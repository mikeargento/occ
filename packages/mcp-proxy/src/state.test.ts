import { describe, it, expect, beforeEach } from "vitest";
import { ProxyState } from "./state.js";
import { ProxyEventBus } from "./events.js";

let events: ProxyEventBus;
let state: ProxyState;

beforeEach(() => {
  events = new ProxyEventBus();
  state = new ProxyState(events);
});

// ── Agent Creation ──

describe("createAgent", () => {
  it("creates agent with default-deny policy", () => {
    const agent = state.createAgent("test-bot");
    expect(agent.name).toBe("test-bot");
    expect(agent.status).toBe("active");
    expect(agent.policy.globalConstraints.allowedTools).toEqual([]);
    expect(agent.id).toMatch(/^agent-/);
  });

  it("creates agent with initial allowed tools", () => {
    const agent = state.createAgent("test-bot", ["read-order", "search-db"]);
    expect(agent.policy.globalConstraints.allowedTools).toEqual(["read-order", "search-db"]);
  });

  it("emits agent-connected event", () => {
    const emitted: unknown[] = [];
    events.subscribe((e) => emitted.push(e));

    state.createAgent("test-bot");
    expect(emitted).toHaveLength(1);
    expect((emitted[0] as { type: string }).type).toBe("agent-connected");
  });

  it("generates unique IDs", () => {
    const a1 = state.createAgent("bot-1");
    const a2 = state.createAgent("bot-2");
    expect(a1.id).not.toBe(a2.id);
  });
});

// ── Agent Retrieval ──

describe("getAgent", () => {
  it("returns created agent", () => {
    const created = state.createAgent("test-bot");
    const fetched = state.getAgent(created.id);
    expect(fetched).toBeDefined();
    expect(fetched!.name).toBe("test-bot");
  });

  it("returns undefined for unknown ID", () => {
    expect(state.getAgent("nonexistent")).toBeUndefined();
  });
});

// ── Agent Deletion ──

describe("deleteAgent", () => {
  it("removes an existing agent", () => {
    const agent = state.createAgent("test-bot");
    const result = state.deleteAgent(agent.id);
    expect(result).toBe(true);
    expect(state.getAgent(agent.id)).toBeUndefined();
  });

  it("returns false for unknown agent", () => {
    expect(state.deleteAgent("nonexistent")).toBe(false);
  });

  it("emits agent-disconnected event", () => {
    const agent = state.createAgent("test-bot");
    const emitted: unknown[] = [];
    events.subscribe((e) => emitted.push(e));

    state.deleteAgent(agent.id);
    expect(emitted).toHaveLength(1);
    expect((emitted[0] as { type: string }).type).toBe("agent-disconnected");
  });
});

// ── Tool Toggle ──

describe("toggleTool", () => {
  it("enables a tool", () => {
    const agent = state.createAgent("test-bot");
    state.toggleTool(agent.id, "read-order", true);

    const updated = state.getAgent(agent.id)!;
    expect(updated.policy.globalConstraints.allowedTools).toContain("read-order");
  });

  it("disables a tool", () => {
    const agent = state.createAgent("test-bot", ["read-order", "search-db"]);
    state.toggleTool(agent.id, "read-order", false);

    const updated = state.getAgent(agent.id)!;
    expect(updated.policy.globalConstraints.allowedTools).not.toContain("read-order");
    expect(updated.policy.globalConstraints.allowedTools).toContain("search-db");
  });

  it("does not duplicate when enabling already-enabled tool", () => {
    const agent = state.createAgent("test-bot", ["read-order"]);
    state.toggleTool(agent.id, "read-order", true);

    const updated = state.getAgent(agent.id)!;
    const count = updated.policy.globalConstraints.allowedTools!.filter(
      (t) => t === "read-order",
    ).length;
    expect(count).toBe(1);
  });

  it("throws for unknown agent", () => {
    expect(() => state.toggleTool("nonexistent", "read-order", true)).toThrow(
      /not found/,
    );
  });
});

// ── Pause / Resume ──

describe("pauseAgent / resumeAgent", () => {
  it("pauses an active agent", () => {
    const agent = state.createAgent("test-bot");
    state.pauseAgent(agent.id);
    expect(state.getAgent(agent.id)!.status).toBe("paused");
    expect(state.isAgentPaused(agent.id)).toBe(true);
  });

  it("resumes a paused agent", () => {
    const agent = state.createAgent("test-bot");
    state.pauseAgent(agent.id);
    state.resumeAgent(agent.id);
    expect(state.getAgent(agent.id)!.status).toBe("active");
    expect(state.isAgentPaused(agent.id)).toBe(false);
  });

  it("throws when pausing unknown agent", () => {
    expect(() => state.pauseAgent("nonexistent")).toThrow(/not found/);
  });

  it("throws when resuming unknown agent", () => {
    expect(() => state.resumeAgent("nonexistent")).toThrow(/not found/);
  });
});

