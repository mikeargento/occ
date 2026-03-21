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
import { appendFileSync, writeFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
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
        metadata: { kind: "policy-commitment", policyName: name, adapter: "occ-mastra" },
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
        agentId: "mastra-agent",
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
// Tool wrapper
// ---------------------------------------------------------------------------

/**
 * Wrap a single Mastra tool's execute function with Ed25519 proof signing.
 *
 * The tool's `execute` is intercepted: a pre-execution proof is created
 * before the real function runs, and a post-execution proof is created
 * after it returns.
 *
 * If a policy is configured (via policyPath or policyBinding), tools not
 * in the policy's allowedTools list will be blocked with a denial proof.
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
  const policyPath = options?.policyPath ? resolve(options.policyPath) : undefined;
  const policyBinding = options?.policyBinding;

  const originalExecute = tool.execute;
  if (!originalExecute) return tool;

  const wrappedExecute = async (...args: any[]): Promise<any> => {
    const toolArgs = args[0] ?? {};
    const signer = await getSigner(statePath, measurement, { policyPath, policyBinding });

    // ── Policy enforcement: block tools not in the allowlist ──
    if (signer.policy?.allowedTools && !signer.policy.allowedTools.has(name)) {
      const denialDigest = hashPayload({
        tool: name,
        args: toolArgs,
        denied: true,
        reason: `Tool "${name}" not in policy allowedTools`,
      });

      const denialProof = await signDigest(denialDigest, {
        phase: "pre-execution",
        tool: name,
        agentId,
        denied: true,
        reason: `Tool "${name}" not in policy allowedTools`,
      }, signer);

      appendProof({
        timestamp: new Date().toISOString(),
        phase: "pre-execution",
        tool: name,
        agentId,
        args: toolArgs,
        proofDigestB64: denialDigest,
        receipt: denialProof,
      }, proofFile);

      throw new Error(`[OCC] Tool "${name}" blocked by policy. Not in allowed tools list.`);
    }

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
 * If a policy is configured, unauthorized tools will be blocked in
 * `beforeExecute` with a denial proof and thrown error.
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
  const policyPath = options?.policyPath ? resolve(options.policyPath) : undefined;
  const policyBinding = options?.policyBinding;

  return {
    /**
     * Hook called before a tool executes.
     * Creates a pre-execution proof entry.
     * If a policy is active, blocks unauthorized tools with a denial proof.
     */
    beforeExecute: async (params: { toolName: string; args: Record<string, unknown> }) => {
      const signer = await getSigner(statePath, measurement, { policyPath, policyBinding });

      // ── Policy enforcement: block tools not in the allowlist ──
      if (signer.policy?.allowedTools && !signer.policy.allowedTools.has(params.toolName)) {
        const denialDigest = hashPayload({
          tool: params.toolName,
          args: params.args,
          denied: true,
          reason: `Tool "${params.toolName}" not in policy allowedTools`,
        });

        const denialProof = await signDigest(denialDigest, {
          phase: "pre-execution",
          tool: params.toolName,
          agentId,
          denied: true,
          reason: `Tool "${params.toolName}" not in policy allowedTools`,
        }, signer);

        appendProof({
          timestamp: new Date().toISOString(),
          phase: "pre-execution",
          tool: params.toolName,
          agentId,
          args: params.args,
          proofDigestB64: denialDigest,
          receipt: denialProof,
        }, proofFile);

        throw new Error(`[OCC] Tool "${params.toolName}" blocked by policy. Not in allowed tools list.`);
      }

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
      const signer = await getSigner(statePath, measurement, { policyPath, policyBinding });

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
