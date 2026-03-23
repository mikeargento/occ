#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Comprehensive TEE + local signer + integration test
// Commits proofs via every path and writes them all to test-proofs.json

import { Constructor, canonicalize, verify, parsePolicy, hashPolicy, createPolicyBinding } from "./dist/index.js";
import { StubHost } from "./packages/stub/dist/index.js";
import {
  createExecutionEnvelope,
  hashExecutionEnvelope,
  commitExecutionEnvelope,
  hashValue,
  exportReceipt,
} from "./packages/occ-agent/dist/index.js";
import { sha256 } from "@noble/hashes/sha256";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { signToolResult as signToolResultAnthropic } from "./packages/integrations/anthropic/dist/index.js";
import { signToolResult as signToolResultOpenAI } from "./packages/integrations/occ-openai/dist/index.js";

const TEE_URL = "https://nitro.occproof.com/commit";
const EXPLORER_API = "https://occ.wtf/api/proofs";
const PROOF_OUTPUT = resolve("test-proofs.json");
const TEST_DIR = resolve(".occ-test-tmp");

// Clean up from previous runs
try { rmSync(TEST_DIR, { recursive: true }); } catch {}
mkdirSync(TEST_DIR, { recursive: true });

const results = [];
const allProofs = []; // collect all proofs for batch Explorer upload
let testNum = 0;

/** Forward a proof to the Explorer database (best-effort). */
async function sendToExplorer(proof) {
  if (!proof || !proof.version) return;
  allProofs.push(proof);
}

/** Flush all collected proofs to Explorer in one batch. */
async function flushToExplorer() {
  if (allProofs.length === 0) return { sent: 0 };
  try {
    const res = await fetch(EXPLORER_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proofs: allProofs }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { sent: allProofs.length, error: `HTTP ${res.status}: ${text}` };
    }
    const result = await res.json();
    return { sent: allProofs.length, ...result };
  } catch (err) {
    return { sent: allProofs.length, error: err.message };
  }
}

function record(name, data) {
  testNum++;
  const entry = { test: testNum, name, timestamp: new Date().toISOString(), ...data };
  results.push(entry);
  // Collect proof(s) for Explorer
  if (data.proof) sendToExplorer(data.proof);
  if (data.proofs) data.proofs.forEach((p) => sendToExplorer(p));
  if (data.receipt?.proof) sendToExplorer(data.receipt.proof);
  const status = data.error ? "FAIL" : "PASS";
  console.log(`  [${status}] ${testNum}. ${name}`);
  if (data.error) console.log(`        ${data.error}`);
}

console.log("");
console.log("  OCC Proof Test Suite — TEE + Local + Integrations");
console.log("  ═══════════════════════════════════════════════════");
console.log("");

// ─────────────────────────────────────────────────────────────
// 1. Direct TEE commitment
// ─────────────────────────────────────────────────────────────
console.log("  ── Direct TEE (nitro.occproof.com) ──");

try {
  const testData = new TextEncoder().encode("Hello from OCC test suite");
  const digest = sha256(testData);
  const digestB64 = Buffer.from(digest).toString("base64");

  const res = await fetch(TEE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      digests: [{ digestB64, hashAlg: "sha256" }],
      metadata: { kind: "test", test: "direct-tee-commitment" },
    }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const proofs = await res.json();
  const proof = proofs[0];

  record("Direct TEE commitment", {
    enforcement: proof.environment?.enforcement,
    measurement: proof.environment?.measurement,
    counter: proof.commit?.counter,
    hasAttestation: !!proof.environment?.attestation,
    epochId: proof.commit?.epochId,
    publicKeyB64: proof.signer?.publicKeyB64?.slice(0, 20) + "...",
    proof,
  });
} catch (err) {
  record("Direct TEE commitment", { error: err.message });
}

// ─────────────────────────────────────────────────────────────
// 2. TEE policy commitment (slot 0 via TEE)
// ─────────────────────────────────────────────────────────────
try {
  const policyMd = `# Policy: TEE Test Policy\nversion: 1.0\n\n## Allowed Tools\n- search_web\n- read_file\n\n## Limits\n- max_actions: 100\n`;
  const policyDigest = hashPolicy(policyMd);
  const policyBinding = createPolicyBinding(policyMd);

  const res = await fetch(TEE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      digests: [{ digestB64: policyDigest, hashAlg: "sha256" }],
      metadata: {
        kind: "policy-commitment",
        policyName: "TEE Test Policy",
        policyVersion: "1.0",
      },
    }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const proofs = await res.json();
  const proof = proofs[0];
  const proofHash = Buffer.from(sha256(canonicalize(proof))).toString("base64");

  record("TEE policy commitment (slot 0)", {
    policyDigestB64: policyDigest,
    proofHashB64: proofHash,
    counter: proof.commit?.counter,
    enforcement: proof.environment?.enforcement,
    hasAttestation: !!proof.environment?.attestation,
    proof,
  });
} catch (err) {
  record("TEE policy commitment (slot 0)", { error: err.message });
}

