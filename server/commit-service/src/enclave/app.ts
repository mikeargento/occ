// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * Nitro Enclave application
 *
 * Runs INSIDE the Nitro Enclave. On boot:
 *   1. Generate Ed25519 keypair in memory (private key never leaves enclave)
 *   2. Generate boot nonce (32 bytes from NSM GetRandom)
 *   3. Compute epochId = SHA-256(publicKeyB64 + ":" + bootNonceB64)
 *   4. Initialize Constructor with NitroHost
 *   5. Listen on vsock port 5000 for length-prefixed JSON requests
 *
 * Epoch semantics:
 *   - epochId uniquely identifies this enclave lifecycle
 *   - Changes on every enclave restart (new keypair + new boot nonce)
 *   - Included in every proof's commit field (signed, tamper-evident)
 *   - Verifiers use it to detect epoch boundaries
 *
 * Proof chaining:
 *   - Each proof records prevB64 = BASE64(SHA-256(canonicalize(previousProof)))
 *   - First proof of an epoch has no prevB64
 *   - Chain is forward-only, signed, and fork-detectable
 *
 * Vsock wire format: [4 bytes big-endian length][JSON payload]
 *
 * OCC causal commit protocol (2-RTT):
 *   1. Client calls allocateSlot() → enclave returns signed slot record
 *   2. Client calls commit(slotId, digests) → enclave consumes slot, returns proof
 *   The slot record is embedded in the proof for self-contained verification.
 *
 * Supported request types:
 *   { type: "allocateSlot" }  — pre-allocate a causal slot (nonce-first)
 *   { type: "commit", slotId, digests: [{ digestB64, hashAlg }], metadata?, agency? }
 *   { type: "challenge" }  — issue a fresh nonce for agency signing
 *   { type: "key" }
 *   { type: "convertBW", imageB64: "<base64 JPEG>" }  — grayscale conversion + proof
 */

import { createServer, type Socket } from "node:net";
import { createVerify, createHash } from "node:crypto";
import { sha256 } from "@noble/hashes/sha256";
import { getPublicKeyAsync, signAsync, utils } from "@noble/ed25519";
import { canonicalize, canonicalizeToString } from "occproof";
import { Constructor } from "occproof";
import type { HostCapabilities, OCCProof, SignedBody, SlotAllocation, ActorIdentity, AgencyEnvelope, AuthorizationPayload, WebAuthnAuthorization } from "occproof";
import type { EnclaveRequest, EnclaveResponse } from "../parent/vsock-client.js";

// ---------------------------------------------------------------------------
// Ed25519 keypair — generated in enclave memory, never exported
// ---------------------------------------------------------------------------

const privateKey = utils.randomPrivateKey();
const publicKey = await getPublicKeyAsync(privateKey);
const publicKeyB64 = Buffer.from(publicKey).toString("base64");

console.log("[enclave] Ed25519 keypair generated in enclave memory");
console.log(`[enclave] publicKey: ${publicKeyB64}`);

// ---------------------------------------------------------------------------
// Enclave HostCapabilities (NitroHost for real enclaves)
// ---------------------------------------------------------------------------

import { NitroHost, DefaultNsmClient } from "@occ/adapter-nitro";

const nsmClient = new DefaultNsmClient();
const nitroHost = new NitroHost({
  sign: (data: Uint8Array) => signAsync(data, privateKey),
  getPublicKey: async () => publicKey,
  nsmClient,
});

const measurement = await nitroHost.getMeasurement();
console.log(`[enclave] measurement (PCR0): ${measurement}`);
if (/^0+$/.test(measurement)) {
  console.warn(
    "[enclave] WARNING: measurement is all zeros — enclave is running in debug mode.\n" +
    "[enclave] Proofs will contain a zero measurement. Redeploy without --debug-mode for production."
  );
}

// ---------------------------------------------------------------------------
// Epoch identity — computed once at boot, included in every proof
// epochId = BASE64(SHA-256(publicKeyB64 + ":" + bootNonceB64))
// ---------------------------------------------------------------------------

