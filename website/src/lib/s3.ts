/**
 * S3-based proof storage — replaces Neon Postgres.
 *
 * Keys:
 *   by-digest/{urlSafeDigest}.json  — lookup by artifact hash
 *   anchors-by-time/{timestamp}.json — chronological anchor listing
 */

import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

function getClient() {
  return new S3Client({ region: (process.env.LEDGER_REGION || "us-east-2").trim() });
}

function getBucket() {
  return (process.env.LEDGER_BUCKET || "occ-ledger-prod").trim();
}

function toSafe(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Look up a proof by artifact digest */
export async function getProofByDigest(digestB64: string): Promise<Record<string, unknown> | null> {
  try {
    const s3 = getClient();
    const key = `by-digest/${toSafe(digestB64)}.json`;
    const result = await s3.send(new GetObjectCommand({ Bucket: getBucket(), Key: key }));
    const body = await result.Body?.transformToString();
    if (!body) return null;
    return JSON.parse(body);
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === "NoSuchKey" || name === "NotFound") return null;
    console.error("[s3] getProofByDigest failed:", name, (err as Error).message);
    return null;
  }
}

/** Store a proof indexed by artifact digest */
export async function storeProofByDigest(proof: Record<string, unknown>): Promise<void> {
  try {
    const s3 = getClient();
    const artifact = proof.artifact as { digestB64: string };
    const key = `by-digest/${toSafe(artifact.digestB64)}.json`;
    await s3.send(new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: JSON.stringify(proof, null, 2),
      ContentType: "application/json",
    }));
  } catch (err) {
    console.error("[s3] storeProofByDigest failed:", (err as Error).message);
  }
}

/**
 * Get the first ETH anchor proof(s) AFTER a given counter on the same chain.
 *
 * Since anchors and user proofs share the same monotonic counter chain,
 * we find the next anchor by scanning proofs with counter > proofCounter
 * in the same epoch, filtering for Ethereum anchors (attribution.name).
 */
/**
 * Get proofs around a given counter in the same epoch.
 * Returns up to `before` proofs before and `after` proofs after the counter,
 * plus the proof at the counter itself.
 */
export async function getProofsAroundCounter(
  epochId: string,
  counter: number,
  before = 3,
  after = 3,
): Promise<Array<Record<string, unknown>>> {
  try {
    const s3 = getClient();
    const bucket = getBucket();
    const safeEpoch = toSafe(epochId);
    const prefix = `proofs/${safeEpoch}/`;

    // Fetch proofs BEFORE (and including) the current counter
    // We list from the start and collect keys up to our counter
    const targetKey = String(counter).padStart(12, "0");
    const beforeProofs: Array<Record<string, unknown>> = [];

    // To get proofs before, we list with prefix and collect those <= counter
    // Start scanning from a few before our target
    const scanStart = Math.max(1, counter - before - 1);
    const scanStartKey = `${prefix}${String(scanStart).padStart(12, "0")}`;

    const beforeResult = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      StartAfter: scanStartKey,
      MaxKeys: before + after + 5, // extra buffer
    }));

    const allKeys = (beforeResult.Contents || []).map(o => o.Key!).filter(Boolean);

    // Split into before, current, and after based on counter in key
    const beforeKeys: string[] = [];
    let currentKey: string | null = null;
    const afterKeys: string[] = [];

    for (const key of allKeys) {
      const filename = key.split("/").pop() || "";
      const keyCounter = parseInt(filename.split("-")[0], 10);
      if (isNaN(keyCounter)) continue;
      if (keyCounter < counter) beforeKeys.push(key);
      else if (keyCounter === counter) currentKey = key;
      else if (keyCounter > counter) afterKeys.push(key);
    }

    // Trim to requested sizes
    const selectedKeys = [
      ...beforeKeys.slice(-before),
      ...(currentKey ? [currentKey] : []),
      ...afterKeys.slice(0, after),
    ];

    // Fetch all proofs in parallel
    const proofs = await Promise.all(
      selectedKeys.map(async (key) => {
        try {
          const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
          const body = await result.Body?.transformToString();
          if (!body) return null;
          return JSON.parse(body) as Record<string, unknown>;
        } catch { return null; }
      })
    );

    return proofs.filter((p): p is Record<string, unknown> => p !== null);
  } catch (err) {
    console.error("[s3] getProofsAroundCounter failed:", (err as Error).message);
    return [];
  }
}

