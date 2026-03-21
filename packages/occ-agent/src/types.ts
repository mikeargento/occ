// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import type { OCCProof, PolicyBinding } from "occproof";

/**
 * Canonical execution envelope — the structure committed through OCC.
 *
 * Contains only hashes of input/output, never raw values.
 * The SHA-256 of this envelope (canonicalized) becomes the OCC artifact digest.
 */
export interface ExecutionEnvelope {
  type: "tool-execution";
  tool: string;
  toolVersion: string;
  runtime: string;
  adapter: "occ-agent";
  inputHashB64: string;
  outputHashB64: string;
  timestamp: number;
}

/**
 * Complete result from a verified tool execution.
 */
export interface VerifiedToolResult<T = unknown> {
  output: T;
  executionEnvelope: ExecutionEnvelope;
  occProof: OCCProof;
}

/**
 * Tool definition — describes a tool that can be wrapped with OCC verification.
 */
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  version: string;
  execute: (input: TInput) => Promise<TOutput>;
  normalizeInput: (input: TInput) => unknown;
  normalizeOutput: (output: TOutput) => unknown;
}

/**
 * Configuration for the OCC agent client.
 */
export interface OccAgentConfig {
  /** OCC commit service URL (e.g. "https://api.occ.example/commit") */
  apiUrl: string;
  /** Optional API key for authenticated access */
  apiKey?: string | undefined;
  /** Runtime identifier (default: "agent-skills") */
  runtime?: string | undefined;
  /** Optional policy binding — sealed into every proof */
  policy?: PolicyBinding | undefined;
}

/**
 * Receipt verification result.
 */
export interface ReceiptVerification {
  valid: boolean;
  checks: {
    envelopeHashMatch: boolean;
    proofStructure: boolean;
    signatureValid?: boolean | undefined;
  };
  reason?: string | undefined;
}
