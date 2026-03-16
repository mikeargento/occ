// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import { appendFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Append-only proof log writer.
 * Writes one JSON line per tool call to a local .jsonl file.
 */
export class ProofWriter {
  readonly path: string;

  constructor(outputPath?: string) {
    this.path = resolve(outputPath ?? "proof.jsonl");
    if (!existsSync(this.path)) {
      writeFileSync(this.path, "");
    }
  }

  append(entry: {
    timestamp: string;
    tool: string;
    args: Record<string, unknown>;
    output: unknown;
    receipt?: unknown | undefined;
    proofDigestB64?: string | undefined;
  }): void {
    appendFileSync(this.path, JSON.stringify(entry) + "\n");
  }
}
