// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * occ-core Verifier
 *
 * Deterministic, offline verification of OCCProof structures.
 *
 * Verification steps (in order):
 *   1. Structural validation — required fields present and typed correctly
 *   2. Artifact check        — SHA-256 of provided bytes matches proof digest
 *   3. Signed body reconstruction — reproduce the exact canonical bytes
 *   4. Signature verification — Ed25519 signature over canonical bytes
 *   5. Policy checks         — enforcement tier, measurement, key, counter,
 *                              time, attestation constraints
 *
 * Design constraints:
 *   - No network calls. All verification is local and deterministic.
 *   - Constant-time comparison for digests and signatures where possible.
 *   - Returns { valid: false, reason: "..." } rather than throwing for
 *     expected verification failures (invalid inputs throw).
 *   - attestation.reportB64 is stored in the proof but not interpreted here;
 *     platform-specific attestation verification belongs in adapter packages.
 *
 * Trust model:
 *   - environment.enforcement is tamper-evident (signed) but self-reported.
 *   - Verifiers requiring measured-tee guarantees MUST combine
 *     requireEnforcement with allowedMeasurements and requireAttestation.
 *   - The measurement allowlist is the primary cryptographic trust anchor.
 */

import { createVerify, createHash } from "node:crypto";
import { verifyAsync as ed25519VerifyAsync } from "@noble/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { canonicalize, constantTimeEqual } from "./canonical.js";
import type { EnforcementTier, OCCProof, SignedBody, VerificationPolicy, AgencyEnvelope, AuthorizationPayload, WebAuthnAuthorization } from "./types.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface VerifyResult {
  valid: boolean;
  /** Human-readable failure reason. Present only when `valid` is false. */
  reason?: string;
}

/**
 * Verify an OCCProof against the original input bytes.
 *
 * @param opts.proof        - The proof to verify
 * @param opts.bytes        - The original input bytes that were committed
 * @param opts.trustAnchors - Optional policy constraints
 *
 * @throws {TypeError}  if `proof` or `bytes` are not the expected types
 * @returns             `{ valid: true }` on success, `{ valid: false, reason }` on failure
 */
