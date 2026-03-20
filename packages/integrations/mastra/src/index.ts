// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * occ-mastra — Cryptographic proof signing for Mastra tool calls.
 *
 * Wraps Mastra tool execute functions so that every tool invocation gets an
 * Ed25519-signed pre/post proof pair written to a local proof.jsonl.
 *
 * Usage:
 *   import { occWrapTool, occWrapTools, occMiddleware } from "occ-mastra";
 *
 *   // Wrap a single tool
 *   const wrapped = occWrapTool(myTool, "my-tool");
 *
 *   // Wrap all tools
 *   const tools = occWrapTools({ search: searchTool, calc: calcTool });
 *
 *   // Or use middleware
 *   const mw = occMiddleware();
 */

import { Constructor, canonicalize, type OCCProof } from "occproof";
import { StubHost } from "occ-stub";
import { sha256 } from "@noble/hashes/sha256";
import { appendFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OCCMastraOptions {
  /** Path to proof log file. Default: "proof.jsonl" */
  proofFile?: string;
  /** Path to signer state file. Default: ".occ/signer-state.json" */
  statePath?: string;
  /** Measurement string for proof metadata. Default: "occ-mastra:stub" */
  measurement?: string;
  /** Agent identifier for metadata. Default: "mastra-agent" */
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
// Tool wrapper
// ---------------------------------------------------------------------------

/**
 * Wrap a single Mastra tool's execute function with Ed25519 proof signing.
 *
 * The tool's `execute` is intercepted: a pre-execution proof is created
 * before the real function runs, and a post-execution proof is created
 * after it returns.
 *
 * @param tool    - A Mastra tool object with an `execute` method
 * @param name    - A human-readable name for this tool (used in proof metadata)
 * @param options - Configuration options
 * @returns A wrapped tool with the same shape
 */
export function occWrapTool<T extends { execute?: (...args: any[]) => any }>(
  tool: T,
  name: string,
  options?: OCCMastraOptions,
): T {
  const proofFile = options?.proofFile ?? "proof.jsonl";
  const statePath = resolve(options?.statePath ?? ".occ/signer-state.json");
  const measurement = options?.measurement ?? "occ-mastra:stub";
  const agentId = options?.agentId ?? "mastra-agent";

  const originalExecute = tool.execute;
  if (!originalExecute) return tool;

  const wrappedExecute = async (...args: any[]): Promise<any> => {
    const toolArgs = args[0] ?? {};
    const signer = await getSigner(statePath, measurement);

    // Pre-execution proof
    const preDigest = hashPayload({ tool: name, args: toolArgs });
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
      args: toolArgs,
      proofDigestB64: preDigest,
      receipt: preProof,
    }, proofFile);

    // Execute the real tool
    const result = await originalExecute.apply(tool, args);

    // Post-execution proof
    const postDigest = hashPayload({ tool: name, args: toolArgs, result });
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
      args: toolArgs,
      output: typeof result === "string" ? result.slice(0, 1000) : result,
      proofDigestB64: postDigest,
      receipt: postProof,
    }, proofFile);

    return result;
  };

  return { ...tool, execute: wrappedExecute } as T;
}

/**
 * Wrap all tools in a tools record with proof signing.
 *
 * @param tools   - A record of Mastra tools keyed by name
 * @param options - Configuration options
 * @returns A new record with all tools wrapped
 */
export function occWrapTools<T extends Record<string, { execute?: (...args: any[]) => any }>>(
  tools: T,
  options?: OCCMastraOptions,
): T {
  const wrapped: Record<string, any> = {};
  for (const [name, t] of Object.entries(tools)) {
    wrapped[name] = occWrapTool(t, name, options);
  }
  return wrapped as T;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Create a Mastra-compatible middleware that wraps tool executions with
 * proof signing.
 *
 * The returned middleware object provides `beforeExecute` and `afterExecute`
 * hooks that create pre/post proof entries for every tool call.
 *
 * @example
 * ```ts
 * import { occMiddleware } from "occ-mastra";
 *
 * const mw = occMiddleware({ agentId: "my-mastra-agent" });
 *
 * // Use with Mastra's middleware system
 * const agent = new Agent({
 *   tools: { search: searchTool },
 *   middleware: [mw],
 * });
 * ```
 */
export function occMiddleware(options?: OCCMastraOptions) {
  const proofFile = options?.proofFile ?? "proof.jsonl";
  const statePath = resolve(options?.statePath ?? ".occ/signer-state.json");
  const measurement = options?.measurement ?? "occ-mastra:stub";
  const agentId = options?.agentId ?? "mastra-agent";

  return {
    /**
     * Hook called before a tool executes.
     * Creates a pre-execution proof entry.
     */
    beforeExecute: async (params: { toolName: string; args: Record<string, unknown> }) => {
      const signer = await getSigner(statePath, measurement);

      const preDigest = hashPayload({ tool: params.toolName, args: params.args });
      const preProof = await signDigest(preDigest, {
        phase: "pre-execution",
        tool: params.toolName,
        agentId,
      }, signer);

      appendProof({
        timestamp: new Date().toISOString(),
        phase: "pre-execution",
        tool: params.toolName,
        agentId,
        args: params.args,
        proofDigestB64: preDigest,
        receipt: preProof,
      }, proofFile);
    },

    /**
     * Hook called after a tool executes.
     * Creates a post-execution proof entry.
     */
    afterExecute: async (params: { toolName: string; args: Record<string, unknown>; result: unknown }) => {
      const signer = await getSigner(statePath, measurement);

      const postDigest = hashPayload({ tool: params.toolName, args: params.args, result: params.result });
      const postProof = await signDigest(postDigest, {
        phase: "post-execution",
        tool: params.toolName,
        agentId,
      }, signer);

      appendProof({
        timestamp: new Date().toISOString(),
        phase: "post-execution",
        tool: params.toolName,
        agentId,
        args: params.args,
        output: typeof params.result === "string" ? params.result.slice(0, 1000) : params.result,
        proofDigestB64: postDigest,
        receipt: postProof,
      }, proofFile);
    },

    /**
     * Convenience: wrap tools directly (non-middleware usage).
     */
    wrapTools: <T extends Record<string, { execute?: (...args: any[]) => any }>>(
      tools: T,
    ): T => occWrapTools(tools, options),

    wrapTool: <T extends { execute?: (...args: any[]) => any }>(
      tool: T,
      name: string,
    ): T => occWrapTool(tool, name, options),
  };
}
