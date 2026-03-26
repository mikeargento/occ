/**
 * V2 API — Request-first control model
 *
 * All endpoints under /api/v2/
 * One unified approval surface. Agent identity is metadata.
 * Causal chain: Request → Decision → Execution → Proof
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { db } from "./db.js";
import { classifyRisk, RISK_LANES, type RiskLane } from "./risk.js";
import { generateSummary, toolLabel } from "./summaries.js";
import { createAuthorizationObject, createExecutionProof } from "./authorization.js";
import { eventBus } from "./events.js";

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
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(/occ_session=([^;]+)/);
  return match?.[1] ?? null;
}

export async function handleApiV2(req: IncomingMessage, res: ServerResponse, url: URL) {
  const path = url.pathname.replace(/^\/api\/v2/, "");
  const method = req.method ?? "GET";
  const userId = getUserId(req) ?? "anonymous";

  // Build principal for proof signing
  let _principal: { id: string; provider?: string } | undefined;
  async function getPrincipal() {
    if (_principal) return _principal;
    const user = await db.getUserById(userId);
    _principal = user ? { id: userId, provider: user.provider } : { id: userId };
    return _principal;
  }

  // ═══════════════════════════════════════════════════════
  // OVERVIEW
  // ═══════════════════════════════════════════════════════

  if (path === "/overview" && method === "GET") {
    const overview = await db.v2GetOverview(userId);
    return json(res, overview);
  }

  // ═══════════════════════════════════════════════════════
  // REQUESTS
  // ═══════════════════════════════════════════════════════

  // Submit a new action request (API-first entry point)
  if (path === "/requests" && method === "POST") {
    const body = JSON.parse(await readBody(req));
    const tool = body.tool;
    if (!tool) return json(res, { error: "tool is required" }, 400);

    const agentId = body.agentId ?? "default";
    const riskLane = classifyRisk(tool);
    const summary = generateSummary(tool, body.args);
    const label = toolLabel(tool);

    // Check risk lane policy
    const laneMode = await db.v2GetRiskLane(userId, riskLane);
    let status = "pending";
    if (laneMode === "auto_approve") status = "auto_approved";
    if (laneMode === "auto_deny") status = "denied";

    const request = await db.v2CreateRequest(userId, {
      agentId,
      runId: body.runId,
      tool,
      capability: body.capability,
      label,
      riskLane,
      summary,
      originType: body.originType ?? "api",
      originClient: body.originClient,
      requestArgs: body.args,
    });

    // Auto-decisions
    if (status !== "pending") {
      await db.v2UpdateRequestStatus(request.id, status);
      request.status = status;
      const decision = await db.v2CreateDecision({
        requestId: request.id, userId,
        decidedBy: "policy_auto",
        decision: status === "auto_approved" ? "approved" : "denied",
        mode: "always",
        reason: `Risk lane "${riskLane}" is set to ${laneMode}`,
      });

      if (status === "auto_approved") {
        // Execute immediately
        const chainId = `${userId}:${agentId}`;
        const principal = await getPrincipal();
        const authResult = await createAuthorizationObject(userId, agentId, tool, undefined, chainId, principal);
        const execResult = await createExecutionProof(userId, agentId, tool, body.args, authResult.digest, chainId, principal);
        await db.v2CreateExecution({
          requestId: request.id, decisionId: decision.id, userId, agentId, tool,
          args: body.args, authDigest: authResult.digest, execDigest: execResult.digest,
          proof: execResult.proof,
        });
      }
    }

    // Emit event
    eventBus.emit(userId, {
      type: "v2:request",
      requestId: request.id, tool, agentId, status: request.status,
      riskLane, summary, timestamp: Date.now(),
    });

    return json(res, { request: formatRequest(request) }, 201);
  }

  // List requests
  if (path === "/requests" && method === "GET") {
    const status = url.searchParams.get("status") ?? undefined;
    const riskLane = url.searchParams.get("risk_lane") ?? undefined;
    const agentId = url.searchParams.get("agent_id") ?? undefined;
    const runId = url.searchParams.get("run_id") ? parseInt(url.searchParams.get("run_id")!) : undefined;
    const limit = parseInt(url.searchParams.get("limit") ?? "50");
    const offset = parseInt(url.searchParams.get("offset") ?? "0");
    const { requests, total } = await db.v2GetRequests(userId, { status, riskLane, agentId, runId, limit, offset });
    return json(res, { requests: requests.map(formatRequest), total, limit, offset });
  }

  // Pending requests (convenience)
  if (path === "/requests/pending" && method === "GET") {
    const { requests, total } = await db.v2GetRequests(userId, { status: "pending" });
    return json(res, { requests: requests.map(formatRequest), total });
  }

  // Request stats
  if (path === "/requests/stats" && method === "GET") {
    const stats = await db.v2GetRequestStats(userId);
    return json(res, { stats });
  }

  // Request detail
  const reqMatch = path.match(/^\/requests\/(\d+)$/);
  if (reqMatch && method === "GET") {
    const request = await db.v2GetRequest(parseInt(reqMatch[1]!));
    if (!request || request.user_id !== userId) return json(res, { error: "Not found" }, 404);
    return json(res, { request: formatRequestDetail(request) });
  }

  // Approve
  const approveMatch = path.match(/^\/requests\/(\d+)\/approve$/);
  if (approveMatch && method === "POST") {
    const requestId = parseInt(approveMatch[1]!);
    const body = JSON.parse(await readBody(req));
    const mode = body.mode ?? "once";

    const request = await db.v2GetRequest(requestId);
    if (!request || request.user_id !== userId) return json(res, { error: "Not found" }, 404);
    if (request.status !== "pending") return json(res, { error: "Request is not pending" }, 400);

    // Create decision
    const chainId = `${userId}:${request.agent_id}`;
    const principal = await getPrincipal();
    const authResult = await createAuthorizationObject(userId, request.agent_id, request.tool, undefined, chainId, principal);

    const decision = await db.v2CreateDecision({
      requestId, userId, decidedBy: "human",
      decision: "approved", mode,
      proofDigest: authResult.digest, proof: authResult.proof,
    });

    await db.v2UpdateRequestStatus(requestId, "approved");

    // If mode is "always", update the risk lane to auto_approve for this tool's lane
    if (mode === "always") {
      await db.enableTool(userId, request.agent_id, request.tool);
    }

    // Create execution proof
    const execResult = await createExecutionProof(userId, request.agent_id, request.tool, request.request_args, authResult.digest, chainId, principal);
    const execution = await db.v2CreateExecution({
      requestId, decisionId: decision.id, userId, agentId: request.agent_id,
      tool: request.tool, args: request.request_args,
      authDigest: authResult.digest, execDigest: execResult.digest,
      proof: execResult.proof,
    });

    eventBus.emit(userId, {
      type: "v2:decision", requestId, decision: "approved", mode,
      tool: request.tool, agentId: request.agent_id, timestamp: Date.now(),
    });

    return json(res, {
      decision: formatDecision(decision),
      execution: formatExecution(execution),
    });
  }

  // Deny
  const denyMatch = path.match(/^\/requests\/(\d+)\/deny$/);
  if (denyMatch && method === "POST") {
    const requestId = parseInt(denyMatch[1]!);
    const body = JSON.parse(await readBody(req));
    const mode = body.mode ?? "once";

    const request = await db.v2GetRequest(requestId);
    if (!request || request.user_id !== userId) return json(res, { error: "Not found" }, 404);
    if (request.status !== "pending") return json(res, { error: "Request is not pending" }, 400);

    const decision = await db.v2CreateDecision({
      requestId, userId, decidedBy: "human",
      decision: "denied", mode,
      reason: body.reason ?? "Denied by human",
    });

    await db.v2UpdateRequestStatus(requestId, "denied");

    if (mode === "always") {
      // Block the tool at agent level
      const p = (await import("pg")).default;
      const pool = new p.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes("railway") ? { rejectUnauthorized: false } : undefined });
      await pool.query(
        `UPDATE occ_agents SET blocked_tools = array_append(blocked_tools, $3)
         WHERE user_id = $1 AND id = $2 AND NOT ($3 = ANY(blocked_tools))`,
        [userId, request.agent_id, request.tool]
      );
    }

    // Record denial proof
    await db.addProof(userId, {
      agentId: request.agent_id, tool: request.tool, allowed: false,
      args: request.request_args, reason: body.reason ?? "Denied by human",
    });

    eventBus.emit(userId, {
      type: "v2:decision", requestId, decision: "denied", mode,
      tool: request.tool, agentId: request.agent_id, timestamp: Date.now(),
    });

    return json(res, { decision: formatDecision(decision) });
  }

  // Bulk approve/deny
  if (path === "/requests/bulk" && method === "POST") {
    const body = JSON.parse(await readBody(req));
    const { ids, action, mode } = body as { ids: number[]; action: "approve" | "deny"; mode?: string };
    if (!ids?.length || !action) return json(res, { error: "ids and action required" }, 400);

    let processed = 0;
    for (const id of ids) {
      try {
        // Forward to individual approve/deny
        const fakeReq = { headers: req.headers, method: "POST", [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(JSON.stringify({ mode: mode ?? "once" }));
        } } as unknown as IncomingMessage;
        const fakeUrl = new URL(`/api/v2/requests/${id}/${action}`, `http://localhost`);
        // Just call the db methods directly
        const request = await db.v2GetRequest(id);
        if (!request || request.user_id !== userId || request.status !== "pending") continue;

        if (action === "approve") {
          const chainId = `${userId}:${request.agent_id}`;
          const principal = await getPrincipal();
          const authResult = await createAuthorizationObject(userId, request.agent_id, request.tool, undefined, chainId, principal);
          const decision = await db.v2CreateDecision({
            requestId: id, userId, decidedBy: "human",
            decision: "approved", mode: mode ?? "once",
            proofDigest: authResult.digest, proof: authResult.proof,
          });
          await db.v2UpdateRequestStatus(id, "approved");
          await createExecutionProof(userId, request.agent_id, request.tool, request.request_args, authResult.digest, chainId, principal);
        } else {
          await db.v2CreateDecision({
            requestId: id, userId, decidedBy: "human",
            decision: "denied", mode: mode ?? "once",
            reason: "Bulk denial",
          });
          await db.v2UpdateRequestStatus(id, "denied");
        }
        processed++;
      } catch (e) {
        console.error(`  [v2] Bulk ${action} failed for #${id}:`, (e as Error).message);
      }
    }
    return json(res, { processed });
  }

  // ═══════════════════════════════════════════════════════
  // RUNS
  // ═══════════════════════════════════════════════════════

  if (path === "/runs" && method === "GET") {
    const runs = await db.v2GetRuns(userId, {
      status: url.searchParams.get("status") ?? undefined,
      agentId: url.searchParams.get("agent_id") ?? undefined,
    });
    return json(res, { runs: runs.map(formatRun) });
  }

  if (path === "/runs" && method === "POST") {
    const body = JSON.parse(await readBody(req));
    const run = await db.v2CreateRun(userId, body.agentId ?? "default", body.name);
    return json(res, { run: formatRun(run) }, 201);
  }

  const runMatch = path.match(/^\/runs\/(\d+)$/);
  if (runMatch && method === "GET") {
    const run = await db.v2GetRun(parseInt(runMatch[1]!));
    if (!run || run.user_id !== userId) return json(res, { error: "Not found" }, 404);
    return json(res, { run: formatRunDetail(run) });
  }

  // ═══════════════════════════════════════════════════════
  // PROOFS
  // ═══════════════════════════════════════════════════════

  if (path === "/proofs" && method === "GET") {
    const { proofs, total } = await db.v2GetProofs(userId, {
      agentId: url.searchParams.get("agent_id") ?? undefined,
      tool: url.searchParams.get("tool") ?? undefined,
      digest: url.searchParams.get("digest") ?? undefined,
      limit: parseInt(url.searchParams.get("limit") ?? "50"),
      offset: parseInt(url.searchParams.get("offset") ?? "0"),
    });
    return json(res, { proofs: proofs.map(formatProof), total });
  }

  const proofMatch = path.match(/^\/proofs\/(.+)$/);
  if (proofMatch && method === "GET") {
    const digest = decodeURIComponent(proofMatch[1]!);
    const proof = await db.getProof(userId, digest);
    if (!proof) return json(res, { error: "Not found" }, 404);
    return json(res, { proof: formatProof(proof) });
  }

  // ═══════════════════════════════════════════════════════
  // POLICY / RISK LANES
  // ═══════════════════════════════════════════════════════

  if (path === "/policy/lanes" && method === "GET") {
    const lanes = await db.v2GetRiskLanes(userId);
    // Merge with defaults
    const result = Object.entries(RISK_LANES).map(([key, info]) => {
      const saved = lanes.find((l: any) => l.lane === key);
      return {
        lane: key,
        label: info.label,
        description: info.description,
        severity: info.severity,
        mode: saved?.mode ?? "ask",
      };
    });
    return json(res, { lanes: result });
  }

  const laneMatch = path.match(/^\/policy\/lanes\/([a-z_]+)$/);
  if (laneMatch && method === "PUT") {
    const lane = laneMatch[1]!;
    if (!(lane in RISK_LANES)) return json(res, { error: "Unknown risk lane" }, 400);
    const body = JSON.parse(await readBody(req));
    const mode = body.mode;
    if (!["auto_approve", "ask", "auto_deny"].includes(mode)) {
      return json(res, { error: "mode must be auto_approve, ask, or auto_deny" }, 400);
    }
    await db.v2SetRiskLane(userId, lane, mode);
    return json(res, { lane, mode });
  }

  // ═══════════════════════════════════════════════════════
  // ACTIVITY (SSE)
  // ═══════════════════════════════════════════════════════

  if (path === "/activity" && method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });
    res.write("data: {\"type\":\"connected\"}\n\n");
    eventBus.subscribe(userId, res);
    const interval = setInterval(() => res.write(": keepalive\n\n"), 15000);
    req.on("close", () => clearInterval(interval));
    return;
  }

  // ═══════════════════════════════════════════════════════
  // SEED (development only)
  // ═══════════════════════════════════════════════════════

  if (path === "/seed" && method === "POST") {
    const { seedDemoData } = await import("./seed.js");
    await seedDemoData(userId);
    return json(res, { ok: true, message: "Demo data seeded" });
  }

  json(res, { error: "Not found" }, 404);
}

// ═══════════════════════════════════════════════════════
// Formatters — shape DB rows for API responses
// ═══════════════════════════════════════════════════════

function formatRequest(r: any) {
  return {
    id: r.id,
    agentId: r.agent_id,
    runId: r.run_id,
    tool: r.tool,
    capability: r.capability,
    label: r.label,
    riskLane: r.risk_lane,
    summary: r.summary,
    originType: r.origin_type,
    originClient: r.origin_client,
    args: r.request_args,
    status: r.status,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

function formatRequestDetail(r: any) {
  return {
    ...formatRequest(r),
    decisions: (r.decisions ?? []).map(formatDecision),
    executions: (r.executions ?? []).map(formatExecution),
  };
}

function formatDecision(d: any) {
  return {
    id: d.id,
    requestId: d.request_id,
    decidedBy: d.decided_by,
    decision: d.decision,
    mode: d.mode,
    reason: d.reason,
    proofDigest: d.proof_digest,
    decidedAt: new Date(d.decided_at).toISOString(),
  };
}

function formatExecution(e: any) {
  return {
    id: e.id,
    requestId: e.request_id,
    decisionId: e.decision_id,
    tool: e.tool,
    args: e.args,
    output: e.output,
    durationMs: e.duration_ms,
    authDigest: e.auth_digest,
    execDigest: e.exec_digest,
    status: e.status,
    error: e.error,
    executedAt: new Date(e.executed_at).toISOString(),
  };
}

function formatRun(r: any) {
  return {
    id: r.id,
    agentId: r.agent_id,
    name: r.name,
    summary: r.summary,
    status: r.status,
    requestCount: r.request_count,
    startedAt: new Date(r.started_at).toISOString(),
    endedAt: r.ended_at ? new Date(r.ended_at).toISOString() : null,
  };
}

function formatRunDetail(r: any) {
  return {
    ...formatRun(r),
    requests: (r.requests ?? []).map(formatRequest),
  };
}

function formatProof(p: any) {
  return {
    id: p.id,
    agentId: p.agent_id,
    tool: p.tool,
    allowed: p.allowed,
    args: p.args,
    output: p.output,
    reason: p.reason,
    proofDigest: p.proof_digest,
    receipt: p.receipt,
    createdAt: new Date(p.created_at).toISOString(),
  };
}
