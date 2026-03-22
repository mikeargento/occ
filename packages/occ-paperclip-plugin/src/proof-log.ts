// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * Per-agent proof log (JSONL format).
 *
 * Each agent gets its own proof.jsonl file at:
 *   ~/.paperclip/.occ/plugin/<agentId>/proof.jsonl
 *
 * The log is append-only and chain-linked via the OCC proofs.
 */

import { appendFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { OCCProof } from "occproof";

const OCC_DIR = join(homedir(), ".paperclip", ".occ", "plugin");

export interface ProofLogEntry {
  timestamp: string;
  agentId: string;
  tool: string;
  args: Record<string, unknown>;
  decision: "allowed" | "denied";
  reason?: string;
  constraint?: string;
  proof?: OCCProof;
}

/**
 * Append a proof entry to the agent's proof.jsonl file.
 */
export function appendProofEntry(agentId: string, entry: ProofLogEntry): void {
  try {
    const agentDir = join(OCC_DIR, agentId);
    mkdirSync(agentDir, { recursive: true });
    const logPath = join(agentDir, "proof.jsonl");
    appendFileSync(logPath, JSON.stringify(entry) + "\n");
  } catch (err) {
    console.warn("[occ-plugin] Failed to write proof log:", err);
  }
}

/**
 * Read all proof entries for an agent.
 * Returns them in chronological order.
 */
export function readProofLog(agentId: string): ProofLogEntry[] {
  try {
    const logPath = join(OCC_DIR, agentId, "proof.jsonl");
    const content = readFileSync(logPath, "utf8");
    return content
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as ProofLogEntry);
  } catch {
    return [];
  }
}

/**
 * Get the path to an agent's proof log file.
 */
export function getProofLogPath(agentId: string): string {
  return join(OCC_DIR, agentId, "proof.jsonl");
}
