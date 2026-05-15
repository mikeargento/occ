import { NextRequest, NextResponse } from "next/server";
import { storeProofByDigest } from "@/lib/s3";

const TEE_URL = "https://nitro.occproof.com";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const teeRes = await fetch(`${TEE_URL}/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!teeRes.ok) {
      const err = await teeRes.json().catch(() => ({ error: teeRes.statusText }));
      return NextResponse.json(err, { status: teeRes.status });
    }

    const teeData = await teeRes.json();
    const proofs = Array.isArray(teeData) ? teeData : [teeData];

    // Index proofs by digest in S3 (must await so lookups work immediately)
    await Promise.all(proofs.map(p => storeProofByDigest(p)));

    return NextResponse.json(teeData);
  } catch (e) {
    console.error("[api/commit] Error:", (e as Error).message);
    return NextResponse.json({ error: "Commit failed" }, { status: 500 });
  }
}