const bootNonceBytes = await nitroHost.getFreshNonce();
const bootNonceB64 = Buffer.from(bootNonceBytes).toString("base64");
const epochIdBytes = sha256(
  new TextEncoder().encode(publicKeyB64 + ":" + bootNonceB64)
);
const epochId = Buffer.from(epochIdBytes).toString("base64");

console.log(`[enclave] epochId: ${epochId}`);

// ---------------------------------------------------------------------------
// Constructor — initialized with epochId so callers that use
// constructor.commit()/commitDigest() also get epochId in proofs.
// The manual proof-building flow below uses epochId from module scope.
// ---------------------------------------------------------------------------

const constructor = await Constructor.initialize({ host: nitroHost, epochId });

// ---------------------------------------------------------------------------
// Monotonic counter (in-memory; initialized from DynamoDB on boot)
// ---------------------------------------------------------------------------

let counter = 0n;

// ---------------------------------------------------------------------------
// Proof chain state — tracks last proof for prevB64 chaining
// prevB64 = BASE64(SHA-256(canonicalize(previousProof)))
// First proof of an epoch has no prevB64.
// ---------------------------------------------------------------------------

let lastProofHashB64: string | undefined;

// ---------------------------------------------------------------------------
// Challenge state — pending challenges for agency signing
// Each challenge is a fresh enclave nonce with a TTL.
// ---------------------------------------------------------------------------

const CHALLENGE_TTL_MS = 60_000; // 60 seconds
const pendingChallenges = new Map<string, number>(); // challenge → expiresAt

function cleanExpiredChallenges(): void {
  const now = Date.now();
  for (const [challenge, expiresAt] of pendingChallenges) {
    if (now >= expiresAt) {
      pendingChallenges.delete(challenge);
    }
  }
}

async function handleChallenge(): Promise<{ challenge: string }> {
  cleanExpiredChallenges();

  // Generate fresh nonce from NSM hardware RNG
  const nonceBytes = await nitroHost.getFreshNonce();
  const challenge = Buffer.from(nonceBytes).toString("base64");

  // Store with TTL
  pendingChallenges.set(challenge, Date.now() + CHALLENGE_TTL_MS);

  console.log(`[enclave] challenge issued (${pendingChallenges.size} pending)`);
  return { challenge };
}

// ---------------------------------------------------------------------------
// Causal slot state — pending slots for OCC atomic causality
// Each slot is a pre-allocated nonce signed by the enclave BEFORE any
// artifact hash is known. Consuming a slot is required to produce a proof.
// ---------------------------------------------------------------------------

const SLOT_TTL_MS = 120_000; // 2 minutes

interface SlotEntry {
  record: SlotAllocation;
  expiresAt: number;
}

const pendingSlots = new Map<string, SlotEntry>(); // nonceB64 → SlotEntry

function cleanExpiredSlots(): void {
  const now = Date.now();
  for (const [slotId, entry] of pendingSlots) {
    if (now >= entry.expiresAt) {
      pendingSlots.delete(slotId);
    }
  }
}

/**
 * Allocate a causal slot.
 *
 * Generates a fresh nonce from the NSM hardware RNG, signs a slot record
 * that deliberately contains NO artifact data, and stores the nonce as a
 * single-use resource. A subsequent commit must reference this slotId to
 * produce a proof.
 *
 * This is the OCC nonce-first causal ordering primitive:
 *   allocateSlot() → slot exists → commit(slotId, digest) → slot consumed
 *
 * The signed slot record is embedded in the resulting proof so that any
 * verifier can confirm the nonce existed before the artifact was bound.
 */
