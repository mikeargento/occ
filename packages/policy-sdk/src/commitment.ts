// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import { sha256 } from "@noble/hashes/sha256";
import { canonicalize } from "occproof";
import type { OCCProof } from "occproof";
import type { AgentPolicy, PolicyCommitment } from "./types.js";
import { PolicyCommitmentError } from "./errors.js";
import { validatePolicy } from "./schema.js";

/**
 * Hash a policy to a base64 SHA-256 digest using OCC canonical serialization.
 */
export function hashPolicy(policy: AgentPolicy): string {
  const bytes = canonicalize(policy);
  const digest = sha256(bytes);
  return Buffer.from(digest).toString("base64");
}

/**
 * Commit a policy to the OCC commit service.
 *
 * Validates the policy, hashes it, sends the digest to /commit,
 * and returns the PolicyCommitment with the OCC proof.
 */
export async function commitPolicy(
  policy: AgentPolicy,
  config: { apiUrl: string; apiKey?: string | undefined },
): Promise<PolicyCommitment> {
  // Validate first
  validatePolicy(policy);

  const digestB64 = hashPolicy(policy);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  let response: Response;
  try {
    response = await fetch(config.apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        digests: [{ digestB64, hashAlg: "sha256" }],
        metadata: {
          kind: "policy-commitment",
          adapter: "occ-agent",
          policyName: policy.name,
          policyVersion: policy.version,
        },
      }),
    });
  } catch (err) {
    throw new PolicyCommitmentError(
      `Failed to reach OCC commit service: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    const body = await response.text();
    throw new PolicyCommitmentError(
      `OCC policy commit failed (${response.status}): ${body}`,
    );
  }

  const proofs = (await response.json()) as OCCProof[];
  const proof = proofs[0];
  if (!proof) {
    throw new PolicyCommitmentError("OCC commit returned empty proof array");
  }

  return {
    policy,
    policyDigestB64: digestB64,
    occProof: proof,
    committedAt: Date.now(),
  };
}
