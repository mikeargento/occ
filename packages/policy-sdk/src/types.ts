// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import type { OCCProof } from "occproof";

// ── Policy Definition ──

/** Top-level agent policy document. Committed to OCC before agent runs. */
export interface AgentPolicy {
  version: "occ/policy/1" | "occ/policy/1";
  name: string;
  description?: string | undefined;
  createdAt: number;
  /** Global constraints that apply to ALL tool calls. */
  globalConstraints: GlobalConstraints;
  /** Named skills — groups of tools with skill-level constraints. */
  skills: Record<string, SkillDefinition>;
  /** Per-tool overrides. */
  toolConstraints?: Record<string, ToolConstraints> | undefined;
}

/** Constraints that apply across all tools/skills. */
export interface GlobalConstraints {
  /** Max total spend (cumulative, in cents to avoid float issues). */
  maxSpendCents?: number | undefined;
  /** Max tool calls per time window. */
  rateLimit?: RateLimit | undefined;
  /** Time windows when agent is allowed to operate (UTC). */
  allowedTimeWindows?: TimeWindow[] | undefined;
  /** If set, only these tools are permitted (allowlist). */
  allowedTools?: string[] | undefined;
  /** These tools are never permitted (blocklist, overrides allowedTools). */
  blockedTools?: string[] | undefined;
}

export interface RateLimit {
  maxCalls: number;
  windowMs: number;
}

export interface TimeWindow {
  /** Day-of-week filter (0=Sun). Empty/undefined = every day. */
  daysOfWeek?: number[] | undefined;
  /** Start time "HH:MM" in UTC. */
  startUtc: string;
  /** End time "HH:MM" in UTC. */
  endUtc: string;
}

/** A skill groups related tool calls with skill-level constraints. */
export interface SkillDefinition {
  name: string;
  /** Ordered list of tool names this skill orchestrates. */
  tools: string[];
  constraints?: SkillConstraints | undefined;
}

export interface SkillConstraints {
  /** Per-invocation spend limit for this skill (cents). */
  maxSpendPerInvocationCents?: number | undefined;
  /** Max concurrent executions of this skill. */
  maxConcurrent?: number | undefined;
  /** Skill-specific rate limit. */
  rateLimit?: RateLimit | undefined;
  /** If true, requires human approval before execution. */
  requireApproval?: boolean | undefined;
}

/** Per-tool constraint overrides. */
export interface ToolConstraints {
  rateLimit?: RateLimit | undefined;
  /** Per-call spend cap for this tool (cents). */
  maxSpendPerCallCents?: number | undefined;
  /** Specific argument value restrictions. */
  argumentRestrictions?: Record<string, ArgumentRestriction> | undefined;
}

export interface ArgumentRestriction {
  allowedValues?: unknown[] | undefined;
  blockedValues?: unknown[] | undefined;
  max?: number | undefined;
  min?: number | undefined;
  /** Regex pattern the string value must match. */
  pattern?: string | undefined;
}

// ── Enforcement Results ──

export type EnforcementDecision =
  | { allowed: true }
  | { allowed: false; reason: string; constraint: string };

// ── Enforcement Request ──

export interface EnforcementRequest {
  tool: string;
  skill?: string | undefined;
  arguments: Record<string, unknown>;
  estimatedCostCents?: number | undefined;
  timestamp?: number | undefined;
}

// ── Execution Context State ──

export interface ExecutionContextState {
  totalSpendCents: number;
  toolCallCounts: Record<string, number>;
  toolCallTimestamps: Record<string, number[]>;
  globalCallTimestamps: number[];
  activeSkills: Record<string, number>;
  auditLog: AuditEntry[];
}

export interface AuditEntry {
  id: string;
  timestamp: number;
  tool: string;
  skill?: string | undefined;
  decision: EnforcementDecision;
  costCents?: number | undefined;
  proofDigestB64?: string | undefined;
}

// ── Agent Instance ──

/** An agent instance with its own policy and execution context. */
export interface AgentInstance {
  id: string;
  name: string;
  policy: AgentPolicy;
  createdAt: number;
  status: "active" | "paused";
}

// ── Policy Commitment ──

export interface PolicyCommitment {
  policy: AgentPolicy;
  policyDigestB64: string;
  occProof: OCCProof;
  committedAt: number;
}
