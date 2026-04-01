/**
 * Ethereum Anchor Service
 *
 * Commits the latest Ethereum block hash to the OCC proof chain via TEE.
 * The anchor proof is a NORMAL OCC proof on the SAME monotonic counter chain
 * as user proofs — same counter, same prevB64, same enclave key, same epoch.
 *
 * Because the Ethereum block hash is unpredictable and the anchor occurs
 * later in the same chain, it acts as a FUTURE CAUSAL BOUNDARY — everything
 * before this proof in the chain provably existed before the block was mined.
 *
 * Chain: User Proof → User Proof → ETH Anchor → User Proof → ETH Anchor
 *
 * "The future is the strongest clock."
 */

import { sha256 } from "@noble/hashes/sha256";

/* ── Canonical proof hash ── */

/**
 * Recursive key-sort canonicalization — matches the library's canonicalize().
 * Produces deterministic JSON with sorted keys at every nesting level.
 */
function canonicalize(obj: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalizeToString(obj));
}

function canonicalizeToString(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalizeToString).join(",") + "]";
  const sorted = Object.keys(obj as Record<string, unknown>).sort();
  const entries = sorted
    .filter((k) => (obj as Record<string, unknown>)[k] !== undefined)
    .map((k) => JSON.stringify(k) + ":" + canonicalizeToString((obj as Record<string, unknown>)[k]));
  return "{" + entries.join(",") + "}";
}

/**
 * Compute canonical proof hash: SHA-256(canonicalize(proof)) → Base64.
 * Covers the ENTIRE proof object (recursive key sort, compact JSON, UTF-8).
 */
function computeProofHash(proof: Record<string, unknown>): string {
  const bytes = canonicalize(proof);
  const hash = sha256(bytes);
  return Buffer.from(hash).toString("base64");
}

/* ── S3 persistence ── */

async function persistAnchor(
  proof: Record<string, unknown>,
  ethereum: { blockNumber: number; blockHash: string }
): Promise<void> {
  const bucket = process.env.LEDGER_BUCKET;
  if (!bucket) return;

  try {
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3" as string) as {
      S3Client: new (config: { region: string }) => { send: (cmd: unknown) => Promise<void> };
      PutObjectCommand: new (params: Record<string, unknown>) => unknown;
    };

    const s3 = new S3Client({ region: process.env.LEDGER_REGION || "us-east-2" });
    const commit = proof.commit as { counter: string; epochId: string };
    const proofHashB64 = computeProofHash(proof);

    const safeEpoch = commit.epochId.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const safeHash = proofHashB64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const counter = (commit.counter || "0").padStart(12, "0");
    const retention = new Date();
    retention.setDate(retention.getDate() + 3650);

    const stored = { ...proof, proofHashB64 };

    // Store proof (same format as user proofs)
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: `proofs/${safeEpoch}/${counter}-${safeHash}.json`,
      Body: JSON.stringify(stored, null, 2),
      ContentType: "application/json",
      ObjectLockMode: "COMPLIANCE",
      ObjectLockRetainUntilDate: retention,
    }));

    // By-digest index (artifact hash → proof)
    const artifact = proof.artifact as { digestB64: string };
    const safeDigest = artifact.digestB64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: `by-digest/${safeDigest}.json`,
      Body: JSON.stringify(stored, null, 2),
      ContentType: "application/json",
    }));

    // Anchor index (time-ordered for causal window queries)
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: `anchors-by-time/${ts}-${ethereum.blockNumber}.json`,
      Body: JSON.stringify({ ...stored, ethereum }, null, 2),
      ContentType: "application/json",
    }));

    console.log(`[ledger] anchor stored: block=${ethereum.blockNumber} counter=${commit.counter}`);
  } catch (err) {
    console.error("[ledger] persist anchor failed:", (err as Error).message);
  }
}

/* ── Ethereum RPC ── */

const TEE_URL = "https://nitro.occproof.com";
let anchorIntervalMs = 12 * 1000; // 12 seconds — every finalized Ethereum block

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

interface EthBlock {
  hash: string;
  number: number;
  timestamp: number;
}

async function getLatestBlock(): Promise<EthBlock> {
  const endpoints = [
    "https://ethereum-rpc.publicnode.com",
    "https://rpc.ankr.com/eth",
    "https://eth.llamarpc.com",
  ];

  for (const rpc of endpoints) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_getBlockByNumber",
          params: ["latest", false],
          id: 1,
        }),
      });

      if (!res.ok) continue;
      const data = await res.json() as { result?: { hash: string; number: string; timestamp: string } };
      if (!data.result?.hash) continue;

      return {
        hash: data.result.hash,
        number: parseInt(data.result.number, 16),
        timestamp: parseInt(data.result.timestamp, 16),
      };
    } catch { continue; }
  }

  throw new Error("Could not fetch Ethereum block from any RPC endpoint");
}