/**
 * Get the most recent ETH anchor BEFORE a given counter on the same chain.
 * Scans backwards from the counter to find the latest anchor.
 */
export async function getAnchorBeforeCounter(proofCounter: number, epochId: string): Promise<Record<string, unknown> | null> {
  try {
    const s3 = getClient();
    const bucket = getBucket();
    const safeEpoch = toSafe(epochId);
    const prefix = `proofs/${safeEpoch}/`;

    // List keys before this counter — we need to scan backwards
    // S3 only lists forward, so list from start up to our counter and take the tail
    const endKey = String(proofCounter).padStart(12, "0");

    // List last 30 keys before this counter
    const result = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: 1000,
    }));

    const allKeys = (result.Contents || [])
      .map(o => o.Key!)
      .filter(k => {
        if (!k) return false;
        const filename = k.split("/").pop() || "";
        const c = parseInt(filename.split("-")[0], 10);
        return !isNaN(c) && c < proofCounter;
      });

    // Scan from the end (most recent first) to find the last anchor
    const keysToCheck = allKeys.slice(-30).reverse();
    for (const key of keysToCheck) {
      try {
        const getResult = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const body = await getResult.Body?.transformToString();
        if (!body) continue;
        const p = JSON.parse(body);
        const attr = p.attribution as { name?: string } | undefined;
        if (attr?.name === "Ethereum Anchor") return p;
      } catch { /* skip */ }
    }
    return null;
  } catch (err) {
    console.error("[s3] getAnchorBeforeCounter failed:", (err as Error).message);
    return null;
  }
}

export async function getAnchorsAfterCounter(proofCounter: number, epochId: string, limit = 2): Promise<Array<Record<string, unknown>>> {
  try {
    const s3 = getClient();
    const bucket = getBucket();

    const safeEpoch = toSafe(epochId);
    const startCounter = String(proofCounter + 1).padStart(12, "0");

    // Scan anchors/{epoch}/ — counter-indexed, only contains anchors.
    // One S3 LIST + one GET per anchor found. No user proofs to skip.
    // Falls back to proofs/ scan if anchors/ index isn't populated yet.
    const anchorPrefix = `anchors/${safeEpoch}/`;
    let result = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: anchorPrefix,
      StartAfter: `${anchorPrefix}${startCounter}`,
      MaxKeys: limit,
    }));

    let keys = (result.Contents || []).map(o => o.Key!).filter(Boolean);

    // Fallback: if anchors/ index is empty, scan proofs/ (slower but works)
    if (keys.length === 0) {
      const proofPrefix = `proofs/${safeEpoch}/`;
      let continuationToken: string | undefined;
      const foundAnchors: Array<Record<string, unknown>> = [];
      for (let page = 0; page < 5 && foundAnchors.length < limit; page++) {
        const r = await s3.send(new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: proofPrefix,
          StartAfter: page === 0 ? `${proofPrefix}${startCounter}` : undefined,
          ContinuationToken: continuationToken,
          MaxKeys: 100,
        }));
        for (const obj of r.Contents || []) {
          if (!obj.Key || foundAnchors.length >= limit) break;
          try {
            const gr = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: obj.Key }));
            const body = await gr.Body?.transformToString();
            if (!body) continue;
            const p = JSON.parse(body);
            if ((p.attribution as { name?: string })?.name === "Ethereum Anchor") foundAnchors.push(p);
          } catch { /* skip */ }
        }
        if (!r.IsTruncated) break;
        continuationToken = r.NextContinuationToken;
      }
      return foundAnchors;
    }

    // Fetch from anchors/ index
    const anchors: Array<Record<string, unknown>> = [];
    for (const key of keys.slice(0, limit)) {
      try {
        const getResult = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const body = await getResult.Body?.transformToString();
        if (!body) continue;
        anchors.push(JSON.parse(body));
      } catch { /* skip */ }
    }
    return anchors;
  } catch (err) {
    console.error("[s3] getAnchorsAfterCounter failed:", (err as Error).message);
    return [];
  }
}
