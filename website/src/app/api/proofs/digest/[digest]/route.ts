import { NextRequest, NextResponse } from "next/server";
import { getProofByDigest, getAnchorsAfterCounter } from "@/lib/s3";
import { fromUrlSafeB64 } from "@/lib/explorer";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ digest: string }> }) {
  try {
    const { digest } = await params;
    const standardB64 = fromUrlSafeB64(decodeURIComponent(digest));
    const proof = await getProofByDigest(standardB64);
    if (!proof) {
      return NextResponse.json({ proofs: [] });
    }

    // Build causal window from S3 anchors
    let causalWindow = null;
    try {
      const commit = proof.commit as { counter?: string; epochId?: string };
      if (commit?.counter && commit?.epochId) {
        const counter = parseInt(commit.counter, 10);
        const anchors = await getAnchorsAfterCounter(counter, commit.epochId, 1);
        if (anchors.length > 0) {
          const anchor = anchors[0];
          const anchorCommit = anchor.commit as { counter?: string } | undefined;
          const anchorAttr = anchor.attribution as { name?: string; title?: string; message?: string } | undefined;
          const blockNumber = anchorAttr?.title?.match(/\/block\/(\d+)/)?.[1];
          causalWindow = {
            anchorBefore: null,
            anchorAfter: {
              counter: anchorCommit?.counter || "?",
              attrName: anchorAttr?.name || "Ethereum Anchor",
              blockNumber: blockNumber ? parseInt(blockNumber, 10) : null,
              blockHash: anchorAttr?.message || null,
              etherscanUrl: anchorAttr?.title || null,
            },
          };
        }
      }
    } catch (_) { /* non-critical */ }

    return NextResponse.json({ proofs: [{ proof }], causalWindow });
  } catch (e) {
    console.error("GET /api/proofs/digest error:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
