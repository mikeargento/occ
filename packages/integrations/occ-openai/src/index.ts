// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * occ-openai — Cryptographic proof signing for OpenAI Node SDK tool calls.
 *
 * Wraps an OpenAI client so that every tool call in a chat completion response
 * gets an Ed25519-signed pre/post proof pair written to a local proof.jsonl.
 *
 * Usage:
 *   import OpenAI from "openai";
 *   import { wrapOpenAI } from "occ-openai";
 *
 *   const client = wrapOpenAI(new OpenAI());
 *   const response = await client.chat.completions.create({ ... });
 */

import { Constructor, canonicalize, type OCCProof } from "occproof";
import { StubHost } from "occ-stub";
import { sha256 } from "@noble/hashes/sha256";
import { appendFileSync, writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WrapOpenAIOptions {
  /** Path to proof log file. Default: "proof.jsonl" */
  proofFile?: string;
  /** Path to signer state file. Default: ".occ/signer-state.json" */
  statePath?: string;
  /** Measurement string for proof metadata. Default: "occ-openai:stub" */
  measurement?: string;
  /** Agent identifier for metadata. Default: "openai-agent" */
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
// Proof writer
// ---------------------------------------------------------------------------

function appendProof(entry: ProofLogEntry, proofFile: string): void {
  if (!existsSync(proofFile)) {
    mkdirSync(dirname(resolve(proofFile)), { recursive: true });
    writeFileSync(proofFile, "");
  }
  appendFileSync(proofFile, JSON.stringify(entry) + "\n");
}

// ---------------------------------------------------------------------------
// Core signing
// ---------------------------------------------------------------------------

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

  // Chain: store this proof's hash for the next commit
  const proofHash = Buffer.from(sha256(canonicalize(proof))).toString("base64");
  signer.stub.setLastProofHash(proofHash);

  return proof;
}

function hashPayload(data: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  return Buffer.from(sha256(bytes)).toString("base64");
}

// ---------------------------------------------------------------------------
// OpenAI wrapper
// ---------------------------------------------------------------------------

/**
 * Wrap an OpenAI client instance to produce Ed25519-signed proofs for
 * every tool call in chat completion responses.
 *
 * The returned client is a Proxy — all non-completion methods pass through
 * unchanged. Only `client.chat.completions.create()` is intercepted.
 *
 * @param client  - An OpenAI client instance
 * @param options - Configuration options
 * @returns A wrapped OpenAI client (same type)
 */
export function wrapOpenAI<T extends { chat: { completions: { create: (...args: any[]) => any } } }>(
  client: T,
  options?: WrapOpenAIOptions,
): T {
  const proofFile = resolve(options?.proofFile ?? "proof.jsonl");
  const statePath = resolve(options?.statePath ?? ".occ/signer-state.json");
  const measurement = options?.measurement ?? "occ-openai:stub";
  const agentId = options?.agentId ?? "openai-agent";

  // Deep proxy: client.chat.completions.create
  const originalCreate = client.chat.completions.create.bind(client.chat.completions);

  const wrappedCreate = async (...args: any[]): Promise<any> => {
    const response = await originalCreate(...args);

    // Only sign if the response has tool calls
    const choices = response?.choices;
    if (!choices || !Array.isArray(choices)) return response;

    const signer = await getSigner(statePath, measurement);

    for (const choice of choices) {
      const toolCalls = choice?.message?.tool_calls;
      if (!toolCalls || !Array.isArray(toolCalls)) continue;

      for (const toolCall of toolCalls) {
        const toolName = toolCall.function?.name ?? "unknown";
        let toolArgs: Record<string, unknown> = {};
        try {
          toolArgs = JSON.parse(toolCall.function?.arguments ?? "{}");
        } catch {
          toolArgs = { raw: toolCall.function?.arguments };
        }

        // Pre-execution proof: sign the tool call input
        const preDigest = hashPayload({
          tool: toolName,
          args: toolArgs,
          callId: toolCall.id,
        });

        const preProof = await signDigest(preDigest, {
          phase: "pre-execution",
          tool: toolName,
          callId: toolCall.id,
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
      }
    }

    return response;
  };

  // Build the proxy chain
  const wrappedCompletions = new Proxy(client.chat.completions, {
    get(target: any, prop: string | symbol) {
      if (prop === "create") return wrappedCreate;
      return target[prop];
    },
  });

  const wrappedChat = new Proxy(client.chat, {
    get(target: any, prop: string | symbol) {
      if (prop === "completions") return wrappedCompletions;
      return target[prop];
    },
  });

  return new Proxy(client, {
    get(target: any, prop: string | symbol) {
      if (prop === "chat") return wrappedChat;
      return target[prop];
    },
  }) as T;
}

/**
 * Sign a tool execution result after the tool function has been called.
 *
 * Use this to create post-execution proofs when you handle tool calls
 * in your own execution loop.
 *
 * @param toolName - Name of the tool that was executed
 * @param toolArgs - Arguments passed to the tool
 * @param result   - The tool execution result
 * @param options  - Configuration options
 */
export async function signToolResult(
  toolName: string,
  toolArgs: Record<string, unknown>,
  result: unknown,
  options?: WrapOpenAIOptions,
): Promise<OCCProof> {
  const proofFile = resolve(options?.proofFile ?? "proof.jsonl");
  const statePath = resolve(options?.statePath ?? ".occ/signer-state.json");
  const measurement = options?.measurement ?? "occ-openai:stub";
  const agentId = options?.agentId ?? "openai-agent";

  const signer = await getSigner(statePath, measurement);

  const postDigest = hashPayload({
    tool: toolName,
    args: toolArgs,
    result,
  });

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

  return postProof;
}
