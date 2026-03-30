import { NextRequest, NextResponse } from "next/server";
import { insertProofs } from "@/lib/db";

const TEE_URL = "https://nitro.occproof.com";

export const dynamic = "force-dynamic";

/**
 * Server-side proxy for TEE commits.
 * Browser sends the commit request here instead of directly to the TEE.
 * This route:
 * 1. Forwards to the TEE
 * 2. Indexes the resulting proof in the explorer DB
 * 3. Returns the proof to the browser
 *
 * This guarantees indexing works regardless of browser CORS/fetch issues.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Forward to TEE
    const teeRes = await fetch(`${TEE_URL}/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!teeRes.ok) {
      const err = await teeRes.json().catch(() => ({ error: teeRes.statusText }));
      return NextResponse.json(err, { status: teeRes.status });
    }

    const teeData = await teeRes.json();
    const proofs = Array.isArray(teeData) ? teeData : [teeData];

    // Index all proofs in the explorer DB
    try {
      await insertProofs(proofs);
    } catch (e) {
      console.error("[api/commit] Index failed:", (e as Error).message);
      // Non-critical — proof is still valid
    }

    // Return the original TEE response to the browser
    return NextResponse.json(teeData);
  } catch (e) {
    console.error("[api/commit] Error:", (e as Error).message);
    return NextResponse.json({ error: "Commit failed" }, { status: 500 });
  }
}
