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
const CHAIN_ID = "occ:ethereum-anchors";
const ANCHOR_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

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
        chainId: CHAIN_ID,
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
 * Anchors every 10 minutes (~144 anchors/day).
 */
export function startBitcoinAnchor(): void {
  console.log(`[eth-anchor] Starting — anchoring every ${ANCHOR_INTERVAL_MS / 60000} minutes`);
  checkAndAnchor();
  intervalId = setInterval(checkAndAnchor, ANCHOR_INTERVAL_MS);
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
export function getAnchorStatus(): { running: boolean; lastAnchoredBlock: number; source: string; intervalMinutes: number } {
  return {
    running: intervalId !== null,
    lastAnchoredBlock,
    source: "ethereum",
    intervalMinutes: ANCHOR_INTERVAL_MS / 60000,
  };
}
