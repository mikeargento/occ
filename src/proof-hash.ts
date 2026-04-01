// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * occ-core proof hash
 *
 * Canonical, deterministic proof hash computation.
 *
 * The proof hash uniquely identifies a proof document. It covers the
 * ENTIRE proof object (including unsigned metadata) using the library's
 * recursive-sort canonicalize() function.
 *
 * This hash is used for:
 *   - prevB64 chain linking (binding the full document)
 *   - S3 ledger key generation
 *   - Ethereum anchor binding (anchoredProofHash)
 *   - Proof deduplication
 *
 * Algorithm:
 *   1. canonicalize(proof) — recursive key sort, compact JSON, UTF-8
 *   2. SHA-256 of canonical bytes
 *   3. Base64-standard encode (RFC 4648 §4)
 *
 * IMPORTANT: All call sites MUST use this function. Do NOT compute
 * proof hashes ad-hoc with JSON.stringify or Object.keys().sort().
 * Non-recursive key sorting diverges on nested objects.
 */

import { canonicalize } from "./canonical.js";
import { sha256 } from "@noble/hashes/sha256";
import type { OCCProof } from "./types.js";

/**
 * Compute the canonical hash of a complete OCC proof.
 *
 * @param proof - The full OCCProof object
 * @returns Base64-standard encoded SHA-256 hash
 */
export function computeProofHash(proof: OCCProof): string {
  // Strip proofHash from input so the hash is self-consistent
  // (proofHash cannot be part of its own computation)
  const { proofHash: _, ...proofWithoutHash } = proof as OCCProof & { proofHash?: string };
  const bytes = canonicalize(proofWithoutHash as OCCProof);
  const hash = sha256(bytes);

  // Base64 encode (works in both Node.js and browser)
  if (typeof Buffer !== "undefined") {
    return Buffer.from(hash).toString("base64");
  }
  // Browser fallback
  let binary = "";
  for (let i = 0; i < hash.length; i++) {
    binary += String.fromCharCode(hash[i]!);
  }
  return btoa(binary);
}
