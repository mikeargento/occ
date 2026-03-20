// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * occ-vercel — Cryptographic proof signing for Vercel AI SDK tool calls.
 *
 * Provides two integration patterns:
 *
 *   1. `occMiddleware()` — Vercel AI SDK experimental_middleware compatible.
 *      Intercepts tool calls at the middleware layer for generateText/streamText.
 *
 *   2. `occWrapTools()` — wraps tool execute functions directly.
 *      Works with any Vercel AI SDK version.
 *
 * Both produce Ed25519-signed pre/post proof pairs written to proof.jsonl.
 */

import { Constructor, canonicalize, type OCCProof } from "occproof";
import { StubHost } from "occ-stub";
import { sha256 } from "@noble/hashes/sha256";
import { appendFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OCCVercelOptions {
  /** Path to proof log file. Default: "proof.jsonl" */
  proofFile?: string;
  /** Path to signer state file. Default: ".occ/signer-state.json" */
  statePath?: string;
  /** Measurement string for proof metadata. Default: "occ-vercel:stub" */
  measurement?: string;
  /** Agent identifier for metadata. Default: "vercel-ai-agent" */
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
// Tool wrapper pattern
// ---------------------------------------------------------------------------

/**
 * Wrap a single Vercel AI SDK tool's execute function with proof signing.
 *
 * The tool's `execute` is intercepted: a pre-execution proof is created
 * before the real function runs, and a post-execution proof is created
 * after it returns.
 */
export function occWrapTool<T extends { execute?: (...args: any[]) => any }>(
  tool: T,
  toolName: string,
  options?: OCCVercelOptions,
): T {
  const proofFile = options?.proofFile ?? "proof.jsonl";
  const statePath = resolve(options?.statePath ?? ".occ/signer-state.json");
  const measurement = options?.measurement ?? "occ-vercel:stub";
  const agentId = options?.agentId ?? "vercel-ai-agent";

  const originalExecute = tool.execute;
  if (!originalExecute) return tool;

  const wrappedExecute = async (...args: any[]): Promise<any> => {
    const toolArgs = args[0] ?? {};
    const signer = await getSigner(statePath, measurement);

    // Pre-execution proof
    const preDigest = hashPayload({ tool: toolName, args: toolArgs });
    const preProof = await signDigest(preDigest, {
      phase: "pre-execution",
      tool: toolName,
      agentId,
    }, signer);

    appendProof({
      timestamp: new Date().toISOString(),
      phase: "pre-execution",
      tool: toolName,
      agentId,
      args: toolArgs,
      proofDigestB64: preDigest,
      receipt: preProof,
    }, proofFile);

    // Execute the real tool
    const result = await originalExecute.apply(tool, args);

    // Post-execution proof
    const postDigest = hashPayload({ tool: toolName, args: toolArgs, result });
    const postProof = await signDigest(postDigest, {
      phase: "post-execution",
      tool: toolName,
      agentId,
    }, signer);

    appendProof({
      timestamp: new Date().toISOString(),
      phase: "post-execution",
      tool: toolName,
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
 * @example
 * ```ts
 * const tools = occWrapTools({
 *   search: tool({ ... }),
 *   calculate: tool({ ... }),
 * });
 * ```
 */
export function occWrapTools<T extends Record<string, { execute?: (...args: any[]) => any }>>(
  tools: T,
  options?: OCCVercelOptions,
): T {
  const wrapped: Record<string, any> = {};
  for (const [name, t] of Object.entries(tools)) {
    wrapped[name] = occWrapTool(t, name, options);
  }
  return wrapped as T;
}

// ---------------------------------------------------------------------------
// Middleware pattern (Vercel AI SDK experimental_middleware)
// ---------------------------------------------------------------------------

/**
 * Vercel AI SDK middleware-compatible object.
 *
 * The Vercel AI SDK `experimental_middleware` interface expects an object
 * with optional `transformParams` and `wrapGenerate` / `wrapStream` methods.
 * This middleware intercepts tool calls and signs them.
 *
 * @example
 * ```ts
 * import { generateText } from "ai";
 * import { occMiddleware } from "occ-vercel";
 *
 * const result = await generateText({
 *   model: openai("gpt-4o"),
 *   tools: { search: searchTool },
 *   experimental_middleware: occMiddleware(),
 *   prompt: "Search for OCC",
 * });
 * ```
 */
export function occMiddleware(options?: OCCVercelOptions) {
  const proofFile = options?.proofFile ?? "proof.jsonl";
  const statePath = resolve(options?.statePath ?? ".occ/signer-state.json");
  const measurement = options?.measurement ?? "occ-vercel:stub";
  const agentId = options?.agentId ?? "vercel-ai-agent";

  return {
    /**
     * Transform params to wrap tool execute functions before they run.
     */
    transformParams: async ({ params }: { params: any }) => {
      if (!params.tools || !Array.isArray(params.tools)) return params;

      const wrappedTools = params.tools.map((t: any) => {
        if (!t.execute) return t;

        const toolName = t.name ?? t.type ?? "unknown";
        const originalExecute = t.execute;

        return {
          ...t,
          execute: async (...args: any[]) => {
            const toolArgs = args[0] ?? {};
            const signer = await getSigner(statePath, measurement);

            // Pre-execution proof
            const preDigest = hashPayload({ tool: toolName, args: toolArgs });
            const preProof = await signDigest(preDigest, {
              phase: "pre-execution",
              tool: toolName,
              agentId,
            }, signer);

            appendProof({
              timestamp: new Date().toISOString(),
              phase: "pre-execution",
              tool: toolName,
              agentId,
              args: toolArgs,
              proofDigestB64: preDigest,
              receipt: preProof,
            }, proofFile);

            // Execute
            const result = await originalExecute(...args);

            // Post-execution proof
            const postDigest = hashPayload({ tool: toolName, args: toolArgs, result });
            const postProof = await signDigest(postDigest, {
              phase: "post-execution",
              tool: toolName,
              agentId,
            }, signer);

            appendProof({
              timestamp: new Date().toISOString(),
              phase: "post-execution",
              tool: toolName,
              agentId,
              args: toolArgs,
              output: typeof result === "string" ? result.slice(0, 1000) : result,
              proofDigestB64: postDigest,
              receipt: postProof,
            }, proofFile);

            return result;
          },
        };
      });

      return { ...params, tools: wrappedTools };
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
