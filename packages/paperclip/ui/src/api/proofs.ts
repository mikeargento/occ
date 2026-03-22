import { api } from "./client";

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

export interface ProofListResponse {
  proofs: ProofEntry[];
  total: number;
}

export const proofsApi = {
  list: (companyId: string, params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : "";
    return api.get<ProofListResponse>(`/companies/${companyId}/proofs${qs}`);
  },
  stats: (companyId: string) =>
    api.get<ProofStats>(`/companies/${companyId}/proofs/stats`),
  forRun: (companyId: string, runId: string) =>
    api.get<ProofEntry[]>(`/companies/${companyId}/proofs/runs/${runId}`),
};
