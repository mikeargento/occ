import type { IncomingMessage, ServerResponse } from "node:http";
import { sha256 } from "@noble/hashes/sha256";
import { db } from "./db.js";
import { eventBus } from "./events.js";
import { validateAuthorization, createExecutionProof, createAuthorizationObject } from "./authorization.js";
import { getToolDef, getToolContext, getToolsForListing, isOccInternal } from "./capabilities.js";
import { executeTool, hasExecutor } from "./executors.js";

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

export async function commitProof(tool: string, args: unknown, agentId: string, allowed: boolean, chainId?: string, principal?: { id: string; provider?: string }): Promise<{ proof: any; digestB64: string }> {
  const payload = JSON.stringify({ tool, args, agentId, allowed, timestamp: Date.now() });
  const bytes = new TextEncoder().encode(payload);
  const digestB64 = toBase64(sha256(bytes));

  try {
    const commitBody: Record<string, unknown> = {
      digests: [{ digestB64, hashAlg: "sha256" }],
      metadata: {
        kind: allowed ? "tool-execution" : "tool-denial",
        tool,
        agentId,
        decision: allowed ? "allowed" : "denied",
        adapter: "hosted-mcp",
        runtime: "agent.occ.wtf",
      },
    };
    if (chainId) {
      commitBody.chainId = chainId;
    }
    if (principal) {
      commitBody.principal = principal;
    }

    const res = await fetch(TEE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(commitBody),
    });

    if (!res.ok) throw new Error(`TEE ${res.status}`);

    const data = await res.json();
    const proof = Array.isArray(data) ? data[0] : data.proofs?.[0] ?? data;

    // Forward proof to occ.wtf explorer
    fetch("https://www.occ.wtf/api/proofs", {
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

  // Authenticate by token — try per-agent token first, then fall back to user token
  let user: any;
  let agentId = "default";

  const agentByToken = await db.getAgentByToken(token);
  if (agentByToken) {
    // Per-agent token — maps directly to a specific agent
    user = { id: agentByToken.user_id, email: agentByToken.email, provider: agentByToken.provider, provider_id: agentByToken.provider_id };
    agentId = agentByToken.id;
  } else {
    // Fall back to user-level token (backward compat)
    user = await db.getUserByToken(token);
    if (!user) {
      return json(res, { error: "Invalid token" }, 401);
    }
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
        // Return ALL capability tools — always visible regardless of policy.
        // Policy governs execution, not visibility.
        // The agent should see what it COULD do, and get a clean denial if policy blocks it.
        const tools = getToolsForListing();

        return json(res, {
          jsonrpc: "2.0",
          id: body.id,
          result: { tools },
        });
      }

      case "tools/call": {
        const toolName = body.params?.name;
        const args = body.params?.arguments ?? {};

        const agents = await db.getAgents(user.id);
        trackConnection(req, token, agentId);
        const agent = agents.find((a: any) => a.id === agentId);
        const isPaused = agent?.paused ?? false;
        const clientName = detectClient(req.headers["user-agent"] ?? "");

        // Look up tool definition from capability registry
        const toolDef = getToolDef(toolName);
        const toolContext = getToolContext(toolName);

        // ── THREE-WAY AUTHORIZATION MODEL ──
        //
        // Tool in allowed_tools  → ALLOW (execute immediately)
        // Tool in blocked_tools  → DENY  (reject immediately)
        // Tool in neither        → ASK   (pending human approval)
        //
        // This is the core of request-first control:
        // agents request, humans govern, decisions become policy.

        // 0. Unknown tool
        if (!toolDef) {
          return json(res, {
            jsonrpc: "2.0", id: body.id,
            error: { code: -32602, message: `Unknown tool: "${toolName}"` },
          });
        }

        // 1. Global kill switch
        if (isPaused) {
          await db.incrementAgentCalls(user.id, agentId, false);
          return json(res, {
            jsonrpc: "2.0", id: body.id,
            error: { code: -32600, message: "Denied: all access is suspended" },
          });
        }

        // 2. OCC internal tools skip policy (always allowed)
        if (isOccInternal(toolName)) {
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
          return json(res, {
            jsonrpc: "2.0", id: body.id,
            result: { content: [{ type: "text", text: `${toolName} executed` }] },
          });
        }

        // 3. Resolve capability mode: allow / deny / ask
        const allowedTools: string[] = agent?.allowed_tools ?? [];
        const blockedTools: string[] = agent?.blocked_tools ?? [];
        const isAllowed = allowedTools.includes(toolName);
        const isBlocked = blockedTools.includes(toolName);

        // ── DENY: tool is explicitly blocked ──
        if (isBlocked) {
          await db.incrementAgentCalls(user.id, agentId, false);

          // Log denial proof
          await db.addProof(user.id, {
            agentId, tool: toolName, allowed: false, args,
            reason: "DENIED_BY_POLICY",
          });

          return json(res, {
            jsonrpc: "2.0", id: body.id,
            error: {
              code: -32600,
              message: `DENIED_BY_POLICY: "${toolDef.label}" is blocked.`,
              data: {
                denied: true,
                reason: "DENIED_BY_POLICY",
                tool: toolName,
                capability: toolContext?.capability ?? toolName,
                label: toolContext?.label ?? toolName,
                description: toolDef.description,
              },
            },
          });
        }

        // ── ASK: tool is not yet authorized — requires human approval ──
        if (!isAllowed) {
          const permReq = await db.createPermissionRequest(
            user.id, agentId, toolName, clientName, args, toolDef.description
          );
          await db.incrementAgentCalls(user.id, agentId, false);

          // Log pending proof
          await db.addProof(user.id, {
            agentId, tool: toolName, allowed: false, args,
            reason: "PENDING_HUMAN_APPROVAL",
          });

          eventBus.emit(user.id, {
            type: "permission-requested",
            tool: toolName, agentId, clientName,
            requestId: permReq.id, timestamp: Date.now(),
            capability: toolContext?.capability ?? toolName,
            label: toolContext?.label ?? toolName,
            description: toolDef.description,
          });

          return json(res, {
            jsonrpc: "2.0", id: body.id,
            error: {
              code: -32000,
              message: `REQUIRES_HUMAN_APPROVAL: "${toolDef.label}" needs approval.`,
              data: {
                pending: true,
                reason: "REQUIRES_HUMAN_APPROVAL",
                tool: toolName,
                capability: toolContext?.capability ?? toolName,
                label: toolContext?.label ?? toolName,
                description: toolDef.description,
                requestId: permReq.id,
                hint: "A request has been sent to the dashboard. Approve it at agent.occ.wtf",
              },
            },
          });
        }

        // ── ALLOW: tool is authorized — execute ──

        // Ensure authorization object exists (create if this is first execution after toggle)
        let authObj = await validateAuthorization(user.id, agentId, toolName);
        if (!authObj) {
          const principal = { id: user.id, provider: user.provider ?? undefined };
          const chainId = `${user.id}:${agentId}`;
          await createAuthorizationObject(user.id, agentId, toolName, undefined, chainId, principal);
          authObj = await validateAuthorization(user.id, agentId, toolName);
        }

        // Create execution proof (causal link: authorization → execution)
        const principal = { id: user.id, provider: user.provider ?? undefined };
        const execChainId = `${user.id}:${agentId}`;
        const authDigest = authObj?.proofDigest ?? "";
        const { digest: execDigest } = await createExecutionProof(
          user.id, agentId, toolName, args, authDigest, execChainId, principal
        );

        // Execute the tool
        if (hasExecutor(toolName)) {
          const result = await executeTool(toolName, args);
          if (result) {
            return json(res, {
              jsonrpc: "2.0", id: body.id,
              result: {
                content: result.content,
                ...(result.isError ? { isError: true } : {}),
              },
            });
          }
        }

        // Tool has no executor yet (stub) — proof was still created
        return json(res, {
          jsonrpc: "2.0", id: body.id,
          result: {
            content: [{ type: "text", text: `${toolName} authorized. Proof: ${execDigest}. (No executor wired yet.)` }],
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