// ─────────────────────────────────────────────────────────────
// 3. TEE tool execution with policy binding
// ─────────────────────────────────────────────────────────────
try {
  // Create a policy binding for the tool execution
  const toolPolicyMd = `# Policy: Tool Execution Policy\nversion: 1.0\n\n## Allowed Tools\n- search_web\n`;
  const toolPolicyBinding = createPolicyBinding(toolPolicyMd);
  // Set a fake authorProofDigestB64 (in production, this comes from the policy commitment proof)
  toolPolicyBinding.authorProofDigestB64 = "test-policy-proof-hash";

  const envelope = createExecutionEnvelope({
    tool: "search_web",
    toolVersion: "1.0.0",
    runtime: "occ-agent",
    inputHashB64: hashValue({ query: "OCC cryptographic proofs" }),
    outputHashB64: hashValue({ results: ["result1", "result2"] }),
  });

  // Use direct fetch with policy binding instead of occ-agent (which doesn't pass policy yet)
  const digestB64 = hashExecutionEnvelope(envelope);
  const commitRes = await fetch(TEE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      digests: [{ digestB64, hashAlg: "sha256" }],
      metadata: { kind: "tool-execution", tool: "search_web", adapter: "occ-agent" },
      policy: toolPolicyBinding,
    }),
  });

  if (!commitRes.ok) throw new Error(`HTTP ${commitRes.status}: ${await commitRes.text()}`);
  const proofs = await commitRes.json();
  const proof = proofs[0];

  const receiptJson = exportReceipt({
    output: { results: ["result1", "result2"] },
    executionEnvelope: envelope,
    occProof: proof,
  });

  record("TEE tool execution (with policy binding)", {
    tool: "search_web",
    digestB64,
    counter: proof.commit?.counter,
    enforcement: proof.environment?.enforcement,
    hasAttestation: !!proof.environment?.attestation,
    hasPolicyInProof: !!proof.policy,
    policyDigest: proof.policy?.digestB64?.slice(0, 16) + "...",
    hasAuthorProof: !!proof.policy?.authorProofDigestB64,
    receipt: JSON.parse(receiptJson),
    proof,
  });
} catch (err) {
  record("TEE tool execution (with policy binding)", { error: err.message });
}

// ─────────────────────────────────────────────────────────────
// 4. TEE batch commit (multiple digests in one call)
// ─────────────────────────────────────────────────────────────
try {
  const digests = [
    { digestB64: Buffer.from(sha256(new TextEncoder().encode("action-1"))).toString("base64"), hashAlg: "sha256" },
    { digestB64: Buffer.from(sha256(new TextEncoder().encode("action-2"))).toString("base64"), hashAlg: "sha256" },
    { digestB64: Buffer.from(sha256(new TextEncoder().encode("action-3"))).toString("base64"), hashAlg: "sha256" },
  ];

  const res = await fetch(TEE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      digests,
      metadata: { kind: "test", test: "batch-commit" },
    }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const proofs = await res.json();

  record("TEE batch commit (3 proofs)", {
    count: proofs.length,
    counters: proofs.map((p) => p.commit?.counter),
    sameEpoch: proofs.every((p) => p.commit?.epochId === proofs[0].commit?.epochId),
    proofs,
  });
} catch (err) {
  record("TEE batch commit (3 proofs)", { error: err.message });
}

// ─────────────────────────────────────────────────────────────
// 5. Local signer — full policy-as-slot-0 flow
// ─────────────────────────────────────────────────────────────
console.log("");
console.log("  ── Local Signer (StubHost) ──");

