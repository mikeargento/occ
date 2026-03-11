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
 * Supported request types:
 *   { type: "commit", digests: [{ digestB64, hashAlg }], metadata?, prevProofId? }
 *   { type: "key" }
 *   { type: "convertBW", imageB64: "<base64 JPEG>" }  — grayscale conversion + proof
 */

import { createServer, type Socket } from "node:net";
import { sha256 } from "@noble/hashes/sha256";
import { getPublicKeyAsync, signAsync, utils } from "@noble/ed25519";
import { canonicalize, canonicalizeToString } from "occproof";
import { Constructor } from "occproof";
import type { HostCapabilities, OCCProof, SignedBody } from "occproof";
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
// Commit handler — produces OCC proofs for pre-computed digests
// ---------------------------------------------------------------------------

async function handleCommit(req: {
  digests: Array<{ digestB64: string; hashAlg: "sha256" }>;
  metadata?: Record<string, unknown>;
  prevProofId?: string;
}): Promise<OCCProof[]> {
  const proofs: OCCProof[] = [];

  for (const { digestB64 } of req.digests) {
    // Decode the digest to verify it's valid base64
    const digestBytes = Buffer.from(digestB64, "base64");
    if (digestBytes.length !== 32) {
      throw new Error(`Invalid SHA-256 digest length: ${digestBytes.length}`);
    }

    // Build the proof manually using the same 10-step atomic flow.
    // (We don't delegate to Constructor.commitDigest() here because the
    // enclave manages its own counter, epoch, and chain state directly.)

    // Step 1: Counter
    counter += 1n;
    const counterStr = String(counter);

    // Step 2: Nonce
    const nonceBytes = await nitroHost.getFreshNonce();

    // Step 3: Time (advisory)
    const time = Date.now();

    // Step 5: Identity (publicKeyB64 computed at module level)

    // Step 6: Build signed body
    const commitFields: OCCProof["commit"] = {
      nonceB64: Buffer.from(nonceBytes).toString("base64"),
      counter: counterStr,
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
    };

    if (req.metadata !== undefined) {
      proof.metadata = req.metadata;
    }

    // Update proof chain state: hash this proof for the next proof's prevB64
    const proofCanonicalBytes = canonicalize(proof);
    lastProofHashB64 = Buffer.from(sha256(proofCanonicalBytes)).toString("base64");

    proofs.push(proof);
  }

  return proofs;
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
    case "key": {
      return {
        publicKeyB64,
        measurement,
        enforcement: "measured-tee",
        epochId,
      };
    }
    case "commitDigest": {
      const digestB64 = (req as { digestB64: string }).digestB64;
      const proofs = await handleCommit({
        digests: [{ digestB64, hashAlg: "sha256" }],
      });
      return { proof: proofs[0] };
    }
    case "commit": {
      // Raw bytes mode: parent sends { action: "commit", bytesB64: "..." }
      // We SHA-256 hash the bytes to get the digest, then create the proof.
      const bytesB64 = (req as { bytesB64?: string }).bytesB64;
      if (bytesB64) {
        const rawBytes = Buffer.from(bytesB64, "base64");
        const digest = sha256(rawBytes);
        const digestB64 = Buffer.from(digest).toString("base64");
        const proofs = await handleCommit({
          digests: [{ digestB64, hashAlg: "sha256" }],
        });
        return { proof: proofs[0] };
      }
      // Batch digest mode: { action: "commit", digests: [...] }
      const proofs = await handleCommit(req as {
        digests: Array<{ digestB64: string; hashAlg: "sha256" }>;
        metadata?: Record<string, unknown>;
      });
      return { ok: true, data: proofs };
    }
    case "convertBW": {
      // Grayscale conversion — happens entirely inside the enclave.
      // The proof's artifact digest covers the B&W output, proving
      // the state change (color → grayscale) occurred within the TEE.
      const imageB64 = (req as { imageB64?: string }).imageB64;
      if (!imageB64) {
        return { error: "convertBW requires imageB64 field" };
      }

      const sharp = (await import("sharp")).default;
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
      const proofs = await handleCommit({
        digests: [{ digestB64, hashAlg: "sha256" }],
        metadata: { source: "occ-bw-demo", operation: "grayscale" },
      });

      return {
        imageB64: Buffer.from(bwBuffer).toString("base64"),
        proof: proofs[0],
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
