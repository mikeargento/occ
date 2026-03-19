#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * Reference point HTTP server.
 *
 * Endpoints:
 *   GET  /v1/health             — liveness check
 *   POST /v1/proofs             — publish a proof { proof: OCCProof }
 *   GET  /v1/proofs/:digestB64  — retrieve proof by content hash
 *
 * The digest parameter uses URL-safe base64 (+ → -, / → _). Standard
 * base64 is also accepted and normalized automatically.
 *
 * Trust model: reads are open. Writes are open by default but can be
 * restricted with the REFERENCE_POINT_WRITE_TOKEN env var (Bearer token).
 * This is deployment-level access control and does NOT affect the
 * cryptographic trust model — proofs are verified by callers, not this
 * service. A stored forged proof fails verification regardless.
 *
 * Usage:
 *   node dist/server.js                   # in-memory, port 4500
 *   REFERENCE_POINT_PORT=8080 \
 *   REFERENCE_POINT_DB_FILE=./data.json \ # persist to disk
 *   node dist/server.js
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { MemoryStore, FileStore, type ReferenceStore } from "./store.js";
import type { OCCProof } from "occproof";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = Number(process.env["REFERENCE_POINT_PORT"] ?? 4500);
const DB_FILE = process.env["REFERENCE_POINT_DB_FILE"] ?? null;
const WRITE_TOKEN = process.env["REFERENCE_POINT_WRITE_TOKEN"] ?? null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toStandardB64(digest: string): string {
  // Accept URL-safe base64 (rfc4648 §5) and normalize to standard (§4).
  // Re-add stripped padding: standard base64 length must be a multiple of 4.
  let s = digest.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4 !== 0) s += "=";
  return s;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

function isValidOCCProof(value: unknown): value is OCCProof {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  if (p["version"] !== "occ/1") return false;
  if (typeof p["artifact"] !== "object" || p["artifact"] === null) return false;
  const a = p["artifact"] as Record<string, unknown>;
  if (typeof a["digestB64"] !== "string" || a["digestB64"].length === 0) return false;
  if (typeof p["signer"] !== "object" || p["signer"] === null) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

export function createHandler(store: ReferenceStore) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = req.url ?? "/";
    const method = req.method ?? "GET";

    // --- Health ---
    if (url === "/v1/health" && method === "GET") {
      const size = await store.size();
      send(res, 200, { ok: true, entries: size });
      return;
    }

    // --- Publish ---
    if (url === "/v1/proofs" && method === "POST") {
      if (WRITE_TOKEN !== null) {
        const auth = req.headers["authorization"] ?? "";
        if (auth !== `Bearer ${WRITE_TOKEN}`) {
          send(res, 401, { error: "unauthorized" });
          return;
        }
      }

      let body: unknown;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        send(res, 400, { error: "invalid JSON" });
        return;
      }

      if (typeof body !== "object" || body === null || !("proof" in body)) {
        send(res, 400, { error: "body must be { proof: OCCProof }" });
        return;
      }

      const proof = (body as Record<string, unknown>)["proof"];
      if (!isValidOCCProof(proof)) {
        send(res, 400, { error: "proof is not a valid OCCProof" });
        return;
      }

      const entry = await store.put(proof);
      send(res, 201, {
        digestB64: entry.digestB64,
        storedAt: entry.storedAt,
      });
      return;
    }

    // --- Retrieve ---
    const retrieveMatch = /^\/v1\/proofs\/([A-Za-z0-9+/=_-]+)$/.exec(url);
    if (retrieveMatch !== null && method === "GET") {
      const rawDigest = retrieveMatch[1];
      if (rawDigest === undefined) {
        send(res, 400, { error: "missing digest" });
        return;
      }
      const digestB64 = toStandardB64(decodeURIComponent(rawDigest));
      const entry = await store.get(digestB64);
      if (entry === null) {
        send(res, 404, { error: "not found" });
        return;
      }
      send(res, 200, entry);
      return;
    }

    send(res, 404, { error: "not found" });
  };
}

// ---------------------------------------------------------------------------
// Entrypoint (run when executed directly, not when imported as a module)
// ---------------------------------------------------------------------------

import { fileURLToPath } from "node:url";

const isMain = process.argv[1] !== undefined &&
  process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  const store: ReferenceStore = DB_FILE !== null
    ? new FileStore(DB_FILE)
    : new MemoryStore();

  const server = createServer((req, res) => {
    void createHandler(store)(req, res).catch((err: unknown) => {
      console.error("handler error", err);
      if (!res.headersSent) {
        res.writeHead(500).end(JSON.stringify({ error: "internal error" }));
      }
    });
  });

  server.listen(PORT, () => {
    console.log(`OCC reference point listening on port ${PORT}`);
    if (DB_FILE !== null) {
      console.log(`Persisting to ${DB_FILE}`);
    }
    if (WRITE_TOKEN !== null) {
      console.log("Write token protection enabled");
    }
  });
}