// ── List Agents ──

describe("getAgents / getAgentIds", () => {
  it("returns all created agents", () => {
    state.createAgent("bot-1");
    state.createAgent("bot-2");
    state.createAgent("bot-3");

    expect(state.getAgents()).toHaveLength(3);
    expect(state.getAgentIds()).toHaveLength(3);
  });

  it("returns empty when no agents", () => {
    expect(state.getAgents()).toHaveLength(0);
    expect(state.getAgentIds()).toHaveLength(0);
  });
});

// ── Execution Context ──

describe("getContext", () => {
  it("returns isolated contexts per agent", () => {
    const a1 = state.createAgent("bot-1");
    const a2 = state.createAgent("bot-2");

    const ctx1 = state.getContext(a1.id);
    const ctx2 = state.getContext(a2.id);

    expect(ctx1).not.toBe(ctx2);
  });

  it("lazy-creates context for unknown agent", () => {
    const ctx = state.getContext("unknown-id");
    expect(ctx).toBeDefined();
  });

  it("returns same context on repeated calls", () => {
    const agent = state.createAgent("test-bot");
    const ctx1 = state.getContext(agent.id);
    const ctx2 = state.getContext(agent.id);
    expect(ctx1).toBe(ctx2);
  });
});

// ── Update Agent Policy ──

describe("updateAgentPolicy", () => {
  it("replaces the policy", () => {
    const agent = state.createAgent("test-bot");
    const newPolicy = {
      version: "occ/policy/1" as const,
      name: "updated-policy",
      createdAt: Date.now(),
      globalConstraints: {
        allowedTools: ["send-email"],
        maxSpendCents: 5000,
      },
      skills: {},
    };

    state.updateAgentPolicy(agent.id, newPolicy);
    const updated = state.getAgent(agent.id)!;
    expect(updated.policy.name).toBe("updated-policy");
    expect(updated.policy.globalConstraints.allowedTools).toEqual(["send-email"]);
  });

  it("resets execution context on policy update", () => {
    const agent = state.createAgent("test-bot");
    const ctxBefore = state.getContext(agent.id);

    const newPolicy = {
      version: "occ/policy/1" as const,
      name: "updated",
      createdAt: Date.now(),
      globalConstraints: { allowedTools: [] },
      skills: {},
    };
    state.updateAgentPolicy(agent.id, newPolicy);

    const ctxAfter = state.getContext(agent.id);
    expect(ctxAfter).not.toBe(ctxBefore);
  });

  it("emits policy-loaded event", () => {
    const agent = state.createAgent("test-bot");
    const emitted: unknown[] = [];
    events.subscribe((e) => emitted.push(e));

    state.updateAgentPolicy(agent.id, {
      version: "occ/policy/1",
      name: "new-policy",
      createdAt: Date.now(),
      globalConstraints: { allowedTools: [] },
      skills: {},
    });

    expect(emitted).toHaveLength(1);
    expect((emitted[0] as { type: string }).type).toBe("policy-loaded");
  });

  it("throws for unknown agent", () => {
    expect(() =>
      state.updateAgentPolicy("nonexistent", {
        version: "occ/policy/1",
        name: "x",
        createdAt: 0,
        globalConstraints: { allowedTools: [] },
        skills: {},
      }),
    ).toThrow(/not found/);
  });
});

// ── Receipts ──

describe("receipts", () => {
  it("stores and retrieves a receipt", () => {
    const receipt = { proof: "abc123" };
    state.storeReceipt("audit-1", receipt);
    expect(state.getReceipt("audit-1")).toBe(receipt);
  });

  it("returns undefined for unknown receipt", () => {
    expect(state.getReceipt("nonexistent")).toBeUndefined();
  });
});

// ── Agent Policy Retrieval ──

describe("getAgentPolicy", () => {
  it("returns policy for existing agent", () => {
    const agent = state.createAgent("test-bot");
    const policy = state.getAgentPolicy(agent.id);
    expect(policy).not.toBeNull();
    expect(policy!.name).toBe("test-bot");
  });

  it("returns null for unknown agent", () => {
    expect(state.getAgentPolicy("nonexistent")).toBeNull();
  });
});
