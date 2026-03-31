import { NextResponse } from "next/server";
import { resetProofs } from "@/lib/db";

export async function DELETE() {
  const result = await resetProofs();
  return NextResponse.json(result);
}

export async function POST() {
  const result = await resetProofs();
  return NextResponse.json(result);
}
