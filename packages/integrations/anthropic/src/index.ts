// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * occ-anthropic — Cryptographic proof signing for Anthropic Node SDK tool calls.
 *
 * Wraps an Anthropic client so that every tool_use content block in a message
 * response gets an Ed25519-signed pre/post proof pair written to a local proof.jsonl.
 *
 * Usage:
 *   import Anthropic from "@anthropic-ai/sdk";
 *   import { wrapAnthropic } from "occ-anthropic";
 *
 *   const client = wrapAnthropic(new Anthropic());
 *   const response = await client.messages.create({ ... });
 */

import { Constructor, canonicalize, type OCCProof } from "occproof";
import { StubHost } from "occ-stub";
import { sha256 } from "@noble/hashes/sha256";
import { appendFileSync, writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WrapAnthropicOptions {
  /** Path to proof log file. Default: "proof.jsonl" */
  proofFile?: string;
  /** Path to signer state file. Default: ".occ/signer-state.json" */
  statePath?: string;
  /** Measurement string for proof metadata. Default: "occ-anthropic:stub" */
  measurement?: string;
  /** Agent identifier for metadata. Default: "anthropic-agent" */
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
        metadata: { kind: "policy-commitment", policyName: name, adapter: "occ-anthropic" },
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
        agentId: "anthropic-agent",
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
    policy?: { digestB64: string; authorProofDigestB64?: string; name?: string; version?: string };
  } = { digestB64, metadata };

  if (prevHash) commitInput.prevProofHashB64 = prevHash;
  if (signer.policy?.binding) commitInput.policy = signer.policy.binding;

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
// Anthropic wrapper
// ---------------------------------------------------------------------------

/**
 * Wrap an Anthropic client instance to produce Ed25519-signed proofs for
 * every tool_use content block in message responses.
 *
 * The returned client is a Proxy — all non-message methods pass through
 * unchanged. Only `client.messages.create()` is intercepted.
 *
 * @param client  - An Anthropic client instance
 * @param options - Configuration options
 * @returns A wrapped Anthropic client (same type)
 */
export function wrapAnthropic<T extends { messages: { create: (...args: any[]) => any } }>(
  client: T,
  options?: WrapAnthropicOptions,
): T {
  const proofFile = resolve(options?.proofFile ?? "proof.jsonl");
  const statePath = resolve(options?.statePath ?? ".occ/signer-state.json");
  const measurement = options?.measurement ?? "occ-anthropic:stub";
  const agentId = options?.agentId ?? "anthropic-agent";
  const policyPath = options?.policyPath ? resolve(options.policyPath) : undefined;
  const policyBinding = options?.policyBinding;

  // Deep proxy: client.messages.create
  const originalCreate = client.messages.create.bind(client.messages);

  const wrappedCreate = async (...args: any[]): Promise<any> => {
    const response = await originalCreate(...args);

    // Anthropic responses have a `content` array with typed blocks
    const content = response?.content;
    if (!content || !Array.isArray(content)) return response;

    const signer = await getSigner(statePath, measurement, { policyPath, policyBinding });

    for (const block of content) {
      // Only sign tool_use blocks
      if (block.type !== "tool_use") continue;

      const toolName = block.name ?? "unknown";
      const toolArgs = (block.input as Record<string, unknown>) ?? {};
      const toolId = block.id ?? "unknown";

      // ── Policy enforcement: block tools not in the allowlist ──
      if (signer.policy?.allowedTools && !signer.policy.allowedTools.has(toolName)) {
        // Sign a denial proof — same chain, proves the block happened
        const denialDigest = hashPayload({
          tool: toolName,
          args: toolArgs,
          callId: toolId,
          denied: true,
          reason: `Tool "${toolName}" not in policy allowedTools`,
        });

        const denialProof = await signDigest(denialDigest, {
          phase: "pre-execution",
          tool: toolName,
          callId: toolId,
          agentId,
          denied: true,
          reason: `Tool "${toolName}" not in policy allowedTools`,
        }, signer);

        appendProof({
          timestamp: new Date().toISOString(),
          phase: "pre-execution",
          tool: toolName,
          agentId,
          args: toolArgs,
          proofDigestB64: denialDigest,
          receipt: denialProof,
        }, proofFile);

        // Replace the tool_use block with an error so the agent knows
        block.type = "text";
        block.text = `[OCC] Tool "${toolName}" blocked by policy. Not in allowed tools list.`;
        delete block.input;
        delete block.name;
        continue;
      }

      // Pre-execution proof: sign the tool call input
      const preDigest = hashPayload({
        tool: toolName,
        args: toolArgs,
        callId: toolId,
      });

      const preProof = await signDigest(preDigest, {
        phase: "pre-execution",
        tool: toolName,
        callId: toolId,
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

    return response;
  };

  // Build the proxy chain
  const wrappedMessages = new Proxy(client.messages, {
    get(target: any, prop: string | symbol) {
      if (prop === "create") return wrappedCreate;
      return target[prop];
    },
  });

  return new Proxy(client, {
    get(target: any, prop: string | symbol) {
      if (prop === "messages") return wrappedMessages;
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
  options?: WrapAnthropicOptions,
): Promise<OCCProof> {
  const proofFile = resolve(options?.proofFile ?? "proof.jsonl");
  const statePath = resolve(options?.statePath ?? ".occ/signer-state.json");
  const measurement = options?.measurement ?? "occ-anthropic:stub";
  const agentId = options?.agentId ?? "anthropic-agent";
  const policyPath = options?.policyPath ? resolve(options.policyPath) : undefined;
  const policyBinding = options?.policyBinding;

  const signer = await getSigner(statePath, measurement, { policyPath, policyBinding });

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
