/**
 * Strip secrets / credential-looking fields from objects before persistence.
 * Never store API keys, access codes, session secrets, Authorization headers.
 */

const SECRET_KEY =
  /^(api[_-]?key|access[_-]?code|session[_-]?secret|password|secret|token|authorization|bearer|cookie)$/i;

const SECRET_VALUE =
  /\b(sk-[a-zA-Z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._\-]+|api[_-]?key\s*[:=]\s*\S+)/i;

export function stripSecretsDeep<T>(value: T): T {
  return stripInner(value, 0) as T;
}

function stripInner(value: unknown, depth: number): unknown {
  if (depth > 12) return null;
  if (value == null) return value;
  if (typeof value === "string") {
    if (SECRET_VALUE.test(value)) {
      return value.replace(SECRET_VALUE, "[REDACTED]");
    }
    return value;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((v) => stripInner(v, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY.test(k)) continue;
    out[k] = stripInner(v, depth + 1);
  }
  return out;
}

/** True if JSON string still appears to contain secret material (tests / guard). */
export function jsonLooksLikeSecrets(json: string): boolean {
  if (/"apiKey"\s*:|"api_key"\s*:|"accessCode"\s*:|"sessionSecret"\s*:/i.test(json)) {
    return true;
  }
  if (/\bsk-[a-zA-Z0-9_-]{16,}\b/.test(json)) return true;
  if (/Bearer\s+[A-Za-z0-9._\-]{12,}/i.test(json)) return true;
  return false;
}