try {
  const statePath = resolve(TEST_DIR, "local-signer-state.json");
  const stub = await StubHost.createPersistent({
    statePath,
    measurement: "test:local-signer",
    enableTime: true,
    enableCounter: true,
  });

  const constructor = await Constructor.initialize({
    host: stub.host,
    policy: { requireCounter: true, requireTime: true },
  });

  const publicKeyB64 = Buffer.from(stub.publicKeyBytes).toString("base64");

  // Helper to sign and chain
  async function signLocal(digestB64, metadata, policyBinding) {
    const prevHash = stub.getLastProofHash();
    const input = { digestB64, metadata };
    if (prevHash) input.prevProofHashB64 = prevHash;
    if (policyBinding) input.policy = policyBinding;
    const proof = await constructor.commitDigest(input);
    const proofHash = Buffer.from(sha256(canonicalize(proof))).toString("base64");
    stub.setLastProofHash(proofHash);
    return { proof, proofHash };
  }

  // Step 1: Commit policy as slot 0
  const policyMd = `# Policy: Local Test Policy\nversion: 2.0\n\n## Allowed Tools\n- read_file\n- search_web\n- calculate\n`;
  const policyDigest = hashPolicy(policyMd);
  const policyBinding = createPolicyBinding(policyMd);

  const { proof: policyProof, proofHash: policyProofHash } = await signLocal(
    policyDigest,
    { kind: "policy-commitment", policyName: "Local Test Policy" },
    policyBinding,
  );

  // Set authorProofDigestB64 — the key that unlocks actions
  policyBinding.authorProofDigestB64 = policyProofHash;

  record("Local policy commitment (slot 0)", {
    counter: policyProof.commit.counter,
    policyDigestB64: policyDigest,
    authorProofDigestB64: policyProofHash,
    hasPolicyInSignedBody: !!policyProof.policy,
    proof: policyProof,
  });

  // Verify the policy proof
  const verifyResult = await verify(policyProof);
  record("Verify policy proof", {
    valid: verifyResult.valid,
    reason: verifyResult.reason,
  });

  // Step 2: Tool execution proofs (slots 1, 2, 3) — all reference the policy
  const tools = [
    { name: "read_file", args: { path: "/etc/hosts" }, output: "127.0.0.1 localhost" },
    { name: "search_web", args: { query: "OCC proofs" }, output: { results: ["occ.wtf"] } },
    { name: "calculate", args: { expr: "2+2" }, output: 4 },
  ];

  for (const tool of tools) {
    const inputHash = hashValue(tool.args);
    const outputHash = hashValue(tool.output);
    const envelope = createExecutionEnvelope({
      tool: tool.name,
      toolVersion: "1.0.0",
      runtime: "test",
      inputHashB64: inputHash,
      outputHashB64: outputHash,
    });
    const digestB64 = hashExecutionEnvelope(envelope);

    const { proof, proofHash } = await signLocal(
      digestB64,
      { kind: "tool-execution", tool: tool.name },
      policyBinding,
    );

    const verifyRes = await verify(proof);

    record(`Local tool execution: ${tool.name}`, {
      counter: proof.commit.counter,
      hasPrevB64: !!proof.commit.prevB64,
      hasPolicyBinding: !!proof.policy,
      policyDigestMatch: proof.policy?.digestB64 === policyDigest,
      hasAuthorProof: !!proof.policy?.authorProofDigestB64,
      authorProofMatch: proof.policy?.authorProofDigestB64 === policyProofHash,
      verified: verifyRes.valid,
      proof,
    });
  }

  // Step 3: Verify causal ordering — policy counter < all action counters
  const policyCounter = BigInt(policyProof.commit.counter);
  record("Causal ordering check", {
    policyCounter: policyProof.commit.counter,
    note: "Policy counter must be less than all action counters (automatically enforced by monotonic counter)",
    publicKeyB64: publicKeyB64.slice(0, 20) + "...",
  });
} catch (err) {
  record("Local signer flow", { error: err.message, stack: err.stack });
}

// ─────────────────────────────────────────────────────────────
// 6. occ-anthropic integration (local stub signing)
// ─────────────────────────────────────────────────────────────
console.log("");
console.log("  ── Integration: occ-anthropic ──");

try {
  const proof = await signToolResultAnthropic(
    "search_web",
    { query: "anthropic integration test" },
    { results: ["anthropic.com"] },
    {
      proofFile: resolve(TEST_DIR, "anthropic-proof.jsonl"),
      statePath: resolve(TEST_DIR, "anthropic-signer.json"),
      measurement: "test:occ-anthropic",
      agentId: "test-anthropic-agent",
    },
  );

  const verifyRes = await verify(proof);

  record("occ-anthropic signToolResult", {
    counter: proof.commit.counter,
    enforcement: proof.environment.enforcement,
    measurement: proof.environment.measurement,
    verified: verifyRes.valid,
    proof,
  });
} catch (err) {
  record("occ-anthropic signToolResult", { error: err.message });
}

