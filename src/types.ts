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
 *   environment.attestation.format (when present),
 *   agency.actor identity (when agency is present)
 *
 * Outside the signature (advisory / vendor-signed / independently verifiable):
 *   signer.signatureB64, environment.attestation.reportB64,
 *   agency.authorization (P-256 signed, independently verifiable), metadata
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
   * Optional external timestamps (e.g. RFC 3161 TSA tokens).
   * NOT included in the signed body. Independently verifiable.
   *
   * When present, each entry contains a TSA authority, ISO 8601 time,
   * DER-encoded token (base64), digest algorithm, and the digest
   * that was timestamped. The "artifact" timestamp covers the artifact
   * digest; the "proof" timestamp covers the proof's canonical hash.
   */
  timestamps?: {
    artifact?: {
      authority: string;
      time: string;
      tokenB64: string;
      digestAlg: string;
      digestB64: string;
    };
    proof?: {
      authority: string;
      time: string;
      tokenB64: string;
      digestAlg: string;
      digestB64: string;
    };
  };

  /**
   * Optional agency envelope — binds actor identity to this proof.
   *
   * When present, proves WHO authorized the commitment:
   *   - actor: device-bound identity (Secure Enclave P-256 key)
   *   - authorization: the possession commitment the actor signed
   *     (artifact hash + enclave-issued challenge + purpose + timestamp)
   *
   * Two independent signatures in the proof:
   *   - P-256 ECDSA (device Secure Enclave) → proves WHO authorized it
   *   - Ed25519 (Nitro Enclave) → proves it was committed inside the TEE
   *
   * The actor identity summary (keyId, publicKeyB64, algorithm, provider)
   * is also included in the signed body (via SignedBody.actor), making it
   * tamper-evident under the enclave's Ed25519 signature.
   *
   * The full authorization envelope (including the device's P-256 signature)
   * lives here, outside the Ed25519 signed body — like attestation.reportB64,
   * it is independently verifiable.
   *
   * NOT included in the Ed25519 signed body (independently verifiable).
   */
  agency?: AgencyEnvelope;

  /**
   * Optional human-readable attribution claim.
   *
   * A free-form human claim associated with the artifact and commit event.
   * INCLUDED in the Ed25519 signed body — cryptographically sealed and
   * tamper-evident. Cannot be modified after the proof is created.
   *
   * This is a claim, not a guaranteed identity. It complements (does not
   * replace) the cryptographic actor key in agency.
   *
   * All fields are optional. If no fields are provided, omit the object.
   */
  attribution?: Attribution;

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

  /**
   * If true, proof.agency must be present with a valid actor identity
   * and authorization signature. The proof must answer WHO authorized
   * the commitment, not just WHAT and WHERE.
   */
  requireActor?: boolean;

  /**
   * Accepted actor key IDs. The proof's agency.actor.keyId must
   * exactly match one of the listed values.
   * Key ID is hex(SHA-256(SPKI DER public key bytes)) — stable,
   * deterministic, derived from the raw key material.
   */
  allowedActorKeyIds?: string[];

  /**
   * Accepted actor key providers. The proof's agency.actor.provider
   * must exactly match one of the listed values.
   * e.g. ["apple-secure-enclave", "android-strongbox", "webauthn"]
   */
  allowedActorProviders?: string[];
}

// ---------------------------------------------------------------------------
// Attribution — human-readable claim sealed into the proof
// ---------------------------------------------------------------------------

/**
 * Human-readable attribution claim associated with the artifact.
 *
 * All fields are optional. Included in the Ed25519 signed body so that
 * the text is cryptographically sealed and tamper-evident.
 *
 * This is a claim, not a guaranteed identity. It complements the
 * cryptographic actor key in agency.
 */
export interface Attribution {
  /** Human name of the person or entity making the claim. */
  name?: string;
  /** Short description of the claim (e.g. "Original capture"). */
  title?: string;
  /** Free-form message associated with the artifact (e.g. "Shot at sunset in Buffalo."). */
  message?: string;
}

// ---------------------------------------------------------------------------
// Agency types — actor identity + authorization
// ---------------------------------------------------------------------------

/**
 * Actor identity — a device-bound key that identifies WHO authorized
 * a commitment.
 *
 * This structure appears in two places:
 *   1. SignedBody.actor — signed by the TEE's Ed25519 key (tamper-evident)
 *   2. OCCProof.agency.actor — in the full agency envelope
 *
 * The keyId is deterministic: hex(SHA-256(SPKI DER public key bytes)).
 * Any verifier can recompute it from the raw public key to confirm
 * the binding.
 */
