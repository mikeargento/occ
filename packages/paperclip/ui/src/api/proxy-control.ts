import { api } from "./client";

export interface SignerConfig {
  mode: "occ-cloud" | "custom-tee" | "local";
  teeUrl?: string;
  publicKey?: string;
}

export interface PolicyConfig {
  readPaths: string[];
  writePaths: string[];
  permissions: Record<string, boolean>;
  globalRate: number;
  maxSpend: number;
  requiredApprovals: number;
  toolSettings: Record<string, {
    rateLimit?: number;
    argsPattern?: string;
    filePaths?: string;
    notes?: string;
  }>;
  allowedTools: string[];
}

export interface ProxyTool {
  name: string;
  enabled: boolean;
  settings: {
    rateLimit?: number;
    argsPattern?: string;
    filePaths?: string;
    notes?: string;
  } | null;
}

export interface AuditEntry {
  id: string;
  tool: string;
  allowed: boolean;
  timestamp: number;
  hash?: string;
  agentId?: string;
}

export interface ConsensusRequest {
  id: string;
  agentId: string;
  tool: string;
  args: Record<string, unknown>;
  requiredApprovals: number;
  status: "pending" | "approved" | "rejected";
  version: number;
  approvals: Array<{ agentId: string; version: number; timestamp: number }>;
  history: Array<{
    type: string;
    agentId: string;
    version: number;
    timestamp: number;
    note?: string;
    changes?: Record<string, unknown>;
  }>;
  createdAt: number;
  updatedAt: number;
}

export const proxyControlApi = {
  // Signer
  getSigner: () => api.get<SignerConfig>("/proxy/signer"),
  updateSigner: (config: { mode: string; teeUrl?: string }) =>
    api.put<SignerConfig>("/proxy/signer", config),

  // Policy
  getPolicy: () => api.get<{ policy: PolicyConfig }>("/proxy/policy"),
  updatePolicy: (policy: Partial<PolicyConfig>) =>
    api.put<{ policy: PolicyConfig }>("/proxy/policy", policy),

  // Tools
  getTools: () => api.get<{ tools: ProxyTool[] }>("/proxy/tools"),

  // Audit
  getAudit: (limit = 50, offset = 0) =>
    api.get<{ entries: AuditEntry[]; total: number }>(
      `/proxy/audit?limit=${limit}&offset=${offset}`,
    ),

  // Consensus
  submitConsensus: (body: {
    agentId: string;
    tool: string;
    args?: Record<string, unknown>;
    requiredApprovals: number;
  }) => api.post<{ request: ConsensusRequest }>("/proxy/consensus", body),

  getPendingConsensus: () =>
    api.get<{ requests: ConsensusRequest[] }>("/proxy/consensus"),

  getConsensus: (id: string) =>
    api.get<{ request: ConsensusRequest }>(`/proxy/consensus/${id}`),

  approveConsensus: (id: string, agentId: string) =>
    api.post<{ request: ConsensusRequest }>(`/proxy/consensus/${id}/approve`, { agentId }),

  fixConsensus: (id: string, agentId: string, args: Record<string, unknown>, note?: string) =>
    api.post<{ request: ConsensusRequest }>(`/proxy/consensus/${id}/fix`, { agentId, args, note }),

  requestChanges: (id: string, agentId: string, note: string) =>
    api.post<{ request: ConsensusRequest }>(`/proxy/consensus/${id}/changes`, { agentId, note }),
};
