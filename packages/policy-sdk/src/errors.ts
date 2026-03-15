// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import type { EnforcementDecision } from "./types.js";

export class PolicyViolationError extends Error {
  public readonly decision: EnforcementDecision & { allowed: false };
  public readonly tool: string;
  public readonly skill: string | undefined;

  constructor(
    decision: EnforcementDecision & { allowed: false },
    tool: string,
    skill?: string,
  ) {
    super(`Policy violation on tool "${tool}": ${decision.reason}`);
    this.name = "PolicyViolationError";
    this.decision = decision;
    this.tool = tool;
    this.skill = skill;
  }
}

export class PolicyCommitmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyCommitmentError";
  }
}

export class PolicyValidationError extends Error {
  public readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid policy: ${issues.join("; ")}`);
    this.name = "PolicyValidationError";
    this.issues = issues;
  }
}
