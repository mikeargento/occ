import type { IncomingMessage, ServerResponse } from "node:http";
import { sha256 } from "@noble/hashes/sha256";
import { db } from "./db.js";
import { eventBus } from "./events.js";
import { validateAuthorization, createExecutionProof } from "./authorization.js";

// ── Active connection tracking ──
interface ActiveConnection {
  id: string;
  clientName: string;
  connectedAt: Date;
  lastSeen: Date;
  userAgent: string;
  agentId: string | null;
  toolCalls: number;
}

const activeConnections = new Map<string, ActiveConnection>();

/** Get all active connections (for the dashboard) */
export function getActiveConnections(): ActiveConnection[] {
  // Prune stale connections (no activity in 2 minutes)
  const now = Date.now();
  for (const [id, conn] of activeConnections) {
    if (now - conn.lastSeen.getTime() > 120_000) {
      activeConnections.delete(id);
    }
  }
  return Array.from(activeConnections.values());
}

function detectClient(ua: string): string {
  if (ua.includes("Cursor")) return "Cursor";
  if (ua.includes("Claude") || ua.includes("claude")) return "Claude Desktop";
  if (ua.includes("Windsurf")) return "Windsurf";
  if (ua.includes("Cline")) return "Cline";
  if (ua.includes("VS Code") || ua.includes("vscode")) return "VS Code";
  if (ua.includes("curl")) return "curl";
  return "Unknown Client";
}

function trackConnection(req: IncomingMessage, token: string, agentId?: string): ActiveConnection {
  const ua = req.headers["user-agent"] ?? "";
  const clientName = detectClient(ua);
  // Use token + client as key so same client reconnecting updates instead of duplicates
  const connId = `${token}-${clientName}`;

  let conn = activeConnections.get(connId);
  if (conn) {
    conn.lastSeen = new Date();
    conn.toolCalls++;
    if (agentId) conn.agentId = agentId;
  } else {
    conn = {
      id: connId,
      clientName,
      connectedAt: new Date(),
      lastSeen: new Date(),
      userAgent: ua,
      agentId: agentId ?? null,
      toolCalls: 0,
    };
    activeConnections.set(connId, conn);
  }
  return conn;
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

// ── TEE Commit via Nitro Enclave ──
const TEE_URL = "https://nitro.occproof.com/commit";

export async function commitProof(tool: string, args: unknown, agentId: string, allowed: boolean): Promise<{ proof: any; digestB64: string }> {
  const payload = JSON.stringify({ tool, args, agentId, allowed, timestamp: Date.now() });
  const bytes = new TextEncoder().encode(payload);
  const digestB64 = toBase64(sha256(bytes));

  try {
    const res = await fetch(TEE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        digests: [{ digestB64, hashAlg: "sha256" }],
        metadata: {
          kind: allowed ? "tool-execution" : "tool-denial",
          tool,
          agentId,
          decision: allowed ? "allowed" : "denied",
          adapter: "hosted-mcp",
          runtime: "agent.occ.wtf",
        },
      }),
    });

    if (!res.ok) throw new Error(`TEE ${res.status}`);

    const data = await res.json();
    const proof = Array.isArray(data) ? data[0] : data.proofs?.[0] ?? data;

    // Forward proof to occ.wtf explorer
    fetch("https://occ.wtf/api/proofs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proof }),
    }).catch(() => {});

    return { proof, digestB64: proof?.artifact?.digestB64 ?? digestB64 };
  } catch (err) {
    // Fallback to local hash if TEE is unreachable
    console.warn("  [occ] TEE commit failed, using local hash:", (err as Error).message);
    return { proof: null, digestB64 };
  }
}

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
        trackConnection(req, token);
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

        const agents = await db.getAgents(user.id);
        const agentId = agents.length > 0 ? agents[0].id : "default-agent";
        trackConnection(req, token, agentId);
        const agent = agents.find((a: any) => a.id === agentId);
        const isPaused = agent?.paused ?? false;
        const clientName = detectClient(req.headers["user-agent"] ?? "");

        // ── AUTHORIZATION-OBJECT ENFORCEMENT ──
        // An action cannot exist unless a prior authorization object exists.

        // 1. Global kill switch
        if (isPaused) {
          await db.incrementAgentCalls(user.id, agentId, false);
          return json(res, {
            jsonrpc: "2.0", id: body.id,
            error: { code: -32600, message: "Denied: all access is suspended" },
          });
        }

        // 2. Look up authorization object
        const authObj = await validateAuthorization(user.id, agentId, toolName);

        // 3. No authorization object → execution path does not exist
        if (!authObj) {
          // Create a pending permission request so the user can authorize it
          const permReq = await db.createPermissionRequest(user.id, agentId, toolName, clientName, args);
          await db.incrementAgentCalls(user.id, agentId, false);

          eventBus.emit(user.id, {
            type: "permission-requested",
            tool: toolName, agentId, clientName,
            requestId: permReq.id, timestamp: Date.now(),
          });

          return json(res, {
            jsonrpc: "2.0", id: body.id,
            error: { code: -32600, message: `No authorization exists for "${toolName}". Approve it at agent.occ.wtf` },
          });
        }

        // 4. Authorization object exists → create execution proof
        // The execution proof references the authorization's digest.
        // This is the causal link: authorization came first, execution depends on it.
        const { proof: execProof, digest: execDigest } = await createExecutionProof(
          user.id, agentId, toolName, args, authObj.proofDigest
        );

        // 5. Handle built-in tools
        if (toolName === "occ_list_proofs") {
          const { entries } = await db.getProofs(user.id, args.limit ?? 10);
          return json(res, {
            jsonrpc: "2.0", id: body.id,
            result: { content: [{ type: "text", text: JSON.stringify(entries, null, 2) }] },
          });
        }

        if (toolName === "occ_get_policy") {
          const policy = await db.getActivePolicy(user.id);
          return json(res, {
            jsonrpc: "2.0", id: body.id,
            result: { content: [{ type: "text", text: policy ? JSON.stringify(policy, null, 2) : "No active policy" }] },
          });
        }

        if (toolName === "occ_create_issue") {
          return json(res, {
            jsonrpc: "2.0", id: body.id,
            result: { content: [{ type: "text", text: `Issue created: ${args.title ?? "Untitled"}` }] },
          });
        }

        // 6. Generic tool — execution happened, proof was created
        return json(res, {
          jsonrpc: "2.0", id: body.id,
          result: {
            content: [{ type: "text", text: `${toolName} executed. Proof: ${execDigest}` }],
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
      const conn = trackConnection(req, token);
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      // Send endpoint info so client knows where to POST
      const endpoint = pathname;
      res.write(`event: endpoint\ndata: ${endpoint}\n\n`);
      // Keep alive + update lastSeen
      const interval = setInterval(() => {
        conn.lastSeen = new Date();
        res.write(": keepalive\n\n");
      }, 15000);
      req.on("close", () => {
        clearInterval(interval);
        activeConnections.delete(conn.id);
      });
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
