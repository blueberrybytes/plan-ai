import { Router, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createPlanAiMcpServer } from "../mcp/planAiMcpServer";
import { validateMcpToken } from "../services/mcpTokenService";

const mcpRouter = Router();

/** Validate the `Authorization: Bearer <token>` header. Returns the auth context or null. */
async function authenticate(req: Request) {
  const authHeader = req.headers.authorization;
  const raw = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!raw) return null;
  return validateMcpToken(raw);
}

const jsonRpcError = (code: number, message: string) => ({
  jsonrpc: "2.0",
  error: { code, message },
  id: null,
});

// ─── Streamable HTTP transport (recommended) ────────────────────────────────
//
// Single endpoint at /mcp handling POST (JSON-RPC requests), GET (the
// server→client SSE notification stream) and DELETE (session teardown).
// Auth happens once, on the `initialize` request; subsequent requests are
// routed by the `mcp-session-id` header that the transport assigns.
//
//   claude mcp add --transport http plan-ai https://.../mcp --header "Authorization: Bearer <token>"

const httpTransports = new Map<string, StreamableHTTPServerTransport>();

mcpRouter.post("/", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  // Existing session → route to its transport.
  if (sessionId) {
    const existing = httpTransports.get(sessionId);
    if (existing) {
      await existing.handleRequest(req, res, req.body);
      return;
    }
  }

  // New connection → must be an `initialize` request and must authenticate.
  if (!sessionId && isInitializeRequest(req.body)) {
    const authCtx = await authenticate(req);
    if (!authCtx) {
      res
        .status(401)
        .json(jsonRpcError(-32001, "Missing or invalid Authorization: Bearer <token>"));
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        httpTransports.set(sid, transport);
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) httpTransports.delete(transport.sessionId);
    };

    const server = createPlanAiMcpServer(authCtx.userId, authCtx.workspaceId);
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    return;
  }

  res
    .status(400)
    .json(jsonRpcError(-32000, "Bad Request: provide mcp-session-id or an initialize request"));
});

// GET (open the notification stream) + DELETE (terminate) for an existing session.
const handleSessionRequest = async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  const transport = sessionId ? httpTransports.get(sessionId) : undefined;
  if (!transport) {
    res.status(400).json(jsonRpcError(-32000, "Invalid or missing mcp-session-id"));
    return;
  }
  await transport.handleRequest(req, res);
};

mcpRouter.get("/", handleSessionRequest);
mcpRouter.delete("/", handleSessionRequest);

// ─── Legacy SSE transport (DEPRECATED — kept for backward compatibility) ─────
//
// The MCP spec deprecated SSE in favour of Streamable HTTP. We keep these
// endpoints so clients already connected via SSE don't break. New connections
// should use the /mcp endpoint above.
//
//   GET  /mcp/sse        → opens the SSE stream
//   POST /mcp/messages   → delivers JSON-RPC messages for an open stream

const sseSessions = new Map<string, SSEServerTransport>();

mcpRouter.get("/sse", async (req: Request, res: Response) => {
  const authCtx = await authenticate(req);
  if (!authCtx) {
    res.status(401).json({ error: "Missing or invalid Authorization: Bearer <token>" });
    return;
  }

  const server = createPlanAiMcpServer(authCtx.userId, authCtx.workspaceId);
  const transport = new SSEServerTransport("/mcp/messages", res);
  sseSessions.set(transport.sessionId, transport);

  // Heartbeat: the SDK's SSE transport sends no keep-alive, so idle proxies
  // (Railway / Cloudflare) close the stream after a short idle period →
  // "Server disconnected". An SSE comment line (`: ping`) is ignored by clients
  // but keeps the connection warm. Cleared when the client disconnects.
  const heartbeat = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseSessions.delete(transport.sessionId);
  });
  await server.connect(transport);
});

mcpRouter.post("/messages", async (req: Request, res: Response) => {
  const sessionId = req.query["sessionId"] as string | undefined;
  if (!sessionId) {
    res.status(400).json({ error: "Missing sessionId query parameter" });
    return;
  }
  const transport = sseSessions.get(sessionId);
  if (!transport) {
    res.status(404).json({ error: "Session not found or expired" });
    return;
  }
  await transport.handlePostMessage(req, res, req.body);
});

export { mcpRouter };
