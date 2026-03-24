// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * Parent EC2 instance — HTTPS API server
 *
 * Endpoints:
 *   POST /commit         — { digests: [{ digestB64, hashAlg }], metadata?, agency?, policy? }  (requires API key)
 *   POST /allocate-slot  — {} → { slotId, slot }  (public — pre-allocates causal slot)
 *   POST /challenge      — {} → { challenge }  (public — issues enclave nonce for agency signing)
 *   POST /convert-bw     — { imageB64 }  (public demo — grayscale conversion inside TEE)
 *   GET  /key             — { publicKeyB64, measurement, enforcement }
 *   POST /verify          — { proof, policy? }
 *   GET  /health          — { ok: true }
 *
 * OCC Causal Commit Model:
 *   The parent internally handles the 2-RTT protocol (allocateSlot → commit)
 *   so clients can still use the single POST /commit API. Clients that want
 *   direct control over slot allocation can use POST /allocate-slot.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { verify } from "occproof";
import type { OCCProof, VerificationPolicy, AgencyEnvelope, PolicyBinding } from "occproof";
import { VsockClient, type EnclaveClient } from "./vsock-client.js";
import { requestTimestamp } from "./tsa-client.js";

const PORT = Number(
  process.argv.find((a) => a.startsWith("--port="))?.split("=")[1]
    ?? process.env["PORT"]
    ?? 8080
);

// ---------------------------------------------------------------------------
// Proof indexing — fire-and-forget POST to explorer database
// ---------------------------------------------------------------------------

const INDEX_URL = process.env["PROOF_INDEX_URL"] ?? "https://www.occ.wtf/api/proofs";

