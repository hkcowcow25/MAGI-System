import { NextRequest } from "next/server";
import { jsonUtf8 } from "@/lib/api/json";
import { requireBearer } from "@/lib/auth/bearer";
import {
  extractTopicFromMessages,
  MessageValidationError,
  type IncomingMessage,
} from "@/lib/api/messages";
import {
  formatDeliberationContent,
  runMagiDeliberation,
} from "@/lib/decision/magi-verdict";

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

  const model = typeof body.model === "string" ? body.model : "";
  if (model && model !== "magi-verdict") {
    return badRequest(
      `Unknown model '${model}'. Only 'magi-verdict' is supported.`,
      "model_not_found",
    );
  }

  try {
    const { topic } = extractTopicFromMessages(
      (body.messages as IncomingMessage[]) ?? [],
    );
    const deliberation = await runMagiDeliberation(topic);
    const content = formatDeliberationContent(deliberation);
    const id = `chatcmpl-magi-${Date.now().toString(36)}`;
    const created = Math.floor(Date.now() / 1000);

    return jsonUtf8({
      id,
      object: "chat.completion",
      created,
      model: "magi-verdict",
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
      // Never invent token usage — omit unless we have real provider totals (mock has none)
      magi: {
        verdict: deliberation.verdict,
        status: deliberation.status,
        units: deliberation.results,
        disagreements: deliberation.disagreements,
        missing_information: deliberation.missing_information,
        next_steps: deliberation.next_steps,
      },
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
