import { Router, Request, Response } from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createPlanAiMcpServer } from "../mcp/planAiMcpServer";
import { isMcpTokenActive, validateMcpToken } from "../services/mcpTokenService";
import { scopeToMember } from "../services/tokenScope";

const mcpRouter = Router();

/** Validate the `Authorization: Bearer <token>` header. Returns the auth context or null. */
async function authenticate(req: Request) {
  const authHeader = req.headers.authorization;
  const raw = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!raw) return null;
  return validateMcpToken(raw);
}

// Every request that executes tools calls scopeToMember first: a token sees
// what its user sees (restricted projects stay hidden).

const jsonRpcError = (code: number, message: string) => ({
  jsonrpc: "2.0",
  error: { code, message },
  id: null,
});

// ─── Streamable HTTP transport (recommended) ────────────────────────────────
//
// Single endpoint at /mcp, stateless: every POST carries the Bearer token and
// gets its own server + transport, so nothing lives in memory between requests.
// A deploy or a restart does not drop anyone, and no request stays open long
// enough to hit Railway's 15 minute limit on HTTP requests.
//
// Clients that opened a session before this change still send `mcp-session-id`.
// The header is ignored, so they keep working.
//
//   claude mcp add --transport http plan-ai https://.../mcp --header "Authorization: Bearer <token>"

mcpRouter.post("/", async (req: Request, res: Response) => {
  const authCtx = await authenticate(req);
  if (!authCtx) {
    res.status(401).json(jsonRpcError(-32001, "Missing or invalid Authorization: Bearer <token>"));
    return;
  }

  await scopeToMember(authCtx.userId, authCtx.workspaceId);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createPlanAiMcpServer(authCtx.userId, authCtx.workspaceId);
  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("[mcp] request failed", error);
    if (!res.headersSent) {
      res.status(500).json(jsonRpcError(-32603, "Internal server error"));
    }
  }
});

// No server to client stream and no session to close in stateless mode.
// 405 is what the spec asks for; clients carry on with POST only.
const methodNotAllowed = (_req: Request, res: Response) => {
  res.set("Allow", "POST").status(405).json(jsonRpcError(-32000, "Method not allowed"));
};

mcpRouter.get("/", methodNotAllowed);
mcpRouter.delete("/", methodNotAllowed);

// ─── Legacy SSE transport (DEPRECATED — kept for backward compatibility) ─────
//
// The MCP spec deprecated SSE in favour of Streamable HTTP. We keep these
// endpoints so clients already connected via SSE don't break. New connections
// should use the /mcp endpoint above.
//
//   GET  /mcp/sse        → opens the SSE stream
//   POST /mcp/messages   → delivers JSON-RPC messages for an open stream

const sseSessions = new Map<string, SSEServerTransport>();
// Token behind each open SSE session, re-checked on every message.
const sessionTokens = new Map<string, string>();
// Who each SSE session acts as. The tools run inside the POST that carries
// the message, so that request is the one that needs the scope.
const sessionMembers = new Map<string, { userId: string; workspaceId: string }>();

/** False (and the session closed) once its token was revoked or the member removed. */
async function sessionStillAllowed(sessionId: string, close: () => unknown): Promise<boolean> {
  const tokenId = sessionTokens.get(sessionId);
  if (tokenId && (await isMcpTokenActive(tokenId))) return true;
  sessionTokens.delete(sessionId);
  await Promise.resolve(close()).catch(() => undefined);
  return false;
}

mcpRouter.get("/sse", async (req: Request, res: Response) => {
  const authCtx = await authenticate(req);
  if (!authCtx) {
    res.status(401).json({ error: "Missing or invalid Authorization: Bearer <token>" });
    return;
  }

  const server = createPlanAiMcpServer(authCtx.userId, authCtx.workspaceId);
  const transport = new SSEServerTransport("/mcp/messages", res);
  sseSessions.set(transport.sessionId, transport);
  sessionTokens.set(transport.sessionId, authCtx.tokenId);
  sessionMembers.set(transport.sessionId, {
    userId: authCtx.userId,
    workspaceId: authCtx.workspaceId,
  });

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
    sessionTokens.delete(transport.sessionId);
    sessionMembers.delete(transport.sessionId);
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
  if (!(await sessionStillAllowed(sessionId, () => transport.close()))) {
    res.status(401).json({ error: "The token was revoked" });
    return;
  }
  const member = sessionMembers.get(sessionId);
  if (!member) {
    res.status(404).json({ error: "Session not found or expired" });
    return;
  }
  await scopeToMember(member.userId, member.workspaceId);
  await transport.handlePostMessage(req, res, req.body);
});

export { mcpRouter };