async function handleAllocateSlot(): Promise<{ slotId: string; slot: SlotAllocation }> {
  cleanExpiredSlots();

  // 1. Increment counter — the slot itself occupies a counter position,
  //    guaranteeing slotCounter < commitCounter for any later commit.
  counter += 1n;

  // 2. Generate fresh nonce from NSM hardware RNG
  const nonceBytes = await nitroHost.getFreshNonce();
  const nonceB64 = Buffer.from(nonceBytes).toString("base64");

  // 3. Capture advisory time
  const time = Date.now();

  // 4. Build slot body — deliberately NO artifact hash
  const slotBody = {
    version: "occ/slot/1" as const,
    nonceB64,
    counter: String(counter),
    time,
    epochId,
    publicKeyB64,
  };

  // 5. Sign the slot body (proves enclave created this independently)
  const slotCanonicalBytes = canonicalize(slotBody);
  const signatureBytes = await signAsync(slotCanonicalBytes, privateKey);

  const record: SlotAllocation = {
    ...slotBody,
    signatureB64: Buffer.from(signatureBytes).toString("base64"),
  };

  // 6. Store as single-use resource
  pendingSlots.set(nonceB64, { record, expiresAt: Date.now() + SLOT_TTL_MS });

  console.log(`[enclave] slot allocated: counter=${record.counter} (${pendingSlots.size} pending)`);
  return { slotId: nonceB64, slot: record };
}

// ---------------------------------------------------------------------------
// Agency verification — validates P-256 device signature
// ---------------------------------------------------------------------------

/**
 * Verify an agency envelope before including the actor in the proof.
 *
 * Two verification paths:
 *   - Direct (format undefined): P-256 signature over canonical JSON
 *   - WebAuthn (format: "webauthn"): Standard WebAuthn assertion
 *
 * Common checks:
 *   1. challenge is pending and unused (consumed on success)
 *   2. authorization.artifactHash matches the committed digest
 *   3. authorization.actorKeyId matches actor.keyId
 *   4. actor.keyId == hex(SHA-256(SPKI DER pubkey bytes))
 *   5. timestamp is within CHALLENGE_TTL_MS of now
 *   6. P-256 signature is valid (over format-specific data)
 */
