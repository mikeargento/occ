import { describe, it, expect } from "vitest";
import { enforcePolicy } from "./enforcer.js";
import type { AgentPolicy, ExecutionContextState, EnforcementRequest } from "./types.js";

/** Minimal empty context. */
function emptyContext(): ExecutionContextState {
  return {
    totalSpendCents: 0,
    toolCallCounts: {},
    toolCallTimestamps: {},
    globalCallTimestamps: [],
    activeSkills: {},
    auditLog: [],
  };
}

/** Minimal policy with one allowed tool. */
function basePolicy(overrides?: Partial<AgentPolicy>): AgentPolicy {
  return {
    version: "occ/policy/1",
    name: "test-policy",
    createdAt: 0,
    globalConstraints: {
      allowedTools: ["read-order"],
    },
    skills: {},
    ...overrides,
  };
}

/** Minimal request. */
function req(overrides?: Partial<EnforcementRequest>): EnforcementRequest {
  return {
    tool: "read-order",
    arguments: {},
    timestamp: Date.now(),
    ...overrides,
  };
}

// ── Blocked Tools ──

describe("blocked tools", () => {
  it("rejects a tool in blockedTools", () => {
    const policy = basePolicy({
      globalConstraints: {
        allowedTools: ["read-order", "delete-user"],
        blockedTools: ["delete-user"],
      },
    });
    const result = enforcePolicy(policy, emptyContext(), req({ tool: "delete-user" }));
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.constraint).toBe("globalConstraints.blockedTools");
    }
  });

  it("allows a tool not in blockedTools", () => {
    const policy = basePolicy({
      globalConstraints: {
        allowedTools: ["read-order"],
        blockedTools: ["delete-user"],
      },
    });
    const result = enforcePolicy(policy, emptyContext(), req({ tool: "read-order" }));
    expect(result.allowed).toBe(true);
  });
});

// ── Allowed Tools (default-deny) ──

describe("allowed tools / default-deny", () => {
  it("denies all when allowedTools is empty", () => {
    const policy = basePolicy({
      globalConstraints: { allowedTools: [] },
    });
    const result = enforcePolicy(policy, emptyContext(), req({ tool: "read-order" }));
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toContain("no tools enabled");
    }
  });

  it("denies all when allowedTools is undefined", () => {
    const policy = basePolicy({
      globalConstraints: {},
    });
    const result = enforcePolicy(policy, emptyContext(), req({ tool: "read-order" }));
    expect(result.allowed).toBe(false);
  });

  it("denies a tool not in allowedTools", () => {
    const policy = basePolicy({
      globalConstraints: { allowedTools: ["search-db"] },
    });
    const result = enforcePolicy(policy, emptyContext(), req({ tool: "read-order" }));
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toContain("not in the allowed tools list");
    }
  });

  it("allows a tool in allowedTools", () => {
    const result = enforcePolicy(basePolicy(), emptyContext(), req());
    expect(result.allowed).toBe(true);
  });
});

// ── Global Rate Limit ──

describe("global rate limit", () => {
  it("denies when rate limit exceeded", () => {
    const now = Date.now();
    const policy = basePolicy({
      globalConstraints: {
        allowedTools: ["read-order"],
        rateLimit: { maxCalls: 3, windowMs: 60_000 },
      },
    });
    const ctx = emptyContext();
    ctx.globalCallTimestamps = [now - 1000, now - 2000, now - 3000];

    const result = enforcePolicy(policy, ctx, req({ timestamp: now }));
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.constraint).toBe("globalConstraints.rateLimit");
    }
  });

  it("allows when within rate limit", () => {
    const now = Date.now();
    const policy = basePolicy({
      globalConstraints: {
        allowedTools: ["read-order"],
        rateLimit: { maxCalls: 5, windowMs: 60_000 },
      },
    });
    const ctx = emptyContext();
    ctx.globalCallTimestamps = [now - 1000, now - 2000];

    const result = enforcePolicy(policy, ctx, req({ timestamp: now }));
    expect(result.allowed).toBe(true);
  });

  it("ignores old timestamps outside window", () => {
    const now = Date.now();
    const policy = basePolicy({
      globalConstraints: {
        allowedTools: ["read-order"],
        rateLimit: { maxCalls: 2, windowMs: 10_000 },
      },
    });
    const ctx = emptyContext();
    ctx.globalCallTimestamps = [now - 20_000, now - 15_000]; // outside window

    const result = enforcePolicy(policy, ctx, req({ timestamp: now }));
    expect(result.allowed).toBe(true);
  });
});

