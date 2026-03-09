// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * occ-core types
 *
 * All public-facing data structures for the OCC proof system.
 * This file intentionally contains no logic.
 */

// ---------------------------------------------------------------------------
// Enforcement tier
// ---------------------------------------------------------------------------

/**
 * Declares the enforcement tier of the host adapter that produced a proof.
 *
 * This field is SIGNED and therefore tamper-evident in transit.
 * However, it is self-reported by the adapter and MUST NOT be treated as
 * self-authenticating by verifiers.
 *
 * Trust is established by verifier policy (allowedMeasurements +
 * attestation chain validation), not by this field alone.
 *
 * Tier semantics:
 *
 *   "stub"
 *     Software-only. Key lives in process memory. No hardware protection.
 *     Suitable for development, testing, and local demos only.
 *     measurement MAY be a synthetic sentinel value.
 *
 *   "hw-key"
 *     Hardware-protected signing key (Secure Enclave / TPM class).
 *     The key is non-exportable from the hardware boundary.
 *     However, the commit gate runs outside the measured boundary —
 *     the host feeds digests to the hardware for signing.
 *     This provides hardware-bound identity but NOT causal enforcement.
 *     measurement SHOULD identify the key environment.
 *
 *   "measured-tee"
 *     Full causal enforcement. The commit gate, key management, nonce
 *     generation, monotonic counter, and signing all execute inside the
 *     attested enclave boundary. The host is treated as untrusted.
 *     Satisfies OCC's atomic causality invariant when combined with a
 *     verifier that pins allowedMeasurements to a known-good enclave image.
 *     measurement MUST identify the attested enclave image.
 *     attestation SHOULD be present and verified by the relying party.
 *
 * IMPORTANT: Signing this field prevents downgrade tampering in transit
 * but does NOT prevent a malicious adapter from lying about its tier.
 * A verifier requiring "measured-tee" guarantees MUST independently
 * validate measurement and attestation — not rely on this field alone.
 */
export type EnforcementTier = "stub" | "hw-key" | "measured-tee";

// ---------------------------------------------------------------------------
// Proof schema (v1)
// ---------------------------------------------------------------------------

/**
 * A fully self-contained, verifiable commit proof.
 *
 * Two orthogonal facts are encoded:
 *
 *   (A) Cryptographic fact — proven by signer.publicKeyB64 + signer.signatureB64
 *       Answers: "Who signed?" — objective, machine-checkable.
 *
 *   (B) Enforcement fact — proven by environment.measurement + environment.attestation
 *       + verifier allowlist policy.
 *       Answers: "Under what enforced conditions was signing allowed?"
 *       Atomic causality lives here, not in (A).
 *
 * Signed body covers:
 *   version, artifact, commit, signer.publicKeyB64,
 *   environment.enforcement, environment.measurement,
 *   environment.attestation.format (when present)
 *
 * Outside the signature (advisory / vendor-signed):
 *   signer.signatureB64, environment.attestation.reportB64, metadata
 */
export interface OCCProof {
  /** Schema version. Hard-coded for forward-compatibility detection. */
  version: "occ/1";

  /** Describes the committed artifact. */
  artifact: {
    /**
     * Hash algorithm applied to the raw input bytes.
     * Only "sha256" is defined for occ/1.
     */
    hashAlg: "sha256";
    /** Base64-standard (RFC 4648 §4) encoded SHA-256 digest of the input bytes. */
    digestB64: string;
  };

  /** Describes the commit context that ensures uniqueness and ordering. */
  commit: {
    /** Base64-encoded boundary-fresh nonce produced by the host. */
    nonceB64: string;
    /**
     * Monotonic counter value at commit time.
     * Decimal string (no leading zeros unless value is "0", no leading +,
     * ASCII digits only) to avoid IEEE-754 precision loss.
     * Compared as BigInt by the verifier.
     * Present only when the host implements nextCounter().
     */
    counter?: string;
    /**
     * Unix epoch milliseconds at commit time from a TEE-trusted clock.
     * Advisory — software clocks may be skewed. Use counter for ordering.
     * Present only when the host implements secureTime().
     */
    time?: number;
    /**
     * Base64-encoded hash of a previous OCCProof's canonical form,
     * allowing callers to chain proofs into a verifiable sequence.
     */
    prevB64?: string;
    /**
     * Opaque identifier for the enclave lifecycle (epoch).
     * Generated at enclave boot as SHA-256(publicKeyB64 + ":" + bootNonceB64).
     * Unique per enclave lifecycle. Changes on every restart.
     *
     * Verifiers use this to detect epoch boundaries: when epochId changes,
     * a new enclave lifecycle has begun (new keypair, counter may reset).
     *
     * Included in the signed body (via commit) — tamper-evident.
     */
    epochId?: string;
  };

  /**
   * Cryptographic identity of the signer.
   * Contains only the signing keypair — who signed.
   * Enforcement context lives in environment, not here.
   */
  signer: {
    /** Base64-encoded Ed25519 public key (32 bytes). */
    publicKeyB64: string;
    /**
     * Base64-encoded Ed25519 signature (64 bytes) over the canonical
     * serialization of the signed body.
     * NOT included in the signed body itself.
     */
    signatureB64: string;
  };

