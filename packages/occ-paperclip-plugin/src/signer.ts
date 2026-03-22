// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * OCC proof signer for the Paperclip plugin.
 *
 * Reuses the same pattern as mcp-proxy's local-signer:
 * - Embeds StubHost + Constructor directly
 * - Produces real Ed25519-signed OCCProofs
 * - Keys persist to disk across restarts
 * - Chain-links proofs via prevProofHashB64
 *
 * Each agent gets its own signer state so proof chains are per-agent.
 */

import { Constructor, canonicalize, type OCCProof } from "occproof";
import { StubHost } from "occ-stub";
import { sha256 } from "@noble/hashes/sha256";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface PluginSigner {
  /** Sign a payload and return a full OCCProof. */
  sign(
    payload: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): Promise<OCCProof>;
  /** The signer's public key (base64). */
  publicKeyB64: string;
}

const OCC_DIR = join(homedir(), ".paperclip", ".occ", "plugin");

/** Cache of per-agent signers. */
const signerCache = new Map<string, Promise<PluginSigner>>();

/**
 * Get or create a signer for a specific agent.
 * Each agent gets its own keypair and counter chain.
 */
export async function getAgentSigner(agentId: string): Promise<PluginSigner> {
  const existing = signerCache.get(agentId);
  if (existing) return existing;

  const promise = initSigner(agentId);
  signerCache.set(agentId, promise);
  return promise;
}

async function initSigner(agentId: string): Promise<PluginSigner> {
  const agentDir = join(OCC_DIR, agentId);
  mkdirSync(agentDir, { recursive: true });

  const statePath = join(agentDir, "signer-state.json");

  const stub = await StubHost.createPersistent({
    statePath,
    measurement: `occ-paperclip-plugin:${agentId}`,
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
    async sign(
      payload: Record<string, unknown>,
      metadata?: Record<string, unknown>,
    ): Promise<OCCProof> {
      const digestB64 = Buffer.from(
        sha256(canonicalize(payload)),
      ).toString("base64");
      const prevHash = stub.getLastProofHash();

      const commitInput: {
        digestB64: string;
        metadata?: Record<string, unknown>;
        prevProofHashB64?: string;
      } = { digestB64 };
      if (metadata) commitInput.metadata = metadata;
      if (prevHash) commitInput.prevProofHashB64 = prevHash;

      const proof = await constructor.commitDigest(commitInput);

      // Chain: store this proof's hash for the next commit
      const proofHash = Buffer.from(
        sha256(canonicalize(proof)),
      ).toString("base64");
      stub.setLastProofHash(proofHash);

      return proof;
    },
  };
}
