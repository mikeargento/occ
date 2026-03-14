// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import { sha256 } from "@noble/hashes/sha256";
import { canonicalize } from "occproof";

/**
 * Hash an arbitrary value into a base64-encoded SHA-256 digest.
 *
 * The value is first canonicalized (deterministic JSON, sorted keys, UTF-8),
 * then hashed. This ensures identical logical values always produce the same
 * digest regardless of key ordering or whitespace.
 */
export function hashValue(value: unknown): string {
  const bytes = canonicalize(value);
  const digest = sha256(bytes);
  return uint8ToBase64(digest);
}

/**
 * Normalize a tool input into a deterministic structure.
 *
 * Default implementation: canonicalize the value as-is.
 * Tools can override this via ToolDefinition.normalizeInput.
 */
export function normalizeToolInput(input: unknown): unknown {
  if (input === null || input === undefined) {
    return null;
  }
  // Parse and re-serialize through canonicalization to strip non-determinism
  return JSON.parse(JSON.stringify(input));
}

/**
 * Normalize a tool output into a deterministic structure.
 *
 * Default implementation: canonicalize the value as-is.
 * Tools can override this via ToolDefinition.normalizeOutput.
 */
export function normalizeToolOutput(output: unknown): unknown {
  if (output === null || output === undefined) {
    return null;
  }
  return JSON.parse(JSON.stringify(output));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uint8ToBase64(bytes: Uint8Array): string {
  // Node.js Buffer is available in our target environment
  return Buffer.from(bytes).toString("base64");
}
