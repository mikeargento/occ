// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import { describe, test, before, after } from "node:test";
import * as assert from "node:assert/strict";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { MemoryStore } from "../store.js";
import { createHandler } from "../server.js";
import type { OCCProof } from "occproof";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProof(digestB64: string): OCCProof {
  return {
    version: "occ/1",
    artifact: { hashAlg: "sha256", digestB64 },
    commit: { nonceB64: "AAAA" },
    signer: { publicKeyB64: "BBBB", signatureB64: "CCCC" },
    environment: { enforcement: "stub", measurement: "test" },
  };
}

async function startServer(store: MemoryStore): Promise<{ server: Server; baseUrl: string }> {
  const handler = createHandler(store);
  const server = createServer((req, res) => {
    void handler(req, res);
  });

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

describe("reference point HTTP server", () => {
  let server: Server;
  let baseUrl: string;
  let store: MemoryStore;

  before(async () => {
    store = new MemoryStore();
    ({ server, baseUrl } = await startServer(store));
  });

  after(async () => {
    await stopServer(server);
  });

  test("GET /v1/health returns ok", async () => {
    const res = await fetch(`${baseUrl}/v1/health`);
    assert.strictEqual(res.status, 200);
    const body = await res.json() as { ok: boolean; entries: number };
    assert.strictEqual(body.ok, true);
    assert.strictEqual(typeof body.entries, "number");
  });

  test("POST /v1/proofs stores proof and returns 201", async () => {
    const proof = makeProof("dGVzdA==");
    const res = await fetch(`${baseUrl}/v1/proofs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proof }),
    });
    assert.strictEqual(res.status, 201);
    const body = await res.json() as { digestB64: string; storedAt: number };
    assert.strictEqual(body.digestB64, "dGVzdA==");
    assert.ok(body.storedAt > 0);
  });

  test("GET /v1/proofs/:digest retrieves stored proof", async () => {
    const proof = makeProof("Zm9v");
    await store.put(proof);

    // URL-safe base64 (no padding) — same as client.ts encoding
    const encoded = encodeURIComponent("Zm9v");
    const res = await fetch(`${baseUrl}/v1/proofs/${encoded}`);
    assert.strictEqual(res.status, 200);
    const body = await res.json() as { proof: OCCProof };
    assert.deepStrictEqual(body.proof, proof);
  });

  test("GET /v1/proofs/:digest returns 404 for missing digest", async () => {
    const res = await fetch(`${baseUrl}/v1/proofs/bm90Zm91bmQ=`);
    assert.strictEqual(res.status, 404);
  });

  test("POST /v1/proofs returns 400 for invalid body", async () => {
    const res = await fetch(`${baseUrl}/v1/proofs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notAProof: true }),
    });
    assert.strictEqual(res.status, 400);
  });

  test("POST /v1/proofs returns 400 for invalid JSON", async () => {
    const res = await fetch(`${baseUrl}/v1/proofs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    assert.strictEqual(res.status, 400);
  });

  test("unknown route returns 404", async () => {
    const res = await fetch(`${baseUrl}/unknown`);
    assert.strictEqual(res.status, 404);
  });
});
