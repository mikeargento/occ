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

function getUserId(req: IncomingMessage): string | null {
  // For now, extract from session cookie or auth header
  // TODO: proper auth check
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  // Check cookie
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(/occ_session=([^;]+)/);
  return match?.[1] ?? null;
}

export async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  const path = url.pathname.replace(/^\/api/, "");
  const method = req.method ?? "GET";

  // Public endpoints
  if (path === "/health") {
    return json(res, { ok: true, timestamp: Date.now() });
  }

  if (path === "/status") {
    return json(res, { ok: true, mode: "hosted", timestamp: Date.now() });
  }

  // Auth-gated endpoints
  const userId = getUserId(req) ?? "anonymous";

  // ── Agents ──
  if (path === "/agents" && method === "GET") {
    const agents = await db.getAgents(userId);
    const summaries = agents.map((a: any) => {
      const tools = a.allowed_tools ?? [];
      return {
        id: a.id,
        name: a.name,
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
    // No auto-creation — let the user create their own agents
    return json(res, { agents: summaries });
  }

  if (path === "/agents" && method === "POST") {
    const body = JSON.parse(await readBody(req));
    const id = body.name?.toLowerCase().replace(/[^a-z0-9-]/g, "-") ?? "agent-" + Date.now();
    await db.upsertAgent(userId, { id, name: body.name ?? id, allowedTools: body.allowedTools });
    return json(res, { agent: { id, name: body.name ?? id, status: "active", createdAt: Date.now() } }, 201);
  }

  // /agents/:id
  const agentMatch = path.match(/^\/agents\/([^/]+)$/);
  if (agentMatch) {
    const agentId = decodeURIComponent(agentMatch[1]!);
    if (method === "GET") {
      const agent = await db.getAgent(userId, agentId);
      if (!agent) return json(res, { error: "Not found" }, 404);
      // Build policy object from allowed_tools so dashboard can read agent.policy.globalConstraints.allowedTools
      const agentAllowedTools = agent.allowed_tools ?? [];
      const agentPolicy = agentAllowedTools.length > 0 ? {
        version: "occ/policy/1" as const,
        name: agent.name,
        createdAt: new Date(agent.created_at).getTime(),
        globalConstraints: { allowedTools: agentAllowedTools },
        skills: {},
      } : null;
      return json(res, {
        agent: { id: agent.id, name: agent.name, status: agent.paused ? "paused" : "active", createdAt: new Date(agent.created_at).getTime(), policy: agentPolicy },
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
      await db.deleteAgent(userId, agentId);
      return json(res, { deleted: true });
    }
  }

  // /agents/:id/policy
  const policyMatch = path.match(/^\/agents\/([^/]+)\/policy$/);
  if (policyMatch && method === "PUT") {
    const agentId = decodeURIComponent(policyMatch[1]!);
    const body = JSON.parse(await readBody(req));
    // Store the policy's allowed tools on the agent
    const allowedTools = body?.globalConstraints?.allowedTools ?? [];
    await db.upsertAgent(userId, { id: agentId, name: agentId, allowedTools });
    return json(res, { policy: body });
  }

  // /agents/:id/pause
  const pauseMatch = path.match(/^\/agents\/([^/]+)\/(pause|resume)$/);
  if (pauseMatch && method === "PUT") {
    return json(res, { paused: pauseMatch[2] === "pause" });
  }

  // /agents/:id/tools/:tool
  const toolMatch = path.match(/^\/agents\/([^/]+)\/tools\/([^/]+)$/);
  if (toolMatch) {
    return json(res, { tool: decodeURIComponent(toolMatch[2]!), enabled: method === "PUT" });
  }

  // ── Policy ──
  if (path === "/policy" && method === "GET") {
    if (!userId) return json(res, { policy: null });
    const policy = await db.getActivePolicy(userId);
    if (!policy) return json(res, { policy: null });
    return json(res, {
      policy: {
        version: "occ/policy/1",
        name: policy.name,
        createdAt: new Date(policy.created_at).getTime(),
        globalConstraints: {
          allowedTools: policy.allowed_tools ?? [],
          maxSpendCents: undefined,
          rateLimit: policy.rate_limit ? { maxCalls: parseInt(policy.rate_limit), windowMs: 3600000 } : undefined,
        },
        skills: {},
      },
      policyDigestB64: policy.policy_digest,
      committedAt: new Date(policy.created_at).getTime(),
    });
  }

  if (path === "/policy" && method === "PUT") {
    const body = JSON.parse(await readBody(req));
    const policy = await db.createPolicy(userId, {
      name: body.name ?? "default",
      allowedTools: body.allowedTools ?? [],
      maxActions: body.maxActions,
      rateLimit: body.rateLimit,
    });
    return json(res, {
      policy: { allowedTools: policy.allowed_tools },
      policyDigestB64: policy.policy_digest,
      committedAt: new Date(policy.created_at).getTime(),
    });
  }

  // ── Audit ──
  if (path === "/audit" && method === "GET") {
    if (!userId) return json(res, { entries: [], total: 0, page: 1, limit: 50 });
    const page = parseInt(url.searchParams.get("page") ?? "1", 10);
    const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
    const { entries, total } = await db.getProofs(userId, limit, (page - 1) * limit);
    return json(res, {
      entries: entries.map((e: any) => ({
        id: String(e.id),
        agentId: e.agent_id,
        tool: e.tool,
        decision: e.allowed
          ? { allowed: true as const }
          : { allowed: false as const, reason: e.reason ?? "Policy denied", constraint: "policy" },
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
    return json(res, { entry: null, receipt: null });
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
    // In hosted mode, aggregate all unique tools from all agents' allowed_tools
    const agents = await db.getAgents(userId);
    const toolSet = new Set<string>();
    for (const a of agents) {
      for (const t of (a.allowed_tools ?? [])) {
        toolSet.add(t);
      }
    }
    const tools = Array.from(toolSet).map(name => ({
      name,
      description: "",
      source: "policy",
    }));
    return json(res, { tools });
  }

  // ── Signer ──
  if (path === "/signer" && method === "GET") {
    return json(res, { mode: "occ-cloud", publicKey: "hosted" });
  }

  // ── Connections ──
  if (path === "/connections" && method === "GET") {
    return json(res, []);
  }

  // ── Keys ──
  if (path === "/keys" && method === "GET") {
    return json(res, []);
  }

  // ── Events (SSE) ──
  if (path === "/events" && method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });
    res.write("data: {\"type\":\"connected\"}\n\n");
    // Keep alive
    const interval = setInterval(() => {
      res.write(": keepalive\n\n");
    }, 15000);
    req.on("close", () => clearInterval(interval));
    return;
  }

  // ── MCP Config ──
  if (path === "/mcp-config" && method === "GET") {
    // TODO: re-enable auth
    const user = await db.getUserById(userId);
    if (!user) return json(res, { error: "User not found" }, 404);
    const baseUrl = req.headers.host ? `https://${req.headers.host}` : "http://localhost:3100";
    return json(res, {
      mcpServers: {
        "occ-agent": {
          url: `${baseUrl}/mcp/${user.mcp_token}`,
        },
      },
    });
  }

  json(res, { error: "Not found" }, 404);
}