export interface ActorIdentity {
  /** Stable device key ID: hex(SHA-256(SPKI DER public key bytes)). */
  keyId: string;
  /** Base64 SPKI DER P-256 public key (standard format, any platform can parse). */
  publicKeyB64: string;
  /** Signature algorithm the device used. */
  algorithm: "ES256";
  /** Key origin: "apple-secure-enclave", "android-strongbox", "webauthn". */
  provider: string;
}

/**
 * The canonical payload that the actor's device signs.
 *
 * Serialized as canonical JSON (sorted keys, compact, UTF-8) for signing.
 * signatureB64 is excluded from the signed bytes (it IS the signature).
 *
 * Fields:
 *   - purpose: domain separation — prevents cross-context signature reuse
 *   - actorKeyId: must match actor.keyId (binds signature to specific key)
 *   - artifactHash: must match proof.artifact.digestB64 (binds to specific artifact)
 *   - challenge: enclave-issued nonce (prevents replay)
 *   - timestamp: Unix epoch ms (enclave checks freshness)
 */
export interface AuthorizationPayload {
  /** Domain separation: prevents cross-context signature reuse. */
  purpose: "occ/commit-authorize/v1";
  /** Must match actor.keyId. */
  actorKeyId: string;
  /** Base64 SHA-256 of artifact — must match proof.artifact.digestB64. */
  artifactHash: string;
  /** Enclave-issued challenge (prevents replay). */
  challenge: string;
  /** Unix epoch ms — enclave checks freshness. */
  timestamp: number;
  /**
   * Optional protocol version. When present, included in the canonical
   * JSON payload that is P-256-signed. Allows versioning the authorization
   * format while maintaining backward compatibility (old payloads without
   * this field remain valid).
   */
  protocolVersion?: string;
}

/**
 * WebAuthn authorization payload — sent when the device signs via
 * navigator.credentials.get() (passkey / Face ID / Touch ID).
 *
 * WebAuthn signs `authenticatorData || SHA-256(clientDataJSON)`, not
 * arbitrary data. The enclave-issued challenge is embedded in
 * clientDataJSON.challenge. The enclave must verify the WebAuthn
 * signature over the standard WebAuthn signed data format.
 */
export interface WebAuthnAuthorization {
  /** Domain separation — same as direct. */
  purpose: "occ/commit-authorize/v1";
  /** Discriminator for verification path. */
  format: "webauthn";
  /** Must match actor.keyId. */
  actorKeyId: string;
  /** Base64 SHA-256 of artifact — must match proof.artifact.digestB64. */
  artifactHash: string;
  /** Enclave-issued challenge (base64). Embedded in clientDataJSON. */
  challenge: string;
  /** Unix epoch ms — checked for freshness. */
  timestamp: number;
  /** Base64-encoded raw authenticator data bytes. */
  authenticatorDataB64: string;
  /** Full clientDataJSON string (UTF-8). Contains challenge, origin, type. */
  clientDataJSON: string;
  /** Base64 DER ECDSA P-256 signature from the authenticator. */
  signatureB64: string;
}

/**
 * Full agency envelope — lives in OCCProof.agency.
 *
 * Contains the actor identity and the authorization payload
 * (including the device's P-256 signature). Independently verifiable:
 * any verifier can check the P-256 signature over the authorization
 * payload without needing any server or API.
 *
 * Two authorization formats:
 *   - Direct: P-256 signature over canonical JSON (native apps, test scripts)
 *   - WebAuthn: Standard WebAuthn assertion (browser passkeys, Face ID / Touch ID)
 */
export interface AgencyEnvelope {
  /** Actor identity (matches SignedBody.actor when present). */
  actor: ActorIdentity;
  /** The possession commitment the actor signed. */
  authorization: (AuthorizationPayload & {
    /**
     * Base64 DER ECDSA signature over canonical JSON of the
     * AuthorizationPayload (excluding signatureB64 itself).
     * P-256 / ES256 — verifiable with actor.publicKeyB64.
     */
    signatureB64: string;
  }) | WebAuthnAuthorization;
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
 *   enforcement, measurement, attestationFormat (when present),
 *   actor (when agency is present),
 *   attribution (when provided)
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

  /**
   * Actor identity summary — included in the signed body when agency
   * is present.
   *
   * Follows the same pattern as attestationFormat: identity summary is
   * signed (tamper-evident under Ed25519), while the full signature
   * envelope (agency.authorization.signatureB64) lives outside the
   * signed body and is independently verifiable.
   *
   * The TEE verifies the actor's P-256 signature BEFORE including this
   * in the signed body, so its presence means the TEE confirmed the
   * actor authorized this specific commitment.
   */
  actor?: ActorIdentity;

  /**
   * Human-readable attribution claim — sealed into the signed body.
   * Present only when the user provided attribution fields at commit time.
   * Canonical serialization includes this when present.
   */
  attribution?: Attribution;
}
