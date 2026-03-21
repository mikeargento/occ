// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * Local OCC signer — embeds StubHost + Constructor directly in the proxy.
 *
 * Produces real Ed25519-signed OCCProofs without needing an external
 * commit service. Keys are persisted to disk so the same identity
 * survives restarts.
 *
 * SECURITY NOTE: This uses the stub adapter (software signing).
 * For production deployments, use `signerMode: "remote"` with a
 * Nitro Enclave commit service.
 */

import { Constructor, type OCCProof, type PolicyBinding } from "occproof";
import { StubHost } from "occ-stub";

export interface LocalSigner {
  /** Commit a digest and return a full OCCProof. */
  commitDigest(digestB64: string, metadata?: Record<string, unknown>, policy?: PolicyBinding): Promise<OCCProof>;
  /** The signer's public key (base64). */
  publicKeyB64: string;
}

/**
 * Create a local signer backed by a PersistentStubHost.
 *
 * The keypair and counter state are persisted to `statePath` so
 * proofs chain correctly across proxy restarts.
 */
export async function createLocalSigner(statePath: string): Promise<LocalSigner> {
  const stub = await StubHost.createPersistent({
    statePath,
    measurement: "occ-agent:proxy:local-stub",
    enableTime: true,
    enableCounter: true,
  });

  const constructor = await Constructor.initialize({
    host: stub.host,
    policy: { requireCounter: true, requireTime: true },
  });

  const publicKeyB64 = Buffer.from(stub.publicKeyBytes).toString("base64");

  return {
    publicKeyB64,
    async commitDigest(digestB64: string, metadata?: Record<string, unknown>, policy?: PolicyBinding): Promise<OCCProof> {
      const prevHash = stub.getLastProofHash();

      const commitInput: { digestB64: string; metadata?: Record<string, unknown>; prevProofHashB64?: string; policy?: PolicyBinding } = {
        digestB64,
      };
      if (metadata) commitInput.metadata = metadata;
      if (prevHash) commitInput.prevProofHashB64 = prevHash;
      if (policy) commitInput.policy = policy;

      const proof = await constructor.commitDigest(commitInput);

      // Chain: store this proof's hash for the next commit
      const { canonicalize } = await import("occproof");
      const { sha256 } = await import("@noble/hashes/sha256");
      const proofHash = Buffer.from(sha256(canonicalize(proof))).toString("base64");
      stub.setLastProofHash(proofHash);

      return proof;
    },
  };
}
