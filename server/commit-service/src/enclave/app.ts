// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * Nitro Enclave application
 *
 * Runs INSIDE the Nitro Enclave. On boot:
 *   1. Generate Ed25519 keypair in memory (private key never leaves enclave)
 *   2. Initialize Constructor with NitroHost
 *   3. Listen on vsock port 5000 for length-prefixed JSON requests
 *
 * Vsock wire format: [4 bytes big-endian length][JSON payload]
 *
 * Supported request types:
 *   { type: "commit", digests: [{ digestB64, hashAlg }], metadata?, prevProofId? }
 *   { type: "key" }
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

console.log("[enclave] Ed25519 keypair generated in enclave memory");
console.log(`[enclave] publicKey: ${Buffer.from(publicKey).toString("base64")}`);

// ---------------------------------------------------------------------------
// Enclave HostCapabilities (NitroHost for real enclaves)
// ---------------------------------------------------------------------------

// In a real Nitro Enclave, this would use NitroHost from @occ/adapter-nitro.
// For the enclave binary itself, we import NitroHost and wire it up.
// Since this file runs inside the enclave, we use the real NSM device.

import { NitroHost, DefaultNsmClient } from "@occ/adapter-nitro";

const nsmClient = new DefaultNsmClient();
const nitroHost = new NitroHost({
  sign: (data: Uint8Array) => signAsync(data, privateKey),
  getPublicKey: async () => publicKey,
  nsmClient,
});

const constructor = await Constructor.initialize({ host: nitroHost });

const measurement = await nitroHost.getMeasurement();
console.log(`[enclave] measurement (PCR0): ${measurement}`);

// ---------------------------------------------------------------------------
// Monotonic counter (in-memory for now; production uses KmsCounter)
// ---------------------------------------------------------------------------

let counter = 0n;

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

    // For digest-only mode, we create the proof directly using the Constructor.
    // The Constructor.commit() expects raw bytes, but we have a pre-computed digest.
    // We use commitDigest() which accepts a pre-computed digestB64.
    // Since commitDigest() doesn't exist yet (Phase 2), we use the raw approach:
    // Build the proof manually using the same 10-step atomic flow.

    // Step 1: Counter
    counter += 1n;
    const counterStr = String(counter);

    // Step 2: Nonce
    const nonceBytes = await nitroHost.getFreshNonce();

    // Step 3: Time (advisory)
    const time = Date.now();

    // Step 5: Identity
    const publicKeyB64 = Buffer.from(publicKey).toString("base64");

    // Step 6: Build signed body
    const commitFields: OCCProof["commit"] = {
      nonceB64: Buffer.from(nonceBytes).toString("base64"),
      counter: counterStr,
      time,
    };

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
      return { ok: true, counter: String(counter) };
    }
    case "health": {
      return {
        status: "ok",
        counter: String(counter),
        publicKeyB64: Buffer.from(publicKey).toString("base64"),
        measurement,
        enforcement: "measured-tee",
      };
    }
    case "key": {
      return {
        publicKeyB64: Buffer.from(publicKey).toString("base64"),
        measurement,
        enforcement: "measured-tee",
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
