// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * Integration tests for verifyWithReference().
 *
 * Builds real OCCProof instances using Constructor + a mock stub host,
 * then exercises both the portable-proof and reference-lookup paths.
 */

import { describe, test, before, after } from "node:test";
import * as assert from "node:assert/strict";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { Constructor } from "occproof";
import { getPublicKeyAsync, signAsync } from "@noble/ed25519";
import type { HostCapabilities } from "occproof";
import { MemoryStore } from "../store.js";
import { createHandler } from "../server.js";
import { ReferencePointClient } from "../client.js";
import { verifyWithReference } from "../verify.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeHost(): Promise<HostCapabilities> {
  const privateKey = crypto.getRandomValues(new Uint8Array(32));
  const publicKeyBytes = await getPublicKeyAsync(privateKey);
  return {
    enforcementTier: "stub" as const,
    getMeasurement: async () => "test-measurement-cafebabe",
    getFreshNonce: async () => crypto.getRandomValues(new Uint8Array(16)),
    sign: async (data: Uint8Array) => signAsync(data, privateKey),
    getPublicKey: async () => publicKeyBytes,
  };
}

async function startServer(store: MemoryStore): Promise<{ server: Server; baseUrl: string }> {
  const handler = createHandler(store);
  const server = createServer((req, res) => { void handler(req, res); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as { port: number };
  return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
}

async function stopServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("verifyWithReference", () => {
  let server: Server;
  let baseUrl: string;
  let store: MemoryStore;
  let client: ReferencePointClient;

  before(async () => {
    store = new MemoryStore();
    ({ server, baseUrl } = await startServer(store));
    client = new ReferencePointClient({ baseUrl });
  });

  after(async () => {
    await stopServer(server);
  });

  test("portable path: verifies proof that travels with artifact", async () => {
    const host = await makeHost();
    const ctor = await Constructor.initialize({ host });
    const bytes = new TextEncoder().encode("hello world");
    const proof = await ctor.commit({ bytes });

    const result = await verifyWithReference({ bytes, proof });
    assert.strictEqual(result.valid, true);
    if (result.valid) {
      assert.strictEqual(result.path, "portable");
    }
  });

  test("portable path: rejects tampered bytes", async () => {
    const host = await makeHost();
    const ctor = await Constructor.initialize({ host });
    const bytes = new TextEncoder().encode("original content");
    const proof = await ctor.commit({ bytes });

    const tampered = new TextEncoder().encode("tampered content");
    const result = await verifyWithReference({ bytes: tampered, proof });
    assert.strictEqual(result.valid, false);
    if (!result.valid) {
      assert.strictEqual(result.path, "portable");
    }
  });

  test("reference path: retrieves proof by content hash when no proof provided", async () => {
    const host = await makeHost();
    const ctor = await Constructor.initialize({ host });
    const bytes = new TextEncoder().encode("artifact without metadata");
    const proof = await ctor.commit({ bytes });

    // Publish to reference point
    await client.publish(proof);

    // Verify without co-traveling proof (simulates stripped metadata)
    const result = await verifyWithReference({ bytes, referencePoint: client });
    assert.strictEqual(result.valid, true);
    if (result.valid) {
      assert.strictEqual(result.path, "reference");
    }
  });

  test("reference path: returns not-found when proof not in reference point", async () => {
    const bytes = new TextEncoder().encode("never committed");
    const result = await verifyWithReference({ bytes, referencePoint: client });
    assert.strictEqual(result.valid, false);
    if (!result.valid) {
      assert.strictEqual(result.path, "not-found");
    }
  });

  test("reference path: accepts URL string instead of client instance", async () => {
    const host = await makeHost();
    const ctor = await Constructor.initialize({ host });
    const bytes = new TextEncoder().encode("url string test");
    const proof = await ctor.commit({ bytes });
    await client.publish(proof);

    // Pass raw URL string — verify creates its own client
    const result = await verifyWithReference({ bytes, referencePoint: baseUrl });
    assert.strictEqual(result.valid, true);
  });

  test("throws TypeError when neither proof nor referencePoint is provided", async () => {
    const bytes = new TextEncoder().encode("no proof no ref");
    await assert.rejects(
      () => verifyWithReference({ bytes }),
      TypeError,
    );
  });

  test("throws TypeError when bytes is not Uint8Array", async () => {
    await assert.rejects(
      // @ts-expect-error intentional invalid input
      () => verifyWithReference({ bytes: "not uint8array", referencePoint: baseUrl }),
      TypeError,
    );
  });
});
