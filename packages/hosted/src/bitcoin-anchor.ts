/**
 * Bitcoin Anchor Service
 *
 * Periodically commits the latest Bitcoin block hash to the OCC proof chain.
 * This creates an unpredictable external anchor — everything in the chain
 * before this anchor provably existed before that Bitcoin block was mined.
 *
 * "The future is the strongest clock."
 */

import { sha256 } from "@noble/hashes/sha256";

const TEE_URL = "https://nitro.occproof.com";
const CHAIN_ID = "occ:bitcoin-anchors";

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

interface BitcoinBlock {
  hash: string;
  height: number;
  time: number;
}

/**
 * Fetch the latest Bitcoin block from mempool.space.
 * Falls back to blockstream.info if mempool is down.
 */
async function getLatestBlock(): Promise<BitcoinBlock> {
  // Try mempool.space first (clean JSON API)
  try {
    const res = await fetch("https://mempool.space/api/blocks/tip/hash");
    if (res.ok) {
      const hash = (await res.text()).trim();
      // Get block details
      const detailRes = await fetch(`https://mempool.space/api/block/${hash}`);
      if (detailRes.ok) {
        const block = await detailRes.json() as { id: string; height: number; timestamp: number };
        return { hash: block.id, height: block.height, time: block.timestamp };
      }
    }
  } catch { /* fall through */ }

  // Fallback: blockstream.info
  try {
    const res = await fetch("https://blockstream.info/api/blocks/tip/hash");
    if (res.ok) {
      const hash = (await res.text()).trim();
      const detailRes = await fetch(`https://blockstream.info/api/block/${hash}`);
      if (detailRes.ok) {
        const block = await detailRes.json() as { id: string; height: number; timestamp: number };
        return { hash: block.id, height: block.height, time: block.timestamp };
      }
    }
  } catch { /* fall through */ }

  throw new Error("Could not fetch Bitcoin block from any source");
}

/**
 * Commit a Bitcoin block hash to the OCC chain via TEE.
 * The block hash becomes the artifact — the thing being proven.
 * The metadata carries the full anchor context.
 */
async function commitAnchor(block: BitcoinBlock): Promise<{ proof: unknown; digestB64: string } | null> {
  // The artifact is the SHA-256 of the Bitcoin block hash string
  const hashBytes = sha256(new TextEncoder().encode(block.hash));
  const digestB64 = toBase64(hashBytes);

  const metadata = {
    type: "bitcoin-anchor",
    anchor: {
      source: "bitcoin",
      blockHeight: block.height,
      blockHash: block.hash,
      blockTime: block.time,
      blockTimeISO: new Date(block.time * 1000).toISOString(),
      verify: `https://mempool.space/block/${block.hash}`,
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
      }),
    });

    if (!res.ok) throw new Error(`TEE ${res.status}`);

    const data = await res.json();
    const proof = Array.isArray(data) ? data[0] : data.proofs?.[0] ?? data;

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
    console.error("[bitcoin-anchor] TEE commit failed:", (err as Error).message);
    return null;
  }
}

/* ── State ── */

let lastAnchoredHeight = 0;
let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Check for a new Bitcoin block and anchor it if it's new.
 * Only anchors if the block height is greater than the last anchored height.
 */
async function checkAndAnchor(): Promise<void> {
  try {
    const block = await getLatestBlock();

    if (block.height <= lastAnchoredHeight) {
      return; // Already anchored this block
    }

    console.log(`[bitcoin-anchor] New block #${block.height} — anchoring...`);
    const result = await commitAnchor(block);

    if (result) {
      lastAnchoredHeight = block.height;
      console.log(`[bitcoin-anchor] Anchored block #${block.height} → ${result.digestB64.slice(0, 20)}...`);
    }
  } catch (err) {
    console.error("[bitcoin-anchor] Error:", (err as Error).message);
  }
}

/**
 * Start the Bitcoin anchor service.
 * Checks every 2 minutes for new blocks (~10 min per Bitcoin block).
 * Anchors every new block it finds.
 */
export function startBitcoinAnchor(): void {
  console.log("[bitcoin-anchor] Starting — anchoring every new Bitcoin block");

  // Run immediately on start
  checkAndAnchor();

  // Then check every 2 minutes
  intervalId = setInterval(checkAndAnchor, 2 * 60 * 1000);
}

/**
 * Stop the anchor service.
 */
export function stopBitcoinAnchor(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[bitcoin-anchor] Stopped");
  }
}

/**
 * Manually trigger an anchor (for API endpoint).
 */
export async function manualAnchor(): Promise<{ block: BitcoinBlock; proof: unknown; digestB64: string } | null> {
  const block = await getLatestBlock();
  const result = await commitAnchor(block);
  if (result) {
    lastAnchoredHeight = block.height;
    return { block, ...result };
  }
  return null;
}

/**
 * Get the current anchor status.
 */
export function getAnchorStatus(): { running: boolean; lastAnchoredHeight: number } {
  return { running: intervalId !== null, lastAnchoredHeight };
}
