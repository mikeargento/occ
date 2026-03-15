// Dashboard types — mirrors policy-sdk types used by the management API

export interface AgentPolicy {
  version: "commandcentral/policy/1" | "occ/policy/1";
  name: string;
  description?: string;
  createdAt: number;
  globalConstraints: GlobalConstraints;
  skills: Record<string, SkillDefinition>;
  toolConstraints?: Record<string, ToolConstraints>;
}

export interface GlobalConstraints {
  maxSpendCents?: number;
  rateLimit?: RateLimit;
  allowedTimeWindows?: TimeWindow[];
  allowedTools?: string[];
  blockedTools?: string[];
}

export interface RateLimit {
  maxCalls: number;
  windowMs: number;
}

export interface TimeWindow {
  daysOfWeek?: number[];
  startUtc: string;
  endUtc: string;
}

export interface SkillDefinition {
  name: string;
  tools: string[];
  constraints?: SkillConstraints;
}

export interface SkillConstraints {
  maxSpendPerInvocationCents?: number;
  maxConcurrent?: number;
  rateLimit?: RateLimit;
  requireApproval?: boolean;
}

export interface ToolConstraints {
  rateLimit?: RateLimit;
  maxSpendPerCallCents?: number;
  argumentRestrictions?: Record<string, ArgumentRestriction>;
}

export interface ArgumentRestriction {
  allowedValues?: unknown[];
  blockedValues?: unknown[];
  max?: number;
  min?: number;
  pattern?: string;
}

export type EnforcementDecision =
  | { allowed: true }
  | { allowed: false; reason: string; constraint: string };

export interface AuditEntry {
  id: string;
  timestamp: number;
  tool: string;
  skill?: string;
  decision: EnforcementDecision;
  costCents?: number;
  proofDigestB64?: string;
}

export interface ExecutionContextState {
  totalSpendCents: number;
  toolCallCounts: Record<string, number>;
  toolCallTimestamps: Record<string, number[]>;
  globalCallTimestamps: number[];
  activeSkills: Record<string, number>;
  auditLog: AuditEntry[];
}

export interface DiscoveredTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  source: string;
}

export interface AgentInstance {
  id: string;
  name: string;
  policy: AgentPolicy;
  createdAt: number;
  status: "active" | "paused";
}

export interface AgentSummary extends AgentInstance {
  totalCalls: number;
  totalSpendCents: number;
  auditCount: number;
}

export type ProxyEvent =
  | { type: "tool-executed"; timestamp: number; tool: string; skill?: string; agentId: string; costCents: number; proofDigestB64?: string }
  | { type: "policy-violation"; timestamp: number; tool: string; skill?: string; agentId: string; reason: string; constraint: string }
  | { type: "context-updated"; timestamp: number; agentId: string }
  | { type: "policy-loaded"; timestamp: number; policyName: string; policyDigestB64: string }
  | { type: "proxy-started"; timestamp: number; toolCount: number }
  | { type: "agent-connected"; timestamp: number; agentId: string }
  | { type: "agent-disconnected"; timestamp: number; agentId: string };
