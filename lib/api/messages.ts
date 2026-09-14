export interface IncomingMessage {
  role: string;
  content: unknown;
}

export const MAX_INPUT_CHARS = 12_000;
export const MAX_MESSAGES = 40;

export class MessageValidationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "MessageValidationError";
    this.status = status;
  }
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const part of content) {
      if (typeof part === "string") {
        parts.push(part);
        continue;
      }
      if (part && typeof part === "object") {
        const p = part as Record<string, unknown>;
        if (p.type === "text" && typeof p.text === "string") {
          parts.push(p.text);
          continue;
        }
        if (p.type === "image_url" || p.type === "image") {
          throw new MessageValidationError(
            "Image content is not supported by magi-verdict",
          );
        }
        if (
          p.type === "tool_use" ||
          p.type === "tool_result" ||
          p.type === "function"
        ) {
          throw new MessageValidationError(
            "Tool/function messages are not supported by magi-verdict",
          );
        }
      }
    }
    return parts.join("\n");
  }
  if (content == null) return "";
  throw new MessageValidationError("Unsupported message content format");
}

/**
 * Extract a single deliberation topic from OpenAI-style messages.
 * Keeps the latest user message; prepends truncated prior context if space allows.
 */
export function extractTopicFromMessages(messages: IncomingMessage[]): {
  topic: string;
  truncated: boolean;
} {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new MessageValidationError("'messages' must be a non-empty array");
  }
  if (messages.length > MAX_MESSAGES) {
    throw new MessageValidationError(`Too many messages (max ${MAX_MESSAGES})`);
  }

  for (const m of messages) {
    if (m.role === "tool" || m.role === "function") {
      throw new MessageValidationError(
        "Tool/function roles are not supported by magi-verdict",
      );
    }
  }

  const texts = messages.map((m) => ({
    role: m.role,
    text: contentToText(m.content).trim(),
  }));

  const lastUserIdx = [...texts]
    .map((t, i) => ({ ...t, i }))
    .reverse()
    .find((t) => t.role === "user" && t.text)?.i;

  if (lastUserIdx == null) {
    throw new MessageValidationError(
      "At least one user message with text is required",
    );
  }

  let primary = texts[lastUserIdx].text;
  let truncated = false;

  if (primary.length > MAX_INPUT_CHARS) {
    primary = primary.slice(0, MAX_INPUT_CHARS);
    truncated = true;
    return { topic: primary, truncated };
  }

  const prior = texts
    .slice(0, lastUserIdx)
    .filter((t) => t.text && (t.role === "user" || t.role === "assistant"))
    .map((t) => `${t.role}: ${t.text}`)
    .join("\n");

  if (!prior) {
    return { topic: primary, truncated: false };
  }

  const header = "Prior context:\n";
  const mid = "\n\nQuestion:\n";
  const overhead = header.length + mid.length;
  const budget = MAX_INPUT_CHARS - primary.length - overhead;

  if (budget < 64) {
    return { topic: primary, truncated: true };
  }

  let priorUsed = prior;
  if (prior.length > budget) {
    priorUsed = prior.slice(prior.length - budget);
    truncated = true;
  }

  const topic = `${truncated ? "Prior context (truncated):\n" : header}${priorUsed}${mid}${primary}`;
  if (topic.length > MAX_INPUT_CHARS) {
    return {
      topic: topic.slice(topic.length - MAX_INPUT_CHARS),
      truncated: true,
    };
  }
  return { topic, truncated };
}
