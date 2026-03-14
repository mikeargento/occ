// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import type { OCCProof } from "occproof";
import type { ExecutionEnvelope, VerifiedToolResult } from "./types.js";

/**
 * Portable execution receipt — a self-contained document
 * that pairs an execution envelope with its OCC proof.
 *
 * Can be serialized to JSON, stored alongside artifacts,
 * or handed to `verifyExecutionReceipt()` for offline verification.
 */
export interface ExecutionReceipt {
  /** Schema identifier */
  format: "occ-agent/receipt/1";
  /** Canonical execution envelope (hashes only, no raw data) */
  envelope: ExecutionEnvelope;
  /** OCC proof binding the envelope to the causal sequence */
  proof: OCCProof;
}

/**
 * Export a verified tool result as a portable receipt.
 *
 * The receipt contains the execution envelope and OCC proof —
 * everything needed for offline verification. Raw tool output
 * is intentionally excluded (it stays in your runtime).
 *
 * @returns JSON string if no path given, or writes to file and returns the path.
 */
export function exportReceipt<T>(result: VerifiedToolResult<T>): string;
export function exportReceipt<T>(
  result: VerifiedToolResult<T>,
  options: { indent?: number },
): string;
export function exportReceipt<T>(
  result: VerifiedToolResult<T>,
  options?: { indent?: number },
): string {
  const receipt: ExecutionReceipt = {
    format: "occ-agent/receipt/1",
    envelope: result.executionEnvelope,
    proof: result.occProof,
  };
  return JSON.stringify(receipt, null, options?.indent ?? 2);
}

/**
 * Parse a receipt JSON string back into an ExecutionReceipt.
 *
 * Validates the format field and basic structure.
 * Does NOT verify cryptographic signatures — use `verifyExecutionReceipt()`
 * with the returned envelope and proof for full verification.
 */
export function loadReceipt(json: string): ExecutionReceipt {
  const parsed = JSON.parse(json);

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    parsed.format !== "occ-agent/receipt/1"
  ) {
    throw new Error(
      `Invalid receipt: expected format "occ-agent/receipt/1", got "${parsed?.format}"`,
    );
  }

  if (!parsed.envelope || typeof parsed.envelope !== "object") {
    throw new Error("Invalid receipt: missing or malformed envelope");
  }

  if (!parsed.proof || typeof parsed.proof !== "object") {
    throw new Error("Invalid receipt: missing or malformed proof");
  }

  return parsed as ExecutionReceipt;
}
