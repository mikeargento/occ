#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * occ-verify-action — Verify OCC proof chains.
 *
 * Reads a proof.jsonl file, verifies Ed25519 signatures on each entry,
 * checks chain integrity (prevB64 linkage), and reports results.
 *
 * Exit codes:
 *   0 — all proofs valid, chain intact
 *   1 — verification failure (broken chain, invalid signature, or missing file)
 *
 * Can be used standalone or as a GitHub Action (see action.yml).
 */

import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { verify, canonicalize, type OCCProof, type VerifyResult } from "occproof";
import { sha256 } from "@noble/hashes/sha256";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProofLogEntry {
  timestamp?: string;
  phase?: string;
  tool?: string;
  agentId?: string;
  args?: Record<string, unknown>;
  output?: unknown;
  denied?: boolean;
  reason?: string;
  proofDigestB64?: string;
  receipt?: OCCProof;
}

interface VerificationReport {
  totalEntries: number;
  proofEntries: number;
  validSignatures: number;
  invalidSignatures: number;
  chainLinks: number;
  brokenLinks: number;
  deniedActions: number;
  allowedActions: number;
  errors: string[];
  passed: boolean;
}

// ---------------------------------------------------------------------------
// Core verification
// ---------------------------------------------------------------------------

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/**
 * Compute the chain hash of a proof (SHA-256 of its canonical form).
 */
function proofHash(proof: OCCProof): string {
  return toBase64(sha256(canonicalize(proof)));
}

/**
 * Verify a single OCC proof's Ed25519 signature.
 */
async function verifyProofSignature(proof: OCCProof): Promise<VerifyResult> {
  return verify({ proof });
}

/**
 * Verify an entire proof.jsonl file.
 *
 * Checks:
 *   1. Each entry with a receipt has a valid Ed25519 signature
 *   2. Chain integrity: each proof's commit.prevB64 matches the hash of the previous proof
 *   3. Counter monotonicity (if counters are present)
 */
export async function verifyProofLog(filePath: string): Promise<VerificationReport> {
  const report: VerificationReport = {
    totalEntries: 0,
    proofEntries: 0,
    validSignatures: 0,
    invalidSignatures: 0,
    chainLinks: 0,
    brokenLinks: 0,
    deniedActions: 0,
    allowedActions: 0,
    errors: [],
    passed: true,
  };

  if (!existsSync(filePath)) {
    report.errors.push(`File not found: ${filePath}`);
    report.passed = false;
    return report;
  }

  const content = readFileSync(filePath, "utf-8").trim();
  if (!content) {
    report.errors.push("Proof file is empty");
    report.passed = false;
    return report;
  }

  const lines = content.split("\n");
  let lastProofHash: string | undefined;
  let lastCounter: bigint | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    report.totalEntries++;

    let entry: ProofLogEntry;
    try {
      entry = JSON.parse(line) as ProofLogEntry;
    } catch (e) {
      report.errors.push(`Line ${i + 1}: Invalid JSON`);
      report.passed = false;
      continue;
    }

    // Track denied/allowed
    if (entry.denied === true) {
      report.deniedActions++;
    } else {
      report.allowedActions++;
    }

    // If there's no receipt (proof), skip signature verification
    const proof = entry.receipt;
    if (!proof || !proof.version) continue;

    report.proofEntries++;

    // Verify Ed25519 signature
    try {
      const result = await verifyProofSignature(proof);
      if (result.valid) {
        report.validSignatures++;
      } else {
        report.invalidSignatures++;
        report.errors.push(`Line ${i + 1}: Invalid signature — ${result.reason}`);
        report.passed = false;
      }
    } catch (e) {
      report.invalidSignatures++;
      report.errors.push(`Line ${i + 1}: Signature verification error — ${e instanceof Error ? e.message : String(e)}`);
      report.passed = false;
    }

    // Chain integrity: check prevB64 linkage
    if (proof.commit?.prevB64) {
      report.chainLinks++;
      if (lastProofHash && proof.commit.prevB64 !== lastProofHash) {
        report.brokenLinks++;
        report.errors.push(
          `Line ${i + 1}: Chain broken — prevB64 does not match previous proof hash. ` +
          `Expected: ${lastProofHash}, Got: ${proof.commit.prevB64}`
        );
        report.passed = false;
      }
    } else if (lastProofHash && report.proofEntries > 1) {
      // If there was a previous proof but this one has no prevB64, that's a gap
      report.brokenLinks++;
      report.errors.push(`Line ${i + 1}: Chain gap — proof has no prevB64 but previous proof exists`);
      report.passed = false;
    }

    // Counter monotonicity
    if (proof.commit?.counter) {
      const currentCounter = BigInt(proof.commit.counter);
      if (lastCounter !== undefined && currentCounter <= lastCounter) {
        report.errors.push(
          `Line ${i + 1}: Counter not monotonically increasing. ` +
          `Previous: ${lastCounter}, Current: ${currentCounter}`
        );
        report.passed = false;
      }
      lastCounter = currentCounter;
    }

    // Update chain state
    try {
      lastProofHash = proofHash(proof);
    } catch (e) {
      report.errors.push(`Line ${i + 1}: Failed to compute proof hash — ${e instanceof Error ? e.message : String(e)}`);
      report.passed = false;
    }
  }

  return report;
}