function verifyAgencyEnvelope(
  agency: AgencyEnvelope,
  digestB64: string
): void {
  const { actor, authorization } = agency;
  const isWebAuthn = "format" in authorization && authorization.format === "webauthn";

  // 1. Validate challenge is pending
  cleanExpiredChallenges();
  const challengeToCheck = authorization.challenge;
  if (!pendingChallenges.has(challengeToCheck)) {
    throw new Error("Agency: challenge not found or expired");
  }

  // 2. Validate purpose
  if (authorization.purpose !== "occ/commit-authorize/v1") {
    throw new Error(`Agency: invalid purpose "${authorization.purpose}"`);
  }

  // 3. Validate actorKeyId matches actor.keyId
  if (authorization.actorKeyId !== actor.keyId) {
    throw new Error("Agency: authorization.actorKeyId does not match actor.keyId");
  }

  // 4. Validate artifactHash matches the committed digest
  if (authorization.artifactHash !== digestB64) {
    throw new Error("Agency: authorization.artifactHash does not match committed digest");
  }

  // 5. Validate actor.keyId == hex(SHA-256(SPKI DER pubkey bytes))
  const pubKeyDer = Buffer.from(actor.publicKeyB64, "base64");
  const computedKeyId = createHash("sha256").update(pubKeyDer).digest("hex");
  if (computedKeyId !== actor.keyId) {
    throw new Error("Agency: actor.keyId does not match SHA-256 of public key");
  }

  // 6. Validate timestamp freshness
  const now = Date.now();
  if (Math.abs(now - authorization.timestamp) > CHALLENGE_TTL_MS) {
    throw new Error("Agency: authorization timestamp too far from current time");
  }

  // 7. Validate algorithm
  if (actor.algorithm !== "ES256") {
    throw new Error(`Agency: unsupported algorithm "${actor.algorithm}"`);
  }

  if (isWebAuthn) {
    // ── WebAuthn assertion verification ──
    const webauthn = authorization as WebAuthnAuthorization;

    // Parse clientDataJSON
    let clientData: { type?: string; challenge?: string; origin?: string };
    try {
      clientData = JSON.parse(webauthn.clientDataJSON);
    } catch {
      throw new Error("Agency: clientDataJSON is not valid JSON");
    }

    // Verify type
    if (clientData.type !== "webauthn.get") {
      throw new Error(`Agency: clientDataJSON.type must be "webauthn.get", got "${clientData.type}"`);
    }

    // Verify challenge in clientDataJSON matches the enclave-issued nonce
    // WebAuthn encodes the challenge as base64url in clientDataJSON
    if (!clientData.challenge) {
      throw new Error("Agency: clientDataJSON missing challenge field");
    }
    // Convert base64url → base64 for comparison
    let clientChallenge = clientData.challenge
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    while (clientChallenge.length % 4) clientChallenge += "=";
    if (clientChallenge !== challengeToCheck) {
      throw new Error("Agency: clientDataJSON challenge does not match enclave-issued nonce");
    }

    // Parse authenticatorData and check flags
    const authData = Buffer.from(webauthn.authenticatorDataB64, "base64");
    if (authData.length < 37) {
      throw new Error("Agency: authenticatorData too short");
    }
    const flags = authData[32]!; // flags byte is at offset 32 (after 32-byte rpIdHash)
    const UP = (flags & 0x01) !== 0; // User Present
    const UV = (flags & 0x04) !== 0; // User Verified
    if (!UP) throw new Error("Agency: authenticatorData UP (user present) flag not set");
    if (!UV) throw new Error("Agency: authenticatorData UV (user verified) flag not set");

    // Build signed data: authenticatorData || SHA-256(clientDataJSON)
    const clientDataHash = createHash("sha256")
      .update(Buffer.from(webauthn.clientDataJSON, "utf8"))
      .digest();
    const signedData = Buffer.concat([authData, clientDataHash]);

    // P-256 signature verification over WebAuthn signed data
    const sigBytes = Buffer.from(webauthn.signatureB64, "base64");
    const verifier = createVerify("SHA256");
    verifier.update(signedData);
    const valid = verifier.verify(
      { key: pubKeyDer, format: "der", type: "spki" },
      sigBytes
    );
    if (!valid) {
      throw new Error("Agency: WebAuthn P-256 signature verification failed");
    }
  } else {
    // ── Direct P-256 signature verification ──
    // Build canonical payload (sorted keys, compact JSON, no signatureB64)
    const canonicalPayload: Record<string, unknown> = {
      purpose: authorization.purpose,
      actorKeyId: authorization.actorKeyId,
      artifactHash: authorization.artifactHash,
      challenge: authorization.challenge,
      timestamp: authorization.timestamp,
    };
    // Include protocolVersion when present (backward-compatible)
    if ("protocolVersion" in authorization && (authorization as unknown as Record<string, unknown>).protocolVersion !== undefined) {
      canonicalPayload.protocolVersion = (authorization as unknown as Record<string, unknown>).protocolVersion;
    }
    const payloadBytes = Buffer.from(
      JSON.stringify(canonicalPayload, Object.keys(canonicalPayload).sort()),
      "utf8"
    );

    const sigBytes = Buffer.from(authorization.signatureB64, "base64");
    const verifier = createVerify("SHA256");
    verifier.update(payloadBytes);
    const valid = verifier.verify(
      { key: pubKeyDer, format: "der", type: "spki" },
      sigBytes
    );
    if (!valid) {
      throw new Error("Agency: P-256 signature verification failed");
    }
  }

  // Consume the challenge (single-use)
  pendingChallenges.delete(challengeToCheck);
  console.log(`[enclave] agency verified: actor=${actor.keyId.slice(0, 12)}... provider=${actor.provider} format=${isWebAuthn ? "webauthn" : "direct"}`);
}

// ---------------------------------------------------------------------------
// Commit handler — produces OCC proofs for pre-computed digests
// ---------------------------------------------------------------------------

/**
 * Commit a single artifact hash by consuming a pre-allocated causal slot.
 *
 * OCC causal invariant: one slot → one artifact → one proof.
 * The slot MUST exist before the artifact hash can be committed.
 * The slot's nonce becomes the proof's nonce (binding).
 * The slot's counter must be less than the commit's counter (ordering).
 * The SHA-256 of the canonical slot body is included in the signed
 * commit body via slotHashB64 (cryptographic binding).
 */
