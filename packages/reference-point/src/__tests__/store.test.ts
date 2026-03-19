// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import { describe, test, after } from "node:test";
import * as assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync } from "node:fs";
import { MemoryStore, FileStore } from "../store.js";
import type { OCCProof } from "occproof";

// ---------------------------------------------------------------------------
// Minimal valid proof fixture (real fields but stub values)
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

// ---------------------------------------------------------------------------
// MemoryStore
// ---------------------------------------------------------------------------

describe("MemoryStore", () => {
  test("put and get round-trip", async () => {
    const store = new MemoryStore();
    const proof = makeProof("abc123==");
    const entry = await store.put(proof);

    assert.strictEqual(entry.digestB64, "abc123==");
    assert.ok(entry.storedAt > 0);

    const fetched = await store.get("abc123==");
    assert.ok(fetched !== null);
    assert.deepStrictEqual(fetched.proof, proof);
  });

  test("get returns null for unknown digest", async () => {
    const store = new MemoryStore();
    const result = await store.get("unknown==");
    assert.strictEqual(result, null);
  });

  test("size reflects stored entries", async () => {
    const store = new MemoryStore();
    assert.strictEqual(await store.size(), 0);
    await store.put(makeProof("a1=="));
    assert.strictEqual(await store.size(), 1);
    await store.put(makeProof("a2=="));
    assert.strictEqual(await store.size(), 2);
  });

  test("overwrite replaces existing entry", async () => {
    const store = new MemoryStore();
    const p1 = makeProof("key==");
    const p2 = makeProof("key==");
    (p2.commit as { nonceB64: string }).nonceB64 = "UPDATED";
    await store.put(p1);
    await store.put(p2);
    assert.strictEqual(await store.size(), 1);
    const fetched = await store.get("key==");
    assert.ok(fetched !== null);
    assert.strictEqual(fetched.proof.commit.nonceB64, "UPDATED");
  });
});

// ---------------------------------------------------------------------------
// FileStore
// ---------------------------------------------------------------------------

describe("FileStore", () => {
  const filePath = join(tmpdir(), `occ-ref-test-${Date.now()}.json`);

  after(() => {
    try { unlinkSync(filePath); } catch { /* ok */ }
  });

  test("put and get survive re-instantiation (persistence)", async () => {
    const proof = makeProof("persistent==");

    {
      const store = new FileStore(filePath);
      await store.put(proof);
    }

    // Re-instantiate — should reload from disk
    const store2 = new FileStore(filePath);
    const fetched = await store2.get("persistent==");
    assert.ok(fetched !== null);
    assert.deepStrictEqual(fetched.proof, proof);
  });

  test("get returns null for missing entry", async () => {
    const store = new FileStore(filePath);
    assert.strictEqual(await store.get("nope=="), null);
  });
});
