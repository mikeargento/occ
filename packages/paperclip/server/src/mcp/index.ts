// MCP Server endpoint for OCC Agent
// Implements MCP Streamable HTTP protocol (JSON-RPC 2.0 over HTTP)
// without depending on @modelcontextprotocol/sdk.
//
// URL format: /mcp/{token}
// The token contains the company ID + HMAC signature.
// No API keys. No headers. Just one URL.

import { Router, type Request, type Response } from "express";
import type { Db } from "@paperclipai/db";
import { verifyMcpToken, generateMcpToken } from "./auth.js";
import { MCP_TOOLS, type McpToolContext } from "./tools.js";
import { companyService } from "../services/index.js";
import { logger } from "../middleware/logger.js";

const SERVER_INFO = {
  name: "occ-agent",
  version: "1.0.0",
};

const CAPABILITIES = {
  tools: { listChanged: false },
};

// ── JSON-RPC helpers ───────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function rpcResult(id: string | number | null | undefined, result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function rpcError(id: string | number | null | undefined, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

// ── Request handlers ───────────────────────────────────────────────────

async function handleRpcRequest(
  msg: JsonRpcRequest,
  toolCtx: McpToolContext,
): Promise<object | null> {
  switch (msg.method) {
    case "initialize":
      return rpcResult(msg.id, {
        protocolVersion: "2024-11-05",
        serverInfo: SERVER_INFO,
        capabilities: CAPABILITIES,
      });

    case "notifications/initialized":
      // Client notification — no response needed
      return null;

    case "tools/list": {
      const tools = MCP_TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: {
          type: "object",
          ...t.inputSchema,
        },
      }));
      return rpcResult(msg.id, { tools });
    }

    case "tools/call": {
      const params = msg.params ?? {};
      const toolName = params.name as string;
      const toolArgs = (params.arguments ?? {}) as Record<string, unknown>;

      const tool = MCP_TOOLS.find((t) => t.name === toolName);
      if (!tool) {
        return rpcError(msg.id, -32602, `Unknown tool: ${toolName}`);
      }

      try {
        const result = await tool.handler(toolCtx, toolArgs);
        return rpcResult(msg.id, result);
      } catch (err) {
        logger.error({ err, tool: toolName }, "MCP tool handler error");
        return rpcResult(msg.id, {
          content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : "Unknown error"}` }],
          isError: true,
        });
      }
    }

    case "ping":
      return rpcResult(msg.id, {});

    default:
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

// ── Express routes ─────────────────────────────────────────────────────

export function mcpRoutes(db: Db) {
  const router = Router();

  // ── GET /mcp/config/:companyId — returns the connection snippet ──────
  router.get("/mcp/config/:companyId", (req: Request, res: Response) => {
    const { companyId } = req.params;

    // Require board auth for getting config
    if (req.actor?.type !== "board") {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const token = generateMcpToken(companyId);
    const baseUrl = resolveBaseUrl(req);

    res.json({
      token,
      url: `${baseUrl}/mcp/${token}`,
      snippet: {
        mcpServers: {
          "occ-agent": {
            url: `${baseUrl}/mcp/${token}`,
          },
        },
      },
    });
  });

  // ── POST /mcp/:token — MCP JSON-RPC endpoint ────────────────────────
  router.post("/mcp/:token", async (req: Request, res: Response) => {
    const companyId = verifyMcpToken(req.params.token);
    if (!companyId) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Invalid connection token" },
        id: null,
      });
      return;
    }

    // Verify company exists
    const companySvc = companyService(db);
    const company = await companySvc.getById(companyId);
    if (!company) {
      res.status(404).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Company not found" },
        id: null,
      });
      return;
    }

    const toolCtx: McpToolContext = { db, companyId };
    const body = req.body;

    try {
      // Handle batch requests
      if (Array.isArray(body)) {
        const results = await Promise.all(
          body.map((msg: JsonRpcRequest) => handleRpcRequest(msg, toolCtx)),
        );
        const responses = results.filter((r) => r !== null);
        if (responses.length === 0) {
          res.status(202).end();
        } else {
          res.json(responses);
        }
        return;
      }

      // Single request
      const result = await handleRpcRequest(body as JsonRpcRequest, toolCtx);
      if (result === null) {
        // Notification — no response body
        res.status(202).end();
      } else {
        res.json(result);
      }
    } catch (err) {
      logger.error({ err }, "MCP endpoint error");
      if (!res.headersSent) {
        res.status(500).json(
          rpcError(body?.id, -32603, "Internal error"),
        );
      }
    }
  });

  // ── GET /mcp/:token — SSE (not needed for stateless) ─────────────────
  router.get("/mcp/:token", (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Use POST for MCP requests" },
      id: null,
    });
  });

  // ── DELETE /mcp/:token — session close ───────────────────────────────
  router.delete("/mcp/:token", (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });

  return router;
}

function resolveBaseUrl(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:3100";
  return `${proto}://${host}`;
}

export { generateMcpToken } from "./auth.js";
