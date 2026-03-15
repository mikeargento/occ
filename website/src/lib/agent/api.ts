import type {
  AgentInstance,
  AgentPolicy,
  AgentSummary,
  AuditEntry,
  DiscoveredTool,
  ExecutionContextState,
} from "./types";

function getBaseUrl(): string {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("occ-proxy-url");
    if (stored) return stored;
    return "http://localhost:9100";
  }
  return "http://localhost:9100";
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
