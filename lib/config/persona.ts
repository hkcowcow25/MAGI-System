import { MagiId } from "@/types/magi";
import {
  PERSONA_IDENTITY,
  MELCHIOR_PROMPT,
  BALTHASAR_PROMPT,
  CASPER_PROMPT,
  buildSystemPrompt,
  normalizePersonaDescription,
} from "@/lib/prompts";
import {
  getCachedOrEmpty,
  loadSettingsFile,
  type PersonaSettingsOverride,
} from "@/lib/config/settings";

import type { ProviderKind } from "@/lib/config/types";
export type { ProviderKind } from "@/lib/config/types";

export interface PersonaConfig {
  id: MagiId;
  number: 1 | 2 | 3;
  provider: ProviderKind;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  /**
   * Persona identity text only (no Verdict/Council JSON schema).
   * Engines must call buildSystemPrompt(id, mode, personaDescription).
   */
  personaDescription: string;
  /**
   * Composed Verdict system prompt for backward compatibility / settings display fallback.
   * Prefer buildSystemPrompt for mode-correct composition.
   */
  systemPrompt: string;
  timeoutMs: number;
  maxOutputTokens: number;
  temperature: number;
  /** OpenAI Responses API reasoning effort (openai provider only). */
  reasoningEffort?: "low" | "medium" | "high";
}

const DEFAULTS: Record<
  MagiId,
  {
    number: 1 | 2 | 3;
    provider: ProviderKind;
    model: string;
    /** @deprecated full verdict prompt — identity is PERSONA_IDENTITY */
    prompt: string;
    identity: string;
    legacyKeyEnv: string;
    legacyModelEnv: string;
  }
> = {
  MELCHIOR: {
    number: 1,
    provider: "openai",
    model: "gpt-4o-mini",
    prompt: MELCHIOR_PROMPT,
    identity: PERSONA_IDENTITY.MELCHIOR,
    legacyKeyEnv: "OPENAI_API_KEY",
    legacyModelEnv: "OPENAI_MODEL",
  },
  BALTHASAR: {
    number: 2,
    provider: "anthropic",
    model: "claude-haiku-4-5",
    prompt: BALTHASAR_PROMPT,
    identity: PERSONA_IDENTITY.BALTHASAR,
    legacyKeyEnv: "ANTHROPIC_API_KEY",
    legacyModelEnv: "ANTHROPIC_MODEL",
  },
  CASPER: {
    number: 3,
    provider: "google",
    model: "gemini-2.0-flash",
    prompt: CASPER_PROMPT,
    identity: PERSONA_IDENTITY.CASPER,
    legacyKeyEnv: "GOOGLE_API_KEY",
    legacyModelEnv: "GOOGLE_MODEL",
  },
};

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

function parseProvider(raw: string | undefined, fallback: ProviderKind): ProviderKind {
  const allowed: ProviderKind[] = [
    "openai",
    "anthropic",
    "google",
    "openai-compatible",
    "ollama",
  ];
  if (raw && (allowed as string[]).includes(raw)) return raw as ProviderKind;
  return fallback;
}

