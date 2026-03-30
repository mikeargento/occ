import { NextRequest, NextResponse } from "next/server";
import { getProofsByDigest } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ digest: string }> }) {
  try {
    const { digest } = await params;
    const proofs = await getProofsByDigest(decodeURIComponent(digest));
    return NextResponse.json({ proofs });
  } catch (e) {
    console.error("GET /api/proofs/digest error:", e);
    return NextResponse.json({ error: "Failed to fetch proof" }, { status: 500 });
  }
}
