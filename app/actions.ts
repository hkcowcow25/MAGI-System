"use server";

import { cookies } from "next/headers";
import type {
  CouncilOpinion,
  MagiCouncilResult,
  MagiDeliberationResult,
  MagiId,
  MagiMode,
} from "@/types/magi";
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
import { runMagiEngine } from "@/lib/decision/engine";
import {
  buildSettingsView,
  type SettingsView,
} from "@/lib/config/settings-view";
import {
  updateSettingsFromClient,
  applyPromptMigration,
  resetPersonaDescription,
  type PersonaSettingsOverride,
  type SummarizerSettings,
} from "@/lib/config/settings";
import {
  testPersonaConnection,
  type ConnectionTestResult,
} from "@/lib/decision/test-connection";
import {
  runSummarizerTest,
  type SummarizerTestResult,
} from "@/lib/decision/test-summarizer";

export type DeliberateSuccess = MagiDeliberationResult & {
  ok: true;
  mode: "verdict";
  mockMode: boolean;
};

export type CouncilSuccess = MagiCouncilResult & {
  ok: true;
  mode: "council";
  mockMode: boolean;
};

export type DeliberateFailure = {
  ok: false;
  error: string;
  code: "locked" | "not_configured" | "empty" | "server_error";
};

export type DeliberateResult =
  | DeliberateSuccess
  | CouncilSuccess
  | DeliberateFailure;