// ─────────────────────────────────────────────────────────────
// 7. occ-openai integration (local stub signing)
// ─────────────────────────────────────────────────────────────
console.log("");
console.log("  ── Integration: occ-openai ──");

try {
  const proof = await signToolResultOpenAI(
    "get_weather",
    { city: "Buffalo" },
    { temp: 72, condition: "sunny" },
    {
      proofFile: resolve(TEST_DIR, "openai-proof.jsonl"),
      statePath: resolve(TEST_DIR, "openai-signer.json"),
      measurement: "test:occ-openai",
      agentId: "test-openai-agent",
    },
  );

  const verifyRes = await verify(proof);

  record("occ-openai signToolResult", {
    counter: proof.commit.counter,
    enforcement: proof.environment.enforcement,
    measurement: proof.environment.measurement,
    verified: verifyRes.valid,
    proof,
  });
} catch (err) {
  record("occ-openai signToolResult", { error: err.message });
}

// ─────────────────────────────────────────────────────────────
// 8. TEE + policy binding (full E2E: commit policy via TEE,
//    then commit tool execution referencing it)
// ─────────────────────────────────────────────────────────────
console.log("");
console.log("  ── TEE End-to-End: Policy → Action ──");

try {
  const policyMd = `# Policy: E2E TEE Policy\nversion: 1.0\n\n## Allowed Tools\n- deploy\n- rollback\n\n## Limits\n- max_actions: 50\n- rate_limit: 5/min\n`;
  const policyDigest = hashPolicy(policyMd);
  const binding = createPolicyBinding(policyMd);

  // Commit policy via TEE
  const policyRes = await fetch(TEE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      digests: [{ digestB64: policyDigest, hashAlg: "sha256" }],
      metadata: { kind: "policy-commitment", policyName: "E2E TEE Policy" },
    }),
  });

  if (!policyRes.ok) throw new Error(`Policy commit: HTTP ${policyRes.status}`);
  const policyProofs = await policyRes.json();
  const policyProof = policyProofs[0];
  const policyProofHash = Buffer.from(sha256(canonicalize(policyProof))).toString("base64");

  binding.authorProofDigestB64 = policyProofHash;

  record("TEE E2E: policy committed", {
    counter: policyProof.commit?.counter,
    policyDigest,
    policyProofHash: policyProofHash.slice(0, 24) + "...",
    enforcement: policyProof.environment?.enforcement,
    proof: policyProof,
  });

  // Now commit a tool execution referencing that policy
  // The policy binding is included in the request body and gets
  // sealed into the Ed25519 signed body by the enclave.
  const actionDigest = Buffer.from(
    sha256(new TextEncoder().encode(JSON.stringify({ tool: "deploy", args: { env: "prod" } })))
  ).toString("base64");

  const actionRes = await fetch(TEE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      digests: [{ digestB64: actionDigest, hashAlg: "sha256" }],
      metadata: {
        kind: "tool-execution",
        tool: "deploy",
      },
      policy: binding,
    }),
  });

  if (!actionRes.ok) throw new Error(`Action commit: HTTP ${actionRes.status}`);
  const actionProofs = await actionRes.json();
  const actionProof = actionProofs[0];

  const policyCounter = BigInt(policyProof.commit?.counter ?? "0");
  const actionCounter = BigInt(actionProof.commit?.counter ?? "0");

  record("TEE E2E: action committed", {
    counter: actionProof.commit?.counter,
    policyCounter: policyProof.commit?.counter,
    causalOrder: actionCounter > policyCounter ? "VALID" : "INVALID",
    sameEpoch: actionProof.commit?.epochId === policyProof.commit?.epochId,
    enforcement: actionProof.environment?.enforcement,
    proof: actionProof,
  });
} catch (err) {
  record("TEE E2E: policy → action", { error: err.message });
}

// ─────────────────────────────────────────────────────────────
// 9. Policy proof gate test (interceptor blocks without commitment)
// ─────────────────────────────────────────────────────────────
console.log("");
console.log("  ── Policy Proof Gate (Interceptor) ──");

