// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import {
  ExecutionContext,
  hashPolicy,
  validatePolicy,
  type AgentInstance,
  type AgentPolicy,
  type PolicyCommitment,
} from "occ-policy-sdk";
import type { ProxyEventBus } from "./events.js";
import type { LocalSigner } from "./local-signer.js";

/**
 * Default-deny policy: no tools allowed, no skills, no constraints.
 */
function createDefaultDenyPolicy(name: string): AgentPolicy {
  return {
    version: "occ/policy/1",
    name,
    createdAt: Date.now(),
    globalConstraints: {
      allowedTools: [], // empty = deny all
    },
    skills: {},
  };
}

/**
 * Central state for the proxy process.
 * Manages per-agent instances, each with their own policy and execution context.
 */
export class ProxyState {
  /** Legacy: global policy commitment (kept for backward compat with policy page). */
  policyCommitment: PolicyCommitment | null = null;

  /** Per-agent instances with independent policies. */
  #agents: Map<string, AgentInstance> = new Map();

  /** Per-agent execution contexts. */
  #contexts: Map<string, ExecutionContext> = new Map();

  /** Stored receipts keyed by audit ID. */
  #receipts: Map<string, unknown> = new Map();

  #events: ProxyEventBus;

  constructor(events: ProxyEventBus) {
    this.#events = events;
  }

  // ── Agent Instance Management ──

  /** Create a new agent instance with default-deny policy. */
  createAgent(name: string, initialAllowedTools?: string[]): AgentInstance {
    const id = `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const policy = createDefaultDenyPolicy(name);
    if (initialAllowedTools && initialAllowedTools.length > 0) {
      policy.globalConstraints.allowedTools = initialAllowedTools;
    }

    const instance: AgentInstance = {
      id,
      name,
      policy,
      createdAt: Date.now(),
      status: "active",
    };

    this.#agents.set(id, instance);
    this.#contexts.set(id, new ExecutionContext());

    this.#events.emit({
      type: "agent-connected",
      timestamp: Date.now(),
      agentId: id,
    });

    return instance;
  }

  /** Get an agent instance. */
  getAgent(agentId: string): AgentInstance | undefined {
    return this.#agents.get(agentId);
  }

  /** Delete an agent instance. */
  deleteAgent(agentId: string): boolean {
    const existed = this.#agents.delete(agentId);
    this.#contexts.delete(agentId);
    if (existed) {
      this.#events.emit({
        type: "agent-disconnected",
        timestamp: Date.now(),
        agentId,
      });
    }
    return existed;
  }

  /** Update the full policy for an agent. */
  updateAgentPolicy(agentId: string, policy: AgentPolicy): void {
    const agent = this.#agents.get(agentId);
    if (!agent) throw new Error(`Agent "${agentId}" not found`);
    agent.policy = policy;
    this.#contexts.set(agentId, new ExecutionContext());
    this.#events.emit({
      type: "policy-loaded",
      timestamp: Date.now(),
      policyName: policy.name,
      policyDigestB64: hashPolicy(policy),
    });
  }

  /** Toggle a specific tool on/off for an agent. */
  toggleTool(agentId: string, toolName: string, enabled: boolean): void {
    const agent = this.#agents.get(agentId);
    if (!agent) throw new Error(`Agent "${agentId}" not found`);

    const allowed = agent.policy.globalConstraints.allowedTools ?? [];

    if (enabled && !allowed.includes(toolName)) {
      agent.policy.globalConstraints.allowedTools = [...allowed, toolName];
    } else if (!enabled) {
      agent.policy.globalConstraints.allowedTools = allowed.filter((t) => t !== toolName);
    }
  }

  /** Pause an agent (deny all calls). */
  pauseAgent(agentId: string): void {
    const agent = this.#agents.get(agentId);
    if (!agent) throw new Error(`Agent "${agentId}" not found`);
    agent.status = "paused";
  }

  /** Resume an agent. */
  resumeAgent(agentId: string): void {
    const agent = this.#agents.get(agentId);
    if (!agent) throw new Error(`Agent "${agentId}" not found`);
    agent.status = "active";
  }

  /** Get the policy for a specific agent. Returns null if agent doesn't exist. */
  getAgentPolicy(agentId: string): AgentPolicy | null {
    const agent = this.#agents.get(agentId);
    return agent?.policy ?? null;
  }

  /** Check if an agent is paused. */
  isAgentPaused(agentId: string): boolean {
    return this.#agents.get(agentId)?.status === "paused";
  }

  // ── Legacy Policy Methods ──

  async loadPolicy(
    policy: AgentPolicy,
    occConfig: { apiUrl: string; apiKey?: string | undefined },
  ): Promise<PolicyCommitment> {
    validatePolicy(policy);
    const { commitPolicy } = await import("occ-policy-sdk");
    const commitment = await commitPolicy(policy, occConfig);
    this.policyCommitment = commitment;
    this.#events.emit({
      type: "policy-loaded",
      timestamp: Date.now(),
      policyName: policy.name,
      policyDigestB64: commitment.policyDigestB64,
    });
    return commitment;
  }

  async loadPolicyWithLocalSigner(
    policy: AgentPolicy,
    signer: LocalSigner,
  ): Promise<PolicyCommitment> {
    validatePolicy(policy);
    const policyDigestB64 = hashPolicy(policy);
    const occProof = await signer.commitDigest(policyDigestB64, {
      kind: "policy-commitment",
      adapter: "occ-agent",
      policyName: policy.name,
      policyVersion: policy.version,
    });
    const commitment: PolicyCommitment = {
      policy,
      policyDigestB64,
      occProof,
      committedAt: Date.now(),
    };
    this.policyCommitment = commitment;
    this.#events.emit({
      type: "policy-loaded",
      timestamp: Date.now(),
      policyName: policy.name,
      policyDigestB64: commitment.policyDigestB64,
    });
    return commitment;
  }

  loadPolicyLocal(policy: AgentPolicy): void {
    validatePolicy(policy);
    this.policyCommitment = {
      policy,
      policyDigestB64: "local-dev-mode",
      occProof: {} as PolicyCommitment["occProof"],
      committedAt: Date.now(),
    };
    this.#events.emit({
      type: "policy-loaded",
      timestamp: Date.now(),
      policyName: policy.name,
      policyDigestB64: "local-dev-mode",
    });
  }

  // ── Context + Receipts ──

  getContext(agentId: string): ExecutionContext {
    let ctx = this.#contexts.get(agentId);
    if (!ctx) {
      ctx = new ExecutionContext();
      this.#contexts.set(agentId, ctx);
    }
    return ctx;
  }

  storeReceipt(auditId: string, receipt: unknown): void {
    this.#receipts.set(auditId, receipt);
  }

  getReceipt(auditId: string): unknown | undefined {
    return this.#receipts.get(auditId);
  }

  /** Find an agent by name (returns first match). */
  findAgentByName(name: string): AgentInstance | undefined {
    for (const agent of this.#agents.values()) {
      if (agent.name === name) return agent;
    }
    return undefined;
  }

  /** Resolve a name or ID to an agent ID. Returns the input if already an ID. */
  resolveAgentId(nameOrId: string): string {
    if (this.#agents.has(nameOrId)) return nameOrId;
    const byName = this.findAgentByName(nameOrId);
    return byName ? byName.id : nameOrId;
  }

  getAgentIds(): string[] {
    return Array.from(this.#agents.keys());
  }

  getAgents(): AgentInstance[] {
    return Array.from(this.#agents.values());
  }
}
