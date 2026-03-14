// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * @occ/agent — Verifiable execution receipts for AI tool calls
 *
 * Wraps tool executions with OCC cryptographic proofs,
 * producing portable receipts that prove a canonical execution
 * record entered the OCC causal sequence.
 */

// Types
export type {
  ExecutionEnvelope,
  VerifiedToolResult,
  ToolDefinition,
  OccAgentConfig,
  ReceiptVerification,
} from "./types.js";

// Envelope
export { createExecutionEnvelope, hashExecutionEnvelope } from "./envelope.js";

// Normalization
export { hashValue, normalizeToolInput, normalizeToolOutput } from "./normalize.js";

// Wrapping
export { wrapTool, runVerifiedTool } from "./wrap.js";

// Commit
export { commitExecutionEnvelope } from "./commit.js";

// Verification
export { verifyExecutionReceipt, verifyExecutionReceiptRemote } from "./verify.js";

// Receipt export/import
export { exportReceipt, loadReceipt } from "./receipt.js";
export type { ExecutionReceipt } from "./receipt.js";

// Built-in tools
export { fetchUrlTool } from "./tools/fetch-url.js";
export type { FetchUrlInput, FetchUrlOutput } from "./tools/fetch-url.js";
