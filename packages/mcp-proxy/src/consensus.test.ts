import { describe, it, expect, beforeEach } from "vitest";
import { ConsensusEngine } from "./consensus.js";

let engine: ConsensusEngine;

beforeEach(() => {
  engine = new ConsensusEngine();
});

// ── Submit ──

describe("submit", () => {
  it("creates a pending request", () => {
    const req = engine.submit("agent-a", "deploy", { env: "prod" }, 2);
    expect(req.id).toMatch(/^cr-/);
    expect(req.agentId).toBe("agent-a");
    expect(req.tool).toBe("deploy");
    expect(req.args).toEqual({ env: "prod" });
    expect(req.requiredApprovals).toBe(2);
    expect(req.status).toBe("pending");
    expect(req.version).toBe(1);
    expect(req.approvals).toHaveLength(0);
    expect(req.history).toHaveLength(1);
    expect(req.history[0]!.type).toBe("submitted");
  });
});

// ── Approve ──

describe("approve", () => {
  it("adds approval and reaches consensus when N met", () => {
    const req = engine.submit("agent-a", "deploy", { env: "prod" }, 2);

    const after1 = engine.approve(req.id, "agent-b");
    expect(after1.approvals).toHaveLength(1);
    expect(after1.status).toBe("pending");

    const after2 = engine.approve(req.id, "agent-c");
    expect(after2.approvals).toHaveLength(2);
    expect(after2.status).toBe("approved");
    // Should have consensus_reached event in history
    const consensusEvent = after2.history.find((e) => e.type === "consensus_reached");
    expect(consensusEvent).toBeDefined();
  });

  it("rejects self-approval", () => {
    const req = engine.submit("agent-a", "deploy", {}, 1);
    expect(() => engine.approve(req.id, "agent-a")).toThrow("Submitter cannot approve their own request");
  });

  it("rejects duplicate approval on same version", () => {
    const req = engine.submit("agent-a", "deploy", {}, 2);
    engine.approve(req.id, "agent-b");
    expect(() => engine.approve(req.id, "agent-b")).toThrow('Agent "agent-b" already approved version 1');
  });
});

// ── fixAndApprove ──

describe("fixAndApprove", () => {
  it("resets all previous approvals", () => {
    const req = engine.submit("agent-a", "deploy", { env: "prod" }, 3);
    engine.approve(req.id, "agent-b");
    expect(engine.getValidApprovals(req.id)).toHaveLength(1);

    const fixed = engine.fixAndApprove(req.id, "agent-c", { env: "staging" }, "wrong env");
    // agent-b's approval on v1 is gone; agent-c's approval on v2 is the only one
    const valid = engine.getValidApprovals(req.id);
    expect(valid).toHaveLength(1);
    expect(valid[0]!.agentId).toBe("agent-c");
    expect(valid[0]!.version).toBe(2);
  });

  it("increments version", () => {
    const req = engine.submit("agent-a", "deploy", {}, 2);
    expect(req.version).toBe(1);

    const fixed = engine.fixAndApprove(req.id, "agent-b", { env: "staging" });
    expect(fixed.version).toBe(2);

    const fixed2 = engine.fixAndApprove(req.id, "agent-c", { env: "dev" });
    expect(fixed2.version).toBe(3);
  });
});

// ── getValidApprovals ──

describe("getValidApprovals", () => {
  it("returns only approvals matching current version", () => {
    const req = engine.submit("agent-a", "deploy", { env: "prod" }, 3);

    // Approve on v1
    engine.approve(req.id, "agent-b");
    engine.approve(req.id, "agent-c");
    expect(engine.getValidApprovals(req.id)).toHaveLength(2);

    // Fix bumps to v2, clears old approvals
    engine.fixAndApprove(req.id, "agent-d", { env: "staging" });
    const valid = engine.getValidApprovals(req.id);
    expect(valid).toHaveLength(1);
    expect(valid[0]!.agentId).toBe("agent-d");
    expect(valid[0]!.version).toBe(2);
  });
});

// ── requestChanges ──

describe("requestChanges", () => {
  it("adds to history but does not count as approval", () => {
    const req = engine.submit("agent-a", "deploy", {}, 1);
    const updated = engine.requestChanges(req.id, "agent-b", "please use staging");

    expect(updated.approvals).toHaveLength(0);
    expect(updated.status).toBe("pending");
    const changeEvent = updated.history.find((e) => e.type === "changes_requested");
    expect(changeEvent).toBeDefined();
    expect(changeEvent!.note).toBe("please use staging");
    expect(changeEvent!.agentId).toBe("agent-b");
  });
});

// ── Consensus logic ──

describe("consensus threshold", () => {
  it("only reaches consensus when approvals >= requiredApprovals on current version", () => {
    const req = engine.submit("agent-a", "deploy", {}, 3);
    engine.approve(req.id, "agent-b");
    engine.approve(req.id, "agent-c");

    const still = engine.getRequest(req.id)!;
    expect(still.status).toBe("pending"); // only 2 of 3

    const done = engine.approve(req.id, "agent-d");
    expect(done.status).toBe("approved");
  });
});

// ── Full flow ──

describe("full flow", () => {
  it("submit → approve → fix → approve → approve → consensus", () => {
    // Agent A submits a deploy request needing 2 approvals
    const req = engine.submit("agent-a", "deploy", { env: "prod", version: "1.0" }, 2);
    expect(req.status).toBe("pending");

    // Agent B approves v1
    const v1approved = engine.approve(req.id, "agent-b");
    expect(v1approved.approvals).toHaveLength(1);
    expect(v1approved.status).toBe("pending"); // needs 2 but only agent-b so far

    // Agent C fixes args (bumps to v2, clears agent-b's v1 approval, adds agent-c's v2 approval)
    const fixed = engine.fixAndApprove(req.id, "agent-c", { env: "staging", version: "1.1" }, "wrong env");
    expect(fixed.version).toBe(2);
    expect(fixed.status).toBe("pending");
    expect(engine.getValidApprovals(req.id)).toHaveLength(1); // only agent-c on v2

    // Agent B approves v2 — that's 2 approvals, consensus reached
    const final = engine.approve(req.id, "agent-b");
    expect(final.status).toBe("approved");
    expect(engine.getValidApprovals(req.id)).toHaveLength(2);

    // History should contain the full flow
    const types = final.history.map((e) => e.type);
    expect(types).toContain("submitted");
    expect(types).toContain("approved");
    expect(types).toContain("fixed");
    expect(types).toContain("consensus_reached");
  });
});

// ── getPending ──

describe("getPending", () => {
  it("returns only pending requests", () => {
    const r1 = engine.submit("agent-a", "deploy", {}, 1);
    const r2 = engine.submit("agent-a", "delete", {}, 1);

    // Approve r1 to completion
    engine.approve(r1.id, "agent-b");

    const pending = engine.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.id).toBe(r2.id);
  });
});
