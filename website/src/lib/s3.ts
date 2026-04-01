/**
 * S3-based proof storage — replaces Neon Postgres.
 *
 * Keys:
 *   by-digest/{urlSafeDigest}.json  — lookup by artifact hash
 *   anchors-by-time/{timestamp}.json — chronological anchor listing
 */

import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command, HeadObjectCommand } from "@aws-sdk/client-s3";

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

/** Get the first N ETH anchor proofs after a given proof (by its creation time in S3) */
export async function getAnchorsAfterProof(digestB64: string, limit = 2): Promise<Array<Record<string, unknown>>> {
  try {
    const s3 = getClient();
    const bucket = getBucket();

    // Get the proof's S3 object creation time
    const proofKey = `by-digest/${toSafe(digestB64)}.json`;
    let proofTime: string;
    try {
      const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: proofKey }));
      proofTime = (head.LastModified || new Date()).toISOString().replace(/[:.]/g, "-");
    } catch {
      // Fallback: use 1 hour ago
      proofTime = new Date(Date.now() - 3600000).toISOString().replace(/[:.]/g, "-");
    }

    // List anchors-by-time/ after the proof was created
    const result = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: "anchors-by-time/",
      StartAfter: `anchors-by-time/${proofTime}`,
      MaxKeys: limit,
    }));

    const anchors: Array<Record<string, unknown>> = [];
    for (const obj of result.Contents || []) {
      if (!obj.Key) continue;
      try {
        const getResult = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: obj.Key }));
        const body = await getResult.Body?.transformToString();
        if (body) anchors.push(JSON.parse(body));
      } catch { /* skip */ }
    }
    return anchors;
  } catch (err) {
    console.error("[s3] getAnchorsAfterProof failed:", (err as Error).message);
    return [];
  }
}
