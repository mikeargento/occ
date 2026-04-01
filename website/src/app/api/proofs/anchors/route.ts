import { NextRequest, NextResponse } from "next/server";
import { getAnchorsAfterProof } from "@/lib/s3";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const digest = req.nextUrl.searchParams.get("digest");
    if (!digest) return NextResponse.json({ error: "digest param required" }, { status: 400 });

    // Get the first 2 ETH anchors after this proof was created
    const anchors = await getAnchorsAfterProof(digest, 2);
    return NextResponse.json({ anchors });
  } catch (e) {
    console.error("GET /api/proofs/anchors error:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
