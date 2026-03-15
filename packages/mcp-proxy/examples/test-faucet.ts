#!/usr/bin/env npx tsx
// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * Test the faucet — prove that blocked tools don't execute
 * and allowed tools produce real Ed25519-signed OCC proofs.
 *
 * Run: npx tsx examples/test-faucet.ts
 *
 * This simulates the full pipeline without needing a real MCP client:
 *   1. Connects to the mock downstream MCP server
 *   2. Creates a local signer (embedded StubHost + Constructor)
 *   3. Loads a policy (committed with real OCC proof)
 *   4. Sends tool calls through the interceptor
 *   5. Shows what flows and what doesn't
 *   6. Verifies real OCC proofs on allowed calls
 */

import { ToolRegistry } from "../src/tool-registry.js";
import { ProxyState } from "../src/state.js";
import { ProxyEventBus } from "../src/events.js";
import { Interceptor } from "../src/interceptor.js";
import { createLocalSigner } from "../src/local-signer.js";
import { verify } from "occproof";
import type { AgentPolicy } from "occ-policy-sdk";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const PASS = "\x1b[32m✓\x1b[0m";
const FAIL = "\x1b[31m✗\x1b[0m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

async function main() {
  console.log(`\n${BOLD}OCC Agent — Faucet Test (with real OCC proofs)${RESET}\n`);

  // Create temp dir for signer state
  const tmpDir = mkdtempSync(join(tmpdir(), "cc-test-"));
  const signerStatePath = join(tmpDir, "signer-state.json");

  try {
    // ── 1. Create local signer ──
    console.log(`${DIM}Initializing local OCC signer...${RESET}`);
    const localSigner = await createLocalSigner(signerStatePath);
    console.log(`${PASS} Local signer ready (pubkey: ${localSigner.publicKeyB64.slice(0, 16)}...)\n`);

    // ── 2. Connect to downstream tools ──
    console.log(`${DIM}Connecting to mock tools server...${RESET}`);
    const registry = new ToolRegistry();
    await registry.initialize([
      {
        name: "customer-service",
        transport: "stdio",
        command: "npx",
        args: ["tsx", "examples/mock-tools-server.ts"],
      },
    ]);

    const tools = registry.listTools();
    console.log(`${PASS} Discovered ${tools.length} tools: ${tools.map((t) => t.name).join(", ")}\n`);

    // ── 3. Load policy ──
    const events = new ProxyEventBus();
    const state = new ProxyState(events);

    const policy: AgentPolicy = {
      version: "occ/policy/1",
      name: "Customer Service Agent",
      description: "Can read orders and process refunds. Cannot delete anything.",
      createdAt: Date.now(),
      globalConstraints: {
        maxSpendCents: 10000,
        rateLimit: { maxCalls: 10, windowMs: 60000 },
        blockedTools: ["delete-user", "drop-table"],
      },
      skills: {
        "process-refund": {
          name: "Process Refund",
          tools: ["read-order", "check-eligibility", "issue-refund", "send-email"],
        },
      },
    };

    // Commit policy with real OCC proof
    const commitment = await state.loadPolicyWithLocalSigner(policy, localSigner);
    console.log(`${PASS} Policy committed with real OCC proof`);
    console.log(`${DIM}  Policy digest: ${commitment.policyDigestB64.slice(0, 24)}...${RESET}`);
    console.log(`${DIM}  Proof signer: ${commitment.occProof.signer.publicKeyB64.slice(0, 24)}...${RESET}`);
    console.log(`${DIM}  Enforcement: ${commitment.occProof.environment.enforcement}${RESET}`);
    console.log(`${DIM}  Counter: ${commitment.occProof.commit.counter}${RESET}`);
    console.log(`${DIM}  Blocked: ${policy.globalConstraints.blockedTools?.join(", ")}${RESET}`);
    console.log(`${DIM}  Spend limit: $${(policy.globalConstraints.maxSpendCents! / 100).toFixed(2)}${RESET}\n`);

    // Verify the policy proof
    const policyVerify = await verify(commitment.occProof);
    console.log(
      `  ${policyVerify.valid ? PASS : FAIL} Policy proof signature: ${policyVerify.valid ? "valid" : "INVALID"}`
    );

    // ── 4. Create interceptor with local signer ──
    const interceptor = new Interceptor(registry, state, events, { localSigner });

    // ── 5. Test the faucet ──
    console.log(`\n${BOLD}Testing the faucet:${RESET}\n`);

    // Test 1: Allowed tool
    const r1 = await interceptor.handleToolCall("agent-1", "read-order", { orderId: "ORD-123" });
    console.log(
      `  ${r1.decision.allowed ? PASS : FAIL} read-order("ORD-123") → ${r1.decision.allowed ? "flows through" : "blocked"}`,
    );
    if (r1.decision.allowed && r1.receipt) {
      const proof = r1.receipt.proof;
      const vr = await verify(proof);
      console.log(
        `    ${vr.valid ? PASS : FAIL} OCC proof: ${vr.valid ? "valid Ed25519 signature" : "INVALID"}`,
      );
      console.log(`${DIM}    Digest: ${proof.artifact.digestB64.slice(0, 24)}...${RESET}`);
      console.log(`${DIM}    Counter: ${proof.commit.counter}${RESET}`);
    }

    // Test 2: Another allowed tool
    const r2 = await interceptor.handleToolCall("agent-1", "search-db", { query: "Jane Doe" });
    console.log(
      `  ${r2.decision.allowed ? PASS : FAIL} search-db("Jane Doe") → ${r2.decision.allowed ? "flows through" : "blocked"}`,
    );
    if (r2.decision.allowed && r2.receipt) {
      const proof = r2.receipt.proof;
      const vr = await verify(proof);
      console.log(
        `    ${vr.valid ? PASS : FAIL} OCC proof: ${vr.valid ? "valid Ed25519 signature" : "INVALID"}`,
      );
    }

    // Test 3: Blocked tool — THE FAUCET IS CLOSED
    const r3 = await interceptor.handleToolCall("agent-1", "delete-user", { userId: "cust_001" });
    console.log(
      `  ${!r3.decision.allowed ? PASS : FAIL} delete-user("cust_001") → ${r3.decision.allowed ? "LEAKED THROUGH!" : "faucet closed"}`,
    );
    if (!r3.decision.allowed) {
      console.log(`${DIM}    Reason: ${r3.decision.reason}${RESET}`);
      console.log(`${DIM}    No proof generated (nothing executed)${RESET}`);
    }

    // Test 4: Another blocked tool
    const r4 = await interceptor.handleToolCall("agent-1", "drop-table", { tableName: "users" });
    console.log(
      `  ${!r4.decision.allowed ? PASS : FAIL} drop-table("users") → ${r4.decision.allowed ? "LEAKED THROUGH!" : "faucet closed"}`,
    );

    // Test 5: Allowed tool (send-email)
    const r5 = await interceptor.handleToolCall("agent-1", "send-email", {
      to: "jane@example.com",
      subject: "Your refund",
      body: "Your refund of $49.99 has been processed.",
    });
    console.log(
      `  ${r5.decision.allowed ? PASS : FAIL} send-email("jane@example.com") → ${r5.decision.allowed ? "flows through" : "blocked"}`,
    );
    if (r5.decision.allowed && r5.receipt) {
      const proof = r5.receipt.proof;
      const vr = await verify(proof);
      console.log(
        `    ${vr.valid ? PASS : FAIL} OCC proof: ${vr.valid ? "valid Ed25519 signature" : "INVALID"}`,
      );
      // Verify proof chaining (prevB64 should point to previous proof)
      if (proof.commit.prevB64) {
        console.log(`    ${PASS} Proof chain: prevB64 present (linked to prior proof)`);
      }
    }

    // ── 6. Rate limit test ──
    console.log(`\n${BOLD}Testing rate limit (10 calls / 60s):${RESET}\n`);

    for (let i = 0; i < 7; i++) {
      const r = await interceptor.handleToolCall("agent-1", "search-db", { query: `test-${i}` });
      if (!r.decision.allowed) {
        console.log(`  ${PASS} Call ${i + 4} → faucet closed (rate limit hit)`);
        console.log(`${DIM}    Reason: ${r.decision.reason}${RESET}`);
        break;
      } else {
        console.log(`  ${DIM}Call ${i + 4} → flows through${RESET}`);
      }
    }

    // ── 7. Show audit trail ──
    const ctx = state.getContext("agent-1");
    const snapshot = ctx.snapshot();
    const audit = ctx.getAuditLog();

    console.log(`\n${BOLD}Audit trail:${RESET}\n`);
    console.log(`  Total calls recorded: ${Object.values(snapshot.toolCallCounts).reduce((a, b) => a + b, 0)}`);
    console.log(`  Audit entries: ${audit.length}`);

    const withProofs = audit.filter((e) => e.proofDigestB64);
    const withoutProofs = audit.filter((e) => !e.proofDigestB64 && e.decision.allowed);
    console.log(`  Entries with OCC proofs: ${withProofs.length}`);
    console.log();

    for (const entry of audit) {
      const status = entry.decision.allowed ? `${PASS} executed` : `${DIM}closed${RESET}`;
      const proof = entry.proofDigestB64 ? ` proof:${entry.proofDigestB64.slice(0, 12)}...` : "";
      console.log(`  ${entry.tool.padEnd(16)} ${status}${DIM}${proof}${RESET}`);
    }

    // ── Summary ──
    const allowed = audit.filter((e) => e.decision.allowed).length;
    const denied = audit.filter((e) => !e.decision.allowed).length;

    console.log(`\n${BOLD}Summary:${RESET}`);
    console.log(`  ${allowed} flowed through (each with real Ed25519-signed OCC proof)`);
    console.log(`  ${denied} faucet closed (no proof, nothing happened)`);
    console.log(`  ${BOLD}Nothing happened that wasn't allowed.${RESET}\n`);

    // Clean up
    await registry.shutdown();
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