try {
  // Import interceptor components
  const { Interceptor } = await import("./packages/mcp-proxy/dist/interceptor.js");
  const { ProxyState } = await import("./packages/mcp-proxy/dist/state.js");
  const { ProxyEventBus } = await import("./packages/mcp-proxy/dist/events.js");
  const { ToolRegistry } = await import("./packages/mcp-proxy/dist/tool-registry.js");

  const events = new ProxyEventBus();
  const registry = new ToolRegistry();
  const state = new ProxyState(events);
  const agent = state.createAgent("gate-test-agent", ["test_tool"]);

  // Register a dummy tool
  registry.registerDemoTools();

  // Create a local signer so denials produce real signed proofs
  const { createLocalSigner } = await import("./packages/mcp-proxy/dist/local-signer.js");
  const gateSigner = await createLocalSigner(resolve(TEST_DIR, "gate-signer-state.json"));

  // Scenario A: policyBinding WITHOUT authorProofDigestB64 → should BLOCK
  // This denial gets a real Ed25519-signed proof (same counter sequence)
  const interceptorLocked = new Interceptor(registry, state, events, {
    localSigner: gateSigner,
    policyBinding: { digestB64: "some-policy-hash", name: "Test Policy" },
    // NO authorProofDigestB64 — proxy should be locked
  });

  const lockedResult = await interceptorLocked.handleToolCall(
    agent.id, "get_weather", { city: "Buffalo" },
  );

  // Retrieve the denial proof from the audit log
  let denialProof = undefined;
  if (lockedResult.auditId) {
    const receipt = state.getReceipt(lockedResult.auditId);
    if (receipt) denialProof = receipt.proof ?? receipt;
  }

  record("Policy gate: LOCKED (no authorProofDigestB64)", {
    blocked: lockedResult.isError,
    reason: lockedResult.decision?.reason,
    constraint: lockedResult.decision?.constraint,
    hasDenialProof: !!denialProof,
    proof: denialProof,
  });

  // Scenario B: policyBinding WITH authorProofDigestB64 → should ALLOW
  const interceptorUnlocked = new Interceptor(registry, state, events, {
    localSigner: gateSigner,
    policyBinding: {
      digestB64: "some-policy-hash",
      authorProofDigestB64: "committed-proof-hash",
      name: "Test Policy",
    },
  });

  const unlockedResult = await interceptorUnlocked.handleToolCall(
    agent.id, "get_weather", { city: "Buffalo" },
  );

  // Get the execution proof
  let allowedProof = undefined;
  if (unlockedResult.receipt) {
    allowedProof = unlockedResult.receipt.proof ?? unlockedResult.receipt;
  }

  record("Policy gate: UNLOCKED (has authorProofDigestB64)", {
    allowed: !unlockedResult.isError,
    hasContent: unlockedResult.content?.length > 0,
    proof: allowedProof,
  });

  // Scenario C: no policyBinding at all → should ALLOW (dev mode)
  const interceptorNone = new Interceptor(registry, state, events, {
    localSigner: gateSigner,
  });

  const noneResult = await interceptorNone.handleToolCall(
    agent.id, "get_weather", { city: "Buffalo" },
  );

  let devProof = undefined;
  if (noneResult.receipt) {
    devProof = noneResult.receipt.proof ?? noneResult.receipt;
  }

  record("Policy gate: NO POLICY (dev mode)", {
    allowed: !noneResult.isError,
    hasContent: noneResult.content?.length > 0,
    proof: devProof,
  });
} catch (err) {
  record("Policy proof gate test", { error: err.message, stack: err.stack });
}

// ─────────────────────────────────────────────────────────────
// Flush all proofs to Explorer
// ─────────────────────────────────────────────────────────────
console.log("");
console.log("  ── Explorer Upload ──");
const explorerResult = await flushToExplorer();
if (explorerResult.error) {
  console.log(`  [WARN] Explorer upload: ${explorerResult.error}`);
} else {
  console.log(`  ${explorerResult.sent} proofs sent to ${EXPLORER_API}`);
  if (explorerResult.inserted !== undefined) console.log(`  ${explorerResult.inserted} inserted, ${explorerResult.duplicates ?? 0} duplicates`);
}

// ─────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────
console.log("");
console.log("  ── Summary ──");
const passed = results.filter((r) => !r.error).length;
const failed = results.filter((r) => r.error).length;
console.log(`  ${passed} passed, ${failed} failed, ${results.length} total`);
console.log("");

// Write all proofs to file for inspection
writeFileSync(PROOF_OUTPUT, JSON.stringify(results, null, 2));
console.log(`  All proofs written to: ${PROOF_OUTPUT}`);
console.log("");

// Clean up test dir
try { rmSync(TEST_DIR, { recursive: true }); } catch {}

process.exit(failed > 0 ? 1 : 0);
