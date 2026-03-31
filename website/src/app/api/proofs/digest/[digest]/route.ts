import { NextRequest, NextResponse } from "next/server";
import { getProofsByDigest, getCausalWindow } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ digest: string }> }) {
  try {
    const { digest } = await params;
    const proofs = await getProofsByDigest(decodeURIComponent(digest));

    // Fetch causal window for the first proof (most recent)
    let causalWindow = null;
    if (proofs.length > 0) {
      const p = proofs[0].proof;
      const epochId = p.commit.epochId;
      const counter = p.commit.counter;
      if (epochId && counter) {
        causalWindow = await getCausalWindow(epochId, counter);
      }
    }

    return NextResponse.json({ proofs, causalWindow });
  } catch (e) {
    console.error("GET /api/proofs/digest error:", e);
    return NextResponse.json({ error: "Failed to fetch proof" }, { status: 500 });
  }
}
