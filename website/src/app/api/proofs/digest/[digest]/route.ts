import { NextRequest, NextResponse } from "next/server";
import { getProofsByDigest, getCausalWindow } from "@/lib/db";
import { fromUrlSafeB64 } from "@/lib/explorer";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ digest: string }> }) {
  try {
    const { digest } = await params;
    // Convert URL-safe base64 back to standard base64 for DB lookup
    const standardB64 = fromUrlSafeB64(decodeURIComponent(digest));
    const proofs = await getProofsByDigest(standardB64);

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
