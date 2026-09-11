import { jsonUtf8 } from "@/lib/api/json";

/** Liveness probe - no LLM calls. */
export async function GET() {
  return jsonUtf8(
    {
      status: "ok",
      service: "magi-system",
      ts: new Date().toISOString(),
    },
    { status: 200 },
  );
}
