import type {
  V2Overview,
  V2Request,
  V2RequestDetail,
  V2RequestFilters,
  V2RequestStats,
  V2Run,
  V2RunDetail,
  V2RunFilters,
  V2Proof,
  V2ProofFilters,
  V2RiskLane,
  LaneMode,
  RiskLane,
} from "./types-v2";

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null
  );
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(
    entries.map(([k, v]) => [k, String(v)])
  ).toString();
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

// --- Overview ---

export async function v2GetOverview(): Promise<V2Overview> {
  const data = await fetchJSON<any>("/api/v2/overview");
  return {
    pending: data.pending ?? 0,
    todayApproved: data.todayApproved ?? 0,
    todayDenied: data.todayDenied ?? 0,
    todayTotal: data.todayTotal ?? 0,
    activeRuns: data.activeRuns ?? 0,
    recentActivity: Array.isArray(data.recentActivity) ? data.recentActivity.map((r: any) => ({
      id: r.id,
      tool: r.tool,
      status: r.status,
      agentId: r.agent_id ?? r.agentId ?? "",
      riskLane: r.risk_lane ?? r.riskLane ?? "unknown",
      summary: r.summary,
      createdAt: r.created_at ?? r.createdAt ?? new Date().toISOString(),
    })) : [],
  };
}

// --- Requests ---

export async function v2GetRequests(filters?: V2RequestFilters): Promise<V2Request[]> {
  const query = filters
    ? qs({
        status: filters.status,
        risk_lane: filters.riskLane,
        agent_id: filters.agentId,
        limit: filters.limit,
        offset: filters.offset,
      })
    : "";
  const data = await fetchJSON<any>(`/api/v2/requests${query}`);
  return Array.isArray(data.requests) ? data.requests : Array.isArray(data) ? data : [];
}

export async function v2GetPendingRequests(): Promise<V2Request[]> {
  const data = await fetchJSON<any>("/api/v2/requests/pending");
  return Array.isArray(data.requests) ? data.requests : Array.isArray(data) ? data : [];
}

export async function v2GetRequestStats(): Promise<V2RequestStats> {
  const data = await fetchJSON<any>("/api/v2/requests/stats");
  return data.stats ?? data ?? [];
}

export async function v2GetRequest(id: number): Promise<V2RequestDetail> {
  const data = await fetchJSON<any>(`/api/v2/requests/${id}`);
  return data.request ?? data;
}

export async function v2ApproveRequest(
  id: number,
  mode: string = "once"
): Promise<any> {
  return fetchJSON(`/api/v2/requests/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ mode }),
  });
}

export async function v2DenyRequest(
  id: number,
  mode: string = "once",
  reason?: string
): Promise<any> {
  return fetchJSON(`/api/v2/requests/${id}/deny`, {
    method: "POST",
    body: JSON.stringify({ mode, reason }),
  });
}

export async function v2BulkAction(
  ids: number[],
  action: "approve" | "deny",
  mode: string = "once"
): Promise<any> {
  return fetchJSON("/api/v2/requests/bulk", {
    method: "POST",
    body: JSON.stringify({ ids, action, mode }),
  });
}

// --- Runs ---

export async function v2GetRuns(filters?: V2RunFilters): Promise<V2Run[]> {
  const query = filters
    ? qs({
        agent_id: filters.agentId,
        status: filters.status,
        limit: filters.limit,
        offset: filters.offset,
      })
    : "";
  const data = await fetchJSON<any>(`/api/v2/runs${query}`);
  return Array.isArray(data.runs) ? data.runs : Array.isArray(data) ? data : [];
}

export async function v2GetRun(id: number): Promise<V2RunDetail> {
  const data = await fetchJSON<any>(`/api/v2/runs/${id}`);
  return data.run ?? data;
}

// --- Proofs ---

export async function v2GetProofs(filters?: V2ProofFilters): Promise<{ proofs: V2Proof[]; total: number }> {
  const query = filters
    ? qs({
        agent_id: filters.agentId,
        tool: filters.tool,
        digest: filters.digest,
        limit: filters.limit,
        offset: filters.offset,
      })
    : "";
  const data = await fetchJSON<any>(`/api/v2/proofs${query}`);
  return {
    proofs: Array.isArray(data.proofs) ? data.proofs : [],
    total: data.total ?? 0,
  };
}

// --- Policy / Risk Lanes ---

export async function v2GetRiskLanes(): Promise<V2RiskLane[]> {
  const data = await fetchJSON<any>("/api/v2/policy/lanes");
  return Array.isArray(data.lanes) ? data.lanes : Array.isArray(data) ? data : [];
}

export async function v2SetRiskLane(
  lane: RiskLane,
  mode: LaneMode
): Promise<any> {
  return fetchJSON(`/api/v2/policy/lanes/${lane}`, {
    method: "PUT",
    body: JSON.stringify({ mode }),
  });
}

// --- Seed ---

export async function v2SeedDemo(): Promise<any> {
  return fetchJSON("/api/v2/seed", { method: "POST" });
}
