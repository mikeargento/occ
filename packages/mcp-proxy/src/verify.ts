// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * occ-verify — Verify a proof.jsonl file and output an audit report.
 *
 * Checks:
 *   1. Chain integrity (monotonic counters, prevB64 linkage)
 *   2. Ed25519 signature validity (via occproof verifier)
 *   3. Action categorization (allowed vs denied, grouped by tool)
 *   4. Optional policy consistency check
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { verify as occVerify, canonicalize } from "occproof";
import { sha256 } from "@noble/hashes/sha256";
import type { OCCProof } from "occproof";

// ── ANSI escape codes ──
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const WHITE = "\x1b[37m";
const BG_RED = "\x1b[41m";

// ── Box-drawing characters ──
const TL = "\u2554"; // ╔
const TR = "\u2557"; // ╗
const BL = "\u255A"; // ╚
const BR = "\u255D"; // ╝
const H = "\u2550";  // ═
const V = "\u2551";  // ║
const ML = "\u2560"; // ╠
const MR = "\u2563"; // ╣

const BOX_WIDTH = 52;
const INNER = BOX_WIDTH - 2; // content width inside ║...║

function pad(text: string, width: number): string {
  // Strip ANSI codes when calculating visible length
  const visible = text.replace(/\x1b\[[0-9;]*m/g, "");
  const padding = Math.max(0, width - visible.length);
  return text + " ".repeat(padding);
}

function boxLine(text: string): string {
  return `${CYAN}${V}${RESET} ${pad(text, INNER - 1)}${CYAN}${V}${RESET}`;
}

function boxTop(): string {
  return `${CYAN}${TL}${H.repeat(INNER)}${TR}${RESET}`;
}

function boxBottom(): string {
  return `${CYAN}${BL}${H.repeat(INNER)}${BR}${RESET}`;
}

function boxSep(): string {
  return `${CYAN}${ML}${H.repeat(INNER)}${MR}${RESET}`;
}

function boxEmpty(): string {
  return boxLine("");
}

// ── Proof entry shape (from proof-writer / interceptor) ──

interface ProofEntry {
  timestamp: string;
  tool: string;
  args: Record<string, unknown>;
  output?: unknown;
  denied?: boolean;
  reason?: string;
  receipt?: {
    executionEnvelope: unknown;
    occProof: OCCProof;
  };
  proofDigestB64?: string;
}

// ── Chain verification result ──

interface ChainResult {
  intact: boolean;
  gaps: string[];
}

// ── Signature verification result ──

interface SigResult {
  allValid: boolean;
  failures: string[];
  signerKey: string | undefined;
  checked: number;
  skipped: number;
}

// ── Main ──

export async function verifyProofChain(proofPath: string, policyPath?: string): Promise<void> {
  // 1. Read and parse
  const raw = readFileSync(proofPath, "utf-8").trim();
  if (!raw) {
    console.error(`${RED}Error:${RESET} File is empty: ${proofPath}`);
    process.exit(1);
  }

  const lines = raw.split("\n");
  const entries: ProofEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    try {
      entries.push(JSON.parse(lines[i]!) as ProofEntry);
    } catch {
      console.error(`${RED}Error:${RESET} Invalid JSON on line ${i + 1}`);
      process.exit(1);
    }
  }

  // 2. Verify chain integrity
  const chain = verifyChain(entries);

  // 3. Verify signatures
  const sigs = await verifySignatures(entries);

  // 4. Categorize actions
  const allowed = new Map<string, number>();
  const denied = new Map<string, number>();
  let allowedTotal = 0;
  let deniedTotal = 0;

  for (const entry of entries) {
    if (entry.denied) {
      deniedTotal++;
      denied.set(entry.tool, (denied.get(entry.tool) ?? 0) + 1);
    } else {
      allowedTotal++;
      allowed.set(entry.tool, (allowed.get(entry.tool) ?? 0) + 1);
    }
  }

  // 5. Policy consistency check
  let policyResult: PolicyCheckResult | undefined;
  if (policyPath) {
    policyResult = checkPolicy(entries, policyPath);
  }

  // 5b. Latest-policy staleness check (always runs if proofs have policy bindings)
  const stalePolicyCount = checkStalePolicies(entries);
  if (stalePolicyCount > 0 && !policyResult) {
    policyResult = {
      consistent: false,
      issues: [`${stalePolicyCount} action(s) reference a superseded policy binding`],
    };
  }

  // 6. Output report
  printReport({
    fileName: basename(proofPath),
    totalProofs: entries.length,
    chain,
    sigs,
    allowed,
    denied,
    allowedTotal,
    deniedTotal,
    policyResult,
  });
}

