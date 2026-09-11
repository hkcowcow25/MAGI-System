import { NextRequest, NextResponse } from "next/server";
import { requireBearer } from "@/lib/auth/bearer";

/** List available MAGI models. Requires Bearer; no LLM calls. */
export async function GET(req: NextRequest) {
  const denied = requireBearer(req);
  if (denied) return denied;

  const created = Math.floor(Date.now() / 1000);
  return NextResponse.json({
    object: "list",
    data: [
      {
        id: "magi-verdict",
        object: "model",
        created,
        owned_by: "magi-system",
      },
    ],
  });
}