function parseIntEnv(name: string, fallback: number): number {
  const v = env(name);
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseFloatEnv(name: string, fallback: number): number {
  const v = env(name);
  if (!v) return fallback;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

export function isMockMode(): boolean {
  return process.env.MAGI_MOCK_MODE === "true";
}

export function getMagiApiKey(): string | undefined {
  return env("MAGI_API_KEY");
}

/**
 * Precedence for non-secrets:
 *   defaults < environment < settings file (/data/magi-settings.json)
 * API keys: environment only (never from settings file / UI).
 */
function buildFromEnv(id: MagiId): PersonaConfig {
  const d = DEFAULTS[id];
  const prefix = id;
  const provider = parseProvider(env(`${prefix}_PROVIDER`), d.provider);
  const model =
    env(`${prefix}_MODEL`) ?? env(d.legacyModelEnv) ?? d.model;
  const apiKey = env(`${prefix}_API_KEY`) ?? env(d.legacyKeyEnv);
  const baseUrl = env(`${prefix}_BASE_URL`);
  const rawPrompt = env(`${prefix}_SYSTEM_PROMPT`);
  const personaDescription = normalizePersonaDescription(
    rawPrompt,
    id,
  );
  // If no env override, use built-in identity (not full verdict prompt)
  const identity = rawPrompt?.trim()
    ? personaDescription
    : d.identity;
  const timeoutMs = parseIntEnv(`${prefix}_TIMEOUT_MS`, 60_000);
  const maxOutputTokens = parseIntEnv(`${prefix}_MAX_OUTPUT_TOKENS`, 1024);
  const temperature = parseFloatEnv(`${prefix}_TEMPERATURE`, 0.3);

  let reasoningEffort: "low" | "medium" | "high" | undefined;
  if (id === "MELCHIOR") {
    const effort = env("OPENAI_REASONING_EFFORT") ?? env("MELCHIOR_REASONING_EFFORT");
    reasoningEffort =
      effort === "medium" || effort === "high" ? effort : "low";
  }

  const resolvedProvider: ProviderKind =
    provider === "ollama" ? "openai-compatible" : provider;
  const resolvedBase =
    baseUrl ??
    (provider === "ollama" ? "http://127.0.0.1:11434/v1" : undefined);

  return {
    id,
    number: d.number,
    provider: resolvedProvider,
    model,
    baseUrl: resolvedBase,
    apiKey,
    personaDescription: identity,
    systemPrompt: buildSystemPrompt(id, "verdict", identity),
    timeoutMs,
    maxOutputTokens,
    temperature,
    reasoningEffort,
  };
}

function resolveOverrideIdentity(
  id: MagiId,
  override: PersonaSettingsOverride | undefined,
  baseIdentity: string,
): string {
  if (!override) return baseIdentity;
  const raw =
    override.personaDescription?.trim() ||
    override.systemPrompt?.trim() ||
    "";
  if (!raw) return baseIdentity;
  return normalizePersonaDescription(raw, id);
}

function applyOverride(
  base: PersonaConfig,
  override: PersonaSettingsOverride | undefined,
): PersonaConfig {
  if (!override) return base;

  const providerHint = override.provider ?? base.provider;
  const resolvedProvider: ProviderKind =
    providerHint === "ollama" ? "openai-compatible" : providerHint;

  let baseUrl =
    override.baseUrl !== undefined ? override.baseUrl : base.baseUrl;
  if (providerHint === "ollama" && !baseUrl) {
    baseUrl = "http://127.0.0.1:11434/v1";
  }

  const identity = resolveOverrideIdentity(
    base.id,
    override,
    base.personaDescription,
  );

  return {
    ...base,
    provider: resolvedProvider,
    model: override.model ?? base.model,
    baseUrl,
    personaDescription: identity,
    systemPrompt: buildSystemPrompt(base.id, "verdict", identity),
    timeoutMs: override.timeoutMs ?? base.timeoutMs,
    maxOutputTokens: override.maxOutputTokens ?? base.maxOutputTokens,
    temperature: override.temperature ?? base.temperature,
    // apiKey intentionally untouched — env only
  };
}

/** Sync read using cache (call ensureSettingsLoaded first in async paths). */
export function getPersonaConfig(id: MagiId): PersonaConfig {
  const fromEnv = buildFromEnv(id);
  const file = getCachedOrEmpty();
  const override = file.personas?.[id];
  return applyOverride(fromEnv, override);
}

/** Async: refresh settings file then return persona config. */
export async function getPersonaConfigAsync(id: MagiId): Promise<PersonaConfig> {
  await loadSettingsFile();
  return getPersonaConfig(id);
}

export function getAllPersonaConfigs(): PersonaConfig[] {
  return (["MELCHIOR", "BALTHASAR", "CASPER"] as MagiId[]).map(getPersonaConfig);
}

export async function getAllPersonaConfigsAsync(): Promise<PersonaConfig[]> {
  await loadSettingsFile();
  return getAllPersonaConfigs();
}

/** Whether an API key is present in env for this persona (never returns the key). */
export function personaApiKeyConfigured(id: MagiId): boolean {
  const d = DEFAULTS[id];
  return Boolean(env(`${id}_API_KEY`) ?? env(d.legacyKeyEnv));
}

/** Effective provider kind as configured for UI (may show ollama). */
export function getPersonaUiProvider(id: MagiId): ProviderKind {
  const file = getCachedOrEmpty();
  const override = file.personas?.[id]?.provider;
  if (override) return override;
  const d = DEFAULTS[id];
  return parseProvider(env(`${id}_PROVIDER`), d.provider);
}

export { DEFAULTS as PERSONA_DEFAULTS };
