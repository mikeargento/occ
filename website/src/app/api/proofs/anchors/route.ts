import { NextRequest, NextResponse } from "next/server";
import { getAnchorsAfterProof } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const digest = req.nextUrl.searchParams.get("digest");
    if (!digest) return NextResponse.json({ error: "digest param required" }, { status: 400 });
    const anchors = await getAnchorsAfterProof(digest);
    return NextResponse.json({ anchors });
  } catch (e) {
    console.error("GET /api/proofs/anchors error:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