// ── Global Spend ──

describe("global spend limit", () => {
  it("denies when projected spend exceeds limit", () => {
    const policy = basePolicy({
      globalConstraints: {
        allowedTools: ["read-order"],
        maxSpendCents: 1000,
      },
    });
    const ctx = emptyContext();
    ctx.totalSpendCents = 900;

    const result = enforcePolicy(policy, ctx, req({ estimatedCostCents: 200 }));
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.constraint).toBe("globalConstraints.maxSpendCents");
    }
  });

  it("allows when under spend limit", () => {
    const policy = basePolicy({
      globalConstraints: {
        allowedTools: ["read-order"],
        maxSpendCents: 1000,
      },
    });
    const ctx = emptyContext();
    ctx.totalSpendCents = 500;

    const result = enforcePolicy(policy, ctx, req({ estimatedCostCents: 200 }));
    expect(result.allowed).toBe(true);
  });
});

// ── Per-Tool Constraints ──

describe("per-tool constraints", () => {
  it("denies when per-tool rate limit exceeded", () => {
    const now = Date.now();
    const policy = basePolicy({
      globalConstraints: { allowedTools: ["read-order"] },
      toolConstraints: {
        "read-order": {
          rateLimit: { maxCalls: 2, windowMs: 60_000 },
        },
      },
    });
    const ctx = emptyContext();
    ctx.toolCallTimestamps = { "read-order": [now - 1000, now - 2000] };

    const result = enforcePolicy(policy, ctx, req({ timestamp: now }));
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.constraint).toBe("toolConstraints.read-order.rateLimit");
    }
  });

  it("denies when per-call spend cap exceeded", () => {
    const policy = basePolicy({
      globalConstraints: { allowedTools: ["read-order"] },
      toolConstraints: {
        "read-order": { maxSpendPerCallCents: 100 },
      },
    });
    const result = enforcePolicy(policy, emptyContext(), req({ estimatedCostCents: 200 }));
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.constraint).toBe("toolConstraints.read-order.maxSpendPerCallCents");
    }
  });
});

// ── Argument Restrictions ──

describe("argument restrictions", () => {
  it("denies value not in allowedValues", () => {
    const policy = basePolicy({
      globalConstraints: { allowedTools: ["read-order"] },
      toolConstraints: {
        "read-order": {
          argumentRestrictions: {
            status: { allowedValues: ["pending", "shipped"] },
          },
        },
      },
    });
    const result = enforcePolicy(
      policy,
      emptyContext(),
      req({ arguments: { status: "cancelled" } }),
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.constraint).toContain("allowedValues");
    }
  });

  it("denies value in blockedValues", () => {
    const policy = basePolicy({
      globalConstraints: { allowedTools: ["read-order"] },
      toolConstraints: {
        "read-order": {
          argumentRestrictions: {
            action: { blockedValues: ["delete", "drop"] },
          },
        },
      },
    });
    const result = enforcePolicy(
      policy,
      emptyContext(),
      req({ arguments: { action: "delete" } }),
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.constraint).toContain("blockedValues");
    }
  });

  it("denies number exceeding max", () => {
    const policy = basePolicy({
      globalConstraints: { allowedTools: ["read-order"] },
      toolConstraints: {
        "read-order": {
          argumentRestrictions: {
            amount: { max: 100 },
          },
        },
      },
    });
    const result = enforcePolicy(
      policy,
      emptyContext(),
      req({ arguments: { amount: 150 } }),
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.constraint).toContain("max");
    }
  });

  it("denies number below min", () => {
    const policy = basePolicy({
      globalConstraints: { allowedTools: ["read-order"] },
      toolConstraints: {
        "read-order": {
          argumentRestrictions: {
            amount: { min: 10 },
          },
        },
      },
    });
    const result = enforcePolicy(
      policy,
      emptyContext(),
      req({ arguments: { amount: 5 } }),
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.constraint).toContain("min");
    }
  });

  it("denies string not matching pattern", () => {
    const policy = basePolicy({
      globalConstraints: { allowedTools: ["read-order"] },
      toolConstraints: {
        "read-order": {
          argumentRestrictions: {
            email: { pattern: "^[^@]+@[^@]+$" },
          },
        },
      },
    });
    const result = enforcePolicy(
      policy,
      emptyContext(),
      req({ arguments: { email: "not-an-email" } }),
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.constraint).toContain("pattern");
    }
  });

  it("allows valid arguments", () => {
    const policy = basePolicy({
      globalConstraints: { allowedTools: ["read-order"] },
      toolConstraints: {
        "read-order": {
          argumentRestrictions: {
            status: { allowedValues: ["pending", "shipped"] },
            amount: { min: 0, max: 1000 },
          },
        },
      },
    });
    const result = enforcePolicy(
      policy,
      emptyContext(),
      req({ arguments: { status: "pending", amount: 50 } }),
    );
    expect(result.allowed).toBe(true);
  });
});

