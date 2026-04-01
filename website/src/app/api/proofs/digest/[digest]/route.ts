import { NextRequest, NextResponse } from "next/server";
import { getProofByDigest } from "@/lib/s3";
import { fromUrlSafeB64 } from "@/lib/explorer";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ digest: string }> }) {
  try {
    const { digest } = await params;
    const standardB64 = fromUrlSafeB64(decodeURIComponent(digest));
    const proof = await getProofByDigest(standardB64);
    if (proof) {
      return NextResponse.json({ proofs: [{ proof }] });
    }
    // Debug: log what we tried
    console.log("[api/proofs/digest] not found:", { digest, standardB64, bucket: process.env.LEDGER_BUCKET, region: process.env.LEDGER_REGION, hasKey: !!process.env.AWS_ACCESS_KEY_ID });
    return NextResponse.json({ proofs: [], debug: { digest, standardB64, bucket: process.env.LEDGER_BUCKET ? "set" : "unset", key: process.env.AWS_ACCESS_KEY_ID ? "set" : "unset" } });
  } catch (e) {
    console.error("GET /api/proofs/digest error:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
