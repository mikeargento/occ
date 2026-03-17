import { NextRequest, NextResponse } from "next/server";
import { getProofsByDigest } from "@/lib/db";
import { fromUrlSafeB64 } from "@/lib/explorer";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ digest: string }> }
) {
  try {
    const { digest } = await params;
    const digestB64 = fromUrlSafeB64(decodeURIComponent(digest));
    const results = await getProofsByDigest(digestB64);

    if (results.length === 0) {
      return NextResponse.json({ error: "No proofs found for this digest" }, { status: 404 });
    }

    return NextResponse.json({ proofs: results });
  } catch (e) {
    console.error("GET /api/proofs/[digest] error:", e);
    return NextResponse.json({ error: "Failed to lookup proof" }, { status: 500 });
  }
}
