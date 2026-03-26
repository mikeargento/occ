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

export function v2GetOverview(): Promise<V2Overview> {
  return fetchJSON("/api/v2/overview");
}

// --- Requests ---

export function v2GetRequests(filters?: V2RequestFilters): Promise<V2Request[]> {
  const query = filters
    ? qs({
        status: filters.status,
        riskLane: filters.riskLane,
        agentId: filters.agentId,
        limit: filters.limit,
        offset: filters.offset,
      })
    : "";
  return fetchJSON(`/api/v2/requests${query}`);
}

export function v2GetPendingRequests(): Promise<V2Request[]> {
  return fetchJSON("/api/v2/requests/pending");
}

export function v2GetRequestStats(): Promise<V2RequestStats> {
  return fetchJSON("/api/v2/requests/stats");
}

export function v2GetRequest(id: number): Promise<V2RequestDetail> {
  return fetchJSON(`/api/v2/requests/${id}`);
}

export function v2ApproveRequest(
  id: number,
  mode: string = "manual"
): Promise<{ ok: boolean }> {
  return fetchJSON(`/api/v2/requests/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ mode }),
  });
}

export function v2DenyRequest(
  id: number,
  mode: string = "manual",
  reason?: string
): Promise<{ ok: boolean }> {
  return fetchJSON(`/api/v2/requests/${id}/deny`, {
    method: "POST",
    body: JSON.stringify({ mode, reason }),
  });
}

export function v2BulkAction(
  ids: number[],
  action: "approve" | "deny",
  mode: string = "manual"
): Promise<{ ok: boolean; count: number }> {
  return fetchJSON("/api/v2/requests/bulk", {
    method: "POST",
    body: JSON.stringify({ ids, action, mode }),
  });
}

// --- Runs ---

export function v2GetRuns(filters?: V2RunFilters): Promise<V2Run[]> {
  const query = filters
    ? qs({
        agentId: filters.agentId,
        status: filters.status,
        limit: filters.limit,
        offset: filters.offset,
      })
    : "";
  return fetchJSON(`/api/v2/runs${query}`);
}

export function v2GetRun(id: number): Promise<V2RunDetail> {
  return fetchJSON(`/api/v2/runs/${id}`);
}

// --- Proofs ---

export function v2GetProofs(filters?: V2ProofFilters): Promise<V2Proof[]> {
  const query = filters
    ? qs({
        agentId: filters.agentId,
        tool: filters.tool,
        allowed: filters.allowed,
        limit: filters.limit,
        offset: filters.offset,
      })
    : "";
  return fetchJSON(`/api/v2/proofs${query}`);
}

// --- Policy / Risk Lanes ---

export function v2GetRiskLanes(): Promise<V2RiskLane[]> {
  return fetchJSON("/api/v2/policy/lanes");
}

export function v2SetRiskLane(
  lane: RiskLane,
  mode: LaneMode
): Promise<{ ok: boolean }> {
  return fetchJSON(`/api/v2/policy/lanes/${lane}`, {
    method: "PUT",
    body: JSON.stringify({ mode }),
  });
}

// --- Seed ---

export function v2SeedDemo(): Promise<{ ok: boolean; message: string }> {
  return fetchJSON("/api/v2/seed", { method: "POST" });
}
