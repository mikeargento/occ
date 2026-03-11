#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * Tests the core occproof verify() function with agency proofs.
 *
 * This test:
 *   1. Creates a proof with agency via the mock server
 *   2. Verifies it with the core verify() function (not just verify-helper)
 *   3. Tests policy checks (requireActor, allowedActorKeyIds, allowedActorProviders)
 *
 * Run:
 *   1. Start mock server:  npm run dev
 *   2. In another terminal:  node --import tsx/esm src/mock/test-verifier-agency.ts
 */

import { createHash, createSign, generateKeyPairSync } from "node:crypto";
import { sha256 } from "@noble/hashes/sha256";
import { verify } from "occproof";

const BASE = process.env["OCC_URL"] ?? "http://localhost:8787";

async function post(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path} returned ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

function assert(condition: boolean, message: string): void {
  if (!condition) { console.error(`❌ FAIL: ${message}`); process.exit(1); }
  console.log(`  ✅ ${message}`);
}

// Generate P-256 keypair
const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const pubKeyDer = publicKey.export({ type: "spki", format: "der" });
const publicKeyB64 = pubKeyDer.toString("base64");
const keyId = createHash("sha256").update(pubKeyDer).digest("hex");

console.log("\n═══════════════════════════════════════════════");
console.log("  Core Verifier — Agency Proof Tests");
console.log("═══════════════════════════════════════════════\n");

// Create artifact
const artifactBytes = Buffer.from("verifier test artifact — core library verification");
const artifactDigest = sha256(artifactBytes);
const artifactDigestB64 = Buffer.from(artifactDigest).toString("base64");

// Get challenge
const { challenge } = await post("/challenge", {}) as { challenge: string };
const timestamp = Date.now();

// Build & sign authorization
const canonicalPayload = {
  purpose: "occ/commit-authorize/v1" as const,
  actorKeyId: keyId,
  artifactHash: artifactDigestB64,
  challenge,
  timestamp,
};
const payloadJson = JSON.stringify(canonicalPayload, Object.keys(canonicalPayload).sort());
const signer = createSign("SHA256");
signer.update(Buffer.from(payloadJson, "utf8"));
const signatureB64 = signer.sign(privateKey).toString("base64");

const agency = {
  actor: { keyId, publicKeyB64, algorithm: "ES256" as const, provider: "test-node-crypto" },
  authorization: { ...canonicalPayload, signatureB64 },
};

// Create proof via mock server
const proofs = await post("/commit", {
  digests: [{ digestB64: artifactDigestB64, hashAlg: "sha256" }],
  metadata: { test: "core-verifier" },
  agency,
}) as any[];

const proof = proofs[0];

// ---------------------------------------------------------------------------
// Test 1: Core verify() with original bytes + agency proof
// ---------------------------------------------------------------------------

console.log("── Test 1: Core verify() with agency proof ──");
const result = await verify({
  proof,
  bytes: new Uint8Array(artifactBytes),
});
assert(result.valid === true, `verify() returned valid: ${result.valid}`);
assert(result.reason === undefined, "No failure reason");

// ---------------------------------------------------------------------------
// Test 2: verify() with requireActor policy
// ---------------------------------------------------------------------------

console.log("\n── Test 2: requireActor policy ──");
const result2 = await verify({
  proof,
  bytes: new Uint8Array(artifactBytes),
  trustAnchors: { requireActor: true },
});
assert(result2.valid === true, "requireActor: true → passes with agency");

// ---------------------------------------------------------------------------
// Test 3: verify() with allowedActorKeyIds policy
// ---------------------------------------------------------------------------

console.log("\n── Test 3: allowedActorKeyIds policy ──");
const result3 = await verify({
  proof,
  bytes: new Uint8Array(artifactBytes),
  trustAnchors: { allowedActorKeyIds: [keyId] },
});
assert(result3.valid === true, "allowedActorKeyIds with correct keyId → passes");

const result3b = await verify({
  proof,
  bytes: new Uint8Array(artifactBytes),
  trustAnchors: { allowedActorKeyIds: ["wrong-key-id"] },
});
assert(result3b.valid === false, "allowedActorKeyIds with wrong keyId → fails");
assert(result3b.reason?.includes("not in the allowed set") === true, `Reason: ${result3b.reason}`);

// ---------------------------------------------------------------------------
// Test 4: verify() with allowedActorProviders policy
// ---------------------------------------------------------------------------

console.log("\n── Test 4: allowedActorProviders policy ──");
const result4 = await verify({
  proof,
  bytes: new Uint8Array(artifactBytes),
  trustAnchors: { allowedActorProviders: ["test-node-crypto", "apple-secure-enclave"] },
});
assert(result4.valid === true, "allowedActorProviders with correct provider → passes");

const result4b = await verify({
  proof,
  bytes: new Uint8Array(artifactBytes),
  trustAnchors: { allowedActorProviders: ["android-strongbox"] },
});
assert(result4b.valid === false, "allowedActorProviders with wrong provider → fails");
assert(result4b.reason?.includes("not in the allowed set") === true, `Reason: ${result4b.reason}`);

// ---------------------------------------------------------------------------
// Test 5: verify() without agency — requireActor should fail
// ---------------------------------------------------------------------------

console.log("\n── Test 5: No agency + requireActor policy ──");
// Create proof without agency
const noAgencyProofs = await post("/commit", {
  digests: [{ digestB64: artifactDigestB64, hashAlg: "sha256" }],
}) as any[];
const noAgencyProof = noAgencyProofs[0];

const result5 = await verify({
  proof: noAgencyProof,
  bytes: new Uint8Array(artifactBytes),
  trustAnchors: { requireActor: true },
});
assert(result5.valid === false, "requireActor: true without agency → fails");
assert(result5.reason?.includes("requires actor") === true, `Reason: ${result5.reason}`);

// No agency, no requirement — should pass
const result5b = await verify({
  proof: noAgencyProof,
  bytes: new Uint8Array(artifactBytes),
});
assert(result5b.valid === true, "No agency, no requirement → passes");

// ---------------------------------------------------------------------------
// Test 6: Tampered proof — wrong bytes
// ---------------------------------------------------------------------------

console.log("\n── Test 6: Wrong bytes (artifact mismatch) ──");
const result6 = await verify({
  proof,
  bytes: new Uint8Array(Buffer.from("different content")),
});
assert(result6.valid === false, "Wrong bytes → fails");
assert(result6.reason?.includes("artifact digest mismatch") === true, `Reason: ${result6.reason}`);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log("\n═══════════════════════════════════════════════");
console.log("  ✅ ALL CORE VERIFIER TESTS PASSED");
console.log("═══════════════════════════════════════════════\n");
