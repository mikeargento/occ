import type { IncomingMessage, ServerResponse } from "node:http";
import { db } from "./db.js";

function json(res: ServerResponse, data: unknown, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf-8");
}

/**
 * Handle MCP protocol requests at /mcp/:token
 *
 * This is a Streamable HTTP MCP transport.
 * The token in the URL authenticates the user — no API keys needed.
 */
export async function handleMcp(req: IncomingMessage, res: ServerResponse, pathname: string) {
  const token = pathname.replace(/^\/mcp\//, "").split("/")[0];
  if (!token) {
    return json(res, { error: "Missing token" }, 401);
  }

  // Authenticate by token
  const user = await db.getUserByToken(token);
  if (!user) {
    return json(res, { error: "Invalid token" }, 401);
  }

  const method = req.method ?? "GET";

  // MCP uses JSON-RPC 2.0 over HTTP POST
  if (method === "POST") {
    const body = JSON.parse(await readBody(req));
    const rpcMethod = body.method;

    // Handle MCP JSON-RPC methods
    switch (rpcMethod) {
      case "initialize": {
        return json(res, {
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2025-03-26",
            capabilities: {
              tools: { listChanged: false },
            },
            serverInfo: {
              name: "occ-agent",
              version: "1.0.0",
            },
          },
        });
      }

      case "notifications/initialized": {
        // Notification — no response needed, but HTTP needs something
        res.writeHead(204);
        res.end();
        return;
      }

      case "tools/list": {
        // Return tools from user's policy
        const policy = await db.getActivePolicy(user.id);
        const tools = (policy?.allowed_tools ?? []).map((name: string) => ({
          name,
          description: `Tool: ${name}`,
          inputSchema: { type: "object", properties: {} },
        }));

        // Always include built-in OCC tools
        const occTools = [
          {
            name: "occ_create_issue",
            description: "Create a new issue/task in OCC Agent",
            inputSchema: {
              type: "object",
              properties: {
                title: { type: "string", description: "Issue title" },
                description: { type: "string", description: "Issue description" },
              },
              required: ["title"],
            },
          },
          {
            name: "occ_list_proofs",
            description: "List recent proof log entries",
            inputSchema: {
              type: "object",
              properties: {
                limit: { type: "number", description: "Number of entries to return (default 10)" },
              },
            },
          },
          {
            name: "occ_get_policy",
            description: "Get the current active policy",
            inputSchema: { type: "object", properties: {} },
          },
        ];

        return json(res, {
          jsonrpc: "2.0",
          id: body.id,
          result: { tools: [...occTools, ...tools] },
        });
      }

      case "tools/call": {
        const toolName = body.params?.name;
        const args = body.params?.arguments ?? {};

        // Find which agent this token maps to, or use first agent
        const agents = await db.getAgents(user.id);
        const agentId = agents.length > 0 ? agents[0].id : "default-agent";

        // Auto-discover: add tool to agent's allowed list if not already there
        const agent = agents.find((a: any) => a.id === agentId);
        const currentTools = agent?.allowed_tools ?? [];
        if (!currentTools.includes(toolName)) {
          await db.enableTool(user.id, agentId, toolName);
        }

        // Log the call as a proof
        await db.addProof(user.id, {
          agentId,
          tool: toolName,
          allowed: true,
          args,
        });

        // Handle built-in tools
        if (toolName === "occ_list_proofs") {
          const limit = args.limit ?? 10;
          const { entries } = await db.getProofs(user.id, limit);
          return json(res, {
            jsonrpc: "2.0",
            id: body.id,
            result: {
              content: [{ type: "text", text: JSON.stringify(entries, null, 2) }],
            },
          });
        }

        if (toolName === "occ_get_policy") {
          const policy = await db.getActivePolicy(user.id);
          return json(res, {
            jsonrpc: "2.0",
            id: body.id,
            result: {
              content: [{ type: "text", text: policy ? JSON.stringify(policy, null, 2) : "No active policy" }],
            },
          });
        }

        if (toolName === "occ_create_issue") {
          // Store as a proof entry for now
          return json(res, {
            jsonrpc: "2.0",
            id: body.id,
            result: {
              content: [{ type: "text", text: `Issue created: ${args.title}` }],
            },
          });
        }

        // Unknown tool
        return json(res, {
          jsonrpc: "2.0",
          id: body.id,
          result: {
            content: [{ type: "text", text: `Tool ${toolName} executed (no downstream connected)` }],
          },
        });
      }

      default: {
        return json(res, {
          jsonrpc: "2.0",
          id: body.id,
          error: { code: -32601, message: `Method not found: ${rpcMethod}` },
        });
      }
    }
  }

  // GET — SSE transport (for clients like Cursor that use SSE)
  if (method === "GET") {
    const accept = req.headers.accept ?? "";
    if (accept.includes("text/event-stream")) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      // Send endpoint info so client knows where to POST
      const endpoint = pathname;
      res.write(`event: endpoint\ndata: ${endpoint}\n\n`);
      // Keep alive
      const interval = setInterval(() => {
        res.write(": keepalive\n\n");
      }, 15000);
      req.on("close", () => clearInterval(interval));
      return;
    }
    // Plain GET — return server info
    return json(res, {
      name: "occ-agent",
      version: "1.0.0",
      owner: user.email,
    });
  }

  json(res, { error: "Method not allowed" }, 405);
}