async function readSessionUnlocked(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(MAGI_SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

async function requireUnlocked(): Promise<DeliberateFailure | null> {
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
  return null;
}

/**
 * Bootstrap flags for the Web UI. Never returns secrets.
 */
export async function getUiBootstrap(): Promise<
  UiBootstrap & { defaultMode: MagiMode }
> {
  const { loadSettingsFile } = await import("@/lib/config/settings");
  const file = await loadSettingsFile();
  return {
    unlocked: await readSessionUnlocked(),
    mockMode: isMockModeEnv(),
    accessConfigured: isAccessConfigured(),
    defaultMode: file.defaultMode ?? "verdict",
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
 * Server-side deliberation for Web UI.
 * mode=verdict → magi-verdict; mode=council → magi-council.
 * Requires unlocked session cookie.
 */
export async function deliberate(
  topic: string,
  mode: MagiMode = "verdict",
): Promise<DeliberateResult> {
  const gate = await requireUnlocked();
  if (gate) return gate;

  const trimmed = (topic ?? "").trim();
  if (!trimmed) {
    return { ok: false, code: "empty", error: "Topic/question must not be empty" };
  }

  try {
    const result = await runMagiEngine(trimmed, mode, { source: "web" });
    if (result.mode === "council") {
      return {
        ok: true,
        mockMode: isMockMode(),
        mode: "council",
        status: result.status,
        opinions: result.opinions,
        consensus: result.consensus,
        disagreements: result.disagreements,
        recommendation: result.recommendation,
        minority_views: result.minority_views,
        missing_information: result.missing_information,
        synthesis_mode: result.synthesis_mode,
        synthesis_error: result.synthesis_error,
      };
    }
    return {
      ok: true,
      mockMode: isMockMode(),
      mode: "verdict",
      status: result.status,
      verdict: result.verdict,
      results: result.results,
      disagreements: result.disagreements,
      missing_information: result.missing_information,
      next_steps: result.next_steps,
    };
  } catch (err) {
    return {
      ok: false,
      code: "server_error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Load settings for the Settings page. Never includes raw API keys. */
export async function getSettings(): Promise<
  | ({ ok: true } & SettingsView)
  | { ok: false; error: string; code: "locked" | "not_configured" }
> {
  if (!isAccessConfigured()) {
    return {
      ok: false,
      code: "not_configured",
      error: "MAGI_ACCESS_CODE is not configured.",
    };
  }
  const unlocked = await readSessionUnlocked();
  if (!unlocked) {
    return {
      ok: false,
      code: "locked",
      error: "請先喺主頁輸入通行碼解鎖，先可以開啟設定。",
    };
  }
  const view = await buildSettingsView(true);
  return { ok: true, ...view };
}

export type SaveSettingsInput = {
  personas?: Partial<Record<MagiId, PersonaSettingsOverride>>;
  summarizer?: SummarizerSettings | null;
  defaultMode?: MagiMode;
};

/** Persist non-secret settings to JSON on disk. Rejects any apiKey fields. */
export async function saveSettings(
  input: SaveSettingsInput,
): Promise<
  | ({ ok: true } & SettingsView)
  | { ok: false; error: string; code: "locked" | "not_configured" | "invalid" }
> {
  const gate = await requireUnlocked();
  if (gate) {
    const code = gate.code === "locked" || gate.code === "not_configured"
      ? gate.code
      : "invalid";
    return { ok: false, code, error: gate.error };
  }

  // Reject secret-looking keys in the payload
  const blob = JSON.stringify(input);
  if (
    /"apiKey"\s*:|"api_key"\s*:|"secret"\s*:|"password"\s*:/i.test(blob)
  ) {
    return {
      ok: false,
      code: "invalid",
      error: "設定不可包含 API 金鑰或密碼欄位。金鑰只可經環境變數設定。",
    };
  }

  try {
    await updateSettingsFromClient(input);
    const view = await buildSettingsView(true);
    return { ok: true, ...view };
  } catch (err) {
    return {
      ok: false,
      code: "invalid",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Test connection for one persona. Only runs when explicitly invoked (button click).
 */
export async function testConnection(
  persona: MagiId,
): Promise<
  | ({ ok: true } & ConnectionTestResult)
  | ({ ok: false } & Partial<ConnectionTestResult> & {
      error: string;
      code: "locked" | "not_configured" | "invalid";
    })
> {
  const gate = await requireUnlocked();
  if (gate) {
    const code = gate.code === "locked" || gate.code === "not_configured"
      ? gate.code
      : "invalid";
    return { ok: false as const, code, error: gate.error };
  }
  if (!["MELCHIOR", "BALTHASAR", "CASPER"].includes(persona)) {
    return { ok: false as const, code: "invalid" as const, error: "未知人格" };
  }
  const result = await testPersonaConnection(persona);
  if (result.ok) {
    return {
      ok: true as const,
      status: result.status,
      message: result.message,
      mock: result.mock,
      persona: result.persona,
      provider: result.provider,
      model: result.model,
      latencyMs: result.latencyMs,
    };
  }
  return {
    ok: false as const,
    code: "invalid" as const,
    error: result.message,
    status: result.status,
    message: result.message,
    mock: result.mock,
    persona: result.persona,
    provider: result.provider,
    model: result.model,
    latencyMs: result.latencyMs,
  };
}


/** 「套用遷移」— strip Verdict/Council format from saved persona text; keep identity. */
export async function migratePromptFormats(): Promise<
  | ({ ok: true } & SettingsView)
  | { ok: false; error: string; code: "locked" | "not_configured" | "invalid" }
> {
  const gate = await requireUnlocked();
  if (gate) {
    const code =
      gate.code === "locked" || gate.code === "not_configured"
        ? gate.code
        : "invalid";
    return { ok: false, code, error: gate.error };
  }
  try {
    await applyPromptMigration();
    const view = await buildSettingsView(true);
    return { ok: true, ...view };
  } catch (err) {
    return {
      ok: false,
      code: "invalid",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** 「還原預設人格描述」— resets identity to built-in; keeps provider/model. */
export async function resetDefaultPersonaDescription(
  persona: MagiId,
): Promise<
  | ({ ok: true } & SettingsView)
  | { ok: false; error: string; code: "locked" | "not_configured" | "invalid" }
> {
  const gate = await requireUnlocked();
  if (gate) {
    const code =
      gate.code === "locked" || gate.code === "not_configured"
        ? gate.code
        : "invalid";
    return { ok: false, code, error: gate.error };
  }
  if (!["MELCHIOR", "BALTHASAR", "CASPER"].includes(persona)) {
    return { ok: false, code: "invalid", error: "未知人格" };
  }
  try {
    await resetPersonaDescription(persona);
    const view = await buildSettingsView(true);
    return { ok: true, ...view };
  } catch (err) {
    return {
      ok: false,
      code: "invalid",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Standalone summarizer test (Settings 「測試摘要」).
 * Does NOT run three personas — uses fixture opinions JSON.
 */
export async function testSummarizer(
  sampleOpinions?: CouncilOpinion[],
): Promise<
  | ({ ok: true } & SummarizerTestResult)
  | ({ ok: false } & SummarizerTestResult & {
      error: string;
      code: "locked" | "not_configured" | "invalid";
    })
> {
  const gate = await requireUnlocked();
  if (gate) {
    const code =
      gate.code === "locked" || gate.code === "not_configured"
        ? gate.code
        : "invalid";
    return {
      ok: false as const,
      code,
      error: gate.error,
      stage: "config",
      message: gate.error,
    };
  }
  const result = await runSummarizerTest(sampleOpinions);
  if (result.ok) {
    const { ok: _ok, ...rest } = result;
    void _ok;
    return { ok: true as const, ...rest, stage: result.stage, message: result.message };
  }
  const { ok: _okFail, ...restFail } = result;
  void _okFail;
  return {
    ok: false as const,
    code: "invalid" as const,
    error: result.message,
    ...restFail,
    stage: result.stage,
    message: result.message,
  };
}
