// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import type {
  AgentPolicy,
  EnforcementDecision,
  EnforcementRequest,
  ExecutionContextState,
} from "./types.js";

/**
 * Stateless policy enforcement. Checks a proposed tool call against
 * the committed policy and current execution context.
 *
 * Check order: blocked → allowed → time windows → global rate limit →
 * global spend → per-tool constraints → argument restrictions → skill constraints.
 */
export function enforcePolicy(
  policy: AgentPolicy,
  context: ExecutionContextState,
  request: EnforcementRequest,
): EnforcementDecision {
  const now = request.timestamp ?? Date.now();
  const gc = policy.globalConstraints;

  // 1. Blocked tools (always reject)
  if (gc.blockedTools && gc.blockedTools.includes(request.tool)) {
    return {
      allowed: false,
      reason: `Tool "${request.tool}" is blocked by policy`,
      constraint: "globalConstraints.blockedTools",
    };
  }

  // 2. Allowed tools (default-deny: if no allowedTools specified, deny all)
  if (!gc.allowedTools || gc.allowedTools.length === 0) {
    return {
      allowed: false,
      reason: `Tool "${request.tool}" is not allowed — no tools enabled`,
      constraint: "globalConstraints.allowedTools",
    };
  }
  if (!gc.allowedTools.includes(request.tool)) {
    return {
      allowed: false,
      reason: `Tool "${request.tool}" is not in the allowed tools list`,
      constraint: "globalConstraints.allowedTools",
    };
  }

  // 3. Time windows
  if (gc.allowedTimeWindows && gc.allowedTimeWindows.length > 0) {
    const inWindow = gc.allowedTimeWindows.some((tw) => isInTimeWindow(now, tw));
    if (!inWindow) {
      return {
        allowed: false,
        reason: "Current time is outside all allowed time windows",
        constraint: "globalConstraints.allowedTimeWindows",
      };
    }
  }

  // 4. Global rate limit
  if (gc.rateLimit) {
    const windowStart = now - gc.rateLimit.windowMs;
    const recentCalls = context.globalCallTimestamps.filter((t) => t > windowStart).length;
    if (recentCalls >= gc.rateLimit.maxCalls) {
      return {
        allowed: false,
        reason: `Global rate limit exceeded: ${recentCalls}/${gc.rateLimit.maxCalls} calls in ${gc.rateLimit.windowMs}ms window`,
        constraint: "globalConstraints.rateLimit",
      };
    }
  }

  // 5. Global spend
  if (gc.maxSpendCents !== undefined) {
    const projectedSpend = context.totalSpendCents + (request.estimatedCostCents ?? 0);
    if (projectedSpend > gc.maxSpendCents) {
      return {
        allowed: false,
        reason: `Would exceed global spend limit: ${projectedSpend}c > ${gc.maxSpendCents}c`,
        constraint: "globalConstraints.maxSpendCents",
      };
    }
  }

  // 6. Per-tool constraints
  const tc = policy.toolConstraints?.[request.tool];
  if (tc) {
    // Per-tool rate limit
    if (tc.rateLimit) {
      const toolTimestamps = context.toolCallTimestamps[request.tool] ?? [];
      const windowStart = now - tc.rateLimit.windowMs;
      const recentCalls = toolTimestamps.filter((t) => t > windowStart).length;
      if (recentCalls >= tc.rateLimit.maxCalls) {
        return {
          allowed: false,
          reason: `Rate limit for "${request.tool}": ${recentCalls}/${tc.rateLimit.maxCalls} calls in ${tc.rateLimit.windowMs}ms`,
          constraint: `toolConstraints.${request.tool}.rateLimit`,
        };
      }
    }

    // Per-call spend cap
    if (tc.maxSpendPerCallCents !== undefined && request.estimatedCostCents !== undefined) {
      if (request.estimatedCostCents > tc.maxSpendPerCallCents) {
        return {
          allowed: false,
          reason: `Tool "${request.tool}" call cost ${request.estimatedCostCents}c exceeds per-call limit of ${tc.maxSpendPerCallCents}c`,
          constraint: `toolConstraints.${request.tool}.maxSpendPerCallCents`,
        };
      }
    }

    // Argument restrictions
    if (tc.argumentRestrictions) {
      const argCheck = checkArgumentRestrictions(
        request.tool,
        request.arguments,
        tc.argumentRestrictions,
      );
      if (!argCheck.allowed) return argCheck;
    }
  }

  // 7. Skill constraints
  if (request.skill) {
    const skill = policy.skills[request.skill];
    if (skill?.constraints) {
      const sc = skill.constraints;

      // Require approval
      if (sc.requireApproval) {
        return {
          allowed: false,
          reason: `Skill "${request.skill}" requires human approval`,
          constraint: `skills.${request.skill}.constraints.requireApproval`,
        };
      }

      // Max concurrent
      if (sc.maxConcurrent !== undefined) {
        const active = context.activeSkills[request.skill] ?? 0;
        if (active >= sc.maxConcurrent) {
          return {
            allowed: false,
            reason: `Skill "${request.skill}" at max concurrency: ${active}/${sc.maxConcurrent}`,
            constraint: `skills.${request.skill}.constraints.maxConcurrent`,
          };
        }
      }

      // Skill rate limit
      if (sc.rateLimit) {
        // Use global timestamps filtered to this skill's tools as a proxy
        // (ExecutionContext tracks per-tool, so sum up the skill's tools)
        const windowStart = now - sc.rateLimit.windowMs;
        let skillCalls = 0;
        for (const toolName of skill.tools) {
          const ts = context.toolCallTimestamps[toolName] ?? [];
          skillCalls += ts.filter((t) => t > windowStart).length;
        }
        if (skillCalls >= sc.rateLimit.maxCalls) {
          return {
            allowed: false,
            reason: `Skill "${request.skill}" rate limit exceeded: ${skillCalls}/${sc.rateLimit.maxCalls}`,
            constraint: `skills.${request.skill}.constraints.rateLimit`,
          };
        }
      }
    }
  }

  return { allowed: true };
}

