import { Router, Request, Response } from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createPlanAiMcpServer } from "../mcp/planAiMcpServer";
import { validateMcpToken } from "../services/mcpTokenService";

const mcpRouter = Router();

/**
 * Active SSE transport sessions keyed by sessionId.
 * Required to route POST /messages to the correct open SSE stream.
 */
const sessions = new Map<string, SSEServerTransport>();

// ─── GET /mcp/sse ─────────────────────────────────────────────────────────
//
// Establishes the SSE stream for an MCP client.
// Auth: Authorization: Bearer PAI_sk_...

mcpRouter.get("/sse", async (req: Request, res: Response) => {
  // --- Authenticate ---
  const authHeader = req.headers.authorization;
  const raw = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!raw) {
    res.status(401).json({ error: "Missing Authorization: Bearer <token>" });
    return;
  }

  const authCtx = await validateMcpToken(raw);
  if (!authCtx) {
    res.status(401).json({ error: "Invalid or revoked MCP token" });
    return;
  }

  const { userId, workspaceId } = authCtx;

  // --- Create MCP server with auth baked in via closure ---
  const server = createPlanAiMcpServer(userId, workspaceId);
  const transport = new SSEServerTransport("/mcp/messages", res);

  sessions.set(transport.sessionId, transport);

  req.on("close", () => {
    sessions.delete(transport.sessionId);
  });

  await server.connect(transport);
});

// ─── POST /mcp/messages ───────────────────────────────────────────────────
//
// Receives JSON-RPC messages from the MCP client and routes to the correct session.

mcpRouter.post("/messages", async (req: Request, res: Response) => {
  const sessionId = req.query["sessionId"] as string | undefined;

  if (!sessionId) {
    res.status(400).json({ error: "Missing sessionId query parameter" });
    return;
  }

  const transport = sessions.get(sessionId);
  if (!transport) {
    res.status(404).json({ error: "Session not found or expired" });
    return;
  }

  await transport.handlePostMessage(req, res, req.body);
});

export { mcpRouter };
