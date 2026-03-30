/**
 * Ethereum Anchor Service
 *
 * Every 10 minutes, commits the latest Ethereum block hash to the OCC
 * proof chain via TEE. This creates an unpredictable external anchor —
 * everything in the OCC chain before this anchor provably existed
 * before that Ethereum block was mined.
 *
 * ~144 anchors/day. ~10 minute time windows.
 *
 * "The future is the strongest clock."
 */

import { sha256 } from "@noble/hashes/sha256";
import { db } from "./db.js";

const TEE_URL = "https://nitro.occproof.com";
// No chainId — all proofs go on the TEE's single default chain
let anchorIntervalMs = 10 * 60 * 1000; // 10 minutes default

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

interface EthBlock {
  hash: string;
  number: number;
  timestamp: number;
}

/**
 * Fetch the latest Ethereum block.
 * Uses public JSON-RPC endpoints — no API key needed.
 */
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

/**
 * Commit an Ethereum block hash to the OCC chain via TEE.
 */
async function commitAnchor(block: EthBlock): Promise<{ proof: unknown; digestB64: string } | null> {
  const hashBytes = sha256(new TextEncoder().encode(block.hash));
  const digestB64 = toBase64(hashBytes);

  const metadata = {
    type: "ethereum-anchor",
    anchor: {
      source: "ethereum",
      blockNumber: block.number,
      blockHash: block.hash,
      blockTime: block.timestamp,
      blockTimeISO: new Date(block.timestamp * 1000).toISOString(),
      verify: `https://etherscan.io/block/${block.number}`,
    },
  };

  try {
    const res = await fetch(`${TEE_URL}/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        digests: [{ digestB64, hashAlg: "sha256" }],
        metadata,
        attribution: {
          name: `Ethereum #${block.number}`,
          message: block.hash,
          title: `https://etherscan.io/block/${block.number}`,
        },
      }),
    });

    if (!res.ok) throw new Error(`TEE ${res.status}`);

    const data = await res.json();
    const proof = Array.isArray(data) ? data[0] : data.proofs?.[0] ?? data;

    // Store in local DB so it shows in signed-in explorer
    try {
      await db.addProof("system", {
        agentId: "system",
        tool: "ethereum-anchor",
        allowed: true,
        args: { anchor: metadata.anchor },
        reason: `Ethereum block #${block.number}`,
        proofDigest: proof?.artifact?.digestB64 ?? digestB64,
        receipt: proof,
      });
    } catch { /* non-critical */ }

    // Forward to public explorer
    try {
      await fetch("https://www.occ.wtf/api/proofs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proof }),
      });
    } catch { /* non-critical */ }

    return { proof, digestB64 };
  } catch (err) {
    console.error("[eth-anchor] TEE commit failed:", (err as Error).message);
    return null;
  }
}

/* ── State ── */

let lastAnchoredBlock = 0;
let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Check for a new Ethereum block and anchor it.
 */
async function checkAndAnchor(): Promise<void> {
  try {
    const block = await getLatestBlock();

    if (block.number <= lastAnchoredBlock) {
      return; // Already anchored a block at or after this height
    }

    console.log(`[eth-anchor] Block #${block.number} — anchoring...`);
    const result = await commitAnchor(block);

    if (result) {
      lastAnchoredBlock = block.number;
      console.log(`[eth-anchor] Anchored block #${block.number} → ${result.digestB64.slice(0, 20)}...`);
    }
  } catch (err) {
    console.error("[eth-anchor] Error:", (err as Error).message);
  }
}

/**
 * Start the Ethereum anchor service.
 */
export function startBitcoinAnchor(): void {
  console.log(`[eth-anchor] Starting — anchoring every ${anchorIntervalMs / 1000}s`);
  checkAndAnchor();
  intervalId = setInterval(checkAndAnchor, anchorIntervalMs);
}

/**
 * Stop the anchor service.
 */
export function stopBitcoinAnchor(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[eth-anchor] Stopped");
  }
}

/**
 * Change the anchor interval at runtime.
 * Restarts the interval timer immediately.
 * Minimum: 12 seconds (one Ethereum block).
 */
export function setAnchorInterval(seconds: number): { ok: boolean; intervalSeconds: number } {
  if (seconds < 12) throw new Error("Minimum interval is 12 seconds (one Ethereum block)");
  if (seconds > 86400) throw new Error("Maximum interval is 86400 seconds (24 hours)");
  anchorIntervalMs = seconds * 1000;
  // Restart the timer with new interval
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = setInterval(checkAndAnchor, anchorIntervalMs);
  }
  console.log(`[eth-anchor] Interval changed to ${seconds}s`);
  return { ok: true, intervalSeconds: seconds };
}

/**
 * Manually trigger an anchor.
 */
export async function manualAnchor(): Promise<{ block: EthBlock; proof: unknown; digestB64: string } | null> {
  const block = await getLatestBlock();
  const result = await commitAnchor(block);
  if (result) {
    lastAnchoredBlock = block.number;
    return { block, ...result };
  }
  return null;
}

/**
 * Get the current anchor status.
 */
export function getAnchorStatus(): { running: boolean; lastAnchoredBlock: number; source: string; intervalSeconds: number } {
  return {
    running: intervalId !== null,
    lastAnchoredBlock,
    source: "ethereum",
    intervalSeconds: anchorIntervalMs / 1000,
  };
}
