import { createHmac, timingSafeEqual } from "node:crypto";

export const MAGI_SESSION_COOKIE = "magi_session";

/** Session lifetime: 12 hours */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export type UiBootstrap = {
  unlocked: boolean;
  mockMode: boolean;
  accessConfigured: boolean;
};

export function getMagiAccessCode(): string | undefined {
  const v = process.env.MAGI_ACCESS_CODE;
  return v && v.trim() ? v.trim() : undefined;
}

export function isAccessConfigured(): boolean {
  return Boolean(getMagiAccessCode());
}

export function isMockModeEnv(): boolean {
  return process.env.MAGI_MOCK_MODE === "true";
}

/**
 * Signing key for the web UI session cookie.
 * Prefer MAGI_SESSION_SECRET; otherwise derive from MAGI_ACCESS_CODE (server-only).
 * Never expose either value to the client.
 */
export function getSessionSecret(): string {
  const explicit = process.env.MAGI_SESSION_SECRET?.trim();
  if (explicit) return explicit;
  const access = getMagiAccessCode();
  if (access) {
    // Derive a stable server-only key so session cookies work when only ACCESS_CODE is set.
    return createHmac("sha256", "magi-web-session-v1")
      .update(access)
      .digest("hex");
  }
  throw new Error(
    "MAGI_ACCESS_CODE is not configured; set it (and optionally MAGI_SESSION_SECRET) to enable the web UI.",
  );
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

function signPayload(payloadB64: string, secret: string): string {
  return b64url(createHmac("sha256", secret).update(payloadB64).digest());
}

export function createSessionToken(now = Date.now()): string {
  const secret = getSessionSecret();
  const payload = JSON.stringify({
    v: 1,
    unlocked: true,
    exp: now + SESSION_TTL_MS,
  });
  const payloadB64 = b64url(payload);
  const sig = signPayload(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

export function verifySessionToken(
  token: string | undefined | null,
  now = Date.now(),
): boolean {
  if (!token || !token.includes(".")) return false;
  let secret: string;
  try {
    secret = getSessionSecret();
  } catch {
    return false;
  }
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return false;
  const expected = signPayload(payloadB64, secret);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  } catch {
    return false;
  }
  try {
    const raw = fromB64url(payloadB64).toString("utf8");
    const data = JSON.parse(raw) as { unlocked?: boolean; exp?: number; v?: number };
    if (data.v !== 1 || data.unlocked !== true) return false;
    if (typeof data.exp !== "number" || data.exp < now) return false;
    return true;
  } catch {
    return false;
  }
}

export function accessCodeMatches(code: string): boolean {
  const expected = getMagiAccessCode();
  if (!expected) return false;
  const a = Buffer.from(code);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Still run a compare against expected to reduce trivial timing leaks on length.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function sessionCookieOptions(maxAgeSeconds = SESSION_TTL_MS / 1000) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(maxAgeSeconds),
  };
}

/** Replace Unicode em/en/figure dashes with ASCII " - " for PowerShell-safe API text. */
export function toAsciiHyphens(text: string): string {
  return text.replace(/\s*[\u2012\u2013\u2014\u2015]\s*/g, " - ");
}
