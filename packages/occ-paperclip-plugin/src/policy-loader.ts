// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * Loads OCC policy from a Paperclip agent's metadata.occPolicy field.
 *
 * Agents store their OCC policy as a JSON object in `metadata.occPolicy`.
 * This module extracts it and validates the shape before returning.
 */

import { validatePolicy } from "occ-policy-sdk";
import type { AgentPolicy } from "occ-policy-sdk";
import type { Agent } from "@paperclipai/plugin-sdk";

/**
 * Extract the OCC policy from an agent's metadata, if present.
 *
 * Returns `null` if the agent has no `metadata.occPolicy` field or
 * the field is not a valid AgentPolicy.
 */
export function loadPolicyFromAgent(agent: Agent): AgentPolicy | null {
  const metadata = agent.metadata as Record<string, unknown> | null | undefined;
  if (!metadata || typeof metadata !== "object") return null;

  const raw = metadata["occPolicy"];
  if (!raw || typeof raw !== "object") return null;

  // Validate the policy shape — throws PolicyValidationError if invalid
  try {
    validatePolicy(raw);
  } catch (err) {
    console.warn(
      `[occ-plugin] Agent ${agent.id} has invalid occPolicy:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }

  return raw as AgentPolicy;
}

/**
 * Build a default permissive policy (all tools allowed).
 * Useful as a fallback when no policy is configured.
 */
export function buildDefaultPolicy(agentName: string): AgentPolicy {
  return {
    version: "occ/policy/1",
    name: `${agentName}-default`,
    description: "Default permissive policy (all tools allowed)",
    createdAt: Date.now(),
    globalConstraints: {
      allowedTools: ["*"],
    },
    skills: {},
  };
}
