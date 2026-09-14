import { NextRequest } from "next/server";
import { jsonUtf8 } from "@/lib/api/json";
import { requireBearer } from "@/lib/auth/bearer";
import {
  extractTopicFromMessages,
  MessageValidationError,
  type IncomingMessage,
} from "@/lib/api/messages";
import {
  formatEngineContent,
  isKnownMagiModel,
  modeFromModel,
  runMagiEngine,
} from "@/lib/decision/engine";

export const runtime = "nodejs";
export const maxDuration = 120;

function badRequest(message: string, code = "invalid_request_error") {
  return jsonUtf8(
    { error: { message, type: "invalid_request_error", code } },
    { status: 400 },
  );
}

export async function POST(req: NextRequest) {
  const denied = requireBearer(req);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  if (body.stream === true) {
    return badRequest(
      "stream=true is not supported; set stream=false",
      "stream_not_supported",
    );
  }

  const model = typeof body.model === "string" ? body.model : "magi-verdict";
  if (model && !isKnownMagiModel(model)) {
    return badRequest(
      `Unknown model '${model}'. Supported: magi-verdict, magi-council.`,
      "model_not_found",
    );
  }

  const mode = modeFromModel(model || "magi-verdict");

  try {
    const { topic } = extractTopicFromMessages(
      (body.messages as IncomingMessage[]) ?? [],
    );
    const result = await runMagiEngine(topic, mode);
    const content = formatEngineContent(result);
    const id = `chatcmpl-magi-${Date.now().toString(36)}`;
    const created = Math.floor(Date.now() / 1000);
    const resolvedModel = mode === "council" ? "magi-council" : "magi-verdict";

    const magi =
      result.mode === "council"
        ? {
            mode: "council" as const,
            status: result.status,
            opinions: result.opinions,
            consensus: result.consensus,
            disagreements: result.disagreements,
            recommendation: result.recommendation,
            minority_views: result.minority_views,
            missing_information: result.missing_information,
            synthesis_mode: result.synthesis_mode,
          }
        : {
            mode: "verdict" as const,
            verdict: result.verdict,
            status: result.status,
            units: result.results,
            disagreements: result.disagreements,
            missing_information: result.missing_information,
            next_steps: result.next_steps,
          };

    return jsonUtf8({
      id,
      object: "chat.completion",
      created,
      model: resolvedModel,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content,
          },
          finish_reason: "stop",
        },
      ],
      magi,
    });
  } catch (err) {
    if (err instanceof MessageValidationError) {
      return jsonUtf8(
        {
          error: {
            message: err.message,
            type: "invalid_request_error",
            code: "invalid_messages",
          },
        },
        { status: err.status },
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return jsonUtf8(
      {
        error: {
          message,
          type: "server_error",
          code: "deliberation_failed",
        },
      },
      { status: 500 },
    );
  }
}
