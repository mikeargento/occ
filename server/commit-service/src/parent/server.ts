// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * Parent EC2 instance — HTTPS API server
 *
 * Endpoints:
 *   POST /commit  — { digests: [{ digestB64, hashAlg }], metadata? }  (requires API key)
 *   GET  /key     — { publicKeyB64, measurement, enforcement }
 *   POST /verify  — { proof, policy? }
 *   GET  /health  — { ok: true }
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { verify } from "occproof";
import type { OCCProof, VerificationPolicy } from "occproof";
import { VsockClient, type EnclaveClient } from "./vsock-client.js";
import { requestTimestamp } from "./tsa-client.js";

const PORT = Number(
  process.argv.find((a) => a.startsWith("--port="))?.split("=")[1]
    ?? process.env["PORT"]
    ?? 443
);

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

  const [enclaveResult, tsaResults] = await Promise.all([
    enclaveClient.send({
      type: "commit",
      digests: body.digests,
      metadata: body.metadata,
      prevProofId: body.prevProofId,
    }),
    Promise.all(
      body.digests.map((d) => requestTimestamp(d.digestB64).catch(() => null))
    ),
  ]);

  if (!enclaveResult.ok) {
    sendError(res, 500, enclaveResult.error ?? "commit failed");
    return;
  }

  const proofs = enclaveResult.data as OCCProof[];
  if (Array.isArray(proofs)) {
    for (let i = 0; i < proofs.length; i++) {
      const tsa = tsaResults[i];
      if (tsa && proofs[i]) {
        proofs[i]!.metadata = { ...proofs[i]!.metadata, tsa };
      }
    }
  }

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

  const { verifySignatureOnly } = await import("../mock/verify-helper.js");
  const result = await verifySignatureOnly(body.proof, body.policy);
  sendJson(res, 200, result);
}

async function handleHealth(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  sendJson(res, 200, { ok: true });
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

server.listen(PORT, () => {
  console.log(`[parent] listening on http://localhost:${PORT}`);
  console.log(`  POST /commit  (Content-Type: application/json, Authorization: Bearer <key>)`);
  console.log(`  GET  /key`);
  console.log(`  POST /verify  (Content-Type: application/json)`);
  console.log(`  GET  /health`);
});

export { server, PORT };
