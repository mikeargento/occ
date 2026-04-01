/**
 * S3-based proof storage — replaces Neon Postgres.
 *
 * Reads/writes proofs to S3 using deterministic keys:
 *   by-digest/{urlSafeDigest}.json  — lookup by artifact hash
 *   anchors-by-time/{timestamp}.json — chronological anchor listing
 */

import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

function getClient() {
  return new S3Client({ region: process.env.LEDGER_REGION || "us-east-2" });
}

function getBucket() {
  return process.env.LEDGER_BUCKET || "occ-ledger-prod";
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
    if ((err as { name?: string }).name === "NoSuchKey") return null;
    console.error("[s3] getProofByDigest failed:", (err as Error).message);
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

/** Get all ETH anchor proofs after a given timestamp (ISO string) */
export async function getAnchorsAfter(afterTime: string): Promise<Array<Record<string, unknown>>> {
  try {
    const s3 = getClient();
    const bucket = getBucket();
    // List anchors-by-time/ objects after the given time
    // S3 keys are lexicographically sorted, and our timestamps are ISO format, so StartAfter works
    const safeTime = afterTime.replace(/[:.]/g, "-");
    const result = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: "anchors-by-time/",
      StartAfter: `anchors-by-time/${safeTime}`,
      MaxKeys: 100,
    }));

    const anchors: Array<Record<string, unknown>> = [];
    for (const obj of result.Contents || []) {
      if (!obj.Key) continue;
      try {
        const getResult = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: obj.Key }));
        const body = await getResult.Body?.transformToString();
        if (body) anchors.push(JSON.parse(body));
      } catch { /* skip individual failures */ }
    }
    return anchors;
  } catch (err) {
    console.error("[s3] getAnchorsAfter failed:", (err as Error).message);
    return [];
  }
}
