import { NextRequest, NextResponse } from "next/server";
import { getProofsAroundCounter } from "@/lib/s3";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const epoch = searchParams.get("epoch");
    const counterStr = searchParams.get("counter");
    const before = parseInt(searchParams.get("before") || "3", 10);
    const after = parseInt(searchParams.get("after") || "3", 10);

    if (!epoch || !counterStr) {
      return NextResponse.json({ error: "epoch and counter required" }, { status: 400 });
    }

    const counter = parseInt(counterStr, 10);
    if (isNaN(counter)) {
      return NextResponse.json({ error: "counter must be a number" }, { status: 400 });
    }

    const proofs = await getProofsAroundCounter(epoch, counter, before, after);
    return NextResponse.json({ proofs });
  } catch (e) {
    console.error("GET /api/proofs/chain error:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
