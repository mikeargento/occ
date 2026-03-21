// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import { randomBytes } from "node:crypto";

// ── Types ──

export interface ConsensusApproval {
  agentId: string;
  version: number;
  timestamp: number;
  proofDigestB64?: string;
  receiptJson?: string;
}

export interface ConsensusEvent {
  type: "submitted" | "approved" | "fixed" | "changes_requested" | "reset" | "consensus_reached";
  agentId: string;
  version: number;
  timestamp: number;
  note?: string;
  changes?: Record<string, unknown>;
  proofDigestB64?: string;
}

export interface ConsensusRequest {
  id: string;
  agentId: string;
  tool: string;
  args: Record<string, unknown>;
  requiredApprovals: number;
  status: "pending" | "approved" | "rejected";
  version: number;
  approvals: ConsensusApproval[];
  history: ConsensusEvent[];
  createdAt: number;
  updatedAt: number;
}

// ── Engine ──

export class ConsensusEngine {
  private requests = new Map<string, ConsensusRequest>();

  /** Create a new consensus request. */
  submit(
    agentId: string,
    tool: string,
    args: Record<string, unknown>,
    requiredApprovals: number,
  ): ConsensusRequest {
    const id = `cr-${randomBytes(8).toString("hex")}`;
    const now = Date.now();
    const request: ConsensusRequest = {
      id,
      agentId,
      tool,
      args: { ...args },
      requiredApprovals,
      status: "pending",
      version: 1,
      approvals: [],
      history: [
        {
          type: "submitted",
          agentId,
          version: 1,
          timestamp: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
    this.requests.set(id, request);
    return structuredClone(request);
  }

  /** Approve a request. Returns updated request. Throws on violations. */
  approve(requestId: string, agentId: string): ConsensusRequest {
    const req = this.requests.get(requestId);
    if (!req) throw new Error(`Consensus request "${requestId}" not found`);
    if (req.status !== "pending") throw new Error(`Request is already ${req.status}`);

    // No self-approval
    if (agentId === req.agentId) {
      throw new Error("Submitter cannot approve their own request");
    }

    // No duplicate approval on same version
    const alreadyApproved = req.approvals.some(
      (a) => a.agentId === agentId && a.version === req.version,
    );
    if (alreadyApproved) {
      throw new Error(`Agent "${agentId}" already approved version ${req.version}`);
    }

    const now = Date.now();
    const approval: ConsensusApproval = {
      agentId,
      version: req.version,
      timestamp: now,
    };
    req.approvals.push(approval);
    req.history.push({
      type: "approved",
      agentId,
      version: req.version,
      timestamp: now,
    });
    req.updatedAt = now;

    // Check consensus
    const validCount = req.approvals.filter((a) => a.version === req.version).length;
    if (validCount >= req.requiredApprovals) {
      req.status = "approved";
      req.history.push({
        type: "consensus_reached",
        agentId,
        version: req.version,
        timestamp: now,
      });
    }

    return structuredClone(req);
  }

  /** Fix arguments, bump version, clear approvals, add this agent's approval. */
  fixAndApprove(
    requestId: string,
    agentId: string,
    newArgs: Record<string, unknown>,
    note?: string,
  ): ConsensusRequest {
    const req = this.requests.get(requestId);
    if (!req) throw new Error(`Consensus request "${requestId}" not found`);
    if (req.status !== "pending") throw new Error(`Request is already ${req.status}`);

    const now = Date.now();
    const oldVersion = req.version;
    req.version += 1;
    req.args = { ...newArgs };
    req.approvals = []; // clear all approvals

    // Record the fix event
    req.history.push({
      type: "fixed",
      agentId,
      version: req.version,
      timestamp: now,
      ...(note !== undefined ? { note } : {}),
      changes: newArgs,
    });

    // Add this agent's approval on the new version (unless they are the submitter)
    if (agentId !== req.agentId) {
      const approval: ConsensusApproval = {
        agentId,
        version: req.version,
        timestamp: now,
      };
      req.approvals.push(approval);
      req.history.push({
        type: "approved",
        agentId,
        version: req.version,
        timestamp: now,
      });

      // Check consensus
      const validCount = req.approvals.filter((a) => a.version === req.version).length;
      if (validCount >= req.requiredApprovals) {
        req.status = "approved";
        req.history.push({
          type: "consensus_reached",
          agentId,
          version: req.version,
          timestamp: now,
        });
      }
    }

    req.updatedAt = now;
    return structuredClone(req);
  }

  /** Request changes — adds to history but does NOT count as approval. */
  requestChanges(requestId: string, agentId: string, note: string): ConsensusRequest {
    const req = this.requests.get(requestId);
    if (!req) throw new Error(`Consensus request "${requestId}" not found`);
    if (req.status !== "pending") throw new Error(`Request is already ${req.status}`);

    const now = Date.now();
    req.history.push({
      type: "changes_requested",
      agentId,
      version: req.version,
      timestamp: now,
      note,
    });
    req.updatedAt = now;
    return structuredClone(req);
  }

  /** Get a specific request by ID. */
  getRequest(requestId: string): ConsensusRequest | undefined {
    const req = this.requests.get(requestId);
    return req ? structuredClone(req) : undefined;
  }

  /** Get all pending requests. */
  getPending(): ConsensusRequest[] {
    const pending: ConsensusRequest[] = [];
    for (const req of this.requests.values()) {
      if (req.status === "pending") {
        pending.push(structuredClone(req));
      }
    }
    return pending;
  }

  /** Get only approvals matching the current version. */
  getValidApprovals(requestId: string): ConsensusApproval[] {
    const req = this.requests.get(requestId);
    if (!req) return [];
    return structuredClone(req.approvals.filter((a) => a.version === req.version));
  }
}