// ── Skill Constraints ──

describe("skill constraints", () => {
  it("denies when requireApproval is true", () => {
    const policy = basePolicy({
      globalConstraints: { allowedTools: ["read-order"] },
      skills: {
        "process-refund": {
          name: "Process Refund",
          tools: ["read-order"],
          constraints: { requireApproval: true },
        },
      },
    });
    const result = enforcePolicy(
      policy,
      emptyContext(),
      req({ skill: "process-refund" }),
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.constraint).toContain("requireApproval");
    }
  });

  it("denies when maxConcurrent exceeded", () => {
    const policy = basePolicy({
      globalConstraints: { allowedTools: ["read-order"] },
      skills: {
        "process-refund": {
          name: "Process Refund",
          tools: ["read-order"],
          constraints: { maxConcurrent: 2 },
        },
      },
    });
    const ctx = emptyContext();
    ctx.activeSkills = { "process-refund": 2 };

    const result = enforcePolicy(policy, ctx, req({ skill: "process-refund" }));
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.constraint).toContain("maxConcurrent");
    }
  });

  it("denies when skill rate limit exceeded", () => {
    const now = Date.now();
    const policy = basePolicy({
      globalConstraints: { allowedTools: ["read-order"] },
      skills: {
        "process-refund": {
          name: "Process Refund",
          tools: ["read-order", "issue-refund"],
          constraints: { rateLimit: { maxCalls: 3, windowMs: 60_000 } },
        },
      },
    });
    const ctx = emptyContext();
    ctx.toolCallTimestamps = {
      "read-order": [now - 1000, now - 2000],
      "issue-refund": [now - 3000],
    };

    const result = enforcePolicy(policy, ctx, req({ skill: "process-refund", timestamp: now }));
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.constraint).toContain("rateLimit");
    }
  });

  it("allows when skill constraints are satisfied", () => {
    const policy = basePolicy({
      globalConstraints: { allowedTools: ["read-order"] },
      skills: {
        "process-refund": {
          name: "Process Refund",
          tools: ["read-order"],
          constraints: { maxConcurrent: 5 },
        },
      },
    });
    const ctx = emptyContext();
    ctx.activeSkills = { "process-refund": 2 };

    const result = enforcePolicy(policy, ctx, req({ skill: "process-refund" }));
    expect(result.allowed).toBe(true);
  });
});

// ── Full policy pass ──

describe("full policy", () => {
  it("allows when all constraints pass", () => {
    const now = Date.now();
    const policy: AgentPolicy = {
      version: "occ/policy/1",
      name: "full-test",
      createdAt: 0,
      globalConstraints: {
        allowedTools: ["read-order", "issue-refund"],
        blockedTools: ["drop-table"],
        maxSpendCents: 10_000,
        rateLimit: { maxCalls: 100, windowMs: 3_600_000 },
      },
      skills: {
        "process-refund": {
          name: "Process Refund",
          tools: ["read-order", "issue-refund"],
          constraints: { maxConcurrent: 5, rateLimit: { maxCalls: 20, windowMs: 3_600_000 } },
        },
      },
      toolConstraints: {
        "issue-refund": {
          maxSpendPerCallCents: 5000,
          rateLimit: { maxCalls: 10, windowMs: 3_600_000 },
        },
      },
    };

    const ctx = emptyContext();
    ctx.totalSpendCents = 500;
    ctx.globalCallTimestamps = [now - 10_000];
    ctx.toolCallTimestamps = { "issue-refund": [now - 10_000] };
    ctx.activeSkills = { "process-refund": 1 };

    const result = enforcePolicy(policy, ctx, req({
      tool: "issue-refund",
      skill: "process-refund",
      estimatedCostCents: 2000,
      timestamp: now,
    }));
    expect(result.allowed).toBe(true);
  });
});