async function handleCommit(req: {
  slotId: string;
  digestB64: string;
  metadata?: Record<string, unknown>;
  agency?: AgencyEnvelope;
  attribution?: { name?: string; title?: string; message?: string };
}): Promise<OCCProof> {
  // ── Slot consumption — OCC causal gate ──
  // The slot MUST exist before any artifact can be committed.
  // This is the enforcement point for nonce-first atomic causality.
  cleanExpiredSlots();
  const slotEntry = pendingSlots.get(req.slotId);
  if (!slotEntry) {
    throw new Error("Slot not found or expired — call allocateSlot before committing");
  }
  const slotRecord = slotEntry.record;
  pendingSlots.delete(req.slotId); // single-use consumption

  console.log(`[enclave] slot consumed: counter=${slotRecord.counter} slotId=${req.slotId.slice(0, 12)}... (${pendingSlots.size} remaining)`);

  // Validate digest
  const digestB64 = req.digestB64;
  const digestBytes = Buffer.from(digestB64, "base64");
  if (digestBytes.length !== 32) {
    throw new Error(`Invalid SHA-256 digest length: ${digestBytes.length}`);
  }

  // Verify agency if provided (single artifact, no batch)
  let verifiedActor: ActorIdentity | undefined;
  if (req.agency) {
    verifyAgencyEnvelope(req.agency, digestB64);
    verifiedActor = req.agency.actor;
  }

  // ── OCC causal commit flow ──
  // The slot has been consumed. This commit is causally bound to
  // the pre-existing slot allocation.

  // Step 1: Counter (commit counter, guaranteed > slot counter)
  counter += 1n;
  const counterStr = String(counter);

  // Step 2: Nonce — use the slot's nonce (causal binding)
  // No new nonce generated here. The nonce was pre-allocated in the slot.

  // Step 3: Time (advisory)
  const time = Date.now();

  // Compute slotHashB64: SHA-256 of canonical slot body.
  // This hash is included in the signed commit body, so the Ed25519
  // signature cryptographically binds this commit to the exact slot.
  const slotBody = {
    version: slotRecord.version,
    nonceB64: slotRecord.nonceB64,
    counter: slotRecord.counter,
    time: slotRecord.time,
    epochId: slotRecord.epochId,
    publicKeyB64: slotRecord.publicKeyB64,
  };
  const slotHashB64 = Buffer.from(sha256(canonicalize(slotBody))).toString("base64");

  // Step 6: Build signed body
  const commitFields: OCCProof["commit"] = {
    nonceB64: slotRecord.nonceB64,  // bound to the pre-allocated slot
    counter: counterStr,
    slotCounter: slotRecord.counter, // proves slot preceded commit
    slotHashB64,                     // signed binding to exact slot record
    time,
    epochId,
  };

  // Proof chaining: include prevB64 if we have a previous proof
  if (lastProofHashB64 !== undefined) {
    commitFields.prevB64 = lastProofHashB64;
  }

  const signedBody: SignedBody = {
    version: "occ/1",
    artifact: { hashAlg: "sha256", digestB64 },
    commit: commitFields,
    publicKeyB64,
    enforcement: "measured-tee",
    measurement,
  };

  // Include verified actor identity in the signed body
  if (verifiedActor) {
    signedBody.actor = verifiedActor;
  }

  // Include attribution in the signed body (cryptographically sealed)
  if (req.attribution) {
    const attr: Record<string, string> = {};
    if (req.attribution.name) attr.name = req.attribution.name;
    if (req.attribution.title) attr.title = req.attribution.title;
    if (req.attribution.message) attr.message = req.attribution.message;
    if (Object.keys(attr).length > 0) {
      signedBody.attribution = attr as SignedBody["attribution"];
    }
  }

  // Step 7: Canonicalize
  const canonicalBytes = canonicalize(signedBody);

  // Step 8: Sign
  const signatureBytes = await signAsync(canonicalBytes, privateKey);

  // Step 9: Attestation
  const bodyHash = sha256(canonicalBytes);
  const attestation = await nitroHost.getAttestation(bodyHash);

  // Re-sign with attestationFormat included
  signedBody.attestationFormat = attestation.format;
  const canonicalBytesWithAttest = canonicalize(signedBody);
  const signatureBytesWithAttest = await signAsync(canonicalBytesWithAttest, privateKey);

  // Step 10: Assemble proof
  const proof: OCCProof = {
    version: "occ/1",
    artifact: signedBody.artifact,
    commit: signedBody.commit,
    signer: {
      publicKeyB64,
      signatureB64: Buffer.from(signatureBytesWithAttest).toString("base64"),
    },
    environment: {
      enforcement: "measured-tee",
      measurement,
      attestation: {
        format: attestation.format,
        reportB64: Buffer.from(attestation.report).toString("base64"),
      },
    },
    // ── OCC causal evidence ──
    // Embed the full signed slot allocation record. The commit signature
    // binds to this via slotHashB64 (preventing slot swapping), and the
    // slot's own signature proves the enclave created it independently.
    slotAllocation: slotRecord,
  };

  // Include full agency envelope (independently verifiable)
  if (req.agency) {
    proof.agency = req.agency;
  }

  // Include attribution (sealed in signed body)
  if (signedBody.attribution) {
    proof.attribution = signedBody.attribution;
  }

  if (req.metadata !== undefined) {
    proof.metadata = req.metadata;
  }

  // Update proof chain state: hash this proof for the next proof's prevB64
  const proofCanonicalBytes = canonicalize(proof);
  lastProofHashB64 = Buffer.from(sha256(proofCanonicalBytes)).toString("base64");

  return proof;
}

