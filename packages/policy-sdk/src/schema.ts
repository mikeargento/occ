// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import type { AgentPolicy } from "./types.js";
import { PolicyValidationError } from "./errors.js";

/**
 * Validate an AgentPolicy at runtime. Throws PolicyValidationError if invalid.
 */
export function validatePolicy(obj: unknown): asserts obj is AgentPolicy {
  const issues: string[] = [];

  if (typeof obj !== "object" || obj === null) {
    throw new PolicyValidationError(["Policy must be an object"]);
  }

  const p = obj as Record<string, unknown>;

  if (p["version"] !== "occ/policy/1" && p["version"] !== "occ/policy/1") {
    issues.push('version must be "occ/policy/1" or "occ/policy/1"');
  }

  if (typeof p["name"] !== "string" || p["name"].length === 0) {
    issues.push("name must be a non-empty string");
  }

  if (typeof p["createdAt"] !== "number") {
    issues.push("createdAt must be a number (Unix ms)");
  }

  if (typeof p["globalConstraints"] !== "object" || p["globalConstraints"] === null) {
    issues.push("globalConstraints must be an object");
  } else {
    validateGlobalConstraints(p["globalConstraints"] as Record<string, unknown>, issues);
  }

  if (typeof p["skills"] !== "object" || p["skills"] === null) {
    issues.push("skills must be an object");
  } else {
    const skills = p["skills"] as Record<string, unknown>;
    for (const [key, skill] of Object.entries(skills)) {
      validateSkill(key, skill, issues);
    }
  }

  if (p["toolConstraints"] !== undefined) {
    if (typeof p["toolConstraints"] !== "object" || p["toolConstraints"] === null) {
      issues.push("toolConstraints must be an object if provided");
    }
  }

  if (issues.length > 0) {
    throw new PolicyValidationError(issues);
  }
}

function validateGlobalConstraints(gc: Record<string, unknown>, issues: string[]): void {
  if (gc["maxSpendCents"] !== undefined && typeof gc["maxSpendCents"] !== "number") {
    issues.push("globalConstraints.maxSpendCents must be a number");
  }

  if (gc["rateLimit"] !== undefined) {
    validateRateLimit(gc["rateLimit"], "globalConstraints.rateLimit", issues);
  }

  if (gc["allowedTools"] !== undefined && !Array.isArray(gc["allowedTools"])) {
    issues.push("globalConstraints.allowedTools must be an array");
  }

  if (gc["blockedTools"] !== undefined && !Array.isArray(gc["blockedTools"])) {
    issues.push("globalConstraints.blockedTools must be an array");
  }

  if (gc["allowedTimeWindows"] !== undefined) {
    if (!Array.isArray(gc["allowedTimeWindows"])) {
      issues.push("globalConstraints.allowedTimeWindows must be an array");
    } else {
      for (const tw of gc["allowedTimeWindows"]) {
        if (typeof tw !== "object" || tw === null) {
          issues.push("Each time window must be an object");
        } else {
          const w = tw as Record<string, unknown>;
          if (typeof w["startUtc"] !== "string") issues.push("TimeWindow.startUtc must be a string");
          if (typeof w["endUtc"] !== "string") issues.push("TimeWindow.endUtc must be a string");
        }
      }
    }
  }
}

function validateSkill(key: string, skill: unknown, issues: string[]): void {
  if (typeof skill !== "object" || skill === null) {
    issues.push(`skills.${key} must be an object`);
    return;
  }
  const s = skill as Record<string, unknown>;
  if (typeof s["name"] !== "string") {
    issues.push(`skills.${key}.name must be a string`);
  }
  if (!Array.isArray(s["tools"])) {
    issues.push(`skills.${key}.tools must be an array`);
  }
}

function validateRateLimit(rl: unknown, path: string, issues: string[]): void {
  if (typeof rl !== "object" || rl === null) {
    issues.push(`${path} must be an object`);
    return;
  }
  const r = rl as Record<string, unknown>;
  if (typeof r["maxCalls"] !== "number") issues.push(`${path}.maxCalls must be a number`);
  if (typeof r["windowMs"] !== "number") issues.push(`${path}.windowMs must be a number`);
}