async function indexProofs(proofs: OCCProof[]): Promise<void> {
  if (!INDEX_URL) return;
  try {
    await fetch(INDEX_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proofs }),
    });
  } catch (err) {
    console.warn(`[parent] proof indexing failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// API key auth
// ---------------------------------------------------------------------------

const API_KEYS: ReadonlySet<string> = (() => {
  const raw = process.env["API_KEYS"] ?? "";
  const keys = raw.split(",").map((k) => k.trim()).filter((k) => k.length > 0);
  if (keys.length > 0) {
    console.log(`[parent] API key auth enabled (${keys.length} key(s))`);
  } else {
    console.log("[parent] API key auth disabled (no API_KEYS set — dev mode)");
  }
  return new Set(keys);
})();

function checkApiKey(req: IncomingMessage): boolean {
  if (API_KEYS.size === 0) return true; // dev mode — open access
  const auth = req.headers["authorization"] ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const token = auth.slice(7).trim();
  return API_KEYS.has(token);
}

// ---------------------------------------------------------------------------
// Enclave client
// ---------------------------------------------------------------------------

const enclaveClient: EnclaveClient = new VsockClient();

let cachedKeyResponse: { publicKeyB64: string; measurement: string; enforcement: string } | null = null;

async function getKeyInfo(): Promise<{ publicKeyB64: string; measurement: string; enforcement: string }> {
  if (cachedKeyResponse) return cachedKeyResponse;
  const result = await enclaveClient.send({ type: "key" });
  if (!result.ok || !result.data) {
    throw new Error(result.error ?? "Failed to get key info from enclave");
  }
  cachedKeyResponse = result.data as unknown as typeof cachedKeyResponse;
  return cachedKeyResponse!;
}

// ---------------------------------------------------------------------------
// Last proof persistence — epoch lineage transport
//
// The parent persists the last proof to disk so it can be passed to the
// enclave on reboot. This is ONLY a transport mechanism — the enclave
// fully verifies the proof cryptographically before trusting it.
// ---------------------------------------------------------------------------

const LAST_PROOF_DIR = join(process.cwd(), ".occ", "last-proofs");
const LAST_PROOF_PATH = join(process.cwd(), ".occ", "last-proof.json"); // legacy global

function loadLastProof(): OCCProof | null {
  try {
    const raw = readFileSync(LAST_PROOF_PATH, "utf8");
    return JSON.parse(raw) as OCCProof;
  } catch {
    return null; // No previous epoch — genesis
  }
}

/** Load all per-chain last proofs for epoch lineage */
function loadPerChainLastProofs(): Record<string, OCCProof> {
  const result: Record<string, OCCProof> = {};
  try {
    mkdirSync(LAST_PROOF_DIR, { recursive: true });
    const files = readdirSync(LAST_PROOF_DIR);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = readFileSync(join(LAST_PROOF_DIR, file), "utf8");
        const chainId = file.replace(".json", "");
        result[chainId] = JSON.parse(raw) as OCCProof;
      } catch { /* skip corrupt files */ }
    }
  } catch { /* dir doesn't exist yet */ }
  return result;
}

function persistLastProof(proof: OCCProof, chainId?: string): void {
  try {
    if (chainId && chainId !== "global") {
      // Per-chain proof persistence
      mkdirSync(LAST_PROOF_DIR, { recursive: true });
      // Sanitize chainId for filesystem (replace non-alphanumeric with _)
      const safeId = chainId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
      writeFileSync(join(LAST_PROOF_DIR, `${safeId}.json`), JSON.stringify(proof, null, 2));
    } else {
      // Global/legacy proof persistence
      mkdirSync(dirname(LAST_PROOF_PATH), { recursive: true });
      writeFileSync(LAST_PROOF_PATH, JSON.stringify(proof, null, 2));
    }
  } catch (err) {
    console.warn(`[parent] failed to persist last proof: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Enclave initialization — pass previous epoch's last proof for lineage
// ---------------------------------------------------------------------------

async function initEnclave(): Promise<void> {
  const lastProof = loadLastProof();
  const perChainProofs = loadPerChainLastProofs();
  const chainCount = Object.keys(perChainProofs).length;

  if (lastProof || chainCount > 0) {
    console.log(`[parent] passing epoch lineage to enclave: global=${!!lastProof}, chains=${chainCount}`);
    const result = await enclaveClient.send({
      type: "init",
      ...(lastProof ? { lastProof } : { allowGenesis: true }),
      ...(chainCount > 0 ? { lastProofsPerChain: perChainProofs } : {}),
    });
    if (!result.ok) {
      throw new Error(`Enclave rejected predecessor proof: ${result.error ?? "unknown"}`);
    }
    const data = result.data as { counter: string; epochId: string; chains: number };
    console.log(`[parent] enclave initialized: epochId=${data.epochId} chains=${data.chains}`);
  } else {
    // No previous proofs on disk — explicit genesis.
    console.log(`[parent] no previous proofs found — requesting genesis epoch`);
    const result = await enclaveClient.send({
      type: "init",
      allowGenesis: true,
    });
    if (!result.ok) {
      throw new Error(`Enclave rejected genesis start: ${result.error ?? "unknown"}`);
    }
    const data = result.data as { counter: string; epochId: string };
    console.log(`[parent] enclave initialized as GENESIS: epochId=${data.epochId}`);
  }
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    ...CORS_HEADERS,
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message });
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleCommit(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // API key check
  if (!checkApiKey(req)) {
    sendError(res, 401, "Unauthorized: valid API key required (Authorization: Bearer <key>)");
    return;
  }

  const contentType = req.headers["content-type"] ?? "";
  if (!contentType.includes("application/json")) {
    sendError(res, 400, "POST /commit requires Content-Type: application/json");
    return;
  }

  const raw = await readBody(req);
  let body: {
    digests: Array<{ digestB64: string; hashAlg: "sha256" }>;
    metadata?: Record<string, unknown>;
    prevProofId?: string;
    agency?: AgencyEnvelope;
    attribution?: { name?: string; title?: string; message?: string };
    policy?: PolicyBinding;
    chainId?: string;
  };

  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    sendError(res, 400, "Invalid JSON body");
    return;
  }

  if (!Array.isArray(body.digests) || body.digests.length === 0) {
    sendError(res, 400, "body.digests must be a non-empty array");
    return;
  }

  for (const d of body.digests) {
    if (typeof d.digestB64 !== "string" || d.hashAlg !== "sha256") {
      sendError(res, 400, "each digest must have { digestB64: string, hashAlg: 'sha256' }");
      return;
    }
  }

  // OCC 2-RTT protocol: one slot → one artifact → one proof
  // For each digest, allocate a slot then commit with the slotId.
  // The parent handles the round-trips so clients keep a single POST /commit API.
  //
  // Agency (passkey/WebAuthn) with batch support:
  //   - The client's agency envelope includes batchContext with all digests.
  //   - We pass agency to EVERY commitDigest call (with updated batchIndex).
  //   - The enclave validates the challenge + P-256 signature on digest #0,
  //     stores the validated batch, then looks it up for digests #1..N.
  //   - All proofs get actor identity in their Ed25519-signed body.
  //
  // Enclave commits are sequential (monotonic counter), but TSA timestamps
  // are parallelized afterward to minimize latency on batch requests.
  const proofs: OCCProof[] = [];
  const isBatch = body.digests.length > 1;

  for (let i = 0; i < body.digests.length; i++) {
    const d = body.digests[i]!;

    // Step 1: Allocate a causal slot (nonce-first) — pass chainId for isolation
    const slotResult = await enclaveClient.send({ type: "allocateSlot", chainId: body.chainId });
    if (!slotResult.ok || !slotResult.data) {
      sendError(res, 500, slotResult.error ?? "slot allocation failed");
      return;
    }
    const { slotId } = slotResult.data as { slotId: string };

    // Step 2: Commit the digest with the allocated slot
    // For batch commits with agency, update batchIndex for each digest.
    let agencyForDigest: AgencyEnvelope | undefined;
    if (body.agency) {
      if (isBatch && body.agency.batchContext) {
        agencyForDigest = {
          ...body.agency,
          batchContext: { ...body.agency.batchContext, batchIndex: i },
        };
      } else {
        agencyForDigest = i === 0 ? body.agency : undefined;
      }
    }

    const commitResult = await enclaveClient.send({
      type: "commitDigest",
      slotId,
      digestB64: d.digestB64,
      agency: agencyForDigest,
      attribution: body.attribution,
      policy: body.policy,
      metadata: body.metadata,
    });

    if (!commitResult.ok || !commitResult.data) {
      sendError(res, 500, commitResult.error ?? "commit failed");
      return;
    }

    const { proof } = commitResult.data as { proof: OCCProof };
    proofs.push(proof);
  }

  // Best-effort TSA timestamps — all in parallel to minimize latency
  await Promise.all(
    proofs.map(async (proof, i) => {
      const d = body.digests[i]!;
      const tsa = await requestTimestamp(d.digestB64).catch(() => null);
      if (tsa) {
        proof.timestamps = { artifact: tsa };
      }
    })
  );

  // Persist the last proof for epoch lineage (transport only — enclave verifies)
  const lastProof = proofs[proofs.length - 1];
  if (lastProof) {
    persistLastProof(lastProof, body.chainId);
  }

  // Fire-and-forget: index proofs in explorer database
  void indexProofs(proofs);

  sendJson(res, 200, proofs);
}

