// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import { verify as occVerify, canonicalize } from "occproof";
import type { OCCProof } from "occproof";
import type { ExecutionEnvelope, OccAgentConfig, ReceiptVerification } from "./types.js";
import { hashExecutionEnvelope } from "./envelope.js";

/**
 * Verify an execution receipt locally.
 *
 * Checks:
 * 1. The envelope hash matches the proof's artifact digest
 * 2. The proof structure is valid
 * 3. The Ed25519 signature is valid (via occproof verifier)
 */
export async function verifyExecutionReceipt(
  envelope: ExecutionEnvelope,
  proof: OCCProof,
): Promise<ReceiptVerification> {
  const checks: ReceiptVerification["checks"] = {
    envelopeHashMatch: false,
    proofStructure: false,
    signatureValid: undefined,
  };

  // Check 1: envelope hash matches artifact digest
  const digestB64 = hashExecutionEnvelope(envelope);
  checks.envelopeHashMatch = digestB64 === proof.artifact.digestB64;

  if (!checks.envelopeHashMatch) {
    return {
      valid: false,
      checks,
      reason: `Envelope hash mismatch: computed ${digestB64}, proof has ${proof.artifact.digestB64}`,
    };
  }

  // Check 2: proof structure and signature via occproof verifier
  // The verify function expects the original bytes — the canonicalized envelope
  const envelopeBytes = canonicalize(envelope);
  const verifyResult = await occVerify({
    proof,
    bytes: envelopeBytes,
  });

  checks.proofStructure = true;
  checks.signatureValid = verifyResult.valid;

  if (!verifyResult.valid) {
    return {
      valid: false,
      checks,
      reason: `OCC proof verification failed: ${verifyResult.reason}`,
    };
  }

  return { valid: true, checks };
}

/**
 * Verify a receipt against the OCC server's /verify endpoint.
 */
export async function verifyExecutionReceiptRemote(
  envelope: ExecutionEnvelope,
  proof: OCCProof,
  config: OccAgentConfig,
): Promise<ReceiptVerification> {
  const checks: ReceiptVerification["checks"] = {
    envelopeHashMatch: false,
    proofStructure: false,
    signatureValid: undefined,
  };

  // Check envelope hash locally first
  const digestB64 = hashExecutionEnvelope(envelope);
  checks.envelopeHashMatch = digestB64 === proof.artifact.digestB64;

  if (!checks.envelopeHashMatch) {
    return {
      valid: false,
      checks,
      reason: `Envelope hash mismatch: computed ${digestB64}, proof has ${proof.artifact.digestB64}`,
    };
  }

  // Verify proof remotely
  const verifyUrl = config.apiUrl.replace(/\/commit\/?$/, "/verify");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(verifyUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ proof }),
  });

  if (!response.ok) {
    return {
      valid: false,
      checks,
      reason: `Server verify failed (${response.status})`,
    };
  }

  const result = (await response.json()) as { valid: boolean; reason?: string };
  checks.proofStructure = true;
  checks.signatureValid = result.valid;

  return {
    valid: result.valid,
    checks,
    reason: result.reason,
  };
}
