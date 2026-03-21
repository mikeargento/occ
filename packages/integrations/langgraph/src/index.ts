// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * occ-langgraph — Cryptographic proof signing for LangGraph node executions.
 *
 * Wraps LangGraph node functions so that every node invocation gets an
 * Ed25519-signed pre/post proof pair written to a local proof.jsonl.
 *
 * Usage:
 *   import { occNode, occGraph } from "occ-langgraph";
 *
 *   // Wrap a single node
 *   const myNode = occNode(async (state) => { ... }, "my-node");
 *
 *   // Or wrap all nodes in a graph
 *   const graph = occGraph(builder);
 */

import { Constructor, canonicalize, type OCCProof } from "occproof";
import { StubHost } from "occ-stub";
import { sha256 } from "@noble/hashes/sha256";
import { appendFileSync, writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OCCLangGraphOptions {
  /** Path to proof log file. Default: "proof.jsonl" */
  proofFile?: string;
  /** Path to signer state file. Default: ".occ/signer-state.json" */
  statePath?: string;
  /** Measurement string for proof metadata. Default: "occ-langgraph:stub" */
  measurement?: string;
  /** Agent identifier for metadata. Default: "langgraph-agent" */
  agentId?: string;
  /** Path to a policy .md file. If set, policy is committed as slot 0
   *  and every proof carries the policy binding. Tools not in the
   *  policy's allowedTools list will be blocked before execution. */
  policyPath?: string;
  /** Pre-built policy binding (alternative to policyPath). */
  policyBinding?: { digestB64: string; authorProofDigestB64?: string; name?: string; version?: string };
}

interface ProofLogEntry {
  timestamp: string;
  phase: "pre-execution" | "post-execution";
  tool: string;
  agentId: string;
  args?: Record<string, unknown>;
  output?: unknown;
  proofDigestB64: string;
  receipt: OCCProof;
}

// ---------------------------------------------------------------------------
// Signer singleton
// ---------------------------------------------------------------------------

/** Policy binding state for the signer. */
interface PolicyState {
  binding: { digestB64: string; authorProofDigestB64?: string; name?: string; version?: string };
  allowedTools?: Set<string>;
}

interface SignerState {
  constructor: Constructor;
  stub: StubHost;
  publicKeyB64: string;
  policy?: PolicyState;
}

const signerCache = new Map<string, Promise<SignerState>>();

async function getSigner(statePath: string, measurement: string, opts?: {
  policyPath?: string;
  policyBinding?: { digestB64: string; authorProofDigestB64?: string; name?: string; version?: string };
}): Promise<SignerState> {
  const key = statePath;
  let cached = signerCache.get(key);
  if (cached) return cached;

  cached = (async () => {
    const stub = await StubHost.createPersistent({
      statePath,
      measurement,
      enableTime: true,
      enableCounter: true,
    });

    const constructor = await Constructor.initialize({
      host: stub.host,
      policy: { requireCounter: true, requireTime: true },
    });

    const publicKeyB64 = Buffer.from(stub.publicKeyBytes).toString("base64");
    const state: SignerState = { constructor, stub, publicKeyB64 };

    // ── Policy enforcement: commit policy as slot 0 ──
    if (opts?.policyPath) {
      const policyMd = readFileSync(opts.policyPath, "utf-8");
      const policyBytes = new TextEncoder().encode(policyMd);
      const policyDigestB64 = Buffer.from(sha256(policyBytes)).toString("base64");

      // Parse allowed tools for enforcement
      const allowedTools = new Set<string>();
      const toolSection = policyMd.match(/##\s+Allowed\s+Tools[\s\S]*?(?=\n##|$)/i);
      if (toolSection) {
        const toolLines = toolSection[0].split("\n");
        for (const line of toolLines) {
          const match = line.match(/^[-*]\s+(.+)/);
          if (match) allowedTools.add(match[1].trim());
        }
      }

      // Extract name
      const nameMatch = policyMd.match(/^#\s+Policy:\s*(.+)/m);
      const name = nameMatch ? nameMatch[1].trim() : undefined;

      // Commit the policy as a proof (slot 0)
      const prevHash = stub.getLastProofHash();
      const commitInput: {
        digestB64: string;
        metadata?: Record<string, unknown>;
        prevProofHashB64?: string;
      } = {
        digestB64: policyDigestB64,
        metadata: { kind: "policy-commitment", policyName: name, adapter: "occ-langgraph" },
      };
      if (prevHash) commitInput.prevProofHashB64 = prevHash;

      const policyProof = await constructor.commitDigest(commitInput);
      const proofHash = Buffer.from(sha256(canonicalize(policyProof))).toString("base64");
      stub.setLastProofHash(proofHash);

      state.policy = {
        binding: {
          digestB64: policyDigestB64,
          authorProofDigestB64: proofHash,
          name,
        },
        allowedTools: allowedTools.size > 0 ? allowedTools : undefined,
      };

      // Write policy commitment to proof log
      appendProof({
        timestamp: new Date().toISOString(),
        phase: "pre-execution",
        tool: "__policy_commitment",
        agentId: "langgraph-agent",
        proofDigestB64: policyDigestB64,
        receipt: policyProof,
      }, resolve(opts.policyPath, "../proof.jsonl"));

    } else if (opts?.policyBinding) {
      state.policy = { binding: opts.policyBinding };
    }

    return state;
  })();

  signerCache.set(key, cached);
  return cached;
}

// ---------------------------------------------------------------------------
// Proof helpers
// ---------------------------------------------------------------------------

function appendProof(entry: ProofLogEntry, proofFile: string): void {
  const resolved = resolve(proofFile);
  if (!existsSync(resolved)) {
    mkdirSync(dirname(resolved), { recursive: true });
    writeFileSync(resolved, "");
  }
  appendFileSync(resolved, JSON.stringify(entry) + "\n");
}

function hashPayload(data: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  return Buffer.from(sha256(bytes)).toString("base64");
}

async function signDigest(
  digestB64: string,
  metadata: Record<string, unknown>,
  signer: SignerState,
): Promise<OCCProof> {
  const prevHash = signer.stub.getLastProofHash();

  const commitInput: {
    digestB64: string;
    metadata?: Record<string, unknown>;
    prevProofHashB64?: string;
    policy?: { digestB64: string; authorProofDigestB64?: string; name?: string; version?: string };
  } = { digestB64, metadata };

  if (prevHash) commitInput.prevProofHashB64 = prevHash;
  if (signer.policy?.binding) commitInput.policy = signer.policy.binding;

  const proof = await signer.constructor.commitDigest(commitInput);

  const proofHash = Buffer.from(sha256(canonicalize(proof))).toString("base64");
  signer.stub.setLastProofHash(proofHash);

  return proof;
}

// ---------------------------------------------------------------------------
// Node wrapper
// ---------------------------------------------------------------------------

/** A LangGraph node function: takes state, returns partial state. */
type NodeFn<S = any> = (state: S, config?: any) => Promise<Partial<S>> | Partial<S>;

/**
 * Wrap a single LangGraph node function with Ed25519 proof signing.
 *
 * A pre-execution proof is created before the node runs, and a
 * post-execution proof is created after it returns.
 *
 * If a policyPath is set, the policy is committed as slot 0 and nodes
 * not in the policy's allowedTools list will be blocked with a denial proof.
 *
 * @param fn      - The node function to wrap
 * @param name    - A human-readable name for this node (used in proof metadata)
 * @param options - Configuration options
 * @returns A wrapped node function with the same signature
 */
export function occNode<S = any>(
  fn: NodeFn<S>,
  name: string,
  options?: OCCLangGraphOptions,
): NodeFn<S> {
  const proofFile = options?.proofFile ?? "proof.jsonl";
  const statePath = resolve(options?.statePath ?? ".occ/signer-state.json");
  const measurement = options?.measurement ?? "occ-langgraph:stub";
  const agentId = options?.agentId ?? "langgraph-agent";
  const policyPath = options?.policyPath ? resolve(options.policyPath) : undefined;
  const policyBinding = options?.policyBinding;

  return async (state: S, config?: any): Promise<Partial<S>> => {
    const signer = await getSigner(statePath, measurement, { policyPath, policyBinding });

    // Summarize state for proof (avoid serializing huge state objects)
    const stateKeys = typeof state === "object" && state !== null
      ? Object.keys(state as Record<string, unknown>)
      : [];

    // ── Policy enforcement: block nodes not in the allowlist ──
    if (signer.policy?.allowedTools && !signer.policy.allowedTools.has(name)) {
      const denialDigest = hashPayload({
        node: name,
        stateKeys,
        denied: true,
        reason: `Node "${name}" not in policy allowedTools`,
      });

      const denialProof = await signDigest(denialDigest, {
        phase: "pre-execution",
        tool: name,
        agentId,
        denied: true,
        reason: `Node "${name}" not in policy allowedTools`,
      }, signer);

      appendProof({
        timestamp: new Date().toISOString(),
        phase: "pre-execution",
        tool: name,
        agentId,
        args: { stateKeys },
        proofDigestB64: denialDigest,
        receipt: denialProof,
      }, proofFile);

      throw new Error(`[OCC] Node "${name}" blocked by policy. Not in allowed tools list.`);
    }

    // Pre-execution proof
    const preDigest = hashPayload({ node: name, stateKeys });
    const preProof = await signDigest(preDigest, {
      phase: "pre-execution",
      tool: name,
      agentId,
    }, signer);

    appendProof({
      timestamp: new Date().toISOString(),
      phase: "pre-execution",
      tool: name,
      agentId,
      args: { stateKeys },
      proofDigestB64: preDigest,
      receipt: preProof,
    }, proofFile);

    // Execute the real node
    const result = await fn(state, config);

    // Post-execution proof
    const resultKeys = typeof result === "object" && result !== null
      ? Object.keys(result as Record<string, unknown>)
      : [];
    const postDigest = hashPayload({ node: name, stateKeys, resultKeys });
    const postProof = await signDigest(postDigest, {
      phase: "post-execution",
      tool: name,
      agentId,
    }, signer);

    appendProof({
      timestamp: new Date().toISOString(),
      phase: "post-execution",
      tool: name,
      agentId,
      args: { stateKeys },
      output: { resultKeys },
      proofDigestB64: postDigest,
      receipt: postProof,
    }, proofFile);

    return result;
  };
}

/**
 * Wrap all nodes in a LangGraph graph builder with proof signing.
 *
 * This patches the `addNode` method so that every node added via
 * `graph.addNode(name, fn)` is automatically wrapped with proof signing.
 *
 * @param graph   - A LangGraph StateGraph (or compatible builder with addNode)
 * @param options - Configuration options
 * @returns The same graph instance (mutated)
 */
export function occGraph<G extends { addNode: (name: string, fn: NodeFn, ...rest: any[]) => any }>(
  graph: G,
  options?: OCCLangGraphOptions,
): G {
  const originalAddNode = graph.addNode.bind(graph);

  graph.addNode = (name: string, fn: NodeFn, ...rest: any[]): any => {
    return originalAddNode(name, occNode(fn, name, options), ...rest);
  };

  return graph;
}
