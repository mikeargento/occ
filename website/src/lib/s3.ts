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
 * Get the first ETH anchor proof(s) AFTER a given proof on the same chain.
 *
 * Since anchors and user proofs share the same monotonic counter chain,
 * we find the next anchor by listing proofs with counter > proof.counter
 * in the same epoch, then filtering for Ethereum anchors (attribution.name).
 */
export async function getAnchorsAfterProof(digestB64: string, limit = 2): Promise<Array<Record<string, unknown>>> {
  try {
    const s3 = getClient();
    const bucket = getBucket();

    // Get the proof to find its counter and epoch
    const proof = await getProofByDigest(digestB64);
    if (!proof) return [];

    const commit = proof.commit as { counter?: string; epochId?: string };
    const proofCounter = parseInt(commit.counter || "0", 10);
    const epochId = commit.epochId || "";
    if (!epochId) return [];

    const safeEpoch = toSafe(epochId);
    const startCounter = String(proofCounter + 1).padStart(12, "0");

    // List proofs in the same epoch after this counter
    // Scan up to 20 proofs to find anchors (at 12s intervals, anchors are dense)
    const result = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: `proofs/${safeEpoch}/`,
      StartAfter: `proofs/${safeEpoch}/${startCounter}`,
      MaxKeys: 20,
    }));

    const anchors: Array<Record<string, unknown>> = [];
    for (const obj of result.Contents || []) {
      if (!obj.Key || anchors.length >= limit) break;
      try {
        const getResult = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: obj.Key }));
        const body = await getResult.Body?.transformToString();
        if (!body) continue;
        const p = JSON.parse(body);
        // Ethereum anchors have attribution.name === "Ethereum Anchor"
        const attr = p.attribution as { name?: string } | undefined;
        if (attr?.name === "Ethereum Anchor") {
          anchors.push(p);
        }
      } catch { /* skip */ }
    }
    return anchors;
  } catch (err) {
    console.error("[s3] getAnchorsAfterProof failed:", (err as Error).message);
    return [];
  }
}
