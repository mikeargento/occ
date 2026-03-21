// SPDX-License-Identifier: MIT
// OCC Protocol integration for Paperclip
// Cryptographic proof signing for every agent action
//
// Modes:
//   OCC_MODE=stub   (default) — local Ed25519 software signing
//   OCC_MODE=tee    — remote Nitro Enclave commit service
//   OCC_COMMIT_URL  — enclave endpoint (default: https://nitro.occproof.com)
//   OCC_API_KEY     — API key for TEE commit service

import { Constructor, type OCCProof, type PolicyBinding, canonicalize, hashPolicy, createPolicyBinding } from "occproof";
import { StubHost } from "occ-stub";
import { sha256 } from "@noble/hashes/sha256";
import { mkdirSync, appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface OccSigner {
  /** Sign a payload and return a full OCCProof. */
  sign(payload: Record<string, unknown>, metadata?: Record<string, unknown>): Promise<OCCProof>;
  /** The signer's public key (base64). */
  publicKeyB64: string;
  /** Signing mode: "stub" or "tee" */
  mode: string;
}

// Singleton instance
let _signer: OccSigner | null = null;
let _initPromise: Promise<OccSigner> | null = null;

const OCC_DIR = join(homedir(), ".paperclip", ".occ");
const STATE_PATH = join(OCC_DIR, "signer-state.json");
const PROOF_LOG_PATH = join(OCC_DIR, "proof.jsonl");

const OCC_MODE = process.env.OCC_MODE ?? "tee";
const OCC_COMMIT_URL = process.env.OCC_COMMIT_URL ?? "https://nitro.occproof.com";
const OCC_API_KEY = process.env.OCC_API_KEY ?? "";
const OCC_POLICY_PATH = process.env.OCC_POLICY_PATH ?? "";

// Policy binding — committed as slot 0, then referenced by every action
let _policyBinding: PolicyBinding | undefined;

/**
 * Get or create the singleton OCC signer.
 * Lazy-initialized on first use.
 */
export async function getOccSigner(): Promise<OccSigner> {
  if (_signer) return _signer;
  if (_initPromise) return _initPromise;

  _initPromise = OCC_MODE === "tee" ? initTeeSigner() : initStubSigner();
  _signer = await _initPromise;
  console.log(`[occ] signer initialized — mode=${_signer.mode} pubkey=${_signer.publicKeyB64.slice(0, 16)}...`);
  return _signer;
}

// ---------------------------------------------------------------------------
// Stub mode — local Ed25519 software signing
// ---------------------------------------------------------------------------
async function initStubSigner(): Promise<OccSigner> {
  mkdirSync(OCC_DIR, { recursive: true });

  const stub = await StubHost.createPersistent({
    statePath: STATE_PATH,
    measurement: "paperclip:heartbeat:occ-proof",
    enableTime: true,
    enableCounter: true,
  });

  const constructor = await Constructor.initialize({
    host: stub.host,
    policy: { requireCounter: true, requireTime: true },
  });

  const publicKeyB64 = Buffer.from(stub.publicKeyBytes).toString("base64");

  // Commit policy as slot 0 if configured
  if (OCC_POLICY_PATH) {
    const policyMd = readFileSync(OCC_POLICY_PATH, "utf8");
    const binding = createPolicyBinding(policyMd);
    const policyDigest = hashPolicy(policyMd);
    const prevHash = stub.getLastProofHash();

    const policyProof = await constructor.commitDigest({
      digestB64: policyDigest,
      metadata: { kind: "policy-commitment", policyName: binding.name },
      ...(prevHash ? { prevProofHashB64: prevHash } : {}),
      policy: binding,
    });

    const proofHash = Buffer.from(sha256(canonicalize(policyProof))).toString("base64");
    stub.setLastProofHash(proofHash);
    binding.authorProofDigestB64 = proofHash;
    _policyBinding = binding;

    appendProofLog(policyProof, { type: "policy-commitment", policyName: binding.name });
    console.log(`[occ] policy committed as slot 0 (counter: ${policyProof.commit.counter})`);
  }

  return {
    publicKeyB64,
    mode: "stub",
    async sign(payload: Record<string, unknown>, metadata?: Record<string, unknown>): Promise<OCCProof> {
      const digestB64 = Buffer.from(sha256(canonicalize(payload))).toString("base64");
      const prevHash = stub.getLastProofHash();

      const commitInput: {
        digestB64: string;
        metadata?: Record<string, unknown>;
        prevProofHashB64?: string;
        policy?: PolicyBinding;
      } = { digestB64 };
      if (metadata) commitInput.metadata = metadata;
      if (prevHash) commitInput.prevProofHashB64 = prevHash;
      if (_policyBinding) commitInput.policy = _policyBinding;

      const proof = await constructor.commitDigest(commitInput);

      const proofHash = Buffer.from(sha256(canonicalize(proof))).toString("base64");
      stub.setLastProofHash(proofHash);

      appendProofLog(proof, payload);
      return proof;
    },
  };
}

// ---------------------------------------------------------------------------
// TEE mode — remote Nitro Enclave commit service
// ---------------------------------------------------------------------------
async function initTeeSigner(): Promise<OccSigner> {
  mkdirSync(OCC_DIR, { recursive: true });

  // Fetch the enclave's public key
  const keyRes = await fetch(`${OCC_COMMIT_URL}/key`);
  if (!keyRes.ok) throw new Error(`[occ] TEE /key failed: ${keyRes.status}`);
  const keyData = await keyRes.json() as { publicKeyB64: string; measurement: string; enforcement: string };

  console.log(`[occ] TEE connected — enforcement=${keyData.enforcement} measurement=${keyData.measurement}`);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (OCC_API_KEY) headers["x-api-key"] = OCC_API_KEY;

  // Commit policy as slot 0 via TEE if configured
  if (OCC_POLICY_PATH) {
    const policyMd = readFileSync(OCC_POLICY_PATH, "utf8");
    const binding = createPolicyBinding(policyMd);
    const policyDigest = hashPolicy(policyMd);

    const policyRes = await fetch(`${OCC_COMMIT_URL}/commit`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        digests: [{ digestB64: policyDigest, hashAlg: "sha256" }],
        metadata: { kind: "policy-commitment", policyName: binding.name },
      }),
    });

    if (!policyRes.ok) throw new Error(`[occ] TEE policy commit failed: ${policyRes.status}`);
    const policyProofs = await policyRes.json() as OCCProof[];
    const policyProof = policyProofs[0];
    const proofHash = Buffer.from(sha256(canonicalize(policyProof))).toString("base64");
    binding.authorProofDigestB64 = proofHash;
    _policyBinding = binding;

    appendProofLog(policyProof, { type: "policy-commitment", policyName: binding.name });
    console.log(`[occ] TEE policy committed as slot 0 (counter: ${policyProof.commit?.counter})`);
  }

  return {
    publicKeyB64: keyData.publicKeyB64,
    mode: "tee",
    async sign(payload: Record<string, unknown>, metadata?: Record<string, unknown>): Promise<OCCProof> {
      const digestB64 = Buffer.from(sha256(canonicalize(payload))).toString("base64");

      const body: Record<string, unknown> = {
        digests: [{ digestB64, hashAlg: "sha256" }],
      };
      if (metadata) body.metadata = metadata;
      if (_policyBinding) body.policy = _policyBinding;

      const res = await fetch(`${OCC_COMMIT_URL}/commit`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`[occ] TEE /commit failed: ${res.status} ${text}`);
      }

      const data = await res.json() as OCCProof[] | { proofs: OCCProof[] };
      const proof = Array.isArray(data) ? data[0] : data.proofs[0];

      appendProofLog(proof, payload);
      return proof;
    },
  };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
