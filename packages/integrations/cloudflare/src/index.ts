// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * occ-cloudflare — Cryptographic proof signing for Cloudflare Workers.
 *
 * Wraps tool/binding calls with Ed25519-signed proofs. Since Cloudflare
 * Workers cannot use node:fs, proof entries are returned (not written to
 * disk). The caller is responsible for storing them (e.g. KV, D1, R2).
 *
 * Uses an in-memory signer — no filesystem persistence. Each Worker
 * invocation starts a fresh proof chain.
 *
 * Usage:
 *   import { occWrapTool, occWrapBinding } from "occ-cloudflare";
 *
 *   const wrapped = occWrapTool(myTool, "my-tool");
 *   const result = await wrapped.execute(args);
 *   // result.proofs contains the pre/post proof entries
 */

import { Constructor, canonicalize, type OCCProof, type HostCapabilities } from "occproof";
import { sha256 } from "@noble/hashes/sha256";
import * as ed from "@noble/ed25519";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OCCCloudflareOptions {
  /** Measurement string for proof metadata. Default: "occ-cloudflare:stub" */
  measurement?: string;
  /** Agent identifier for metadata. Default: "cloudflare-worker" */
  agentId?: string;
}

export interface ProofLogEntry {
  timestamp: string;
  phase: "pre-execution" | "post-execution";
  tool: string;
  agentId: string;
  args?: Record<string, unknown>;
  output?: unknown;
  proofDigestB64: string;
  receipt: OCCProof;
}

export interface WrappedResult<T = unknown> {
  /** The original tool result */
  result: T;
  /** Pre and post execution proof entries */
  proofs: ProofLogEntry[];
}

// ---------------------------------------------------------------------------
// In-memory signer (no filesystem, no occ-stub)
// ---------------------------------------------------------------------------

interface SignerState {
  constructor: Constructor;
  host: InMemoryHost;
  publicKeyB64: string;
  lastProofHash: string | undefined;
}

class InMemoryHost implements HostCapabilities {
  readonly enforcementTier = "stub" as const;
  readonly #privateKey: Uint8Array;
  readonly #publicKey: Uint8Array;
  readonly #measurement: string;
  #counter = 0n;

  constructor(privateKey: Uint8Array, publicKey: Uint8Array, measurement: string) {
    this.#privateKey = privateKey;
    this.#publicKey = publicKey;
    this.#measurement = measurement;
  }

  async getMeasurement(): Promise<string> {
    return this.#measurement;
  }

  async getFreshNonce(): Promise<Uint8Array> {
    const nonce = new Uint8Array(32);
    crypto.getRandomValues(nonce);
    return nonce;
  }