  /**
   * Enforcement context — under what conditions signing was allowed.
   *
   * enforcement and measurement are included in the signed body,
   * making them tamper-evident. attestation.reportB64 is excluded
   * from the signature because it is a vendor-signed document that
   * self-authenticates.
   */
  environment: {
    /**
     * Self-reported enforcement tier.
     * SIGNED — tamper-evident in transit but not self-authenticating.
     * Verifiers MUST NOT treat this as sufficient evidence of tier.
     */
    enforcement: EnforcementTier;
    /**
     * Platform-specific measurement string.
     * - stub:         MAY be a synthetic sentinel
     * - hw-key:       SHOULD identify the key environment
     * - measured-tee: MUST identify the attested enclave image
     * SIGNED — pinned by verifier allowedMeasurements policy.
     */
    measurement: string;
    /**
     * Optional platform attestation report.
     * If present, format MUST be a non-empty string.
     * reportB64 is excluded from the signature (vendor-signed).
     * attestation.format IS included in the signed body.
     */
    attestation?: {
      /**
       * Identifies the attestation document format.
       * e.g. "aws-nitro", "sgx-dcap", "amd-sev-snp"
       * SIGNED — prevents semantic ambiguity via format rewrite.
       */
      format: string;
      /**
       * Base64-encoded raw attestation report bytes.
       * NOT signed — vendor-signed and self-authenticating.
       * Platform-specific verifiers must parse and validate this.
       */
      reportB64: string;
    };
  };

  /**
   * Caller-supplied metadata key/value pairs.
   * NOT included in the signed body. Treat as advisory only.
   */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Policy types
// ---------------------------------------------------------------------------

/**
 * Policy applied during Constructor initialization.
 */
export interface OCCPolicy {
  /**
   * If true, commits are rejected when host.nextCounter() is unavailable.
   * Defaults to false (counter is advisory).
   */
  requireCounter?: boolean;

  /**
   * If true, commits are rejected when host.secureTime() is unavailable.
   * Defaults to false.
   */
  requireTime?: boolean;
}

/**
 * Constraints checked by the verifier against an OCCProof.
 * All fields are optional; omitting a field skips that check.
 *
 * Trust model:
 *   - Cryptographic identity is proven by signature verification.
 *   - Enforcement guarantees are proven by measurement + attestation policy.
 *   - requireEnforcement alone is NOT sufficient for security — it must
 *     be combined with allowedMeasurements (and requireAttestation for
 *     measured-tee) to establish actual trust.
 */
export interface VerificationPolicy {
  /**
   * Require a specific enforcement tier.
   * MUST be combined with allowedMeasurements for security.
   * This field is tamper-evident (signed) but not self-authenticating.
   */
  requireEnforcement?: EnforcementTier;

  /**
   * Accepted measurement strings. The proof's environment.measurement
   * must exactly match one of the listed values.
   * This is the primary trust anchor for enforcement verification.
   */
  allowedMeasurements?: string[];

  /**
   * Accepted public keys (Base64-encoded). The proof's
   * signer.publicKeyB64 must exactly match one of the listed values.
   */
  allowedPublicKeys?: string[];

  /**
   * If true, the proof must contain environment.attestation.
   * Required for full measured-tee verification.
   */
  requireAttestation?: boolean;

  /**
   * If provided, environment.attestation.format must match one of
   * the listed format strings (e.g. ["aws-nitro", "sgx-dcap"]).
   * Only checked when attestation is present.
   */
  requireAttestationFormat?: string[];

  /**
   * If set, proof.commit.counter must be >= this value (as BigInt).
   * Decimal string, compared as BigInt to avoid precision loss.
   */
  minCounter?: string;

  /**
   * If set, proof.commit.counter must be <= this value (as BigInt).
   * Use with minCounter to enforce a sliding replay-resistance window.
   */
  maxCounter?: string;

  /**
   * If set, proof.commit.time must be >= this Unix ms value.
   */
  minTime?: number;

  /**
   * If set, proof.commit.time must be <= this Unix ms value.
   * Use with minTime to enforce a validity window.
   */
  maxTime?: number;

  /**
   * If true, proof.commit.epochId must be present.
   * Required for production deployments using the epoch model.
   * Verifiers should track epochId to detect epoch boundaries
   * (enclave restarts) and cross-reference with an external
   * monotonic anchor (e.g., DynamoDB) for cross-epoch continuity.
   */
  requireEpochId?: boolean;
}

// ---------------------------------------------------------------------------
// Internal canonical body type
// ---------------------------------------------------------------------------

/**
 * The object that is serialized and signed.
 * Constructed internally by Constructor.commit() and reconstructed by
 * verify() for signature validation.
 *
 * Exported so external adapters can construct test proofs without
 * re-implementing the signing body layout.
 *
 * Signed fields:
 *   version, artifact, commit, publicKeyB64,
 *   enforcement, measurement, attestationFormat (when present)
 */
export interface SignedBody {
  version: "occ/1";
  artifact: OCCProof["artifact"];
  commit: OCCProof["commit"];
  /** Public key included to bind cryptographic identity to the body. */
  publicKeyB64: string;
  /** Enforcement tier — signed to prevent downgrade attacks. */
  enforcement: EnforcementTier;
  /** Measurement — primary trust anchor for enforcement verification. */
  measurement: string;
  /**
   * Attestation format string — signed to prevent semantic ambiguity.
   * Present only when environment.attestation is present.
   * reportB64 is intentionally excluded (vendor-signed).
   */
  attestationFormat?: string;
}