export async function verify(opts: {
  proof: OCCProof;
  bytes: Uint8Array;
  trustAnchors?: VerificationPolicy;
}): Promise<VerifyResult> {
  const { proof, bytes, trustAnchors } = opts;

  // ------------------------------------------------------------------
  // 1. Structural validation
  // ------------------------------------------------------------------
  const structureError = validateStructure(proof);
  if (structureError !== null) {
    return fail(structureError);
  }

  // ------------------------------------------------------------------
  // 2. Artifact check: SHA-256 of provided bytes must match proof digest
  // ------------------------------------------------------------------
  const computedDigest = sha256(bytes);
  let proofDigest: Uint8Array;
  try {
    proofDigest = fromBase64(proof.artifact.digestB64);
  } catch {
    return fail("artifact.digestB64 is not valid base64");
  }

  if (!constantTimeEqual(computedDigest, proofDigest)) {
    return fail(
      "artifact digest mismatch: the provided bytes do not match the committed digest"
    );
  }

  // ------------------------------------------------------------------
  // 3. Reconstruct canonical signed body
  // ------------------------------------------------------------------
  let publicKeyBytes: Uint8Array;
  try {
    publicKeyBytes = fromBase64(proof.signer.publicKeyB64);
  } catch {
    return fail("signer.publicKeyB64 is not valid base64");
  }

  if (publicKeyBytes.length !== 32) {
    return fail(
      `signer.publicKeyB64 decodes to ${publicKeyBytes.length} bytes; expected 32 (Ed25519)`
    );
  }

  const signedBody: SignedBody = {
    version: proof.version as "occ/1",
    artifact: proof.artifact,
    commit: proof.commit,
    publicKeyB64: proof.signer.publicKeyB64,
    enforcement: proof.environment.enforcement,
    measurement: proof.environment.measurement,
  };

  // Include attestationFormat in signed body when present
  if (proof.environment.attestation !== undefined) {
    signedBody.attestationFormat = proof.environment.attestation.format;
  }

  // Include actor in signed body when agency is present
  if (proof.agency !== undefined) {
    signedBody.actor = proof.agency.actor;
  }

  // Include attribution in signed body when present
  if (proof.attribution !== undefined) {
    signedBody.attribution = proof.attribution;
  }

  const canonicalBytes = canonicalize(signedBody);

  // ------------------------------------------------------------------
  // 4. Signature verification
  // ------------------------------------------------------------------
  let signatureBytes: Uint8Array;
  try {
    signatureBytes = fromBase64(proof.signer.signatureB64);
  } catch {
    return fail("signer.signatureB64 is not valid base64");
  }

  if (signatureBytes.length !== 64) {
    return fail(
      `signer.signatureB64 decodes to ${signatureBytes.length} bytes; expected 64 (Ed25519)`
    );
  }

  let signatureValid: boolean;
  try {
    signatureValid = await ed25519VerifyAsync(
      signatureBytes,
      canonicalBytes,
      publicKeyBytes
    );
  } catch (err: unknown) {
    return fail(
      `signature verification error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!signatureValid) {
    return fail("signature verification failed: signature does not match");
  }

  // ------------------------------------------------------------------
  // 4b. Agency verification (P-256 device signature)
  // ------------------------------------------------------------------
  if (proof.agency !== undefined) {
    const agencyError = verifyAgency(proof);
    if (agencyError !== null) {
      return fail(agencyError);
    }
  }

  // ------------------------------------------------------------------
  // 5. Policy checks
  // ------------------------------------------------------------------
  if (trustAnchors !== undefined) {
    const policyError = checkPolicy(proof, trustAnchors);
    if (policyError !== null) {
      return fail(policyError);
    }
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Structural validation
// ---------------------------------------------------------------------------

const VALID_ENFORCEMENT_TIERS: ReadonlySet<string> = new Set([
  "stub",
  "hw-key",
  "measured-tee",
]);

function validateStructure(proof: unknown): string | null {
  if (proof === null || typeof proof !== "object") {
    return "proof must be an object";
  }
  const p = proof as Record<string, unknown>;

  if (p["version"] !== "occ/1") {
    return `unsupported proof version: ${String(p["version"])}`;
  }

  // artifact
  if (!isObject(p["artifact"])) return "proof.artifact is missing or not an object";
  const artifact = p["artifact"] as Record<string, unknown>;
  if (artifact["hashAlg"] !== "sha256") {
    return `unsupported hashAlg: ${String(artifact["hashAlg"])}`;
  }
  if (typeof artifact["digestB64"] !== "string" || artifact["digestB64"].length === 0) {
    return "proof.artifact.digestB64 must be a non-empty string";
  }

  // commit
  if (!isObject(p["commit"])) return "proof.commit is missing or not an object";
  const commit = p["commit"] as Record<string, unknown>;
  if (typeof commit["nonceB64"] !== "string" || commit["nonceB64"].length === 0) {
    return "proof.commit.nonceB64 must be a non-empty string";
  }
  if (commit["counter"] !== undefined && typeof commit["counter"] !== "string") {
    return "proof.commit.counter must be a string when present";
  }
  if (commit["time"] !== undefined) {
    if (typeof commit["time"] !== "number" || !Number.isFinite(commit["time"]) || commit["time"] < 0) {
      return "proof.commit.time must be a non-negative finite number when present";
    }
  }
  if (commit["prevB64"] !== undefined && typeof commit["prevB64"] !== "string") {
    return "proof.commit.prevB64 must be a string when present";
  }
  if (commit["epochId"] !== undefined && typeof commit["epochId"] !== "string") {
    return "proof.commit.epochId must be a string when present";
  }

  // signer
  if (!isObject(p["signer"])) return "proof.signer is missing or not an object";
  const signer = p["signer"] as Record<string, unknown>;
  if (typeof signer["publicKeyB64"] !== "string" || signer["publicKeyB64"].length === 0) {
    return "proof.signer.publicKeyB64 must be a non-empty string";
  }
  if (typeof signer["signatureB64"] !== "string" || signer["signatureB64"].length === 0) {
    return "proof.signer.signatureB64 must be a non-empty string";
  }

  // environment
  if (!isObject(p["environment"])) return "proof.environment is missing or not an object";
  const env = p["environment"] as Record<string, unknown>;
  if (typeof env["enforcement"] !== "string" || !VALID_ENFORCEMENT_TIERS.has(env["enforcement"])) {
    return `proof.environment.enforcement must be one of: stub, hw-key, measured-tee`;
  }
  if (typeof env["measurement"] !== "string" || env["measurement"].length === 0) {
    return "proof.environment.measurement must be a non-empty string";
  }

  // environment.attestation (optional)
  if (env["attestation"] !== undefined) {
    if (!isObject(env["attestation"])) {
      return "proof.environment.attestation must be an object when present";
    }
    const att = env["attestation"] as Record<string, unknown>;
    if (typeof att["format"] !== "string" || att["format"].length === 0) {
      return "proof.environment.attestation.format must be a non-empty string";
    }
    if (typeof att["reportB64"] !== "string" || att["reportB64"].length === 0) {
      return "proof.environment.attestation.reportB64 must be a non-empty string";
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Policy enforcement
// ---------------------------------------------------------------------------

function checkPolicy(proof: OCCProof, policy: VerificationPolicy): string | null {
  // Enforcement tier check
  if (policy.requireEnforcement !== undefined) {
    if (proof.environment.enforcement !== policy.requireEnforcement) {
      return `enforcement tier "${proof.environment.enforcement}" does not meet required tier "${policy.requireEnforcement}"`;
    }
  }

  // Measurement allowlist
  if (
    policy.allowedMeasurements !== undefined &&
    policy.allowedMeasurements.length > 0
  ) {
    if (!policy.allowedMeasurements.includes(proof.environment.measurement)) {
      return `measurement "${proof.environment.measurement}" is not in the allowed set`;
    }
  }

  // Public key allowlist
  if (
    policy.allowedPublicKeys !== undefined &&
    policy.allowedPublicKeys.length > 0
  ) {
    if (!policy.allowedPublicKeys.includes(proof.signer.publicKeyB64)) {
      return "proof public key is not in the allowed set";
    }
  }

  // Attestation required
  if (policy.requireAttestation === true) {
    if (proof.environment.attestation === undefined) {
      return "policy requires attestation but proof has none";
    }
  }

  // Attestation format allowlist
  if (
    policy.requireAttestationFormat !== undefined &&
    policy.requireAttestationFormat.length > 0
  ) {
    if (proof.environment.attestation === undefined) {
      return "policy requires attestation format but proof has no attestation";
    }
    if (!policy.requireAttestationFormat.includes(proof.environment.attestation.format)) {
      return `attestation format "${proof.environment.attestation.format}" is not in the required set`;
    }
  }

  // Counter checks
  if (policy.minCounter !== undefined || policy.maxCounter !== undefined) {
    if (proof.commit.counter === undefined) {
      return "policy requires a counter but proof has none";
    }
    let proofCounter: bigint;
    try {
      proofCounter = BigInt(proof.commit.counter);
    } catch {
      return "could not parse proof counter value as integer";
    }
    if (policy.minCounter !== undefined) {
      let minCounter: bigint;
      try {
        minCounter = BigInt(policy.minCounter);
      } catch {
        return "could not parse policy minCounter as integer";
      }
      if (proofCounter < minCounter) {
        return `counter ${proof.commit.counter} is below minimum ${policy.minCounter}`;
      }
    }
    if (policy.maxCounter !== undefined) {
      let maxCounter: bigint;
      try {
        maxCounter = BigInt(policy.maxCounter);
      } catch {
        return "could not parse policy maxCounter as integer";
      }
      if (proofCounter > maxCounter) {
        return `counter ${proof.commit.counter} is above maximum ${policy.maxCounter}`;
      }
    }
  }

  // Time checks
  if (policy.minTime !== undefined || policy.maxTime !== undefined) {
    if (proof.commit.time === undefined) {
      return "policy requires a time field but proof has none";
    }
    if (policy.minTime !== undefined && proof.commit.time < policy.minTime) {
      return `commit time ${proof.commit.time} is before minimum ${policy.minTime}`;
    }
    if (policy.maxTime !== undefined && proof.commit.time > policy.maxTime) {
      return `commit time ${proof.commit.time} is after maximum ${policy.maxTime}`;
    }
  }

  // Epoch ID check
  if (policy.requireEpochId === true) {
    if (proof.commit.epochId === undefined || proof.commit.epochId.length === 0) {
      return "policy requires epochId but proof has none";
    }
  }

  // Actor required check
  if (policy.requireActor === true) {
    if (proof.agency === undefined) {
      return "policy requires actor (agency) but proof has none";
    }
  }

  // Actor key ID allowlist
  if (
    policy.allowedActorKeyIds !== undefined &&
    policy.allowedActorKeyIds.length > 0
  ) {
    if (proof.agency === undefined) {
      return "policy requires allowed actor key ID but proof has no agency";
    }
    if (!policy.allowedActorKeyIds.includes(proof.agency.actor.keyId)) {
      return "actor key ID is not in the allowed set";
    }
  }

  // Actor provider allowlist
  if (
    policy.allowedActorProviders !== undefined &&
    policy.allowedActorProviders.length > 0
  ) {
    if (proof.agency === undefined) {
      return "policy requires allowed actor provider but proof has no agency";
    }
    if (!policy.allowedActorProviders.includes(proof.agency.actor.provider)) {
      return `actor provider "${proof.agency.actor.provider}" is not in the allowed set`;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Agency verification (P-256 device signature)
// ---------------------------------------------------------------------------

/**
 * Verify the agency envelope: P-256 signature, structural consistency,
 * and artifact binding.
 *
 * Checks:
 *   1. Structural validation of agency fields
 *   2. actor.keyId == hex(SHA-256(SPKI DER pubkey bytes))
 *   3. authorization.actorKeyId == actor.keyId
 *   4. authorization.artifactHash == proof.artifact.digestB64
 *   5. authorization.purpose == "occ/commit-authorize/v1"
 *   6. P-256 signature over canonical authorization payload
 */
function verifyAgency(proof: OCCProof): string | null {
  const agency = proof.agency!;
  const { actor, authorization } = agency;
  const isWebAuthn = "format" in authorization && authorization.format === "webauthn";

  // 1. Structural validation
  if (typeof actor.keyId !== "string" || actor.keyId.length === 0) {
    return "agency.actor.keyId must be a non-empty string";
  }
  if (typeof actor.publicKeyB64 !== "string" || actor.publicKeyB64.length === 0) {
    return "agency.actor.publicKeyB64 must be a non-empty string";
  }
  if (actor.algorithm !== "ES256") {
    return `agency.actor.algorithm must be "ES256", got "${String(actor.algorithm)}"`;
  }
  if (typeof actor.provider !== "string" || actor.provider.length === 0) {
    return "agency.actor.provider must be a non-empty string";
  }
  if (authorization.purpose !== "occ/commit-authorize/v1") {
    return `agency.authorization.purpose must be "occ/commit-authorize/v1", got "${String(authorization.purpose)}"`;
  }
  if (typeof authorization.signatureB64 !== "string" || authorization.signatureB64.length === 0) {
    return "agency.authorization.signatureB64 must be a non-empty string";
  }

  // 2. Verify keyId matches public key
  let pubKeyDer: Buffer;
  try {
    pubKeyDer = Buffer.from(actor.publicKeyB64, "base64");
  } catch {
    return "agency.actor.publicKeyB64 is not valid base64";
  }
  const computedKeyId = createHash("sha256").update(pubKeyDer).digest("hex");
  if (computedKeyId !== actor.keyId) {
    return "agency: actor.keyId does not match SHA-256 of public key";
  }

  // 3. Verify actorKeyId matches actor.keyId
  if (authorization.actorKeyId !== actor.keyId) {
    return "agency: authorization.actorKeyId does not match actor.keyId";
  }

  // 4. Verify artifactHash matches proof.artifact.digestB64
  //    For batch proofs, the P-256 signature binds to the first digest in the
  //    batch. batchContext (set by the enclave) lists all digests so we can
  //    verify this proof's digest is part of the authorized batch.
  if (authorization.artifactHash !== proof.artifact.digestB64) {
    const bc = agency.batchContext;
    if (
      !bc ||
      !Array.isArray(bc.batchDigests) ||
      !bc.batchDigests.includes(proof.artifact.digestB64) ||
      bc.batchDigests[0] !== authorization.artifactHash
    ) {
      return "agency: authorization.artifactHash does not match proof.artifact.digestB64";
    }
  }

  // 5. Signature verification (format-dependent)
  let sigBytes: Buffer;
  try {
    sigBytes = Buffer.from(authorization.signatureB64, "base64");
  } catch {
    return "agency.authorization.signatureB64 is not valid base64";
  }

  try {
    if (isWebAuthn) {
      // ── WebAuthn assertion verification ──
      const webauthn = authorization as WebAuthnAuthorization;

      if (typeof webauthn.clientDataJSON !== "string" || !webauthn.clientDataJSON) {
        return "agency: WebAuthn authorization missing clientDataJSON";
      }
      if (typeof webauthn.authenticatorDataB64 !== "string" || !webauthn.authenticatorDataB64) {
        return "agency: WebAuthn authorization missing authenticatorDataB64";
      }

      // Parse clientDataJSON
      let clientData: { type?: string; challenge?: string; origin?: string };
      try {
        clientData = JSON.parse(webauthn.clientDataJSON);
      } catch {
        return "agency: clientDataJSON is not valid JSON";
      }

      if (clientData.type !== "webauthn.get") {
        return `agency: clientDataJSON.type must be "webauthn.get", got "${clientData.type}"`;
      }

      // Verify challenge in clientDataJSON (base64url → base64)
      if (!clientData.challenge) {
        return "agency: clientDataJSON missing challenge field";
      }
      let clientChallenge = clientData.challenge
        .replace(/-/g, "+")
        .replace(/_/g, "/");
      while (clientChallenge.length % 4) clientChallenge += "=";
      if (clientChallenge !== authorization.challenge) {
        return "agency: clientDataJSON challenge does not match authorization.challenge";
      }

      // Check authenticatorData flags
      const authData = Buffer.from(webauthn.authenticatorDataB64, "base64");
      if (authData.length < 37) {
        return "agency: authenticatorData too short";
      }
      const flags = authData[32]!;
      if (!(flags & 0x01)) return "agency: authenticatorData UP flag not set";
      if (!(flags & 0x04)) return "agency: authenticatorData UV flag not set";

      // Build signed data: authenticatorData || SHA-256(clientDataJSON)
      const clientDataHash = createHash("sha256")
        .update(Buffer.from(webauthn.clientDataJSON, "utf8"))
        .digest();
      const signedData = Buffer.concat([authData, clientDataHash]);

      // P-256 signature verification over WebAuthn signed data
      const verifier = createVerify("SHA256");
      verifier.update(signedData);
      const valid = verifier.verify(
        { key: pubKeyDer, format: "der", type: "spki" },
        sigBytes
      );
      if (!valid) {
        return "agency: WebAuthn P-256 signature verification failed";
      }
    } else {
      // ── Direct P-256 signature verification ──
      const canonicalPayload: Record<string, unknown> = {
        purpose: authorization.purpose,
        actorKeyId: authorization.actorKeyId,
        artifactHash: authorization.artifactHash,
        challenge: authorization.challenge,
        timestamp: authorization.timestamp,
      };
      // Include protocolVersion when present (backward-compatible)
      if ("protocolVersion" in authorization && authorization.protocolVersion !== undefined) {
        canonicalPayload.protocolVersion = authorization.protocolVersion;
      }
      const payloadBytes = Buffer.from(
        JSON.stringify(canonicalPayload, Object.keys(canonicalPayload).sort()),
        "utf8"
      );

      const verifier = createVerify("SHA256");
      verifier.update(payloadBytes);
      const valid = verifier.verify(
        { key: pubKeyDer, format: "der", type: "spki" },
        sigBytes
      );
      if (!valid) {
        return "agency: P-256 signature verification failed";
      }
    }
  } catch (err: unknown) {
    return `agency: P-256 signature verification error: ${err instanceof Error ? err.message : String(err)}`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fail(reason: string): VerifyResult {
  return { valid: false, reason };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fromBase64(b64: string): Uint8Array {
  const buf = Buffer.from(b64, "base64");
  if (buf.toString("base64") !== b64) {
    throw new Error(`invalid base64 string: "${b64}"`);
  }
  return new Uint8Array(buf);
}
