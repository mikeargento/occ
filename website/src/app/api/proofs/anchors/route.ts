import { NextRequest, NextResponse } from "next/server";
import { getAnchorsAfterCounter } from "@/lib/s3";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const counter = req.nextUrl.searchParams.get("counter");
    const epoch = req.nextUrl.searchParams.get("epoch");

    if (!counter || !epoch) {
      return NextResponse.json({ error: "counter and epoch params required" }, { status: 400 });
    }

    const anchors = await getAnchorsAfterCounter(parseInt(counter, 10), epoch, 2);
    return NextResponse.json({ anchors });
  } catch (e) {
    console.error("GET /api/proofs/anchors error:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
