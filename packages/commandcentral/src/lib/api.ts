// OCC API client — stripped to essentials

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts?.headers },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

// V2 API
async function v2<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v2${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts?.headers },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

// Auth
export async function getMe(): Promise<{ user: { id: string; name: string; email: string; avatar: string } | null }> {
  const res = await fetch("/auth/me");
  if (!res.ok) return { user: null };
  return res.json();
}

// Feed — all requests
export async function getFeed(): Promise<{ requests: FeedItem[] }> {
  return v2("/requests?limit=100");
}

// Approve — returns authorization + execution proof digests
export interface ApproveResponse {
  decision: { id: number; proofDigest: string; mode: string; decidedAt: string };
  execution: { id: number; authDigest: string; execDigest: string };
}
export async function approve(id: number, mode: "once" | "always" = "always"): Promise<ApproveResponse> {
  return v2(`/requests/${id}/approve`, { method: "POST", body: JSON.stringify({ mode }) });
}

// Deny
export async function deny(id: number, mode: "once" | "always" = "once"): Promise<unknown> {
  return v2(`/requests/${id}/deny`, { method: "POST", body: JSON.stringify({ mode }) });
}

// Token
export async function getToken(): Promise<{ token: string }> {
  return api("/settings/token");
}

// API Key
export async function getApiKeyStatus(): Promise<{ hasKey: boolean; maskedKey: string | null }> {
  return api("/settings/api-key");
}

export async function saveApiKey(key: string): Promise<{ ok: boolean; maskedKey: string }> {
  return api("/settings/api-key", { method: "PUT", body: JSON.stringify({ key }) });
}

export async function deleteApiKey(): Promise<{ ok: boolean }> {
  return api("/settings/api-key", { method: "DELETE" });
}

// User's proofs (TEE proof log via V2 API)
export async function getProofs(limit = 20, offset = 0, search = "", fullChain = false): Promise<{ proofs: V2Proof[]; total: number }> {
  const params = `limit=${limit}&offset=${offset}${search ? `&search=${encodeURIComponent(search)}` : ""}${fullChain ? "&full=1" : ""}`;
  return v2(`/proofs?${params}`);
}

// Wipe all test data
export async function wipeAll(): Promise<{ ok: boolean }> {
  return v2("/wipe", { method: "POST" });
}

// Types
export interface V2Proof {
  id: number;
  agentId: string;
  tool: string;
  allowed: boolean;
  reason?: string;
  proofDigest: string | null;
  args?: unknown;
  receipt?: Record<string, unknown>;
  createdAt: string;
}

export interface ProofEntry {
  id: string;
  agentId: string;
  tool: string;
  decision: { allowed: boolean; reason?: string };
  proofDigestB64: string | null;
  timestamp: number;
}

export interface FeedItem {
  id: number;
  agentId: string;
  tool: string;
  label: string;
  summary: string;
  riskLane: string;
  status: "pending" | "approved" | "denied" | "auto_approved" | "expired";
  originClient: string;
  args: unknown;
  createdAt: string;
}