// ── Chain integrity ──

function verifyChain(entries: ProofEntry[]): ChainResult {
  const gaps: string[] = [];

  // Extract proofs with counters
  const proofsWithCounters: Array<{ index: number; counter: bigint; prevB64: string | undefined; proof: OCCProof }> = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    if (entry.receipt?.occProof) {
      const proof = entry.receipt.occProof;
      const counter = proof.commit.counter !== undefined ? BigInt(proof.commit.counter) : undefined;
      proofsWithCounters.push({
        index: i,
        counter: counter ?? BigInt(-1),
        prevB64: proof.commit.prevB64,
        proof,
      });
    }
  }

  if (proofsWithCounters.length < 2) {
    return { intact: true, gaps };
  }

  // Check monotonic counters
  for (let i = 1; i < proofsWithCounters.length; i++) {
    const prev = proofsWithCounters[i - 1]!;
    const curr = proofsWithCounters[i]!;

    if (curr.counter !== BigInt(-1) && prev.counter !== BigInt(-1)) {
      if (curr.counter <= prev.counter) {
        gaps.push(`Counter not increasing: entry ${prev.index} (${prev.counter}) -> entry ${curr.index} (${curr.counter})`);
      } else if (curr.counter !== prev.counter + BigInt(1)) {
        gaps.push(`Counter gap: entry ${prev.index} (${prev.counter}) -> entry ${curr.index} (${curr.counter})`);
      }
    }

    // Check prevB64 linkage
    if (curr.prevB64 !== undefined) {
      const prevProofHash = Buffer.from(sha256(canonicalize(prev.proof))).toString("base64");
      if (curr.prevB64 !== prevProofHash) {
        gaps.push(`Chain break: entry ${curr.index} prevB64 does not match hash of entry ${prev.index}`);
      }
    }
  }

  return { intact: gaps.length === 0, gaps };
}

// ── Signature verification ──

async function verifySignatures(entries: ProofEntry[]): Promise<SigResult> {
  const failures: string[] = [];
  let signerKey: string | undefined;
  let checked = 0;
  let skipped = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    if (!entry.receipt?.occProof) {
      skipped++;
      continue;
    }

    checked++;
    const proof = entry.receipt.occProof;

    if (!signerKey) {
      signerKey = proof.signer.publicKeyB64;
    }

    // Reconstruct artifact bytes from the execution envelope
    const envelope = entry.receipt.executionEnvelope;
    if (!envelope) {
      failures.push(`Entry ${i}: no executionEnvelope to verify against`);
      continue;
    }

    const envelopeBytes = new TextEncoder().encode(JSON.stringify(envelope));
    const digestBytes = sha256(envelopeBytes);
    const digestB64 = Buffer.from(digestBytes).toString("base64");

    // The proof's artifact.digestB64 should match the hash of the envelope
    if (proof.artifact.digestB64 !== digestB64) {
      // The digest was computed from the envelope via occ-agent's hashExecutionEnvelope
      // which uses canonicalize. Try canonical form.
      const { canonicalize: occCanonicalize } = await import("occproof");
      const canonicalBytes = occCanonicalize(envelope);
      const canonicalDigest = Buffer.from(sha256(canonicalBytes)).toString("base64");

      if (proof.artifact.digestB64 !== canonicalDigest) {
        failures.push(`Entry ${i}: artifact digest mismatch`);
        continue;
      }
    }

    // Verify the Ed25519 signature using the core verifier
    // We need the original bytes that were committed (the canonical envelope)
    const { canonicalize: occCanonicalize } = await import("occproof");
    const artifactBytes = occCanonicalize(envelope);

    const result = await occVerify({
      proof,
      bytes: artifactBytes,
    });

    if (!result.valid) {
      failures.push(`Entry ${i}: ${result.reason ?? "signature invalid"}`);
    }
  }

  return {
    allValid: failures.length === 0,
    failures,
    signerKey,
    checked,
    skipped,
  };
}

// ── Policy check ──

interface PolicyCheckResult {
  consistent: boolean;
  issues: string[];
}

interface AgentPolicy {
  allowedTools?: string[];
  [key: string]: unknown;
}

