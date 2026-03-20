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
import { appendFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
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

interface SignerState {
  constructor: Constructor;
  stub: StubHost;
  publicKeyB64: string;
}

const signerCache = new Map<string, Promise<SignerState>>();

async function getSigner(statePath: string, measurement: string): Promise<SignerState> {
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
    return { constructor, stub, publicKeyB64 };
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
  } = { digestB64, metadata };

  if (prevHash) commitInput.prevProofHashB64 = prevHash;

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

  return async (state: S, config?: any): Promise<Partial<S>> => {
    const signer = await getSigner(statePath, measurement);

    // Summarize state for proof (avoid serializing huge state objects)
    const stateKeys = typeof state === "object" && state !== null
      ? Object.keys(state as Record<string, unknown>)
      : [];

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
