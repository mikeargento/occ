import { NextRequest, NextResponse } from "next/server";
import { searchProofs } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const query = req.nextUrl.searchParams.get("q")?.trim();

    if (!query || query.length < 2) {
      return NextResponse.json({ error: "Query must be at least 2 characters" }, { status: 400 });
    }

    const results = await searchProofs(query);
    return NextResponse.json({ proofs: results });
  } catch (e) {
    console.error("GET /api/proofs/search error:", e);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
