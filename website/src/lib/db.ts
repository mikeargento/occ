import { neon } from "@neondatabase/serverless";
import type { OCCProof } from "./occ";

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  return neon(url);
}

/* ── Insert ── */

export async function insertProofs(proofs: OCCProof[]) {
  const sql = getDb();
  let indexed = 0;

  for (const proof of proofs) {
    const digestB64 = proof.artifact.digestB64;
    const counter = proof.commit.counter ?? null;
    const epochId = proof.commit.epochId ?? null;
    const commitTime = proof.commit.time ?? null;
    const enforcement = proof.environment.enforcement;
    const signerPub = proof.signer.publicKeyB64;
    const hasAgency = !!proof.agency;
    const hasTsa = !!proof.timestamps;
    const attrName = proof.attribution?.name ?? null;
    const proofJson = JSON.stringify(proof);

    try {
      await sql`INSERT INTO proofs (digest_b64, counter, epoch_id, commit_time, enforcement, signer_pub, has_agency, has_tsa, attr_name, proof_json)
        VALUES (${digestB64}, ${counter}, ${epochId}, ${commitTime}, ${enforcement}, ${signerPub}, ${hasAgency}, ${hasTsa}, ${attrName}, ${proofJson}::jsonb)
        ON CONFLICT (signer_pub, counter) DO NOTHING`;
      indexed++;
    } catch {
      // skip individual failures
    }
  }

  return { indexed };
}

/* ── Query by artifact digest ── */

export async function getProofsByDigest(digestB64: string) {
  const sql = getDb();
  const rows = await sql`SELECT proof_json, indexed_at FROM proofs WHERE digest_b64 = ${digestB64} ORDER BY commit_time DESC`;
  return rows.map((r) => ({
    proof: r.proof_json as unknown as OCCProof,
    indexedAt: r.indexed_at as string,
  }));
}

/* ── Paginated list ── */

export async function listProofs(page = 1, limit = 20) {
  const sql = getDb();
  const offset = (page - 1) * limit;

  const [rows, countResult] = await Promise.all([
    sql`SELECT id, digest_b64, counter, commit_time, enforcement, signer_pub, has_agency, has_tsa, attr_name, indexed_at
      FROM proofs ORDER BY commit_time DESC NULLS LAST LIMIT ${limit} OFFSET ${offset}`,
    sql`SELECT COUNT(*) as total FROM proofs`,
  ]);

  return {
    proofs: rows.map((r) => ({
      id: r.id as number,
      digestB64: r.digest_b64 as string,
      counter: r.counter as string | null,
      commitTime: r.commit_time as number | null,
      enforcement: r.enforcement as string,
      signerPub: r.signer_pub as string,
      hasAgency: r.has_agency as boolean,
      hasTsa: r.has_tsa as boolean,
      attrName: r.attr_name as string | null,
      indexedAt: r.indexed_at as string,
    })),
    total: Number(countResult[0].total),
    page,
    limit,
  };
}

/* ── Search ── */

export async function searchProofs(query: string, limit = 20) {
  const sql = getDb();
  const pattern = `%${query}%`;

  const rows = await sql`SELECT id, digest_b64, counter, commit_time, enforcement, signer_pub, has_agency, has_tsa, attr_name, indexed_at
    FROM proofs
    WHERE digest_b64 ILIKE ${pattern} OR attr_name ILIKE ${pattern} OR signer_pub ILIKE ${pattern} OR counter = ${query}
    ORDER BY commit_time DESC NULLS LAST
    LIMIT ${limit}`;

  return rows.map((r) => ({
    id: r.id as number,
    digestB64: r.digest_b64 as string,
    counter: r.counter as string | null,
    commitTime: r.commit_time as number | null,
    enforcement: r.enforcement as string,
    signerPub: r.signer_pub as string,
    hasAgency: r.has_agency as boolean,
    hasTsa: r.has_tsa as boolean,
    attrName: r.attr_name as string | null,
    indexedAt: r.indexed_at as string,
  }));
}
