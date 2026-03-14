// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import type { ToolDefinition, VerifiedToolResult, OccAgentConfig } from "./types.js";
import { hashValue, normalizeToolInput, normalizeToolOutput } from "./normalize.js";
import { createExecutionEnvelope } from "./envelope.js";
import { commitExecutionEnvelope } from "./commit.js";

/**
 * Wrap a tool definition to produce verified execution receipts.
 *
 * Returns a function that, when called with tool input:
 * 1. Normalizes and hashes the input
 * 2. Executes the tool
 * 3. Normalizes and hashes the output
 * 4. Builds a canonical execution envelope
 * 5. Commits the envelope hash through OCC
 * 6. Returns output + envelope + proof
 */
export function wrapTool<TInput, TOutput>(
  tool: ToolDefinition<TInput, TOutput>,
  config: OccAgentConfig,
): (input: TInput) => Promise<VerifiedToolResult<TOutput>> {
  const runtime = config.runtime ?? "agent-skills";

  return async (input: TInput): Promise<VerifiedToolResult<TOutput>> => {
    // 1. Normalize and hash input
    const normalizedInput = tool.normalizeInput
      ? tool.normalizeInput(input)
      : normalizeToolInput(input);
    const inputHashB64 = hashValue(normalizedInput);

    // 2. Execute the tool
    const output = await tool.execute(input);

    // 3. Normalize and hash output
    const normalizedOutput = tool.normalizeOutput
      ? tool.normalizeOutput(output)
      : normalizeToolOutput(output);
    const outputHashB64 = hashValue(normalizedOutput);

    // 4. Build canonical execution envelope
    const envelope = createExecutionEnvelope({
      tool: tool.name,
      toolVersion: tool.version,
      runtime,
      inputHashB64,
      outputHashB64,
    });

    // 5. Commit envelope through OCC
    const { proof } = await commitExecutionEnvelope(envelope, config);

    // 6. Return complete verified result
    return {
      output,
      executionEnvelope: envelope,
      occProof: proof,
    };
  };
}

/**
 * Run a tool with OCC verification in a single call.
 *
 * Convenience function that wraps and immediately executes.
 */
export async function runVerifiedTool<TInput, TOutput>(
  tool: ToolDefinition<TInput, TOutput>,
  input: TInput,
  config: OccAgentConfig,
): Promise<VerifiedToolResult<TOutput>> {
  const wrappedTool = wrapTool(tool, config);
  return wrappedTool(input);
}
