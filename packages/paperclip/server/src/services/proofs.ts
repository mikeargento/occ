import type { Db } from "@paperclipai/db";
import { heartbeatRuns, heartbeatRunEvents, agents } from "@paperclipai/db";
import { eq, and, desc, isNotNull, sql, gte, lte } from "drizzle-orm";

export interface ProofEntry {
  id: string;
  runId: string;
  agentId: string;
  agentName: string;
  proofType: "pre-exec" | "post-exec" | "event";
  proof: Record<string, unknown>;
  timestamp: string;
  counter: string | null;
  enforcement: string | null;
  prevB64: string | null;
  runStatus: string | null;
  eventType: string | null;
  message: string | null;
  model: string | null;
  costUsd: number | null;
}

export interface ProofStats {
  total: number;
  today: number;
  agentsCovered: number;
  enforcementBreakdown: { stub: number; tee: number };
  byAgent: Array<{
    agentId: string;
    agentName: string;
    totalProofs: number;
    lastProofAt: string | null;
    totalCostUsd: number;
  }>;
}

function extractFromProof(proof: Record<string, unknown>) {
  const commit = proof.commit as Record<string, unknown> | undefined;
  const env = proof.environment as Record<string, unknown> | undefined;
  return {
    counter: (commit?.counter as string) ?? null,
    enforcement: (env?.enforcement as string) ?? null,
    prevB64: (commit?.prevB64 as string) ?? null,
  };
}