/* ── TEE commit ── */

/**
 * Commit an Ethereum block hash to the OCC chain via TEE.
 *
 * The anchor proof is a normal OCC proof where:
 * - artifact.digestB64 = SHA-256(blockHash) — the block hash IS the artifact
 * - attribution.name = "Ethereum Anchor" (signed, human-readable label)
 * - attribution.message = blockHash (signed, the actual anchor data)
 * - metadata = { type: "ethereum-anchor", ... } (unsigned, advisory)
 *
 * It shares the same counter, prevB64, epochId, and signing key as all
 * other proofs on this chain. It IS the chain.
 */
async function commitAnchor(block: EthBlock): Promise<{ proof: unknown; digestB64: string } | null> {
  const hashBytes = sha256(new TextEncoder().encode(block.hash));
  const digestB64 = toBase64(hashBytes);

  try {
    const res = await fetch(`${TEE_URL}/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        digests: [{ digestB64, hashAlg: "sha256" }],
        // Attribution is SIGNED — block data is tamper-evident
        attribution: {
          name: "Ethereum Anchor",
          message: block.hash,
          title: `https://etherscan.io/block/${block.number}`,
        },
        // Metadata is NOT signed — advisory only
        metadata: {
          type: "ethereum-anchor",
          anchor: {
            network: "mainnet",
            blockNumber: block.number,
            blockHash: block.hash,
            blockTime: block.timestamp,
            blockTimeISO: new Date(block.timestamp * 1000).toISOString(),
          },
        },
      }),
    });

    if (!res.ok) throw new Error(`TEE ${res.status}`);

    const data = await res.json();
    const proof = Array.isArray(data) ? data[0] : data.proofs?.[0] ?? data;

    // Persist to S3 (same chain, same format, just with anchor index too)
    void persistAnchor(proof, { blockNumber: block.number, blockHash: block.hash });

    return { proof, digestB64 };
  } catch (err) {
    console.error("[eth-anchor] TEE commit failed:", (err as Error).message);
    return null;
  }
}

/* ── State & scheduling ── */

let lastAnchoredBlock = 0;
let intervalId: ReturnType<typeof setInterval> | null = null;

async function checkAndAnchor(): Promise<void> {
  try {
    const block = await getLatestBlock();

    if (block.number <= lastAnchoredBlock) {
      return;
    }

    console.log(`[eth-anchor] Block #${block.number} — anchoring...`);
    const result = await commitAnchor(block);

    if (result) {
      lastAnchoredBlock = block.number;
      console.log(`[eth-anchor] Anchored block #${block.number} → counter on same chain`);
    }
  } catch (err) {
    console.error("[eth-anchor] check failed:", (err as Error).message);
  }
}

export async function manualAnchor(): Promise<{ block: EthBlock; proof: unknown; digestB64: string } | null> {
  const block = await getLatestBlock();
  const result = await commitAnchor(block);
  if (result) {
    lastAnchoredBlock = block.number;
    return { block, proof: result.proof, digestB64: result.digestB64 };
  }
  return null;
}

export function getAnchorStatus(): { running: boolean; lastAnchoredBlock: number; source: string; intervalSeconds: number } {
  return {
    running: intervalId !== null,
    lastAnchoredBlock,
    source: "ethereum",
    intervalSeconds: anchorIntervalMs / 1000,
  };
}

export function startAnchorService(intervalMs?: number): void {
  if (intervalMs) anchorIntervalMs = intervalMs;
  console.log(`[eth-anchor] Starting Ethereum anchor service (interval: ${anchorIntervalMs / 1000}s)`);

  // Run immediately, then on interval
  void checkAndAnchor();
  intervalId = setInterval(() => void checkAndAnchor(), anchorIntervalMs);
}

export function stopAnchorService(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[eth-anchor] Anchor service stopped");
  }
}

export function setAnchorInterval(seconds: number): { ok: boolean; intervalSeconds: number } {
  anchorIntervalMs = seconds * 1000;
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = setInterval(() => void checkAndAnchor(), anchorIntervalMs);
  }
  console.log(`[eth-anchor] Interval updated: ${seconds}s`);
  return { ok: true, intervalSeconds: seconds };
}

// Legacy aliases
export const startBitcoinAnchor = startAnchorService;
export const stopBitcoinAnchor = stopAnchorService;