// ---------------------------------------------------------------------------
// Request dispatcher
// ---------------------------------------------------------------------------

// The parent server (http-server.js) sends requests with { action: "key" },
// { action: "commitDigest", digestB64: "..." }, and { action: "init", lastKnownCounter: N }.
async function handleRequest(req: Record<string, unknown>): Promise<unknown> {
  const action = (req as { action?: string }).action;

  switch (action) {
    case "init": {
      // Parent server sends the last DynamoDB-anchored counter on boot.
      // We set our in-memory counter to at least that value so the next
      // proof's counter will be higher, passing DynamoDB's conditional write.
      const lastKnown = (req as { lastKnownCounter?: number }).lastKnownCounter ?? 0;
      if (BigInt(lastKnown) > counter) {
        counter = BigInt(lastKnown);
        console.log(`[enclave] counter initialized to ${counter} from DynamoDB head`);
      } else {
        console.log(`[enclave] counter already at ${counter}, ignoring init(${lastKnown})`);
      }
      return { ok: true, counter: String(counter), epochId };
    }
    case "health": {
      return {
        status: "ok",
        counter: String(counter),
        publicKeyB64,
        measurement,
        enforcement: "measured-tee",
        epochId,
      };
    }
    case "allocateSlot": {
      return await handleAllocateSlot();
    }
    case "challenge": {
      return await handleChallenge();
    }
    case "key": {
      return {
        publicKeyB64,
        measurement,
        enforcement: "measured-tee",
        epochId,
      };
    }
    case "commitDigest": {
      // One slot → one artifact → one proof (OCC causal unit)
      const slotId = (req as { slotId: string }).slotId;
      if (!slotId) throw new Error("commitDigest requires slotId — call allocateSlot first");
      const digestB64 = (req as { digestB64: string }).digestB64;
      const agency = (req as { agency?: AgencyEnvelope }).agency;
      const attribution = (req as { attribution?: { name?: string; title?: string; message?: string } }).attribution;
      const proof = await handleCommit({ slotId, digestB64, agency, attribution });
      return { proof };
    }
    case "commit": {
      // One slot → one artifact → one proof (OCC causal unit)
      const slotId = (req as { slotId: string }).slotId;
      if (!slotId) throw new Error("commit requires slotId — call allocateSlot first");

      // Raw bytes mode: parent sends { action: "commit", bytesB64: "..." }
      // We SHA-256 hash the bytes to get the digest, then create the proof.
      const bytesB64 = (req as { bytesB64?: string }).bytesB64;
      if (bytesB64) {
        const rawBytes = Buffer.from(bytesB64, "base64");
        const digest = sha256(rawBytes);
        const digestB64 = Buffer.from(digest).toString("base64");
        const proof = await handleCommit({ slotId, digestB64 });
        return { proof };
      }
      // Single digest mode: { action: "commit", slotId, digestB64, agency?, attribution? }
      const digestB64 = (req as { digestB64: string }).digestB64;
      const agency = (req as { agency?: AgencyEnvelope }).agency;
      const attribution = (req as { attribution?: { name?: string; title?: string; message?: string } }).attribution;
      const metadata = (req as { metadata?: Record<string, unknown> }).metadata;
      const proof = await handleCommit({ slotId, digestB64, agency, attribution, metadata });
      return { proof };
    }
    case "convertBW": {
      // Grayscale conversion — happens entirely inside the enclave.
      // The proof's artifact digest covers the B&W output, proving
      // the state change (color → grayscale) occurred within the TEE.
      //
      // For convertBW, the enclave auto-allocates a slot internally
      // because both the transformation and the commitment happen
      // within the same TEE boundary in a single atomic operation.
      // The causal slot still exists in the proof for verifier consistency.
      const imageB64 = (req as { imageB64?: string }).imageB64;
      if (!imageB64) {
        return { error: "convertBW requires imageB64 field" };
      }

      // Auto-allocate a slot (enclave-internal, no external round-trip)
      const { slotId } = await handleAllocateSlot();

      const sharp = (await import("sharp") as any).default;
      const inputBuffer = Buffer.from(imageB64, "base64");

      // Convert to grayscale JPEG inside the enclave
      const bwBuffer = await sharp(inputBuffer)
        .grayscale()
        .jpeg({ quality: 90 })
        .toBuffer();

      // Hash the B&W output — this becomes the proof's artifact digest
      const digest = sha256(bwBuffer);
      const digestB64 = Buffer.from(digest).toString("base64");

      // Generate OCC proof for this digest
      const proof = await handleCommit({
        slotId,
        digestB64,
        metadata: { source: "occ-bw-demo", operation: "grayscale" },
      });

      return {
        imageB64: Buffer.from(bwBuffer).toString("base64"),
        proof,
        digestB64,
      };
    }
    default:
      return { error: `Unknown action: ${String(action)}` };
  }
}

