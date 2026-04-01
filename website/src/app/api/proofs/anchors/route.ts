import { NextRequest, NextResponse } from "next/server";
import { getProofByDigest, getAnchorsAfter } from "@/lib/s3";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const digest = req.nextUrl.searchParams.get("digest");
    if (!digest) return NextResponse.json({ error: "digest param required" }, { status: 400 });

    // Find the proof to get its timestamp
    const proof = await getProofByDigest(digest);
    if (!proof) return NextResponse.json({ anchors: [] });

    // Get all ETH anchors after this proof's commit time
    // Use current time minus 24h as fallback
    const commitTime = (proof as Record<string, unknown>).commit as Record<string, unknown>;
    const proofTime = commitTime?.time ? new Date(Number(commitTime.time)).toISOString() : new Date(Date.now() - 86400000).toISOString();

    const anchors = await getAnchorsAfter(proofTime);
    return NextResponse.json({ anchors });
  } catch (e) {
    console.error("GET /api/proofs/anchors error:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
