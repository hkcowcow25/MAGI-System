import { NextRequest } from "next/server";
import { requireBearer } from "@/lib/auth/bearer";
import { jsonUtf8 } from "@/lib/api/json";
import { MAGI_MODEL_IDS } from "@/lib/decision/engine";

/** List available MAGI models. Requires Bearer; no LLM calls. */
export async function GET(req: NextRequest) {
  const denied = requireBearer(req);
  if (denied) return denied;

  const created = Math.floor(Date.now() / 1000);
  return jsonUtf8({
    object: "list",
    data: MAGI_MODEL_IDS.map((id) => ({
      id,
      object: "model",
      created,
      owned_by: "magi-system",
    })),
  });
}
