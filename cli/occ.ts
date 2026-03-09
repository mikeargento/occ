#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * OCC CLI — hash files locally, get TEE-signed proofs
 *
 * Usage:
 *   occ [files...] -o <dir> [-k <key>] [-e <url>]
 *
 * Options:
 *   -o, --output <dir>     Output directory for .proof.zip files (required)
 *   -k, --key <key>        API key for the commit service
 *   -e, --endpoint <url>   Commit service URL (default: https://nitro.occproof.com)
 *   -c, --concurrency <n>  Max concurrent files (default: 4)
 *   -h, --help             Show help
 *
 * Each input file produces a .proof.zip containing:
 *   - The original file
 *   - proof.json (the OCC proof)
 *   - VERIFY.txt (verification instructions)
 *
 * The file never leaves your machine — only the SHA-256 digest is sent.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { zipSync } from "fflate";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OCCProof {
  version: string;
  artifact: { hashAlg: string; digestB64: string };
  commit: Record<string, unknown>;
  signer: { publicKeyB64: string; signatureB64: string };
  environment: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

interface CommitResponse {
  error?: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_ENDPOINT = "https://nitro.occproof.com";
const COMMIT_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

interface Args {
  files: string[];
  output: string;
  apiKey: string | undefined;
  endpoint: string;
  concurrency: number;
}

function parseArgs(argv: string[]): Args {
  const args = argv.slice(2); // skip node + script
  const files: string[] = [];
  let output = "";
  let apiKey: string | undefined;
  let endpoint = DEFAULT_ENDPOINT;
  let concurrency = 4;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;

    if (arg === "-h" || arg === "--help") {
      printHelp();
      process.exit(0);
    }

    if (arg === "-o" || arg === "--output") {
      output = args[++i] ?? "";
      continue;
    }

    if (arg === "-k" || arg === "--key") {
      apiKey = args[++i] ?? "";
      continue;
    }

    if (arg === "-e" || arg === "--endpoint") {
      endpoint = args[++i] ?? DEFAULT_ENDPOINT;
      continue;
    }

    if (arg === "-c" || arg === "--concurrency") {
      concurrency = parseInt(args[++i] ?? "4", 10) || 4;
      continue;
    }

    // Treat as file path
    files.push(arg);
  }

  // Also check env vars
  if (!apiKey) {
    apiKey = process.env["OCC_API_KEY"];
  }
  if (endpoint === DEFAULT_ENDPOINT && process.env["OCC_ENDPOINT"]) {
    endpoint = process.env["OCC_ENDPOINT"];
  }

  if (files.length === 0) {
    console.error("Error: no input files specified\n");
    printHelp();
    process.exit(1);
  }

  if (!output) {
    console.error("Error: output directory required (-o <dir>)\n");
    printHelp();
    process.exit(1);
  }

  return { files, output: resolve(output), apiKey, endpoint, concurrency };
}

function printHelp(): void {
  console.log(`
  OCC — Origin Controlled Computing

  Hash files locally, get TEE-signed cryptographic proofs.
  The file never leaves your machine — only the SHA-256 digest is sent.

  Usage:
    occ [files...] -o <dir> [options]

  Options:
    -o, --output <dir>       Output directory for .proof.zip files (required)
    -k, --key <key>          API key (or set OCC_API_KEY env var)
    -e, --endpoint <url>     Commit service URL (default: ${DEFAULT_ENDPOINT})
                             (or set OCC_ENDPOINT env var)
    -c, --concurrency <n>    Max concurrent files (default: 4)
    -h, --help               Show this help

  Output:
    Each file produces <filename>.proof.zip containing:
      - The original file
      - proof.json   (OCC proof with TEE signature)
      - VERIFY.txt   (verification instructions)

  Examples:
    occ photo.jpg -o ./proofs -k my-api-key
    occ *.png -o ./proofs -k my-api-key
    OCC_API_KEY=my-key occ document.pdf -o ./out
  `.trim());
}

// ---------------------------------------------------------------------------
// SHA-256 hashing (node:crypto, nothing leaves the machine)
// ---------------------------------------------------------------------------

function hashFile(filePath: string): string {
  const data = readFileSync(filePath);
  const hash = createHash("sha256").update(data).digest();
  return hash.toString("base64");
}

// ---------------------------------------------------------------------------
// Commit service client
// ---------------------------------------------------------------------------

async function commitDigest(
  digestB64: string,
  metadata: Record<string, unknown>,
  endpoint: string,
  apiKey: string | undefined
): Promise<OCCProof> {
  const url = `${endpoint}/commit`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const body = JSON.stringify({
    digests: [{ digestB64, hashAlg: "sha256" }],
    metadata,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COMMIT_TIMEOUT_MS);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Commit service error (${resp.status}): ${text}`);
    }

    const proofs = (await resp.json()) as OCCProof[];
    if (!proofs[0]) throw new Error("No proof returned from commit service");
    return proofs[0];
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Commit service timed out");
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// ZIP creation
// ---------------------------------------------------------------------------

function createProofZip(
  originalFileName: string,
  originalData: Uint8Array,
  proof: OCCProof
): Uint8Array {
  const proofJson = JSON.stringify(proof, null, 2);

  const verifyTxt = `VERIFICATION INSTRUCTIONS
========================

This .proof.zip was created by OCCproof (https://occproof.com).

It contains:
  - ${originalFileName}  (the original file)
  - proof.json           (the cryptographic proof)
  - VERIFY.txt           (this file)

The proof guarantees that "${originalFileName}" existed at the time
the proof was created. The file was hashed locally — it was never
uploaded to any server. Only the SHA-256 digest was sent to a
Trusted Execution Environment (TEE) for signing.

To verify this proof:
  1. Visit https://occproof.com/verify
  2. Drop this .proof.zip file onto the page
  3. The verifier checks the SHA-256 hash and Ed25519 signature

Proof details:
  Version:     ${proof.version}
  Digest:      ${proof.artifact.digestB64}
  Algorithm:   ${proof.artifact.hashAlg}
  Public Key:  ${proof.signer.publicKeyB64}

Learn more: https://occproof.com
`;

  const zipped = zipSync({
    [originalFileName]: originalData,
    "proof.json": new TextEncoder().encode(proofJson),
    "VERIFY.txt": new TextEncoder().encode(verifyTxt),
  });

  return zipped;
}

// ---------------------------------------------------------------------------
// File size formatting
// ---------------------------------------------------------------------------

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ---------------------------------------------------------------------------
// Process a single file
// ---------------------------------------------------------------------------

async function processFile(
  filePath: string,
  outputDir: string,
  endpoint: string,
  apiKey: string | undefined
): Promise<{ ok: boolean; file: string; error?: string }> {
  const fileName = basename(filePath);
  const resolvedPath = resolve(filePath);

  try {
    // Validate file exists
    if (!existsSync(resolvedPath)) {
      return { ok: false, file: fileName, error: "File not found" };
    }

    const stat = statSync(resolvedPath);
    if (!stat.isFile()) {
      return { ok: false, file: fileName, error: "Not a file" };
    }

    // Step 1: Hash locally
    process.stdout.write(`  ${fileName} (${formatSize(stat.size)}) — hashing...`);
    const digestB64 = hashFile(resolvedPath);

    // Step 2: Send digest to TEE
    process.stdout.write(" signing...");
    const proof = await commitDigest(
      digestB64,
      { filename: fileName },
      endpoint,
      apiKey
    );

    // Step 3: Create .proof.zip
    process.stdout.write(" zipping...");
    const originalData = readFileSync(resolvedPath);
    const zipData = createProofZip(fileName, originalData, proof);

    // Step 4: Write to output directory
    const zipFileName = `${fileName}.proof.zip`;
    const zipPath = join(outputDir, zipFileName);
    writeFileSync(zipPath, zipData);

    console.log(` ✓ ${zipFileName} (${formatSize(zipData.length)})`);
    return { ok: true, file: fileName };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(` ✗ ${msg}`);
    return { ok: false, file: fileName, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  console.log(`\n  OCC — Origin Controlled Computing\n`);
  console.log(`  Endpoint:    ${args.endpoint}`);
  console.log(`  API Key:     ${args.apiKey ? "***" + args.apiKey.slice(-4) : "(none — dev mode)"}`);
  console.log(`  Output:      ${args.output}`);
  console.log(`  Files:       ${args.files.length}`);
  console.log(`  Concurrency: ${args.concurrency}`);
  console.log();

  // Ensure output directory exists
  mkdirSync(args.output, { recursive: true });

  // Process files with concurrency limit
  const results: Array<{ ok: boolean; file: string; error?: string }> = [];
  let nextIdx = 0;

  async function worker(): Promise<void> {
    while (nextIdx < args.files.length) {
      const idx = nextIdx++;
      const file = args.files[idx]!;
      const result = await processFile(file, args.output, args.endpoint, args.apiKey);
      results.push(result);
    }
  }

  const workers = Array.from(
    { length: Math.min(args.concurrency, args.files.length) },
    () => worker()
  );
  await Promise.all(workers);

  // Summary
  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  console.log();
  console.log(`  Done: ${succeeded} succeeded, ${failed} failed`);

  if (failed > 0) {
    console.log();
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`  ✗ ${r.file}: ${r.error}`);
    }
    process.exit(1);
  }

  console.log();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
