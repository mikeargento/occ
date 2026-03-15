// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import {
  enforcePolicy,
  type EnforcementDecision,
} from "occ-policy-sdk";
import {
  createExecutionEnvelope,
  hashExecutionEnvelope,
  commitExecutionEnvelope,
  hashValue,
  exportReceipt,
  type OccAgentConfig,
} from "occ-agent";
import type { ToolRegistry } from "./tool-registry.js";
import type { ProxyState } from "./state.js";
import type { ProxyEventBus } from "./events.js";
import type { InterceptResult } from "./types.js";
import type { LocalSigner } from "./local-signer.js";

/**
 * Core enforcement + receipt middleware.
 * Intercepts every tool call for policy checks and OCC receipting.
 */
export class Interceptor {
  #registry: ToolRegistry;
  #state: ProxyState;
  #events: ProxyEventBus;
  #occConfig: OccAgentConfig | undefined;
  #localSigner: LocalSigner | undefined;

  constructor(
    registry: ToolRegistry,
    state: ProxyState,
    events: ProxyEventBus,
    opts: {
      occConfig?: OccAgentConfig;
      localSigner?: LocalSigner;
    },
  ) {
    this.#registry = registry;
    this.#state = state;
    this.#events = events;
    this.#occConfig = opts.occConfig;
    this.#localSigner = opts.localSigner;
  }

  async handleToolCall(
    agentId: string,
    toolName: string,
    args: Record<string, unknown>,
    skill?: string,
  ): Promise<InterceptResult> {
    const context = this.#state.getContext(agentId);
    const now = Date.now();

    // ── Check if agent is paused ──
    if (this.#state.isAgentPaused(agentId)) {
      const decision = { allowed: false as const, reason: "Agent is paused", constraint: "agent.status" };
      const auditId = context.addAudit(toolName, decision, skill ? { skill } : undefined);
      this.#events.emit({
        type: "policy-violation",
        timestamp: now,
        tool: toolName,
        ...(skill ? { skill } : {}),
        agentId,
        reason: decision.reason,
        constraint: decision.constraint,
      });
      return {
        content: [{ type: "text", text: `Policy violation: ${decision.reason}` }],
        isError: true,
        decision,
        auditId,
      };
    }

    // ── Pre-execution policy check (per-agent or global) ──
    const agentPolicy = this.#state.getAgentPolicy(agentId);
    const policy = agentPolicy ?? this.#state.policyCommitment?.policy;

    if (policy) {
      const decision = enforcePolicy(
        policy,
        context.snapshot(),
        { tool: toolName, skill, arguments: args, timestamp: now },
      );

      if (!decision.allowed) {
        const auditId = context.addAudit(toolName, decision, skill ? { skill } : undefined);

        this.#events.emit({
          type: "policy-violation",
          timestamp: now,
          tool: toolName,
          ...(skill ? { skill } : {}),
          agentId,
          reason: decision.reason,
          constraint: decision.constraint,
        });

        return {
          content: [{ type: "text", text: `Policy violation: ${decision.reason}` }],
          isError: true,
          decision,
          auditId,
        };
      }
    }

    // ── Execute downstream ──
    let result: { content: Array<{ type: string; text?: string }>; isError?: boolean };
    try {
      result = await this.#registry.callTool(toolName, args);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const decision: EnforcementDecision = { allowed: true };
      const auditId = context.addAudit(toolName, decision, skill ? { skill } : undefined);
      return {
        content: [{ type: "text", text: `Tool execution failed: ${errorMsg}` }],
        isError: true,
        decision,
        auditId,
      };
    }

    // ── Post-execution: OCC receipt ──
    const decision: EnforcementDecision = { allowed: true };
    let proofDigestB64: string | undefined;
    let receiptJson: string | undefined;

    try {
      const inputHashB64 = hashValue(args);
      const outputHashB64 = hashValue(result.content);

      const envelope = createExecutionEnvelope({
        tool: toolName,
        toolVersion: "1.0.0",
        runtime: "occ-agent",
        inputHashB64,
        outputHashB64,
      });

      if (this.#localSigner) {
        // Local signing: use embedded StubHost + Constructor
        const digestB64 = hashExecutionEnvelope(envelope);
        const proof = await this.#localSigner.commitDigest(digestB64, {
          kind: "tool-execution",
          tool: toolName,
          adapter: "occ-agent",
          runtime: "occ-agent",
        });
        proofDigestB64 = digestB64;

        receiptJson = exportReceipt({
          output: result.content,
          executionEnvelope: envelope,
          occProof: proof,
        });
      } else if (this.#occConfig) {
        // Remote signing: HTTP POST to commit service
        const commitResult = await commitExecutionEnvelope(envelope, this.#occConfig);
        proofDigestB64 = commitResult.digestB64;

        receiptJson = exportReceipt({
          output: result.content,
          executionEnvelope: envelope,
          occProof: commitResult.proof,
        });
      }
    } catch {
      // OCC commit is best-effort — don't fail the tool call
    }

    // ── Update context ──
    const costCents = 0; // v1: no cost tracking yet
    context.recordCall(toolName, skill, costCents, now);

    const auditOpts: { skill?: string; costCents?: number; proofDigestB64?: string } = { costCents };
    if (skill) auditOpts.skill = skill;
    if (proofDigestB64) auditOpts.proofDigestB64 = proofDigestB64;

    const auditId = context.addAudit(toolName, decision, auditOpts);

    // Store receipt for later retrieval
    if (receiptJson) {
      this.#state.storeReceipt(auditId, JSON.parse(receiptJson));
    }

    this.#events.emit({
      type: "tool-executed",
      timestamp: now,
      tool: toolName,
      ...(skill ? { skill } : {}),
      agentId,
      costCents,
      ...(proofDigestB64 ? { proofDigestB64 } : {}),
    });

    this.#events.emit({
      type: "context-updated",
      timestamp: now,
      agentId,
    });

    return {
      content: result.content,
      isError: result.isError ?? false,
      decision,
      receipt: receiptJson ? JSON.parse(receiptJson) : undefined,
      auditId,
    };
  }
}