function checkPolicy(entries: ProofEntry[], policyPath: string): PolicyCheckResult {
  const issues: string[] = [];

  let policy: AgentPolicy;
  try {
    policy = JSON.parse(readFileSync(policyPath, "utf-8")) as AgentPolicy;
  } catch (err) {
    return {
      consistent: false,
      issues: [`Failed to read policy: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  const allowedTools = new Set(policy.allowedTools ?? []);

  // ── Latest-policy check ──
  // Track the most recent policy commitment proof. Any action proof
  // that references a stale (superseded) policy binding is flagged.
  let latestPolicyDigest: string | undefined;
  let latestPolicyAuthorDigest: string | undefined;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const proof = entry.receipt?.occProof;

    // If this entry is a policy commitment, update the latest policy reference
    if (entry.tool === "__policy_commitment" || (proof as any)?.policy?.name) {
      const policyField = (proof as any)?.policy;
      if (policyField?.digestB64) {
        latestPolicyDigest = policyField.digestB64;
        latestPolicyAuthorDigest = policyField.authorProofDigestB64;
      }
    }

    // Check action entries against latest policy
    if (entry.tool !== "__policy_commitment" && !entry.denied && proof) {
      const proofPolicy = (proof as any)?.policy;

      // If we have a latest policy and this action has a policy binding,
      // verify it references the current policy, not a stale one
      if (latestPolicyDigest && proofPolicy?.digestB64) {
        if (proofPolicy.digestB64 !== latestPolicyDigest) {
          issues.push(`Entry ${i}: action references stale policy (${proofPolicy.digestB64.slice(0, 12)}...) — latest is (${latestPolicyDigest.slice(0, 12)}...)`);
        }
      }

      // If we have a latest author proof digest, check that too
      if (latestPolicyAuthorDigest && proofPolicy?.authorProofDigestB64) {
        if (proofPolicy.authorProofDigestB64 !== latestPolicyAuthorDigest) {
          issues.push(`Entry ${i}: action references superseded policy authority (${proofPolicy.authorProofDigestB64.slice(0, 12)}...) — current is (${latestPolicyAuthorDigest.slice(0, 12)}...)`);
        }
      }
    }

    // Original allowed/blocked tool check
    const toolAllowed = allowedTools.size === 0 ? false : allowedTools.has(entry.tool);

    if (!entry.denied && !toolAllowed && allowedTools.size > 0 && entry.tool !== "__policy_commitment") {
      issues.push(`Entry ${i}: "${entry.tool}" was ALLOWED but not in policy allowedTools`);
    }
    if (entry.denied && toolAllowed) {
      issues.push(`Entry ${i}: "${entry.tool}" was DENIED but IS in policy allowedTools`);
    }
  }

  return { consistent: issues.length === 0, issues };
}

// ── Report printer ──

interface ReportData {
  fileName: string;
  totalProofs: number;
  chain: ChainResult;
  sigs: SigResult;
  allowed: Map<string, number>;
  denied: Map<string, number>;
  allowedTotal: number;
  deniedTotal: number;
  policyResult?: PolicyCheckResult | undefined;
}

function printReport(data: ReportData): void {
  const out = console.log;
  const {
    fileName, totalProofs, chain, sigs,
    allowed, denied, allowedTotal, deniedTotal,
    policyResult,
  } = data;

  out("");
  out(boxTop());
  out(boxLine(`${BOLD}       OCC Proof Verification${RESET}`));
  out(boxSep());
  out(boxLine(`File: ${BOLD}${fileName}${RESET}`));
  out(boxLine(`Proofs: ${BOLD}${totalProofs}${RESET}`));

  // Chain status
  if (chain.intact) {
    out(boxLine(`Chain: ${GREEN}\u2705 Intact (no gaps)${RESET}`));
  } else {
    out(boxLine(`Chain: ${RED}\u274C BROKEN${RESET}`));
    for (const gap of chain.gaps) {
      out(boxLine(`  ${RED}${gap}${RESET}`));
    }
  }

  // Signature status
  if (sigs.checked === 0) {
    out(boxLine(`Signatures: ${YELLOW}\u26A0 No signed proofs found${RESET}`));
  } else if (sigs.allValid) {
    out(boxLine(`Signatures: ${GREEN}\u2705 All valid${RESET} (${sigs.checked} checked)`));
  } else {
    out(boxLine(`Signatures: ${RED}\u274C ${sigs.failures.length} failed${RESET}`));
    for (const f of sigs.failures) {
      out(boxLine(`  ${RED}${f}${RESET}`));
    }
  }

  if (sigs.skipped > 0) {
    out(boxLine(`${DIM}(${sigs.skipped} entries without receipts)${RESET}`));
  }

  // Signer
  if (sigs.signerKey) {
    const truncKey = sigs.signerKey.length > 20
      ? sigs.signerKey.slice(0, 20) + "..."
      : sigs.signerKey;
    out(boxLine(`Signer: ${BOLD}${truncKey}${RESET} (Ed25519)`));
  }

  out(boxSep());

  // Allowed actions
  out(boxLine(`${GREEN}${BOLD}ALLOWED ACTIONS: ${allowedTotal}${RESET}`));
  if (allowedTotal > 0) {
    const sortedAllowed = [...allowed.entries()].sort((a, b) => b[1] - a[1]);
    for (const [tool, count] of sortedAllowed) {
      const dots = ".".repeat(Math.max(1, 30 - tool.length));
      out(boxLine(`  ${tool} ${DIM}${dots}${RESET} ${count}`));
    }
  }

  out(boxEmpty());

  // Denied actions
  out(boxLine(`${RED}${BOLD}DENIED ACTIONS: ${deniedTotal}${RESET}`));
  if (deniedTotal > 0) {
    const sortedDenied = [...denied.entries()].sort((a, b) => b[1] - a[1]);
    for (const [tool, count] of sortedDenied) {
      const dots = ".".repeat(Math.max(1, 30 - tool.length));
      out(boxLine(`  ${tool} ${DIM}${dots}${RESET} ${count}  \uD83D\uDEAB`));
    }
  }

  // Policy check
  if (policyResult) {
    out(boxSep());
    if (policyResult.consistent) {
      out(boxLine(`${GREEN}Policy: \u2705 All actions consistent${RESET}`));
    } else {
      out(boxLine(`${RED}Policy: \u274C Inconsistencies found${RESET}`));
      for (const issue of policyResult.issues) {
        out(boxLine(`  ${YELLOW}${issue}${RESET}`));
      }
    }
  }

  // Conclusion
  out(boxSep());
  out(boxLine(`${BOLD}CONCLUSION:${RESET}`));

  if (deniedTotal > 0) {
    out(boxLine(`${BOLD}This agent could NOT have:${RESET}`));
    const deniedTools = [...denied.keys()];
    for (const tool of deniedTools) {
      // Convert tool_name to human-readable action
      const action = toolToAction(tool);
      out(boxLine(`  ${RED}\u2022${RESET} ${action}`));
    }
    out(boxLine(`All ${deniedTotal} attempt${deniedTotal !== 1 ? "s" : ""} were blocked and proven.`));
  } else if (allowedTotal > 0) {
    out(boxLine(`All ${allowedTotal} action${allowedTotal !== 1 ? "s" : ""} were ${GREEN}allowed${RESET}.`));
    out(boxLine(`No denied actions in the proof log.`));
  } else {
    out(boxLine(`No actions found in the proof log.`));
  }

  if (chain.intact && sigs.allValid && sigs.checked > 0) {
    out(boxEmpty());
    out(boxLine(`${GREEN}${BOLD}Proof chain is cryptographically valid.${RESET}`));
  } else if (!chain.intact || !sigs.allValid) {
    out(boxEmpty());
    out(boxLine(`${RED}${BOLD}Proof chain has verification issues.${RESET}`));
  }

  out(boxBottom());
  out("");
}

// ── Stale policy check (runs even without --policy flag) ──

function checkStalePolicies(entries: ProofEntry[]): number {
  let latestPolicyDigest: string | undefined;
  let staleCount = 0;

  for (const entry of entries) {
    const proof = entry.receipt?.occProof;
    if (!proof) continue;

    const proofPolicy = (proof as any)?.policy;

    // Track policy commitment updates
    if (entry.tool === "__policy_commitment" && proofPolicy?.digestB64) {
      latestPolicyDigest = proofPolicy.digestB64;
      continue;
    }

    // Check actions for stale references
    if (latestPolicyDigest && proofPolicy?.digestB64 && proofPolicy.digestB64 !== latestPolicyDigest) {
      staleCount++;
    }
  }

  return staleCount;
}

// ── Helpers ──

function toolToAction(tool: string): string {
  // Map common tool names to human-readable descriptions
  const actions: Record<string, string> = {
    "write_file": "Written to any file",
    "edit_file": "Edited any file",
    "execute_command": "Executed any command",
    "bash": "Executed any shell command",
    "delete_file": "Deleted any file",
    "create_directory": "Created any directory",
    "move_file": "Moved or renamed any file",
    "send_email": "Sent any email",
    "http_request": "Made any HTTP request",
    "database_query": "Executed any database query",
  };

  if (actions[tool]) {
    return actions[tool]!;
  }

  // Generic: convert snake_case to sentence
  return tool.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) + " (any)";
}