function isInTimeWindow(
  now: number,
  tw: { daysOfWeek?: number[] | undefined; startUtc: string; endUtc: string },
): boolean {
  const d = new Date(now);
  const day = d.getUTCDay();
  if (tw.daysOfWeek && tw.daysOfWeek.length > 0 && !tw.daysOfWeek.includes(day)) {
    return false;
  }

  const nowMinutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  const startMinutes = parseTimeToMinutes(tw.startUtc);
  const endMinutes = parseTimeToMinutes(tw.endUtc);

  if (startMinutes <= endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }
  // Wraps midnight
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

function parseTimeToMinutes(time: string): number {
  const parts = time.split(":");
  return Number(parts[0]) * 60 + Number(parts[1]);
}

function checkArgumentRestrictions(
  tool: string,
  args: Record<string, unknown>,
  restrictions: Record<string, { allowedValues?: unknown[] | undefined; blockedValues?: unknown[] | undefined; max?: number | undefined; min?: number | undefined; pattern?: string | undefined }>,
): EnforcementDecision {
  for (const [argName, restriction] of Object.entries(restrictions)) {
    const value = args[argName];
    if (value === undefined) continue;

    if (restriction.allowedValues && !restriction.allowedValues.includes(value)) {
      return {
        allowed: false,
        reason: `Argument "${argName}" value not in allowed values for tool "${tool}"`,
        constraint: `toolConstraints.${tool}.argumentRestrictions.${argName}.allowedValues`,
      };
    }

    if (restriction.blockedValues && restriction.blockedValues.includes(value)) {
      return {
        allowed: false,
        reason: `Argument "${argName}" value is blocked for tool "${tool}"`,
        constraint: `toolConstraints.${tool}.argumentRestrictions.${argName}.blockedValues`,
      };
    }

    if (typeof value === "number") {
      if (restriction.max !== undefined && value > restriction.max) {
        return {
          allowed: false,
          reason: `Argument "${argName}" value ${value} exceeds max ${restriction.max} for tool "${tool}"`,
          constraint: `toolConstraints.${tool}.argumentRestrictions.${argName}.max`,
        };
      }
      if (restriction.min !== undefined && value < restriction.min) {
        return {
          allowed: false,
          reason: `Argument "${argName}" value ${value} below min ${restriction.min} for tool "${tool}"`,
          constraint: `toolConstraints.${tool}.argumentRestrictions.${argName}.min`,
        };
      }
    }

    if (typeof value === "string" && restriction.pattern) {
      const re = new RegExp(restriction.pattern);
      if (!re.test(value)) {
        return {
          allowed: false,
          reason: `Argument "${argName}" does not match pattern /${restriction.pattern}/ for tool "${tool}"`,
          constraint: `toolConstraints.${tool}.argumentRestrictions.${argName}.pattern`,
        };
      }
    }
  }

  return { allowed: true };
}
