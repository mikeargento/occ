import { NextRequest, NextResponse } from "next/server";
import { insertProofs, listProofs, resetProofs } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl;
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));

    const result = await listProofs(page, limit);
    return NextResponse.json(result);
  } catch (e) {
    console.error("GET /api/proofs error:", e);
    return NextResponse.json({ error: "Failed to list proofs" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await resetProofs();
    return NextResponse.json({ ok: true, message: "All proofs cleared" });
  } catch (e) {
    console.error("DELETE /api/proofs error:", e);
    return NextResponse.json({ error: "Failed to clear proofs" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const proofs = Array.isArray(body.proofs) ? body.proofs : body.proof ? [body.proof] : [];

    if (proofs.length === 0) {
      return NextResponse.json({ error: "No proofs provided" }, { status: 400 });
    }

    if (proofs.length > 100) {
      return NextResponse.json({ error: "Max 100 proofs per request" }, { status: 400 });
    }

    // Basic validation — must have required fields
    for (const p of proofs) {
      if (!p?.version || !p?.artifact?.digestB64 || !p?.signer?.publicKeyB64 || !p?.environment?.enforcement) {
        return NextResponse.json({ error: "Invalid proof: missing required fields" }, { status: 400 });
      }
    }

    const result = await insertProofs(proofs);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("POST /api/proofs error:", e);
    return NextResponse.json({ error: "Failed to index proofs" }, { status: 500 });
  }
}