export function proofService(db: Db) {
  return {
    async listProofs(
      companyId: string,
      filters: {
        agentId?: string;
        proofType?: string;
        enforcement?: string;
        dateFrom?: string;
        dateTo?: string;
        limit?: number;
        offset?: number;
      } = {},
    ): Promise<{ proofs: ProofEntry[]; total: number }> {
      const limit = Math.min(filters.limit ?? 50, 200);
      const offset = filters.offset ?? 0;
      const results: ProofEntry[] = [];

      // Build agent name lookup
      const agentRows = await db
        .select({ id: agents.id, name: agents.name })
        .from(agents)
        .where(eq(agents.companyId, companyId));
      const agentMap = new Map(agentRows.map((a) => [a.id, a.name]));

      // --- Run-level proofs (pre-exec and post-exec) ---
      if (!filters.proofType || filters.proofType === "pre-exec" || filters.proofType === "post-exec") {
        const conditions = [
          eq(heartbeatRuns.companyId, companyId),
        ];
        if (filters.agentId) conditions.push(eq(heartbeatRuns.agentId, filters.agentId));
        if (filters.dateFrom) conditions.push(gte(heartbeatRuns.createdAt, new Date(filters.dateFrom)));
        if (filters.dateTo) conditions.push(lte(heartbeatRuns.createdAt, new Date(filters.dateTo)));

        // Only fetch runs that have at least one OCC proof
        conditions.push(
          sql`(${heartbeatRuns.occProofPreExec} IS NOT NULL OR ${heartbeatRuns.occProofPostExec} IS NOT NULL)`,
        );

        const runs = await db
          .select({
            id: heartbeatRuns.id,
            agentId: heartbeatRuns.agentId,
            status: heartbeatRuns.status,
            preExec: heartbeatRuns.occProofPreExec,
            postExec: heartbeatRuns.occProofPostExec,
            createdAt: heartbeatRuns.createdAt,
          })
          .from(heartbeatRuns)
          .where(and(...conditions))
          .orderBy(desc(heartbeatRuns.createdAt))
          .limit(500); // fetch more than needed since we split into two entries per run

        for (const run of runs) {
          if (run.preExec && (!filters.proofType || filters.proofType === "pre-exec")) {
            const extracted = extractFromProof(run.preExec);
            if (!filters.enforcement || extracted.enforcement?.includes(filters.enforcement)) {
              // Extract payload data from proof metadata
              const payload = run.preExec.payload as Record<string, unknown> | undefined;
              results.push({
                id: `run:${run.id}:pre`,
                runId: run.id,
                agentId: run.agentId,
                agentName: agentMap.get(run.agentId) ?? "Unknown",
                proofType: "pre-exec",
                proof: run.preExec,
                timestamp: run.createdAt.toISOString(),
                ...extracted,
                runStatus: run.status,
                eventType: null,
                message: "Run started",
                model: null,
                costUsd: null,
              });
            }
          }
          if (run.postExec && (!filters.proofType || filters.proofType === "post-exec")) {
            const extracted = extractFromProof(run.postExec);
            if (!filters.enforcement || extracted.enforcement?.includes(filters.enforcement)) {
              // Try to extract cost/model from the proof's payload
              const payload = run.postExec.payload as Record<string, unknown> | undefined;
              results.push({
                id: `run:${run.id}:post`,
                runId: run.id,
                agentId: run.agentId,
                agentName: agentMap.get(run.agentId) ?? "Unknown",
                proofType: "post-exec",
                proof: run.postExec,
                timestamp: run.createdAt.toISOString(),
                ...extracted,
                runStatus: run.status,
                eventType: null,
                message: `Run ${run.status}`,
                model: (payload?.model as string) ?? null,
                costUsd: (payload?.costUsd as number) ?? null,
              });
            }
          }
        }
      }

      // --- Event-level proofs ---
      if (!filters.proofType || filters.proofType === "event") {
        const eventConditions = [
          eq(heartbeatRunEvents.companyId, companyId),
          isNotNull(heartbeatRunEvents.occProof),
        ];
        if (filters.agentId) eventConditions.push(eq(heartbeatRunEvents.agentId, filters.agentId));
        if (filters.dateFrom) eventConditions.push(gte(heartbeatRunEvents.createdAt, new Date(filters.dateFrom)));
        if (filters.dateTo) eventConditions.push(lte(heartbeatRunEvents.createdAt, new Date(filters.dateTo)));

        const events = await db
          .select({
            id: heartbeatRunEvents.id,
            runId: heartbeatRunEvents.runId,
            agentId: heartbeatRunEvents.agentId,
            eventType: heartbeatRunEvents.eventType,
            message: heartbeatRunEvents.message,
            occProof: heartbeatRunEvents.occProof,
            createdAt: heartbeatRunEvents.createdAt,
          })
          .from(heartbeatRunEvents)
          .where(and(...eventConditions))
          .orderBy(desc(heartbeatRunEvents.createdAt))
          .limit(500);

        for (const evt of events) {
          if (!evt.occProof) continue;
          const extracted = extractFromProof(evt.occProof);
          if (filters.enforcement && !extracted.enforcement?.includes(filters.enforcement)) continue;

          results.push({
            id: `event:${evt.id}`,
            runId: evt.runId,
            agentId: evt.agentId,
            agentName: agentMap.get(evt.agentId) ?? "Unknown",
            proofType: "event",
            proof: evt.occProof,
            timestamp: evt.createdAt.toISOString(),
            ...extracted,
            runStatus: null,
            eventType: evt.eventType,
            message: evt.message,
            model: null,
            costUsd: null,
          });
        }
      }

      // Sort all by counter (descending) for consistent ordering
      results.sort((a, b) => {
        const ca = parseInt(a.counter ?? "0", 10);
        const cb = parseInt(b.counter ?? "0", 10);
        return cb - ca;
      });

      const total = results.length;
      const page = results.slice(offset, offset + limit);
      return { proofs: page, total };
    },

    async getProofStats(companyId: string): Promise<ProofStats> {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString();

      // Count run proofs
      const runProofCounts = await db
        .select({
          agentId: heartbeatRuns.agentId,
          preExecCount: sql<number>`count(${heartbeatRuns.occProofPreExec})`,
          postExecCount: sql<number>`count(${heartbeatRuns.occProofPostExec})`,
          preExecToday: sql<number>`count(case when ${heartbeatRuns.createdAt} >= ${todayStr}::timestamptz then ${heartbeatRuns.occProofPreExec} end)`,
          postExecToday: sql<number>`count(case when ${heartbeatRuns.createdAt} >= ${todayStr}::timestamptz then ${heartbeatRuns.occProofPostExec} end)`,
        })
        .from(heartbeatRuns)
        .where(
          and(
            eq(heartbeatRuns.companyId, companyId),
            sql`(${heartbeatRuns.occProofPreExec} IS NOT NULL OR ${heartbeatRuns.occProofPostExec} IS NOT NULL)`,
          ),
        )
        .groupBy(heartbeatRuns.agentId);

      // Count event proofs
      const eventProofCounts = await db
        .select({
          agentId: heartbeatRunEvents.agentId,
          count: sql<number>`count(${heartbeatRunEvents.occProof})`,
          todayCount: sql<number>`count(case when ${heartbeatRunEvents.createdAt} >= ${todayStr}::timestamptz then ${heartbeatRunEvents.occProof} end)`,
        })
        .from(heartbeatRunEvents)
        .where(
          and(
            eq(heartbeatRunEvents.companyId, companyId),
            isNotNull(heartbeatRunEvents.occProof),
          ),
        )
        .groupBy(heartbeatRunEvents.agentId);

      // Agent names
      const agentRows = await db
        .select({ id: agents.id, name: agents.name })
        .from(agents)
        .where(eq(agents.companyId, companyId));
      const agentMap = new Map(agentRows.map((a) => [a.id, a.name]));

      // Aggregate per-agent
      const agentTotals = new Map<string, { proofs: number; today: number }>();
      for (const r of runProofCounts) {
        const existing = agentTotals.get(r.agentId) ?? { proofs: 0, today: 0 };
        existing.proofs += Number(r.preExecCount) + Number(r.postExecCount);
        existing.today += Number(r.preExecToday) + Number(r.postExecToday);
        agentTotals.set(r.agentId, existing);
      }
      for (const e of eventProofCounts) {
        const existing = agentTotals.get(e.agentId) ?? { proofs: 0, today: 0 };
        existing.proofs += Number(e.count);
        existing.today += Number(e.todayCount);
        agentTotals.set(e.agentId, existing);
      }

      let total = 0;
      let todayTotal = 0;
      for (const v of agentTotals.values()) {
        total += v.proofs;
        todayTotal += v.today;
      }

      // Enforcement breakdown — sample from recent proofs
      let stub = 0;
      let tee = 0;
      const recentRuns = await db
        .select({ preExec: heartbeatRuns.occProofPreExec })
        .from(heartbeatRuns)
        .where(
          and(
            eq(heartbeatRuns.companyId, companyId),
            isNotNull(heartbeatRuns.occProofPreExec),
          ),
        )
        .orderBy(desc(heartbeatRuns.createdAt))
        .limit(100);
      for (const r of recentRuns) {
        const env = (r.preExec as Record<string, unknown>)?.environment as Record<string, unknown> | undefined;
        const enforcement = env?.enforcement as string;
        if (enforcement?.includes("tee")) tee++;
        else stub++;
      }

      // Per-agent summary with cost from post-exec proofs
      const byAgent = Array.from(agentTotals.entries()).map(([agentId, counts]) => ({
        agentId,
        agentName: agentMap.get(agentId) ?? "Unknown",
        totalProofs: counts.proofs,
        lastProofAt: null as string | null, // Could query but expensive
        totalCostUsd: 0, // Could extract from post-exec payloads
      }));

      return {
        total,
        today: todayTotal,
        agentsCovered: agentTotals.size,
        enforcementBreakdown: { stub, tee },
        byAgent,
      };
    },

    async getProofsForRun(runId: string): Promise<ProofEntry[]> {
      const agentRows = await db.select({ id: agents.id, name: agents.name }).from(agents);
      const agentMap = new Map(agentRows.map((a) => [a.id, a.name]));

      const results: ProofEntry[] = [];

      // Run proofs
      const [run] = await db
        .select({
          id: heartbeatRuns.id,
          agentId: heartbeatRuns.agentId,
          status: heartbeatRuns.status,
          preExec: heartbeatRuns.occProofPreExec,
          postExec: heartbeatRuns.occProofPostExec,
          createdAt: heartbeatRuns.createdAt,
        })
        .from(heartbeatRuns)
        .where(eq(heartbeatRuns.id, runId))
        .limit(1);

      if (run?.preExec) {
        const extracted = extractFromProof(run.preExec);
        results.push({
          id: `run:${run.id}:pre`,
          runId: run.id,
          agentId: run.agentId,
          agentName: agentMap.get(run.agentId) ?? "Unknown",
          proofType: "pre-exec",
          proof: run.preExec,
          timestamp: run.createdAt.toISOString(),
          ...extracted,
          runStatus: run.status,
          eventType: null,
          message: "Run started",
          model: null,
          costUsd: null,
        });
      }

      // Event proofs
      const events = await db
        .select({
          id: heartbeatRunEvents.id,
          runId: heartbeatRunEvents.runId,
          agentId: heartbeatRunEvents.agentId,
          eventType: heartbeatRunEvents.eventType,
          message: heartbeatRunEvents.message,
          occProof: heartbeatRunEvents.occProof,
          createdAt: heartbeatRunEvents.createdAt,
        })
        .from(heartbeatRunEvents)
        .where(and(eq(heartbeatRunEvents.runId, runId), isNotNull(heartbeatRunEvents.occProof)))
        .orderBy(heartbeatRunEvents.seq);

      for (const evt of events) {
        if (!evt.occProof) continue;
        results.push({
          id: `event:${evt.id}`,
          runId: evt.runId,
          agentId: evt.agentId,
          agentName: agentMap.get(evt.agentId) ?? "Unknown",
          proofType: "event",
          proof: evt.occProof,
          timestamp: evt.createdAt.toISOString(),
          ...extractFromProof(evt.occProof),
          runStatus: null,
          eventType: evt.eventType,
          message: evt.message,
          model: null,
          costUsd: null,
        });
      }

      if (run?.postExec) {
        const extracted = extractFromProof(run.postExec);
        const payload = run.postExec.payload as Record<string, unknown> | undefined;
        results.push({
          id: `run:${run.id}:post`,
          runId: run.id,
          agentId: run.agentId,
          agentName: agentMap.get(run.agentId) ?? "Unknown",
          proofType: "post-exec",
          proof: run.postExec,
          timestamp: run.createdAt.toISOString(),
          ...extracted,
          runStatus: run.status,
          eventType: null,
          message: `Run ${run.status}`,
          model: (payload?.model as string) ?? null,
          costUsd: (payload?.costUsd as number) ?? null,
        });
      }

      // Sort by counter
      results.sort((a, b) => parseInt(a.counter ?? "0", 10) - parseInt(b.counter ?? "0", 10));
      return results;
    },
  };
}
