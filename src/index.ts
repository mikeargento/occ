// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * occ-core — Origin Controlled Computing
 *
 * Portable cryptographic proof at finalization.
 * Hardware TEE enforcement via AWS Nitro Enclaves.
 */

// Types
export type {
  OCCProof,
  OCCPolicy,
  VerificationPolicy,
  SignedBody,
  EnforcementTier,
  ActorIdentity,
  AuthorizationPayload,
  AgencyEnvelope,
} from "./types.js";

// Host interface
export type { HostCapabilities } from "./host.js";

// Constructor (write path)
export { Constructor } from "./constructor.js";

// Verifier (read path)
export { verify } from "./verifier.js";
export type { VerifyResult } from "./verifier.js";

// Canonical serialization
export { canonicalize, canonicalizeToString, constantTimeEqual } from "./canonical.js";
