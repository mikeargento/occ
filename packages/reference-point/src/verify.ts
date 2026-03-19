// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * Reference-based and hybrid verification.
 *
 * This module provides two verification paths:
 *
 *   verifyWithReference()
 *     Hybrid verifier — supports both portable proof (proof co-travels
 *     with artifact) and reference-based fallback (proof retrieved by
 *     content hash when metadata was stripped).
 *
 *     When `proof` is provided: standard portable-proof path.
 *     When `proof` is omitted:  content hash computed, proof fetched
 *                                from reference point, then verified.
 *
 * Both paths call the same core verify() function with the same trust
 * anchor checks. The reference point plays no role in the trust model.
 * Trust is anchored entirely in allowedMeasurements + attestation policy.
 *
 * Use case: social media, CDN, messaging — any channel that strips
 * metadata. The artifact's content hash is the only thing needed to
 * recover verifiability.
 */

import { verify, type VerifyResult } from "occproof";
import { sha256 } from "@noble/hashes/sha256";
import type { OCCProof, VerificationPolicy } from "occproof";
import { ReferencePointClient, type ReferencePointClientOptions } from "./client.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VerifyWithReferenceOpts {
  /**
   * The raw artifact bytes.
   * Their SHA-256 is the lookup key when no co-traveling proof is provided.
   */
  bytes: Uint8Array;

  /**
   * Optional co-traveling proof (portable path).
   * When present, used directly — no network call is made.
   * When absent, a reference point lookup is performed.
   */
  proof?: OCCProof;

  /**
   * Reference point to query when `proof` is absent.
   * Accepts a URL string or a pre-configured ReferencePointClient.
   * Required when `proof` is absent.
   */
  referencePoint?: string | ReferencePointClient;

  /** Policy constraints passed to the core verifier. */
  trustAnchors?: VerificationPolicy;
}

export type ReferenceVerifyResult =
  | (VerifyResult & { valid: true; path: "portable" | "reference"; proof: OCCProof })
  | (VerifyResult & { valid: false; reason: string; path?: "portable" | "reference" | "not-found" });

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Hybrid verifier — portable proof or reference-based fallback.
 *
 * @throws {TypeError} if `bytes` is not Uint8Array, or if neither `proof`
 *                     nor `referencePoint` is provided.
 */
export async function verifyWithReference(
  opts: VerifyWithReferenceOpts,
): Promise<ReferenceVerifyResult> {
  const { bytes, proof: coTravelingProof, trustAnchors } = opts;

  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("bytes must be a Uint8Array");
  }

  // --- Portable path: proof travels with the artifact ---
  if (coTravelingProof !== undefined) {
    const verifyOpts = trustAnchors !== undefined
      ? { proof: coTravelingProof, bytes, trustAnchors }
      : { proof: coTravelingProof, bytes };
    const result = await verify(verifyOpts);
    if (result.valid) {
      return { valid: true, path: "portable", proof: coTravelingProof };
    }
    return { valid: false, reason: result.reason ?? "verification failed", path: "portable" };
  }

  // --- Reference path: look up proof by content hash ---
  if (opts.referencePoint === undefined) {
    throw new TypeError(
      "either proof or referencePoint must be provided",
    );
  }

  const client =
    typeof opts.referencePoint === "string"
      ? new ReferencePointClient({ baseUrl: opts.referencePoint })
      : opts.referencePoint;

  // Compute content hash to use as lookup key
  const digestBytes = sha256(bytes);
  const digestB64 = Buffer.from(digestBytes).toString("base64");

  let entry;
  try {
    entry = await client.fetch(digestB64);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      reason: `reference point unreachable: ${msg}`,
      path: "reference",
    };
  }

  if (entry === null) {
    return {
      valid: false,
      reason: `no proof found at reference point for digest ${digestB64}`,
      path: "not-found",
    };
  }

  const verifyOpts = trustAnchors !== undefined
    ? { proof: entry.proof, bytes, trustAnchors }
    : { proof: entry.proof, bytes };
  const result = await verify(verifyOpts);
  if (result.valid) {
    return { valid: true, path: "reference", proof: entry.proof };
  }
  return { valid: false, reason: result.reason ?? "verification failed", path: "reference" };
}
