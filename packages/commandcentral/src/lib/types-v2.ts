export type RequestStatus =
  | "pending"
  | "approved"
  | "denied"
  | "auto_approved"
  | "expired";

export type RiskLane =
  | "read_only"
  | "file_modification"
  | "external_comms"
  | "deployment"
  | "financial"
  | "credential_access"
  | "unknown";

export type LaneMode = "auto_approve" | "ask" | "auto_deny";

export interface V2Request {
  id: number;
  agentId: string;
  runId: number | null;
  tool: string;
  capability: string | null;
  label: string | null;
  riskLane: RiskLane;
  summary: string | null;
  originType: string;
  originClient: string | null;
  args: unknown;
  status: RequestStatus;
  createdAt: string;
}

export interface V2Decision {
  id: number;
  requestId: number;
  decidedBy: string;
  decision: "approved" | "denied";
  mode: string;
  reason: string | null;
  proofDigest: string | null;
  decidedAt: string;
}

export interface V2Execution {
  id: number;
  requestId: number;
  decisionId: number;
  tool: string;
  args: unknown;
  output: unknown;
  durationMs: number | null;
  authDigest: string | null;
  execDigest: string | null;
  status: string;
  error: string | null;
  executedAt: string;
}

export interface V2RequestDetail extends V2Request {
  decisions: V2Decision[];
  executions: V2Execution[];
}

export interface V2Run {
  id: number;
  agentId: string;
  name: string | null;
  summary: string | null;
  status: string;
  requestCount: number;
  startedAt: string;
  endedAt: string | null;
}

export interface V2RunDetail extends V2Run {
  requests: V2Request[];
}

export interface V2RiskLane {
  lane: RiskLane;
  label: string;
  description: string;
  severity: number;
  mode: LaneMode;
}

export interface V2Proof {
  id: number;
  agentId: string;
  tool: string;
  allowed: boolean;
  args: unknown;
  output: unknown;
  reason: string | null;
  proofDigest: string | null;
  receipt: unknown;
  createdAt: string;
}

export interface V2Overview {
  pending: number;
  todayApproved: number;
  todayDenied: number;
  todayTotal: number;
  activeRuns: number;
  recentActivity: V2ActivityItem[];
}

export interface V2ActivityItem {
  id: number;
  tool: string;
  agentId: string;
  status: RequestStatus;
  riskLane: RiskLane;
  summary: string | null;
  createdAt: string;
}

export interface V2RequestFilters {
  status?: RequestStatus;
  riskLane?: RiskLane;
  agentId?: string;
  limit?: number;
  offset?: number;
}

export interface V2RunFilters {
  agentId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface V2ProofFilters {
  agentId?: string;
  tool?: string;
  digest?: string;
  allowed?: boolean;
  limit?: number;
  offset?: number;
}

export interface V2RequestStats {
  total: number;
  pending: number;
  approved: number;
  denied: number;
  autoApproved: number;
  expired: number;
  byLane: Record<RiskLane, number>;
}
