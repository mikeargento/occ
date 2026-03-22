// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * OCC policy enforcement adapted for Paperclip's plugin context.
 *
 * Wraps the core `enforcePolicy()` from occ-policy-sdk with:
 * - Per-agent execution context tracking
 * - Proof signing for both allowed and denied actions
 * - JSONL proof log writing
 */

import {
  enforcePolicy,
  ExecutionContext,
  type AgentPolicy,
  type EnforcementDecision,
} from "occ-policy-sdk";
import type { OCCProof } from "occproof";
import { getAgentSigner } from "./signer.js";
import { appendProofEntry, type ProofLogEntry } from "./proof-log.js";

/** Per-agent execution contexts — tracks rate limits, spend, etc. */
const agentContexts = new Map<string, ExecutionContext>();

function getOrCreateContext(agentId: string): ExecutionContext {
  let ctx = agentContexts.get(agentId);
  if (!ctx) {
    ctx = new ExecutionContext();
    agentContexts.set(agentId, ctx);
  }
  return ctx;
}

/** Reset an agent's execution context (e.g. on policy change). */
export function resetAgentContext(agentId: string): void {
  agentContexts.delete(agentId);
}

/** Get read-only snapshot of an agent's execution context. */
export function getAgentContextSnapshot(agentId: string) {
  const ctx = agentContexts.get(agentId);
  return ctx ? ctx.snapshot() : null;
}

/** Get the full audit log for an agent. */
export function getAgentAuditLog(
  agentId: string,
  opts?: { offset?: number; limit?: number },
) {
  const ctx = agentContexts.get(agentId);
  return ctx ? ctx.getAuditLog(opts) : [];
}

export interface EnforceResult {
  decision: EnforcementDecision;
  proof: OCCProof | null;
  auditId: string;
}

/**
 * Enforce OCC policy on a tool call for a Paperclip agent.
 *
 * 1. Runs the stateless enforcePolicy() check
 * 2. Signs a proof (allowed or denied)
 * 3. Records in the agent's execution context
 * 4. Appends to the agent's proof.jsonl
 */
export async function enforceToolCall(
  agentId: string,
  policy: AgentPolicy,
  toolName: string,
  args: Record<string, unknown>,
  opts?: { skill?: string },
): Promise<EnforceResult> {
  const ctx = getOrCreateContext(agentId);
  const now = Date.now();

  // Step 1: Run stateless policy check
  const decision = enforcePolicy(policy, ctx.snapshot(), {
    tool: toolName,
    skill: opts?.skill,
    arguments: args,
    timestamp: now,
  });

  // Step 2: Sign a proof
  let proof: OCCProof | null = null;
  try {
    const signer = await getAgentSigner(agentId);
    const payload: Record<string, unknown> = {
      type: decision.allowed
        ? "occ-paperclip/tool-execution"
        : "occ-paperclip/tool-denial",
      agentId,
      tool: toolName,
      args,
      timestamp: now,
    };
    if (!decision.allowed) {
      payload["denied"] = true;
      payload["reason"] = decision.reason;
      payload["constraint"] = decision.constraint;
    }

    proof = await signer.sign(payload, {
      type: decision.allowed ? "tool-execution" : "tool-denial",
      tool: toolName,
      agentId,
    });
  } catch (err) {
    console.warn("[occ-plugin] Proof signing failed:", err);
  }

  // Step 3: Record in execution context
  const auditOpts: { skill?: string; proofDigestB64?: string } = {};
  if (opts?.skill) auditOpts.skill = opts.skill;

  if (decision.allowed) {
    ctx.recordCall(toolName, opts?.skill, 0, now);
  }
  const auditId = ctx.addAudit(toolName, decision, auditOpts);

  // Step 4: Write to proof log
  const entry: ProofLogEntry = {
    timestamp: new Date(now).toISOString(),
    agentId,
    tool: toolName,
    args,
    decision: decision.allowed ? "allowed" : "denied",
    proof: proof ?? undefined,
  };
  if (!decision.allowed) {
    entry.reason = decision.reason;
    entry.constraint = decision.constraint;
  }
  appendProofEntry(agentId, entry);

  return { decision, proof, auditId };
}