  async sign(data: Uint8Array): Promise<Uint8Array> {
    return ed.signAsync(data, this.#privateKey);
  }

  async getPublicKey(): Promise<Uint8Array> {
    return this.#publicKey;
  }

  async nextCounter(): Promise<string> {
    this.#counter += 1n;
    return this.#counter.toString();
  }

  async secureTime(): Promise<number> {
    return Date.now();
  }
}

let signerPromise: Promise<SignerState> | undefined;

async function getSigner(measurement: string): Promise<SignerState> {
  if (signerPromise) return signerPromise;

  signerPromise = (async () => {
    // Generate ephemeral Ed25519 key pair in memory
    const privateKey = ed.utils.randomPrivateKey();
    const publicKey = await ed.getPublicKeyAsync(privateKey);

    const host = new InMemoryHost(privateKey, publicKey, measurement);

    const constructor = await Constructor.initialize({
      host,
      policy: { requireCounter: true, requireTime: true },
    });

    const publicKeyB64 = uint8ToBase64(publicKey);
    return { constructor, host, publicKeyB64, lastProofHash: undefined };
  })();

  return signerPromise;
}

// ---------------------------------------------------------------------------
// Helpers (no Buffer in Workers — use native btoa/Uint8Array)
// ---------------------------------------------------------------------------

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function hashPayload(data: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  return uint8ToBase64(sha256(bytes));
}

async function signDigest(
  digestB64: string,
  metadata: Record<string, unknown>,
  signer: SignerState,
): Promise<OCCProof> {
  const commitInput: {
    digestB64: string;
    metadata?: Record<string, unknown>;
    prevProofHashB64?: string;
  } = { digestB64, metadata };

  if (signer.lastProofHash) commitInput.prevProofHashB64 = signer.lastProofHash;

  const proof = await signer.constructor.commitDigest(commitInput);

  // Chain: store this proof's hash for the next commit
  const proofHash = uint8ToBase64(sha256(canonicalize(proof)));
  signer.lastProofHash = proofHash;

  return proof;
}

// ---------------------------------------------------------------------------
// Tool wrapper
// ---------------------------------------------------------------------------

/**
 * Wrap a single tool's execute function with Ed25519 proof signing.
 *
 * Since Cloudflare Workers have no filesystem, proofs are returned
 * alongside the result rather than written to disk.
 *
 * @param tool    - A tool object with an `execute` method
 * @param name    - A human-readable name for this tool (used in proof metadata)
 * @param options - Configuration options
 * @returns A wrapped tool whose execute returns { result, proofs }
 */
export function occWrapTool<T extends { execute?: (...args: any[]) => any }>(
  tool: T,
  name: string,
  options?: OCCCloudflareOptions,
): T & { execute: (...args: any[]) => Promise<WrappedResult> } {
  const measurement = options?.measurement ?? "occ-cloudflare:stub";
  const agentId = options?.agentId ?? "cloudflare-worker";

  const originalExecute = tool.execute;
  if (!originalExecute) {
    return { ...tool, execute: async () => ({ result: undefined, proofs: [] }) } as any;
  }

  const wrappedExecute = async (...args: any[]): Promise<WrappedResult> => {
    const toolArgs = args[0] ?? {};
    const signer = await getSigner(measurement);
    const proofs: ProofLogEntry[] = [];

    // Pre-execution proof
    const preDigest = hashPayload({ tool: name, args: toolArgs });
    const preProof = await signDigest(preDigest, {
      phase: "pre-execution",
      tool: name,
      agentId,
    }, signer);

    proofs.push({
      timestamp: new Date().toISOString(),
      phase: "pre-execution",
      tool: name,
      agentId,
      args: toolArgs,
      proofDigestB64: preDigest,
      receipt: preProof,
    });

    // Execute the real tool
    const result = await originalExecute.apply(tool, args);

    // Post-execution proof
    const postDigest = hashPayload({ tool: name, args: toolArgs, result });
    const postProof = await signDigest(postDigest, {
      phase: "post-execution",
      tool: name,
      agentId,
    }, signer);

    proofs.push({
      timestamp: new Date().toISOString(),
      phase: "post-execution",
      tool: name,
      agentId,
      args: toolArgs,
      output: typeof result === "string" ? result.slice(0, 1000) : result,
      proofDigestB64: postDigest,
      receipt: postProof,
    });

    return { result, proofs };
  };

  return { ...tool, execute: wrappedExecute } as any;
}

// ---------------------------------------------------------------------------
// Binding wrapper (Service Bindings, KV, D1, etc.)
// ---------------------------------------------------------------------------

/**
 * Wrap a Cloudflare binding (Service Binding, KV namespace, D1, etc.)
 * so that every method call produces pre/post proof entries.
 *
 * Returns a Proxy around the binding. Each method call returns
 * `{ result, proofs }` instead of the raw result.
 *
 * @param binding - A Cloudflare binding object (e.g. env.MY_SERVICE)
 * @param name    - A human-readable name for this binding
 * @param options - Configuration options
 * @returns A proxied binding with proof-wrapped methods
 */
export function occWrapBinding<B extends Record<string, any>>(
  binding: B,
  name: string,
  options?: OCCCloudflareOptions,
): B {
  const measurement = options?.measurement ?? "occ-cloudflare:stub";
  const agentId = options?.agentId ?? "cloudflare-worker";

  return new Proxy(binding, {
    get(target, prop: string | symbol) {
      const original = target[prop as keyof B];
      if (typeof original !== "function") return original;

      return async (...args: any[]): Promise<WrappedResult> => {
        const methodName = `${name}.${String(prop)}`;
        const signer = await getSigner(measurement);
        const proofs: ProofLogEntry[] = [];

        // Pre-execution proof
        const preDigest = hashPayload({
          tool: methodName,
          args: args.length === 1 ? args[0] : args,
        });
        const preProof = await signDigest(preDigest, {
          phase: "pre-execution",
          tool: methodName,
          agentId,
        }, signer);

        proofs.push({
          timestamp: new Date().toISOString(),
          phase: "pre-execution",
          tool: methodName,
          agentId,
          args: args.length === 1 ? args[0] : { _args: args },
          proofDigestB64: preDigest,
          receipt: preProof,
        });

        // Execute the real method
        const result = await original.apply(target, args);

        // Post-execution proof
        const postDigest = hashPayload({
          tool: methodName,
          args: args.length === 1 ? args[0] : args,
          result,
        });
        const postProof = await signDigest(postDigest, {
          phase: "post-execution",
          tool: methodName,
          agentId,
        }, signer);

        proofs.push({
          timestamp: new Date().toISOString(),
          phase: "post-execution",
          tool: methodName,
          agentId,
          args: args.length === 1 ? args[0] : { _args: args },
          output: typeof result === "string" ? result.slice(0, 1000) : result,
          proofDigestB64: postDigest,
          receipt: postProof,
        });

        return { result, proofs };
      };
    },
  }) as B;
}

/**
 * Reset the in-memory signer. Useful for testing or when you want to
 * start a fresh proof chain within the same Worker invocation.
 */
export function resetSigner(): void {
  signerPromise = undefined;
}
