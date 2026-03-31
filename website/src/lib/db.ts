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

  // Idempotent migrations
  try { await sql`ALTER TABLE proofs ADD COLUMN IF NOT EXISTS chain_id TEXT`; } catch { }
  // Replace old unique-on-digest with unique-on-(digest+counter) — same file can be proven
  // multiple times (different counters) but the same proof can't be inserted twice
  try { await sql`DROP INDEX IF EXISTS proofs_digest_b64_unique`; } catch { }
  try { await sql`DROP INDEX IF EXISTS proofs_signer_pub_counter_key`; } catch { }
  try { await sql`ALTER TABLE proofs DROP CONSTRAINT IF EXISTS proofs_signer_pub_counter_key`; } catch { }
  try { await sql`CREATE UNIQUE INDEX IF NOT EXISTS proofs_digest_counter_unique ON proofs (digest_b64, counter)`; } catch { }
  // Clean up existing duplicates
  try { await sql`DELETE FROM proofs a USING proofs b WHERE a.id > b.id AND a.digest_b64 = b.digest_b64 AND a.counter = b.counter`; } catch { }

  for (const proof of proofs) {
    const digestB64 = proof.artifact.digestB64;
    const counter = proof.commit.counter ?? null;
    const epochId = proof.commit.epochId ?? null;
    const commitTime = proof.commit.time ?? null;
    const chainId = (proof.commit as Record<string, unknown>).chainId as string ?? null;
    const enforcement = proof.environment.enforcement;
    const signerPub = proof.signer.publicKeyB64;
    const hasAgency = !!proof.agency;
    const hasTsa = !!proof.timestamps;
    const attrName = proof.attribution?.name ?? null;
    const proofJson = JSON.stringify(proof);

    try {
      await sql`INSERT INTO proofs (digest_b64, counter, epoch_id, commit_time, enforcement, signer_pub, has_agency, has_tsa, attr_name, chain_id, proof_json)
        VALUES (${digestB64}, ${counter}, ${epochId}, ${commitTime}, ${enforcement}, ${signerPub}, ${hasAgency}, ${hasTsa}, ${attrName}, ${chainId}, ${proofJson}::jsonb)
        ON CONFLICT (digest_b64, counter) DO NOTHING`;
      indexed++;
    } catch (e1) {
      console.error("  insert proof (with chain_id) failed:", (e1 as Error).message, "digest:", digestB64?.slice(0, 20));
      try {
        await sql`INSERT INTO proofs (digest_b64, counter, epoch_id, commit_time, enforcement, signer_pub, has_agency, has_tsa, attr_name, proof_json)
          VALUES (${digestB64}, ${counter}, ${epochId}, ${commitTime}, ${enforcement}, ${signerPub}, ${hasAgency}, ${hasTsa}, ${attrName}, ${proofJson}::jsonb)
          ON CONFLICT (digest_b64, counter) DO NOTHING`;
        indexed++;
      } catch (e2) {
        console.error("  insert proof (fallback) also failed:", (e2 as Error).message);
      }
    }
  }

  return { indexed };
}

/* ── Query by artifact digest ── */

export async function getProofsByDigest(digestB64: string) {
  const sql = getDb();
  const rows = await sql`SELECT proof_json, indexed_at FROM proofs WHERE digest_b64 = ${digestB64} ORDER BY CAST(counter AS INTEGER) DESC`;
  return rows.map((r) => ({
    proof: canonicalizeProof(r.proof_json as unknown as OCCProof),
    indexedAt: r.indexed_at as string,
  }));
}

/** Reorder proof fields to canonical occ/1 order */
function canonicalizeProof(raw: OCCProof): OCCProof {
  return {
    version: raw.version,
    artifact: raw.artifact,
    commit: raw.commit,
    signer: raw.signer,
    environment: raw.environment,
    timestamps: raw.timestamps,
    agency: raw.agency,
    attribution: raw.attribution,
    slotAllocation: raw.slotAllocation,
    metadata: raw.metadata,
    claims: raw.claims,
    ...(raw as unknown as Record<string, unknown>), // extra fields at end
  };
}

/* ── Paginated list ── */

export async function listProofs(page = 1, limit = 20) {
  const sql = getDb();
  const offset = (page - 1) * limit;

  const [rows, countResult] = await Promise.all([
    sql`SELECT id, digest_b64, counter, commit_time, enforcement, signer_pub, has_agency, has_tsa, attr_name, indexed_at
      FROM proofs ORDER BY CAST(counter AS INTEGER) DESC NULLS LAST LIMIT ${limit} OFFSET ${offset}`,
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

/* ── Reset ── */

export async function resetProofs() {
  const sql = getDb();
  await sql`TRUNCATE TABLE proofs`;
  return { ok: true };
}

/* ── Search ── */

export async function searchProofs(query: string, limit = 20) {
  const sql = getDb();
  const pattern = `%${query}%`;

  const rows = await sql`SELECT id, digest_b64, counter, commit_time, enforcement, signer_pub, has_agency, has_tsa, attr_name, indexed_at
    FROM proofs
    WHERE digest_b64 ILIKE ${pattern} OR attr_name ILIKE ${pattern} OR signer_pub ILIKE ${pattern} OR counter = ${query}
    ORDER BY CAST(counter AS INTEGER) DESC NULLS LAST
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