const PROOF_EXPLORER_URL = process.env.OCC_EXPLORER_URL ?? "https://occ.wtf/api/proofs";

function appendProofLog(proof: OCCProof, payload: Record<string, unknown>) {
  try {
    appendFileSync(PROOF_LOG_PATH, JSON.stringify({ proof, payload, ts: new Date().toISOString() }) + "\n");
  } catch {
    // Non-fatal
  }
  // Fire-and-forget: post to proof explorer + OCC dashboard
  indexProofToExplorer(proof);
  forwardToOccDashboard(proof, payload);
}

const OCC_DASHBOARD_URL = process.env.OCC_DASHBOARD_URL ?? "http://localhost:9100";

async function forwardToOccDashboard(proof: OCCProof, payload: Record<string, unknown>) {
  try {
    const payloadType = (payload as { type?: string }).type ?? "unknown";
    const agentId = (payload as { agentId?: string }).agentId ?? "paperclip";
    const tool = payloadType; // pre-exec, post-exec, event
    await fetch(`${OCC_DASHBOARD_URL}/api/audit/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool,
        agentId,
        decision: { allowed: true },
        timestamp: Date.now(),
        receipt: proof,
      }),
    });
  } catch {
    // Dashboard not running — that's fine
  }
}

async function indexProofToExplorer(proof: OCCProof) {
  try {
    await fetch(PROOF_EXPLORER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proofs: [proof] }),
    });
  } catch {
    // Non-fatal — explorer indexing is best-effort
  }
}

/**
 * Sign an agent execution manifest (pre-execution).
 */
export async function signPreExec(params: {
  runId: string;
  agentId: string;
  agentName?: string;
  companyId: string;
  adapterType: string;
  invocationSource: string;
  contextHash?: string;
}): Promise<OCCProof | null> {
  try {
    const signer = await getOccSigner();
    return await signer.sign(
      { type: "paperclip/pre-exec", ...params, timestamp: Date.now() },
      { type: "paperclip/pre-exec", runId: params.runId, agentId: params.agentId },
    );
  } catch (err) {
    console.warn("[occ] pre-exec signing failed:", err);
    return null;
  }
}

/**
 * Sign an agent execution result (post-execution).
 */
export async function signPostExec(params: {
  runId: string;
  agentId: string;
  companyId: string;
  status: string;
  exitCode?: number | null;
  signal?: string | null;
  logSha256?: string | null;
  logBytes?: number | null;
  model?: string;
  provider?: string;
  costUsd?: number | null;
}): Promise<OCCProof | null> {
  try {
    const signer = await getOccSigner();
    return await signer.sign(
      { type: "paperclip/post-exec", ...params, timestamp: Date.now() },
      { type: "paperclip/post-exec", runId: params.runId, agentId: params.agentId },
    );
  } catch (err) {
    console.warn("[occ] post-exec signing failed:", err);
    return null;
  }
}

/**
 * Sign a run event.
 */
export async function signEvent(params: {
  runId: string;
  agentId: string;
  companyId: string;
  seq: number;
  eventType: string;
  message?: string | null;
}): Promise<OCCProof | null> {
  try {
    const signer = await getOccSigner();
    return await signer.sign(
      { type: "paperclip/event", ...params, timestamp: Date.now() },
      { type: "paperclip/event", runId: params.runId, seq: params.seq },
    );
  } catch (err) {
    console.warn("[occ] event signing failed:", err);
    return null;
  }
}

/**
 * Sign an agent policy change — the rule itself becomes a proof.
 * This commits the occPolicy configuration as a cryptographic record
 * in the OCC chain, making the rule change tamper-evident.
 *
 * REVOCATION ENFORCEMENT: After committing the policy-change proof,
 * the module-level _policyBinding is updated so that all subsequent
 * action proofs reference this new policy proof's digest. This means
 * a revoked permission is immediately reflected in the proof chain —
 * no stale policy can authorize future actions.
 */
export async function signPolicyChange(params: {
  agentId: string;
  agentName: string;
  companyId: string;
  occPolicy: Record<string, unknown>;
  changedBy: string;
}): Promise<OCCProof | null> {
  try {
    const signer = await getOccSigner();
    const proof = await signer.sign(
      {
        type: "paperclip/policy-change",
        agentId: params.agentId,
        agentName: params.agentName,
        companyId: params.companyId,
        occPolicy: params.occPolicy,
        changedBy: params.changedBy,
        timestamp: Date.now(),
      },
      {
        type: "paperclip/policy-change",
        agentId: params.agentId,
        kind: "policy-change",
      },
    );

    // ── Revocation enforcement ──
    // Update the policy binding to reference THIS proof as the new authority.
    // All subsequent action proofs will now carry this policy-change proof's
    // digest as authorProofDigestB64, proving they were authorized AFTER
    // the policy change. If a permission was revoked, the new binding reflects that.
    if (proof && _policyBinding) {
      const newDigest = Buffer.from(sha256(canonicalize(proof))).toString("base64");

      // Recompute the policy digest from the new occPolicy config
      const policyContent = JSON.stringify(params.occPolicy);
      const policyDigest = Buffer.from(sha256(new TextEncoder().encode(policyContent))).toString("base64");

      _policyBinding = {
        ..._policyBinding,
        digestB64: policyDigest,
        authorProofDigestB64: newDigest,
      };

      console.log(`[occ] policy binding updated — new authority: ${newDigest.slice(0, 16)}...`);
    } else if (proof && !_policyBinding) {
      // No prior policy binding — create one from this policy-change proof
      const newDigest = Buffer.from(sha256(canonicalize(proof))).toString("base64");
      const policyContent = JSON.stringify(params.occPolicy);
      const policyDigest = Buffer.from(sha256(new TextEncoder().encode(policyContent))).toString("base64");

      _policyBinding = {
        digestB64: policyDigest,
        authorProofDigestB64: newDigest,
        name: params.agentName,
      };

      console.log(`[occ] policy binding created from policy-change — authority: ${newDigest.slice(0, 16)}...`);
    }

    return proof;
  } catch (err) {
    console.warn("[occ] policy-change signing failed:", err);
    return null;
  }
}

/**
 * Get the current policy binding.
 * Used by enforcement checks to verify actions are authorized
 * under the latest policy.
 */
export function getCurrentPolicyBinding(): PolicyBinding | undefined {
  return _policyBinding;
}
