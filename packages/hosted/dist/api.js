import { db } from "./db.js";
import { getActiveConnections } from "./mcp.js";
import { eventBus } from "./events.js";
import { createAuthorizationObject, createRevocationObject } from "./authorization.js";
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
function getUserId(req) {
    // For now, extract from session cookie or auth header
    // TODO: proper auth check
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer "))
        return auth.slice(7);
    // Check cookie
    const cookies = req.headers.cookie ?? "";
    const match = cookies.match(/occ_session=([^;]+)/);
    return match?.[1] ?? null;
}
export async function handleApi(req, res, url) {
    const path = url.pathname.replace(/^\/api/, "");
    const method = req.method ?? "GET";
    // Public endpoints
    if (path === "/health") {
        return json(res, { ok: true, timestamp: Date.now() });
    }
    if (path === "/status") {
        return json(res, { ok: true, mode: "hosted", version: "2025-03-25-await-fwd", timestamp: Date.now() });
    }
    // Auth-gated endpoints
    const userId = getUserId(req) ?? "anonymous";
    // Build principal for proof signing — cached per request
    let _principal;
    async function getPrincipal() {
        if (_principal)
            return _principal;
        const user = await db.getUserById(userId);
        _principal = user ? { id: userId, provider: user.provider } : { id: userId };
        return _principal;
    }
    // ── Agents ──
    if (path === "/agents" && method === "GET") {
        const agents = await db.getAgents(userId);
        const host = req.headers.host ?? "agent.occ.wtf";
        const proto = host.includes("localhost") ? "http" : "https";
        // Get active connections for connection status
        const activeConns = getActiveConnections();
        const summaries = agents.map((a) => {
            const tools = a.allowed_tools ?? [];
            const blocked = a.blocked_tools ?? [];
            // Find connection for this agent
            const conn = activeConns.find(c => c.agentId === a.id);
            return {
                id: a.id,
                name: a.name,
                mcpUrl: a.mcp_token ? `${proto}://${host}/mcp/${a.mcp_token}` : null,
                proxyUrl: a.proxy_token ? `${proto}://${host}/v1/${a.proxy_token}` : null,
                allowedTools: tools,
                blockedTools: blocked,
                connected: !!conn,
                lastSeen: conn ? conn.lastSeen.toISOString() : null,
                clientName: conn?.clientName ?? null,
                policy: tools.length > 0 ? {
                    version: "occ/policy/1",
                    name: a.name,
                    createdAt: new Date(a.created_at).getTime(),
                    globalConstraints: { allowedTools: tools },
                    skills: {},
                } : null,
                createdAt: new Date(a.created_at).getTime(),
                status: a.paused ? "paused" : "active",
                totalCalls: a.total_calls ?? 0,
                totalSpendCents: 0,
                auditCount: a.total_calls ?? 0,
            };
        });
        return json(res, { agents: summaries });
    }
    if (path === "/agents" && method === "POST") {
        const crypto = await import("node:crypto");
        const body = JSON.parse(await readBody(req));
        const id = body.name?.toLowerCase().replace(/[^a-z0-9-]/g, "-") ?? "agent-" + Date.now();
        const agentToken = crypto.randomBytes(24).toString("hex");
        const proxyToken = crypto.randomBytes(24).toString("hex");
        await db.upsertAgent(userId, { id, name: body.name ?? id, allowedTools: body.allowedTools, mcpToken: agentToken, proxyToken });
        // Birth proof — slot 0 on this agent's chain.
        // The agent cannot exist without this proof existing first.
        const { commitPolicyProof } = await import("./authorization.js");
        const birthChainId = `${userId}:${id}`;
        const birthProof = await commitPolicyProof(userId, {
            categories: {},
            customRules: [`Agent "${body.name ?? id}" created`],
        }, birthChainId, await getPrincipal()).catch(e => { console.error("  [occ] Birth proof failed:", e.message); return null; });
        const host = req.headers.host ?? "agent.occ.wtf";
        const proto = host.includes("localhost") ? "http" : "https";
        return json(res, {
            agent: { id, name: body.name ?? id, status: "active", createdAt: Date.now(), mcpUrl: `${proto}://${host}/mcp/${agentToken}`, proxyUrl: `${proto}://${host}/v1/${proxyToken}` },
            birthProof: birthProof?.proof ?? null,
        }, 201);
    }
    // /agents/:id
    const agentMatch = path.match(/^\/agents\/([^/]+)$/);
    if (agentMatch) {
        const agentId = decodeURIComponent(agentMatch[1]);
        if (method === "GET") {
            const agent = await db.getAgent(userId, agentId);
            if (!agent)
                return json(res, { error: "Not found" }, 404);
            // Build policy object from allowed_tools so dashboard can read agent.policy.globalConstraints.allowedTools
            const agentAllowedTools = agent.allowed_tools ?? [];
            const agentPolicy = agentAllowedTools.length > 0 ? {
                version: "occ/policy/1",
                name: agent.name,
                createdAt: new Date(agent.created_at).getTime(),
                globalConstraints: { allowedTools: agentAllowedTools },
                skills: {},
            } : null;
            return json(res, {
                agent: { id: agent.id, name: agent.name, status: agent.paused ? "paused" : "active", createdAt: new Date(agent.created_at).getTime(), policy: agentPolicy, customRules: agent.custom_rules ?? "" },
                context: {
                    allowedTools: agentAllowedTools,
                    totalSpendCents: 0,
                    toolCallCounts: {},
                    toolCallTimestamps: {},
                    globalCallTimestamps: [],
                    activeSkills: {},
                    auditLog: [],
                    recentDenials: [],
                },
                auditCount: agent.total_calls ?? 0,
            });
        }
        if (method === "DELETE") {
            // Death proof — final slot on this agent's chain. Seals it permanently.
            const { commitPolicyProof } = await import("./authorization.js");
            const deathChainId = `${userId}:${agentId}`;
            const deathProof = await commitPolicyProof(userId, {
                categories: {},
                customRules: [`Agent "${agentId}" terminated`],
            }, deathChainId, await getPrincipal()).catch(e => { console.error("  [occ] Death proof failed:", e.message); return null; });
            await db.deleteAgent(userId, agentId);
            return json(res, { deleted: true, deathProof: deathProof?.proof ?? null });
        }
        if (method === "PUT") {
            const body = JSON.parse(await readBody(req));
            if (body.name) {
                await db.renameAgent(userId, agentId, body.name);
                return json(res, { renamed: true, name: body.name });
            }
            return json(res, { error: "Nothing to update" }, 400);
        }
    }
    // /agents/:id/activity — per-agent proof log
    const activityMatch = path.match(/^\/agents\/([^/]+)\/activity$/);
    if (activityMatch && method === "GET") {
        const agentId = decodeURIComponent(activityMatch[1]);
        const p = (await import("pg")).default;
        const pool = new p.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes("railway") ? { rejectUnauthorized: false } : undefined });
        const res2 = await pool.query("SELECT * FROM occ_proofs WHERE user_id = $1 AND agent_id = $2 ORDER BY created_at DESC LIMIT 50", [userId, agentId]);
        return json(res, { entries: res2.rows });
    }
    // /agents/:id/policy
    const policyMatch = path.match(/^\/agents\/([^/]+)\/policy$/);
    if (policyMatch && method === "PUT") {
        const agentId = decodeURIComponent(policyMatch[1]);
        const body = JSON.parse(await readBody(req));
        // Store the policy's allowed tools on the agent
        const allowedTools = body?.globalConstraints?.allowedTools ?? [];
        await db.upsertAgent(userId, { id: agentId, name: agentId, allowedTools });
        return json(res, { policy: body });
    }
    // /agents/:id/pause|resume
    const pauseMatch = path.match(/^\/agents\/([^/]+)\/(pause|resume)$/);
    if (pauseMatch && method === "PUT") {
        const agentId = decodeURIComponent(pauseMatch[1]);
        const paused = pauseMatch[2] === "pause";
        await db.setAgentPaused(userId, agentId, paused);
        return json(res, { paused });
    }
    // /agents/:id/rules
    const rulesMatch = path.match(/^\/agents\/([^/]+)\/rules$/);
    if (rulesMatch && method === "PUT") {
        const agentId = decodeURIComponent(rulesMatch[1]);
        const body = JSON.parse(await readBody(req));
        await db.updateAgentRules(userId, agentId, body.rules ?? "");
        return json(res, { rules: body.rules ?? "" });
    }
    if (rulesMatch && method === "GET") {
        const agentId = decodeURIComponent(rulesMatch[1]);
        const agent = await db.getAgent(userId, agentId);
        return json(res, { rules: agent?.custom_rules ?? "" });
    }
    // /agents/:id/tools/:tool
    const toolMatch = path.match(/^\/agents\/([^/]+)\/tools\/([^/]+)$/);
    if (toolMatch) {
        const agentId = decodeURIComponent(toolMatch[1]);
        const tool = decodeURIComponent(toolMatch[2]);
        if (method === "PUT") {
            await db.enableTool(userId, agentId, tool);
            return json(res, { tool, enabled: true });
        }
        if (method === "DELETE") {
            await db.disableTool(userId, agentId, tool);
            return json(res, { tool, enabled: false });
        }
    }
    // /agents/:id/tools/:tool/unblock
    const unblockMatch = path.match(/^\/agents\/([^/]+)\/tools\/([^/]+)\/unblock$/);
    if (unblockMatch && method === "POST") {
        const agentId = decodeURIComponent(unblockMatch[1]);
        const tool = decodeURIComponent(unblockMatch[2]);
        await db.unblockTool(userId, agentId, tool);
        return json(res, { tool, unblocked: true });
    }
    // ── Policy ──
    if (path === "/policy" && method === "GET") {
        if (!userId)
            return json(res, { policy: null });
        const policy = await db.getActivePolicy(userId);
        if (!policy)
            return json(res, { policy: null });
        return json(res, {
            policy: {
                version: "occ/policy/1",
                categories: policy.categories ?? {},
                customRules: policy.custom_rules ?? [],
                allowedTools: policy.allowed_tools ?? [],
            },
            policyDigestB64: policy.policy_digest,
            committedAt: new Date(policy.created_at).getTime(),
        });
    }
    if (path === "/policy" && method === "PUT") {
        const body = JSON.parse(await readBody(req));
        // Commit the policy through TEE — the proof IS the rule
        const { commitPolicyProof } = await import("./authorization.js");
        const policyAgentId = body.agentId ?? "default";
        const policyChainId = `${userId}:${policyAgentId}`;
        const { proof, digest } = await commitPolicyProof(userId, {
            categories: body.categories ?? {},
            customRules: body.customRules ?? [],
        }, policyChainId, await getPrincipal());
        const policy = await db.createPolicy(userId, {
            name: body.name ?? "default",
            allowedTools: body.allowedTools ?? [],
            maxActions: body.maxActions,
            rateLimit: body.rateLimit,
            categories: body.categories,
            customRules: body.customRules,
            policyDigest: digest,
        });
        return json(res, {
            policy: {
                categories: policy.categories ?? body.categories,
                customRules: policy.custom_rules ?? body.customRules,
                allowedTools: policy.allowed_tools ?? [],
            },
            policyDigestB64: digest,
            proof,
            committedAt: Date.now(),
        });
    }
    // ── Audit ──
    if (path === "/audit" && method === "GET") {
        if (!userId)
            return json(res, { entries: [], total: 0, page: 1, limit: 50 });
        const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
        const limit = Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10));
        const offset = Math.max(0, (page - 1) * limit);
        const { entries, total } = await db.getProofs(userId, limit, offset);
        return json(res, {
            entries: entries.map((e) => ({
                id: String(e.id),
                agentId: e.agent_id,
                tool: e.tool,
                decision: e.allowed
                    ? { allowed: true }
                    : { allowed: false, reason: e.reason ?? "Policy denied", constraint: "policy" },
                proofDigestB64: e.proof_digest ?? null,
                timestamp: new Date(e.created_at).getTime(),
            })),
            total,
            page,
            limit,
        });
    }
    // /audit/:id
    const auditMatch = path.match(/^\/audit\/([^/]+)$/);
    if (auditMatch && method === "GET") {
        const auditId = decodeURIComponent(auditMatch[1]);
        const e = await db.getProof(userId, auditId);
        if (!e)
            return json(res, { entry: null, receipt: null });
        return json(res, {
            entry: {
                id: String(e.id),
                agentId: e.agent_id,
                tool: e.tool,
                decision: e.allowed ? { allowed: true } : { allowed: false, reason: e.reason ?? "Policy denied", constraint: "policy" },
                proofDigestB64: e.proof_digest ?? null,
                timestamp: new Date(e.created_at).getTime(),
            },
            receipt: e.receipt ?? null,
        });
    }
    // ── Context ──
    if (path === "/context" && method === "GET") {
        const agentId = url.searchParams.get("agentId") ?? "default-agent";
        const agent = await db.getAgent(userId, agentId);
        return json(res, {
            allowedTools: agent?.allowed_tools ?? [],
            totalSpendCents: 0,
            toolCallCounts: {},
            toolCallTimestamps: {},
            globalCallTimestamps: [],
            activeSkills: {},
            auditLog: [],
        });
    }
    // ── Tools ──
    if (path === "/tools" && method === "GET") {
        // Built-in OCC tools
        const builtIn = [
            { name: "occ_create_issue", description: "Create a new issue/task" },
            { name: "occ_list_proofs", description: "List recent proof log entries" },
            { name: "occ_get_policy", description: "Get the current active policy" },
        ];
        // Tools from agents' allowed lists
        const agents = await db.getAgents(userId);
        const toolSet = new Set(builtIn.map(t => t.name));
        for (const a of agents) {
            for (const t of (a.allowed_tools ?? [])) {
                toolSet.add(t);
            }
        }
        // Tools discovered from proof log
        const { entries } = await db.getProofs(userId, 200, 0);
        for (const e of entries) {
            if (e.tool)
                toolSet.add(e.tool);
        }
        const tools = Array.from(toolSet).map(name => {
            const bi = builtIn.find(b => b.name === name);
            return { name, description: bi?.description ?? "", source: bi ? "built-in" : "discovered" };
        });
        return json(res, { tools });
    }
    // ── Signer ──
    if (path === "/signer" && method === "GET") {
        return json(res, { mode: "occ-cloud", publicKey: "hosted" });
    }
    // ── Connections ──
    if (path === "/connections" && method === "GET") {
        // Filter connections to only show this user's agents
        const agents = await db.getAgents(userId);
        const agentIds = new Set(agents.map((a) => a.id));
        const connections = getActiveConnections()
            .filter(c => c.agentId && agentIds.has(c.agentId))
            .map(c => ({
            name: c.clientName,
            transport: "streamable-http",
            status: "connected",
            toolCount: c.toolCalls,
            tools: [],
            connectedAt: c.connectedAt.toISOString(),
            lastSeen: c.lastSeen.toISOString(),
            agentId: c.agentId,
        }));
        return json(res, connections);
    }
    // ── Keys ──
    if (path === "/keys" && method === "GET") {
        return json(res, []);
    }
    // ── Permissions ──
    // Unified endpoint: all permissions with full context
    if (path === "/permissions" && method === "GET") {
        const all = await db.getAllPermissions(userId);
        return json(res, { permissions: all.map((r) => ({
                id: r.id, agentId: r.agent_id, tool: r.tool, status: r.status,
                clientName: r.client_name || "Unknown",
                toolDescription: r.tool_description || null,
                requestedAt: new Date(r.requested_at).getTime(),
                resolvedAt: r.resolved_at ? new Date(r.resolved_at).getTime() : null,
                requestArgs: r.request_args,
                proofDigest: r.proof_digest,
                explorerUrl: r.proof_digest ? `https://occ.wtf/explorer?digest=${encodeURIComponent(r.proof_digest)}` : null,
            })) });
    }
    if (path === "/permissions/pending" && method === "GET") {
        const pending = await db.getPendingPermissions(userId);
        return json(res, { requests: pending.map((r) => ({
                id: r.id, agentId: r.agent_id, tool: r.tool, clientName: r.client_name,
                toolDescription: r.tool_description || null,
                requestedAt: new Date(r.requested_at).getTime(), requestArgs: r.request_args,
            })) });
    }
    if (path === "/permissions/active" && method === "GET") {
        const active = await db.getActivePermissions(userId);
        // Also get denied/revoked
        const { entries: denied } = await db.getPermissionHistory(userId, 100, 0);
        const deniedItems = denied.filter((r) => r.status === "denied" || r.status === "revoked");
        const all = [...active, ...deniedItems];
        return json(res, { permissions: all.map((r) => ({
                id: r.id, agentId: r.agent_id, tool: r.tool, status: r.status,
                resolvedAt: r.resolved_at ? new Date(r.resolved_at).getTime() : null,
                proofDigest: r.proof_digest,
                explorerUrl: r.proof_digest ? `https://occ.wtf/explorer?digest=${encodeURIComponent(r.proof_digest)}` : null,
            })) });
    }
    if (path === "/permissions/history" && method === "GET") {
        const url = new URL(req.url ?? "", "http://localhost");
        const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
        const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 50));
        const { entries, total } = await db.getPermissionHistory(userId, limit, (page - 1) * limit);
        return json(res, {
            permissions: entries.map((r) => ({
                id: r.id, agentId: r.agent_id, tool: r.tool, status: r.status,
                resolvedAt: r.resolved_at ? new Date(r.resolved_at).getTime() : null,
                proofDigest: r.proof_digest,
            })),
            total, page, limit,
        });
    }
    // POST /api/permissions/:id/approve or /deny
    const permMatch = path.match(/^\/permissions\/(\d+)\/(approve|deny)$/);
    if (permMatch && method === "POST") {
        const requestId = parseInt(permMatch[1], 10);
        const decision = permMatch[2];
        const status = decision === "approve" ? "approved" : "denied";
        const pending = await db.getPendingPermissions(userId);
        const req_entry = pending.find((r) => r.id === requestId);
        if (!req_entry)
            return json(res, { error: "Permission request not found" }, 404);
        // Parse optional body for approval mode
        let approvalMode = "always";
        let denyMode = "once";
        try {
            const body = JSON.parse(await readBody(req));
            if (decision === "approve" && body.mode === "once")
                approvalMode = "once";
            if (decision === "approve" && body.mode === "always")
                approvalMode = "always";
            if (decision === "deny" && body.mode === "always")
                denyMode = "always";
        }
        catch { /* no body or invalid JSON — use defaults */ }
        let digestB64 = "";
        let proof = null;
        if (decision === "approve") {
            // ── CREATE AUTHORIZATION OBJECT ──
            // This creates a cryptographic object that must exist before execution.
            const chainId = `${userId}:${req_entry.agent_id}`;
            const authResult = await createAuthorizationObject(userId, req_entry.agent_id, req_entry.tool, undefined, chainId, await getPrincipal());
            digestB64 = authResult.digest;
            proof = authResult.proof;
            if (approvalMode === "always") {
                // Durable: add tool to agent's allowed list (remembered policy)
                await db.enableTool(userId, req_entry.agent_id, req_entry.tool);
            }
            // "once" mode: authorization object exists for this execution,
            // but tool is NOT added to allowed_tools. Next request will ask again.
        }
        if (decision === "deny" && denyMode === "always") {
            // Durable deny: add to blocked list
            await db.disableTool(userId, req_entry.agent_id, req_entry.tool);
        }
        // Resolve the permission request
        await db.resolvePermission(userId, requestId, status, digestB64, proof);
        // Log to proof table
        await db.addProof(userId, {
            agentId: req_entry.agent_id, tool: req_entry.tool,
            allowed: decision === "approve",
            reason: decision === "approve"
                ? `${approvalMode === "always" ? "Always allowed" : "Allowed once"} — authorization: ${digestB64}`
                : `${denyMode === "always" ? "Always denied" : "Denied once"} — no authorization object`,
            proofDigest: digestB64 || undefined, receipt: proof,
        });
        eventBus.emit(userId, {
            type: "permission-resolved",
            tool: req_entry.tool, agentId: req_entry.agent_id,
            decision: status, mode: decision === "approve" ? approvalMode : denyMode,
            proofDigest: digestB64, timestamp: Date.now(),
        });
        return json(res, {
            permission: { tool: req_entry.tool, status, mode: decision === "approve" ? approvalMode : denyMode },
            proof: { digestB64 },
        });
    }
    // POST /api/permissions/revoke
    if (path === "/permissions/revoke" && method === "POST") {
        const body = JSON.parse(await readBody(req));
        const { agentId, tool } = body;
        if (!agentId || !tool)
            return json(res, { error: "agentId and tool required" }, 400);
        // Find the authorization object to revoke
        const authObj = await db.getValidAuthorization(userId, agentId, tool);
        let digest = "";
        let proof = null;
        if (authObj) {
            // ── CREATE REVOCATION OBJECT ──
            // This supersedes the authorization. After this, no execution path exists.
            const revokeChainId = `${userId}:${agentId}`;
            const result = await createRevocationObject(userId, agentId, tool, authObj.proofDigest, revokeChainId, await getPrincipal());
            digest = result.digest;
            proof = result.proof;
        }
        // Always revoke the permission and disable the tool — even without an auth object
        await db.revokePermission(userId, agentId, tool, digest, proof);
        await db.disableTool(userId, agentId, tool);
        await db.addProof(userId, {
            agentId, tool, allowed: false,
            reason: digest ? `Revocation object created: ${digest}` : "Tool revoked (no authorization object)",
            proofDigest: digest || undefined, receipt: proof,
        });
        eventBus.emit(userId, {
            type: "permission-resolved", tool, agentId,
            decision: "revoked", proofDigest: digest, timestamp: Date.now(),
        });
        return json(res, { ok: true, proof: { digestB64: digest } });
    }
    // GET /api/authorizations/:agentId/:tool/chain
    const chainMatch = path.match(/^\/authorizations\/([^/]+)\/([^/]+)\/chain$/);
    if (chainMatch && method === "GET") {
        const chain = await db.getAuthorizationChain(userId, decodeURIComponent(chainMatch[1]), decodeURIComponent(chainMatch[2]));
        return json(res, { chain: chain.map((r) => ({
                id: r.id, type: r.type, proofDigest: r.proof_digest,
                referencesDigest: r.references_digest, createdAt: new Date(r.created_at).getTime(),
                explorerUrl: r.proof_digest ? `https://occ.wtf/explorer?digest=${encodeURIComponent(r.proof_digest)}` : null,
            })) });
    }
    // ── Events (SSE) ──
    if (path === "/events" && method === "GET") {
        res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        });
        res.write("data: {\"type\":\"connected\"}\n\n");
        eventBus.subscribe(userId, res);
        const interval = setInterval(() => {
            res.write(": keepalive\n\n");
        }, 15000);
        req.on("close", () => clearInterval(interval));
        return;
    }
    // ── Connect Config ──
    if (path === "/connect-config" && method === "GET") {
        const user = await db.getUserById(userId);
        if (!user)
            return json(res, { error: "User not found" }, 404);
        const mcpUrl = `https://agent.occ.wtf/mcp/${user.mcp_token}`;
        return json(res, {
            mcpUrl,
            claudeCode: `claude mcp add occ-agent --transport http ${mcpUrl}`,
            claudeDesktop: JSON.stringify({ mcpServers: { "occ-agent": { url: mcpUrl } } }, null, 2),
            cursor: JSON.stringify({ mcpServers: { "occ-agent": { url: mcpUrl } } }, null, 2),
            generic: mcpUrl,
        });
    }
    // ── MCP Config (legacy) ──
    if (path === "/mcp-config" && method === "GET") {
        const user = await db.getUserById(userId);
        if (!user)
            return json(res, { error: "User not found" }, 404);
        const baseUrl = "https://agent.occ.wtf";
        return json(res, {
            mcpServers: {
                "occ-agent": {
                    url: `${baseUrl}/mcp/${user.mcp_token}`,
                },
            },
        });
    }
    // ── Hook Token ──
    if (path === "/settings/token" && method === "GET") {
        const user = await db.getUserById(userId);
        if (!user)
            return json(res, { error: "User not found" }, 404);
        return json(res, { token: user.mcp_token });
    }
    // ── API Key Management ──
    if (path === "/settings/api-key" && method === "GET") {
        const key = await db.getAnthropicKey(userId);
        return json(res, { hasKey: !!key, maskedKey: key ? `sk-ant-...${key.slice(-8)}` : null });
    }
    if (path === "/settings/api-key" && method === "PUT") {
        const body = JSON.parse(await readBody(req));
        if (!body.key || !body.key.startsWith("sk-ant-")) {
            return json(res, { error: "Invalid Anthropic API key" }, 400);
        }
        await db.setAnthropicKey(userId, body.key);
        return json(res, { ok: true, maskedKey: `sk-ant-...${body.key.slice(-8)}` });
    }
    if (path === "/settings/api-key" && method === "DELETE") {
        await db.deleteAnthropicKey(userId);
        return json(res, { ok: true });
    }
    // ── Phone Number ──
    if (path === "/settings/phone" && method === "GET") {
        const user = await db.getUserById(userId);
        return json(res, { phone: user?.phone ?? null });
    }
    if (path === "/settings/phone" && method === "PUT") {
        const body = JSON.parse(await readBody(req));
        if (!body.phone)
            return json(res, { error: "Phone number required" }, 400);
        // Normalize: ensure + prefix
        const phone = body.phone.startsWith("+") ? body.phone : `+1${body.phone.replace(/\D/g, "")}`;
        await db.setPhone(userId, phone);
        return json(res, { ok: true, phone });
    }
    // ── Notifications ──
    if (path === "/notifications/count" && method === "GET") {
        const count = await db.getUnreadNotificationCount(userId);
        return json(res, { count });
    }
    if (path === "/notifications/mark-read" && method === "POST") {
        await db.markNotificationsRead(userId);
        return json(res, { ok: true });
    }
    // ── Bulk Approve/Deny ──
    if (path === "/permissions/bulk" && method === "POST") {
        const body = JSON.parse(await readBody(req));
        const { action, mode, ids, agentId } = body;
        if (!action || (action !== "approve" && action !== "deny")) {
            return json(res, { error: "action must be 'approve' or 'deny'" }, 400);
        }
        // If agentId is provided, get all pending for that agent
        let targetIds = ids ?? [];
        if (agentId && !ids) {
            const pending = await db.getPendingPermissions(userId);
            targetIds = pending
                .filter((r) => r.agent_id === agentId)
                .map((r) => r.id);
        }
        if (targetIds.length === 0) {
            return json(res, { processed: 0 });
        }
        const resolveMode = mode ?? (action === "approve" ? "always" : "once");
        let processed = 0;
        for (const requestId of targetIds) {
            const pending = await db.getPendingPermissions(userId);
            const req_entry = pending.find((r) => r.id === requestId);
            if (!req_entry)
                continue;
            const status = action === "approve" ? "approved" : "denied";
            let digestB64 = "";
            let proof = null;
            if (action === "approve") {
                const chainId = `${userId}:${req_entry.agent_id}`;
                const authResult = await createAuthorizationObject(userId, req_entry.agent_id, req_entry.tool, undefined, chainId, await getPrincipal());
                digestB64 = authResult.digest;
                proof = authResult.proof;
                if (resolveMode === "always") {
                    await db.enableTool(userId, req_entry.agent_id, req_entry.tool);
                }
            }
            if (action === "deny" && resolveMode === "always") {
                await db.disableTool(userId, req_entry.agent_id, req_entry.tool);
            }
            await db.resolvePermission(userId, requestId, status, digestB64, proof);
            await db.addProof(userId, {
                agentId: req_entry.agent_id, tool: req_entry.tool,
                allowed: action === "approve",
                reason: action === "approve"
                    ? `${resolveMode === "always" ? "Always allowed" : "Allowed once"} (bulk) -- authorization: ${digestB64}`
                    : `${resolveMode === "always" ? "Always denied" : "Denied once"} (bulk)`,
                proofDigest: digestB64 || undefined, receipt: proof,
            });
            eventBus.emit(userId, {
                type: "permission-resolved",
                tool: req_entry.tool, agentId: req_entry.agent_id,
                decision: status, mode: resolveMode,
                proofDigest: digestB64, timestamp: Date.now(),
            });
            processed++;
        }
        return json(res, { processed });
    }
    json(res, { error: "Not found" }, 404);
}
//# sourceMappingURL=api.js.map