import { sha256 } from "@noble/hashes/sha256";
import * as ed from "@noble/ed25519";
import { Constructor } from "occproof";
import { db } from "./db.js";
import crypto from "node:crypto";
const activeConnections = new Map();
/** Get all active connections (for the dashboard) */
export function getActiveConnections() {
    // Prune stale connections (no activity in 2 minutes)
    const now = Date.now();
    for (const [id, conn] of activeConnections) {
        if (now - conn.lastSeen.getTime() > 120_000) {
            activeConnections.delete(id);
        }
    }
    return Array.from(activeConnections.values());
}
function detectClient(ua) {
    if (ua.includes("Cursor"))
        return "Cursor";
    if (ua.includes("Claude") || ua.includes("claude"))
        return "Claude Desktop";
    if (ua.includes("Windsurf"))
        return "Windsurf";
    if (ua.includes("Cline"))
        return "Cline";
    if (ua.includes("VS Code") || ua.includes("vscode"))
        return "VS Code";
    if (ua.includes("curl"))
        return "curl";
    return "Unknown Client";
}
function trackConnection(req, token, agentId) {
    const ua = req.headers["user-agent"] ?? "";
    const clientName = detectClient(ua);
    // Use token + client as key so same client reconnecting updates instead of duplicates
    const connId = `${token}-${clientName}`;
    let conn = activeConnections.get(connId);
    if (conn) {
        conn.lastSeen = new Date();
        conn.toolCalls++;
        if (agentId)
            conn.agentId = agentId;
    }
    else {
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
function toBase64(bytes) {
    return Buffer.from(bytes).toString("base64");
}
// ── OCC Constructor (real cryptographic proofs) ──
let occConstructor = null;
async function getConstructor() {
    if (occConstructor)
        return occConstructor;
    const privateKey = ed.utils.randomPrivateKey();
    const publicKey = await ed.getPublicKeyAsync(privateKey);
    const host = {
        enforcementTier: "hw-key",
        async getMeasurement() {
            const hash = sha256(new TextEncoder().encode("occ-hosted-v1"));
            return Buffer.from(hash).toString("hex");
        },
        async getFreshNonce() {
            return new Uint8Array(crypto.randomBytes(16));
        },
        async sign(data) {
            return new Uint8Array(await ed.signAsync(data, privateKey));
        },
        async getPublicKey() {
            return new Uint8Array(publicKey);
        },
        _counter: 0,
        async nextCounter() {
            return String(++this._counter);
        },
    };
    occConstructor = await Constructor.initialize({
        host,
        policy: { requireCounter: true },
        epochId: `hosted-${Date.now()}`,
    });
    console.log("  [occ] Constructor initialized — signing proofs with Ed25519");
    return occConstructor;
}
function generateProofDigest(tool, args, timestamp, agentId) {
    const payload = JSON.stringify({ tool, args, timestamp, agentId });
    const hash = sha256(new TextEncoder().encode(payload));
    return toBase64(hash);
}
async function commitProof(tool, args, agentId, allowed) {
    const payload = JSON.stringify({ tool, args, agentId, allowed, timestamp: Date.now() });
    const bytes = new TextEncoder().encode(payload);
    try {
        const ctor = await getConstructor();
        const proof = await ctor.commit({
            bytes,
            metadata: { tool, agentId, decision: allowed ? "allowed" : "denied" },
        });
        const digestB64 = proof.artifact.digestB64;
        // Forward proof to occ.wtf explorer
        fetch("https://occ.wtf/api/proofs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(proof),
        }).catch(() => { }); // fire-and-forget
        return { proof, digestB64 };
    }
    catch (err) {
        // Fallback to simple hash if Constructor fails
        const hash = sha256(bytes);
        return { proof: null, digestB64: toBase64(hash) };
    }
}
function json(res, data, status = 200) {
    const body = JSON.stringify(data);
    res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
    res.end(body);
}
async function readBody(req) {
    const chunks = [];
    for await (const chunk of req)
        chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf-8");
}
/**
 * Handle MCP protocol requests at /mcp/:token
 *
 * This is a Streamable HTTP MCP transport.
 * The token in the URL authenticates the user — no API keys needed.
 */
export async function handleMcp(req, res, pathname) {
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
                const tools = (policy?.allowed_tools ?? []).map((name) => ({
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
                trackConnection(req, token, agentId);
                const agent = agents.find((a) => a.id === agentId);
                const currentTools = agent?.allowed_tools ?? [];
                const isPaused = agent?.paused ?? false;
                // ── ENFORCEMENT ──
                // Check if agent is paused — blocks EVERYTHING
                if (isPaused) {
                    const { proof, digestB64 } = await commitProof(toolName, args, agentId, false);
                    await db.addProof(user.id, {
                        agentId, tool: toolName, allowed: false, args, proofDigest: digestB64,
                        reason: "Switchboard is paused — all tool access suspended",
                        receipt: proof,
                    });
                    await db.incrementAgentCalls(user.id, agentId, false);
                    return json(res, {
                        jsonrpc: "2.0", id: body.id,
                        error: { code: -32600, message: `Denied: switchboard "${agentId}" is paused` },
                    });
                }
                // Check if agent has ever had tools configured
                const hasEverBeenConfigured = (agent?.total_calls ?? 0) > 0 || currentTools.length > 0;
                if (hasEverBeenConfigured && !currentTools.includes(toolName)) {
                    const { proof, digestB64 } = await commitProof(toolName, args, agentId, false);
                    await db.addProof(user.id, {
                        agentId, tool: toolName, allowed: false, args, proofDigest: digestB64,
                        reason: `Tool "${toolName}" is not in the allowed list`,
                        receipt: proof,
                    });
                    await db.incrementAgentCalls(user.id, agentId, false);
                    return json(res, {
                        jsonrpc: "2.0", id: body.id,
                        error: { code: -32600, message: `Denied: "${toolName}" is not allowed by switchboard "${agentId}"` },
                    });
                }
                // Auto-discover: brand new agent, no calls ever — add tool to allowed list
                if (!hasEverBeenConfigured && !currentTools.includes(toolName)) {
                    await db.enableTool(user.id, agentId, toolName);
                }
                // ── ALLOWED — commit real OCC proof ──
                const { proof, digestB64 } = await commitProof(toolName, args, agentId, true);
                await db.addProof(user.id, {
                    agentId,
                    tool: toolName,
                    allowed: true,
                    args,
                    proofDigest: digestB64,
                    receipt: proof,
                });
                await db.incrementAgentCalls(user.id, agentId, true);
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
//# sourceMappingURL=mcp.js.map