// ---------------------------------------------------------------------------
// Vsock listener (length-prefixed JSON framing)
// ---------------------------------------------------------------------------

const VSOCK_PORT = 5000;

// allowHalfOpen: keep writable side open even when readable side ends
// (socat half-closes the connection after sending the request)
const server = createServer({ allowHalfOpen: true }, (socket: Socket) => {
  let buffer = "";

  socket.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");

    // Try to parse as complete JSON after each chunk
    let request: Record<string, unknown>;
    try {
      request = JSON.parse(buffer) as Record<string, unknown>;
    } catch {
      // Not yet a complete JSON object, wait for more data
      return;
    }

    // Reset buffer (we consumed the message)
    buffer = "";

    // Process asynchronously and write response before closing
    handleRequest(request)
      .then((response) => {
        const json = JSON.stringify(response);
        socket.end(json);
      })
      .catch((err) => {
        const errResp = {
          error: `Enclave error: ${err instanceof Error ? err.message : String(err)}`,
        };
        socket.end(JSON.stringify(errResp));
      });
  });

  socket.on("error", (err) => {
    if (err.message !== "read ECONNRESET") {
      console.error("[enclave] socket error:", err.message);
    }
  });
});

// In a Nitro Enclave, there's no loopback network. We listen on a Unix
// domain socket and let socat bridge vsock:5000 → this socket.
const SOCKET_PATH = "/app/enclave.sock";
server.listen(SOCKET_PATH, () => {
  console.log(`[enclave] listening on ${SOCKET_PATH}`);
});