async function handleKey(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const keyInfo = await getKeyInfo();
    sendJson(res, 200, keyInfo);
  } catch (err) {
    sendError(res, 500, `Failed to get key info: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function handleVerify(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const contentType = req.headers["content-type"] ?? "";
  if (!contentType.includes("application/json")) {
    sendError(res, 400, "POST /verify requires Content-Type: application/json");
    return;
  }

  const raw = await readBody(req);
  let body: { proof: OCCProof; policy?: VerificationPolicy };
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    sendError(res, 400, "Invalid JSON body");
    return;
  }

  if (!body.proof) {
    sendError(res, 400, "body must have { proof: OCCProof, policy?: VerificationPolicy }");
    return;
  }

  const { verifySignatureOnly } = await import("./verify-helper.js");
  const result = await verifySignatureOnly(body.proof, body.policy);
  sendJson(res, 200, result);
}

async function handleChallenge(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Public endpoint — no API key required.
  // Issues a fresh enclave nonce for agency signing.
  try {
    const result = await enclaveClient.send({ type: "challenge" });
    if (!result.ok || !result.data) {
      sendError(res, 500, result.error ?? "challenge failed");
      return;
    }
    sendJson(res, 200, result.data);
  } catch (err) {
    sendError(res, 500, `Failed to get challenge: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function handleAllocateSlot(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Public endpoint — no API key required.
  // Pre-allocates a causal slot (nonce-first) for the OCC commit model.
  // Returns { slotId, slot } where slot is the signed SlotAllocation record.
  try {
    const result = await enclaveClient.send({ type: "allocateSlot" });
    if (!result.ok || !result.data) {
      sendError(res, 500, result.error ?? "allocateSlot failed");
      return;
    }
    sendJson(res, 200, result.data);
  } catch (err) {
    sendError(res, 500, `Failed to allocate slot: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function handleHealth(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  sendJson(res, 200, { ok: true });
}

async function handleConvertBW(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Public demo endpoint — no API key required
  const contentType = req.headers["content-type"] ?? "";
  if (!contentType.includes("application/json")) {
    sendError(res, 400, "POST /convert-bw requires Content-Type: application/json");
    return;
  }

  const raw = await readBody(req);

  // Guard against oversized payloads (2 MB max)
  if (raw.length > 2 * 1024 * 1024) {
    sendError(res, 413, "Image too large. Max 2 MB.");
    return;
  }

  let body: { imageB64: string };
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    sendError(res, 400, "Invalid JSON body");
    return;
  }

  if (typeof body.imageB64 !== "string" || body.imageB64.length === 0) {
    sendError(res, 400, "body.imageB64 must be a non-empty base64 string");
    return;
  }

  const enclaveResult = await enclaveClient.send({
    type: "convertBW",
    imageB64: body.imageB64,
  });

  if (!enclaveResult.ok || !enclaveResult.data) {
    sendError(res, 500, enclaveResult.error ?? "convertBW failed");
    return;
  }

  const result = enclaveResult.data as {
    imageB64: string;
    proof: OCCProof;
    digestB64: string;
  };

  // Attach TSA timestamp (best-effort)
  const tsa = await requestTimestamp(result.digestB64).catch(() => null);
  if (tsa && result.proof) {
    result.proof.timestamps = { artifact: tsa };
  }

  sendJson(res, 200, result);
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const method = req.method ?? "GET";

  try {
    if (method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    if (method === "POST" && url.pathname === "/commit") {
      await handleCommit(req, res);
    } else if (method === "POST" && url.pathname === "/allocate-slot") {
      await handleAllocateSlot(req, res);
    } else if (method === "POST" && url.pathname === "/challenge") {
      await handleChallenge(req, res);
    } else if (method === "POST" && url.pathname === "/convert-bw") {
      await handleConvertBW(req, res);
    } else if (method === "GET" && url.pathname === "/key") {
      await handleKey(req, res);
    } else if (method === "POST" && url.pathname === "/verify") {
      await handleVerify(req, res);
    } else if (method === "GET" && url.pathname === "/health") {
      await handleHealth(req, res);
    } else {
      sendError(res, 404, `${method} ${url.pathname} not found`);
    }
  } catch (err) {
    console.error("[parent] unhandled error:", err);
    sendError(res, 500, "internal server error");
  }
});

server.listen(PORT, async () => {
  console.log(`[parent] listening on http://localhost:${PORT}`);
  console.log(`  POST /commit         (Content-Type: application/json, Authorization: Bearer <key>)`);
  console.log(`  POST /allocate-slot  (public — pre-allocates causal slot)`);
  console.log(`  POST /challenge      (public — issues enclave nonce for agency signing)`);
  console.log(`  POST /convert-bw     (Content-Type: application/json — public demo)`);
  console.log(`  GET  /key`);
  console.log(`  POST /verify         (Content-Type: application/json)`);
  console.log(`  GET  /health`);

  // Initialize enclave with previous epoch's last proof for lineage
  try {
    await initEnclave();
  } catch (err) {
    console.error(`[parent] enclave init failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error(`[parent] enclave will start as genesis epoch`);
  }
});

export { server, PORT };