// ---------------------------------------------------------------------------
// GitHub Actions integration
// ---------------------------------------------------------------------------

function setOutput(name: string, value: string): void {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    appendFileSync(outputFile, `${name}=${value}\n`);
  }
}

function writeSummary(content: string): void {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) {
    appendFileSync(summaryFile, content);
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const proofFile = process.env.INPUT_PROOF_FILE
    ?? process.env.OCC_PROOF_FILE
    ?? process.argv[2]
    ?? "proof.jsonl";
  const failOnDenied = (process.env.INPUT_FAIL_ON_DENIED ?? "true") === "true";

  const resolvedPath = resolve(proofFile);
  console.log(`[OCC] Verifying proof chain: ${resolvedPath}`);

  const report = await verifyProofLog(resolvedPath);

  // Print report
  console.log("");
  console.log("=== OCC Proof Verification Report ===");
  console.log(`Total entries:      ${report.totalEntries}`);
  console.log(`Proof entries:      ${report.proofEntries}`);
  console.log(`Valid signatures:   ${report.validSignatures}`);
  console.log(`Invalid signatures: ${report.invalidSignatures}`);
  console.log(`Chain links:        ${report.chainLinks}`);
  console.log(`Broken links:       ${report.brokenLinks}`);
  console.log(`Allowed actions:    ${report.allowedActions}`);
  console.log(`Denied actions:     ${report.deniedActions}`);
  console.log("");

  if (report.errors.length > 0) {
    console.log("Errors:");
    for (const err of report.errors) {
      console.log(`  - ${err}`);
    }
    console.log("");
  }

  console.log(`Result: ${report.passed ? "PASSED" : "FAILED"}`);

  // GitHub Actions outputs
  setOutput("total-proofs", String(report.totalEntries));
  setOutput("allowed-count", String(report.allowedActions));
  setOutput("denied-count", String(report.deniedActions));
  setOutput("chain-intact", String(report.brokenLinks === 0));
  setOutput("verification-passed", String(report.passed));

  // GitHub Actions summary
  const isGitHub = !!process.env.GITHUB_STEP_SUMMARY;
  if (isGitHub) {
    let summary = "## OCC Proof Verification\n\n";
    summary += "| Metric | Value |\n";
    summary += "|--------|-------|\n";
    summary += `| Total entries | ${report.totalEntries} |\n`;
    summary += `| Valid signatures | ${report.validSignatures} |\n`;
    summary += `| Invalid signatures | ${report.invalidSignatures} |\n`;
    summary += `| Chain links | ${report.chainLinks} |\n`;
    summary += `| Broken links | ${report.brokenLinks} |\n`;
    summary += `| Allowed | ${report.allowedActions} |\n`;
    summary += `| Denied | ${report.deniedActions} |\n\n`;

    if (report.passed) {
      summary += "**Result: PASSED**\n\n";
    } else {
      summary += "**Result: FAILED**\n\n";
      if (report.errors.length > 0) {
        summary += "### Errors\n\n";
        for (const err of report.errors) {
          summary += `- ${err}\n`;
        }
        summary += "\n";
      }
    }

    summary += "*Verified by [OCC](https://proofstudio.xyz)*\n";
    writeSummary(summary);
  }

  // Exit code
  if (!report.passed) {
    process.exit(1);
  }

  if (failOnDenied && report.deniedActions > 0) {
    console.log(`[OCC] ${report.deniedActions} denied actions found — failing as requested`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[OCC] Verification failed:", err);
  process.exit(1);
});
