"use server";

import { cookies } from "next/headers";
import { MagiDeliberationResult } from "@/types/magi";
import { runMagiDeliberation } from "@/lib/decision/magi-verdict";
import { isMockMode } from "@/lib/config/persona";
import {
  MAGI_SESSION_COOKIE,
  UiBootstrap,
  accessCodeMatches,
  createSessionToken,
  getMagiAccessCode,
  isAccessConfigured,
  isMockModeEnv,
  sessionCookieOptions,
  verifySessionToken,
} from "@/lib/auth/session";

export type DeliberateSuccess = MagiDeliberationResult & {
  mockMode: boolean;
};

export type DeliberateFailure = {
  ok: false;
  error: string;
  code: "locked" | "not_configured" | "empty" | "server_error";
};

export type DeliberateResult =
  | (DeliberateSuccess & { ok: true })
  | DeliberateFailure;

async function readSessionUnlocked(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(MAGI_SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

/**
 * Bootstrap flags for the Web UI. Never returns secrets.
 */
export async function getUiBootstrap(): Promise<UiBootstrap> {
  return {
    unlocked: await readSessionUnlocked(),
    mockMode: isMockModeEnv(),
    accessConfigured: isAccessConfigured(),
  };
}

/**
 * Unlock the web UI with MAGI_ACCESS_CODE. Sets a signed httpOnly session cookie.
 */
export async function unlockAccessCode(
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!getMagiAccessCode()) {
    return {
      ok: false,
      error:
        "MAGI_ACCESS_CODE is not configured on the server. Set it in .env.local (distinct from MAGI_API_KEY and provider API keys).",
    };
  }
  if (!accessCodeMatches(code ?? "")) {
    return { ok: false, error: "Invalid access code" };
  }
  const jar = await cookies();
  jar.set(MAGI_SESSION_COOKIE, createSessionToken(), sessionCookieOptions());
  return { ok: true };
}

/** Clear the web UI session cookie. */
export async function logoutSession(): Promise<{ ok: true }> {
  const jar = await cookies();
  jar.set(MAGI_SESSION_COOKIE, "", { ...sessionCookieOptions(0), maxAge: 0 });
  return { ok: true };
}

/**
 * Single server-side deliberation entry for the Web UI.
 * Requires a valid unlocked session cookie. Verdict is computed on the server.
 */
export async function deliberate(topic: string): Promise<DeliberateResult> {
  if (!isAccessConfigured()) {
    return {
      ok: false,
      code: "not_configured",
      error:
        "MAGI_ACCESS_CODE is not configured. Set MAGI_ACCESS_CODE in the server environment to unlock the web UI (fail-closed).",
    };
  }

  if (!(await readSessionUnlocked())) {
    return {
      ok: false,
      code: "locked",
      error: "Web UI is locked. Enter the access code to unlock before deliberating.",
    };
  }

  const trimmed = (topic ?? "").trim();
  if (!trimmed) {
    return { ok: false, code: "empty", error: "Topic/question must not be empty" };
  }

  try {
    const result = await runMagiDeliberation(trimmed);
    return { ok: true, mockMode: isMockMode(), ...result };
  } catch (err) {
    return {
      ok: false,
      code: "server_error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Per-unit web actions are no longer exported for the page path.
 * Use `deliberate(topic)` so the verdict is computed server-side and gated
 * by web session auth (MAGI_ACCESS_CODE unlock cookie).
 */
