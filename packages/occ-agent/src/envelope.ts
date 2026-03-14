// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import { sha256 } from "@noble/hashes/sha256";
import { canonicalize } from "occproof";
import type { ExecutionEnvelope } from "./types.js";

/**
 * Build a canonical execution envelope from tool execution data.
 */
export function createExecutionEnvelope(opts: {
  tool: string;
  toolVersion: string;
  runtime: string;
  inputHashB64: string;
  outputHashB64: string;
}): ExecutionEnvelope {
  return {
    type: "tool-execution",
    tool: opts.tool,
    toolVersion: opts.toolVersion,
    runtime: opts.runtime,
    adapter: "occ-agent",
    inputHashB64: opts.inputHashB64,
    outputHashB64: opts.outputHashB64,
    timestamp: Date.now(),
  };
}

/**
 * Hash an execution envelope using the OCC canonical serialization.
 *
 * Returns the base64-encoded SHA-256 digest, suitable for passing
 * to the OCC /commit endpoint as `digestB64`.
 */
export function hashExecutionEnvelope(envelope: ExecutionEnvelope): string {
  const bytes = canonicalize(envelope);
  const digest = sha256(bytes);
  return Buffer.from(digest).toString("base64");
}
