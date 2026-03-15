// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import type { AuditEntry, EnforcementDecision, ExecutionContextState } from "./types.js";

/**
 * Mutable execution context tracking cumulative state for policy enforcement.
 * One instance per agent session.
 */
export class ExecutionContext {
  #state: ExecutionContextState;
  #nextAuditId: number;

  constructor(initial?: Partial<ExecutionContextState>) {
    this.#state = {
      totalSpendCents: initial?.totalSpendCents ?? 0,
      toolCallCounts: { ...initial?.toolCallCounts },
      toolCallTimestamps: {},
      globalCallTimestamps: [...(initial?.globalCallTimestamps ?? [])],
      activeSkills: { ...initial?.activeSkills },
      auditLog: [...(initial?.auditLog ?? [])],
    };
    // Deep-copy timestamp arrays
    if (initial?.toolCallTimestamps) {
      for (const [k, v] of Object.entries(initial.toolCallTimestamps)) {
        this.#state.toolCallTimestamps[k] = [...v];
      }
    }
    this.#nextAuditId = this.#state.auditLog.length + 1;
  }

  /** Record a completed tool call. */
  recordCall(tool: string, skill: string | undefined, costCents: number, timestamp?: number): void {
    const now = timestamp ?? Date.now();
    this.#state.totalSpendCents += costCents;
    this.#state.toolCallCounts[tool] = (this.#state.toolCallCounts[tool] ?? 0) + 1;

    if (!this.#state.toolCallTimestamps[tool]) {
      this.#state.toolCallTimestamps[tool] = [];
    }
    this.#state.toolCallTimestamps[tool].push(now);
    this.#state.globalCallTimestamps.push(now);
  }

  /** Start a skill invocation (for concurrency tracking). */
  startSkill(skill: string): void {
    this.#state.activeSkills[skill] = (this.#state.activeSkills[skill] ?? 0) + 1;
  }

  /** End a skill invocation. */
  endSkill(skill: string): void {
    const current = this.#state.activeSkills[skill] ?? 0;
    this.#state.activeSkills[skill] = Math.max(0, current - 1);
  }

  /** Add an audit entry and return its ID. */
  addAudit(
    tool: string,
    decision: EnforcementDecision,
    opts?: { skill?: string; costCents?: number; proofDigestB64?: string },
  ): string {
    const id = `audit-${this.#nextAuditId++}`;
    const entry: AuditEntry = {
      id,
      timestamp: Date.now(),
      tool,
      skill: opts?.skill,
      decision,
      costCents: opts?.costCents,
      proofDigestB64: opts?.proofDigestB64,
    };
    this.#state.auditLog.push(entry);
    return id;
  }

  /** Prune timestamps outside all rate limit windows (memory hygiene). */
  prune(maxAgeMs: number, now?: number): void {
    const cutoff = (now ?? Date.now()) - maxAgeMs;
    this.#state.globalCallTimestamps = this.#state.globalCallTimestamps.filter((t) => t > cutoff);
    for (const [tool, ts] of Object.entries(this.#state.toolCallTimestamps)) {
      this.#state.toolCallTimestamps[tool] = ts.filter((t) => t > cutoff);
    }
  }

  /** Snapshot the current state (read-only copy). */
  snapshot(): Readonly<ExecutionContextState> {
    return structuredClone(this.#state);
  }

  /** Get audit log entries. */
  getAuditLog(opts?: { offset?: number; limit?: number }): readonly AuditEntry[] {
    const log = this.#state.auditLog;
    const offset = opts?.offset ?? 0;
    const limit = opts?.limit ?? log.length;
    return log.slice(offset, offset + limit);
  }

  /** Get a specific audit entry by ID. */
  getAuditEntry(id: string): AuditEntry | undefined {
    return this.#state.auditLog.find((e) => e.id === id);
  }

  /** Total audit entries. */
  get auditCount(): number {
    return this.#state.auditLog.length;
  }
}
