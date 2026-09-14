/**
 * Shared provider error helpers — never leak API keys / tokens into UI or logs.
 */

const SECRETISH =
  /\b(AIza[0-9A-Za-z_\-]{8,}|sk-[A-Za-z0-9]{8,}|sk-ant-[A-Za-z0-9_\-]{8,}|Bearer\s+[A-Za-z0-9._\-]+|key[=:\s]+[A-Za-z0-9_\-]{12,}|api[_-]?key[=:\s]+[A-Za-z0-9_\-]{8,})\b/gi;

export function cleanProviderErrorMessage(raw: string): string {
  const cleaned = String(raw ?? "")
    .replace(SECRETISH, "[REDACTED]")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 600 ? `${cleaned.slice(0, 600)}…` : cleaned;
}

export function extractHttpStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const o = err as Record<string, unknown>;
  for (const key of ["httpStatus", "status", "statusCode", "code"] as const) {
    const v = o[key];
    if (typeof v === "number" && v >= 100 && v < 600) return v;
    if (typeof v === "string" && /^\d{3}$/.test(v)) return Number(v);
  }
  const cause = o.cause;
  if (cause && cause !== err) return extractHttpStatus(cause);
  return undefined;
}

/** Pull a useful message from SDK / fetch failures (Google, OpenAI, etc.). */
export function extractProviderFailure(err: unknown): {
  message: string;
  httpStatus?: number;
} {
  const httpStatus = extractHttpStatus(err);
  let message = err instanceof Error ? err.message : String(err);

  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    const extras: string[] = [];
    for (const key of ["errorDetails", "statusText", "statusMessage"] as const) {
      const v = o[key];
      if (v == null) continue;
      try {
        const s = typeof v === "string" ? v : JSON.stringify(v);
        if (s && s.length < 400 && !message.includes(s.slice(0, 24))) {
          extras.push(s);
        }
      } catch {
        /* ignore */
      }
    }
    if (extras.length) message = `${message} | ${extras.join(" | ")}`;
  }

  // Prefer explicit 400/401 hints in message when status missing
  let status = httpStatus;
  if (status == null) {
    const m = message.match(/\b([45]\d{2})\b/);
    if (m) status = Number(m[1]);
  }

  return { message: cleanProviderErrorMessage(message), httpStatus: status };
}
