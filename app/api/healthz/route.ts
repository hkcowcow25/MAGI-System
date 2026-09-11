import { NextResponse } from "next/server";

/** Liveness probe — no LLM calls. */
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "magi-system",
      ts: new Date().toISOString(),
    },
    { status: 200 },
  );
}
