// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import type { OCCProof } from "occproof";
import type { ExecutionEnvelope, OccAgentConfig } from "./types.js";
import { hashExecutionEnvelope } from "./envelope.js";

/**
 * Commit an execution envelope through the OCC commit service.
 *
 * Hashes the envelope, sends the digest to /commit, and returns the OCC proof.
 */
export async function commitExecutionEnvelope(
  envelope: ExecutionEnvelope,
  config: OccAgentConfig,
): Promise<{ proof: OCCProof; digestB64: string }> {
  const digestB64 = hashExecutionEnvelope(envelope);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      digests: [{ digestB64, hashAlg: "sha256" }],
      metadata: {
        kind: "tool-execution",
        tool: envelope.tool,
        adapter: "occ-agent",
        runtime: envelope.runtime,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `OCC commit failed (${response.status}): ${body}`,
    );
  }

  const proofs = (await response.json()) as OCCProof[];
  const proof = proofs[0];
  if (!proof) {
    throw new Error("OCC commit returned empty proof array");
  }

  return { proof, digestB64 };
}
