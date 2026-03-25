import type {
  AgentInstance,
  AgentPolicy,
  AgentSummary,
  AuditEntry,
  Connection,
  DiscoveredTool,
  DownstreamServer,
  ExecutionContextState,
  StoredKey,
} from "./types";

function getBaseUrl(): string {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("occ-proxy-url");
    if (stored) return stored;
    return "";
  }
  return "";
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${getBaseUrl()}/api${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...opts?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ── Health ──

export async function getHealth(): Promise<{ ok: boolean; proxyId: string; timestamp: number }> {
  return apiFetch("/health");
}

// ── Status ──

export async function getStatus(): Promise<{
  ok: boolean;
  proxyId: string;
  mode: "demo" | "live";
  toolCount: number;
  timestamp: number;
}> {
  return apiFetch("/status");
}

// Old policy endpoint removed — see new one below

export async function loadPolicy(policy: AgentPolicy): Promise<{
  policy: AgentPolicy;
  policyDigestB64: string;
  committedAt: number;
}> {
  return apiFetch("/policy", {
    method: "PUT",
    body: JSON.stringify(policy),
  });
}

// ── Tools ──

export async function getTools(): Promise<{ tools: DiscoveredTool[] }> {
  return apiFetch("/tools");
}

// ── Agents ──

export async function getAgents(): Promise<{ agents: AgentSummary[] }> {
  return apiFetch("/agents");
}

export async function getAgent(agentId: string): Promise<{
  agent: AgentInstance;
  context: ExecutionContextState;
  auditCount: number;
}> {
  return apiFetch(`/agents/${encodeURIComponent(agentId)}`);
}

export async function createAgent(name: string, allowedTools?: string[]): Promise<{ agent: AgentInstance }> {
  return apiFetch("/agents", {
    method: "POST",
    body: JSON.stringify({ name, allowedTools }),
  });
}

export async function deleteAgent(agentId: string): Promise<{ deleted: boolean }> {
  return apiFetch(`/agents/${encodeURIComponent(agentId)}`, { method: "DELETE" });
}

export async function renameAgent(agentId: string, name: string): Promise<{ renamed: boolean }> {
  return apiFetch(`/agents/${encodeURIComponent(agentId)}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
}

export async function getAgentActivity(agentId: string): Promise<{ entries: any[] }> {
  return apiFetch(`/agents/${encodeURIComponent(agentId)}/activity`);
}

export async function updateAgentPolicy(agentId: string, policy: AgentPolicy): Promise<{ policy: AgentPolicy }> {
  return apiFetch(`/agents/${encodeURIComponent(agentId)}/policy`, {
    method: "PUT",
    body: JSON.stringify(policy),
  });
}

export async function enableTool(agentId: string, toolName: string): Promise<{ tool: string; enabled: boolean }> {
  return apiFetch(`/agents/${encodeURIComponent(agentId)}/tools/${encodeURIComponent(toolName)}`, {
    method: "PUT",
  });
}

export async function disableTool(agentId: string, toolName: string): Promise<{ tool: string; enabled: boolean }> {
  return apiFetch(`/agents/${encodeURIComponent(agentId)}/tools/${encodeURIComponent(toolName)}`, {
    method: "DELETE",
  });
}

export async function pauseAgent(agentId: string): Promise<{ paused: boolean }> {
  return apiFetch(`/agents/${encodeURIComponent(agentId)}/pause`, { method: "PUT" });
}

export async function resumeAgent(agentId: string): Promise<{ paused: boolean }> {
  return apiFetch(`/agents/${encodeURIComponent(agentId)}/resume`, { method: "PUT" });
}

// ── Context ──

export async function getContext(agentId = "default-agent"): Promise<ExecutionContextState> {
  return apiFetch(`/context?agentId=${encodeURIComponent(agentId)}`);
}

// ── Audit ──

export async function getAuditLog(opts?: {
  agentId?: string;
  page?: number;
  limit?: number;
}): Promise<{ entries: AuditEntry[]; total: number; page: number; limit: number }> {
  const params = new URLSearchParams();
  if (opts?.agentId) params.set("agentId", opts.agentId);
  if (opts?.page !== undefined) params.set("page", String(opts.page));
  if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
  return apiFetch(`/audit?${params.toString()}`);
}

export async function getAuditEntry(auditId: string, agentId = "default-agent"): Promise<{
  entry: AuditEntry;
  receipt: unknown | null;
}> {
  return apiFetch(`/audit/${encodeURIComponent(auditId)}?agentId=${encodeURIComponent(agentId)}`);
}

// ── Connections (downstream MCP servers) ──

export async function listConnections(): Promise<DownstreamServer[]> {
  return apiFetch("/connections");
}

// ── Permissions ──

export interface Permission {
  id: number; agentId: string; tool: string; status: "pending" | "approved" | "denied" | "revoked";
  clientName: string; requestedAt: number; resolvedAt: number | null;
  requestArgs: unknown; proofDigest: string | null; explorerUrl: string | null;
}

export async function getAllPermissions(): Promise<{ permissions: Permission[] }> {
  return apiFetch("/permissions");
}

export async function getPendingPermissions(): Promise<{ requests: Array<{
  id: number; agentId: string; tool: string; clientName: string; requestedAt: number; requestArgs?: unknown;
}> }> {
  return apiFetch("/permissions/pending");
}

export async function getActivePermissions(): Promise<{ permissions: Array<{
  id: number; agentId: string; tool: string; status: string; resolvedAt: number | null;
  proofDigest: string | null; explorerUrl: string | null;
}> }> {
  return apiFetch("/permissions/active");
}

export async function approvePermission(id: number): Promise<unknown> {
  return apiFetch(`/permissions/${id}/approve`, { method: "POST" });
}

export async function denyPermission(id: number): Promise<unknown> {
  return apiFetch(`/permissions/${id}/deny`, { method: "POST" });
}

export async function revokePermission(agentId: string, tool: string): Promise<unknown> {
  return apiFetch("/permissions/revoke", {
    method: "POST",
    body: JSON.stringify({ agentId, tool }),
  });
}

export async function getConnectConfig(): Promise<{
  mcpUrl: string; claudeCode: string; claudeDesktop: string; cursor: string; generic: string;
}> {
  return apiFetch("/connect-config");
}

export interface ChainEntry {
  id: number; type: string; proofDigest: string;
  referencesDigest: string | null; createdAt: number;
  explorerUrl: string | null;
}

export async function getAuthorizationChain(agentId: string, tool: string): Promise<{ chain: ChainEntry[] }> {
  return apiFetch(`/authorizations/${encodeURIComponent(agentId)}/${encodeURIComponent(tool)}/chain`);
}

// ── Policy ──

export interface PolicyData {
  categories: Record<string, boolean>;
  customRules: string[];
  allowedTools: string[];
}

export async function getPolicy(): Promise<{ policy: (PolicyData & Partial<AgentPolicy>) | null; policyDigestB64: string | null; committedAt: number | null }> {
  return apiFetch("/policy");
}

export async function commitPolicy(categories: Record<string, boolean>, customRules: string[], agentId?: string): Promise<{ policyDigestB64: string; committedAt: number }> {
  return apiFetch("/policy", {
    method: "PUT",
    body: JSON.stringify({ categories, customRules, name: "default", allowedTools: [], agentId }),
  });
}

// ── Keys ──

export async function listKeys(): Promise<StoredKey[]> {
  return apiFetch("/keys");
}

export async function setKey(id: string, name: string, value: string): Promise<StoredKey> {
  return apiFetch("/keys", {
    method: "POST",
    body: JSON.stringify({ id, name, value }),
  });
}

export async function deleteKey(id: string): Promise<boolean> {
  return apiFetch(`/keys/${encodeURIComponent(id)}`, { method: "DELETE" });
}
