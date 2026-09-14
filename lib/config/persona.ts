import { MagiId } from "@/types/magi";
import {
  MELCHIOR_PROMPT,
  BALTHASAR_PROMPT,
  CASPER_PROMPT,
} from "@/lib/prompts";

export type ProviderKind =
  | "openai"
  | "anthropic"
  | "google"
  | "openai-compatible"
  | "ollama";

export interface PersonaConfig {
  id: MagiId;
  number: 1 | 2 | 3;
  provider: ProviderKind;
  model: string;
  baseUrl?: string;
  apiKey?: string;
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
    prompt: string;
    legacyKeyEnv: string;
    legacyModelEnv: string;
  }
> = {
  MELCHIOR: {
    number: 1,
    provider: "openai",
    model: "gpt-4o-mini",
    prompt: MELCHIOR_PROMPT,
    legacyKeyEnv: "OPENAI_API_KEY",
    legacyModelEnv: "OPENAI_MODEL",
  },
  BALTHASAR: {
    number: 2,
    provider: "anthropic",
    model: "claude-haiku-4-5",
    prompt: BALTHASAR_PROMPT,
    legacyKeyEnv: "ANTHROPIC_API_KEY",
    legacyModelEnv: "ANTHROPIC_MODEL",
  },
  CASPER: {
    number: 3,
    provider: "google",
    model: "gemini-2.0-flash",
    prompt: CASPER_PROMPT,
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

export function getPersonaConfig(id: MagiId): PersonaConfig {
  const d = DEFAULTS[id];
  const prefix = id;
  const provider = parseProvider(env(`${prefix}_PROVIDER`), d.provider);
  const model =
    env(`${prefix}_MODEL`) ?? env(d.legacyModelEnv) ?? d.model;
  const apiKey = env(`${prefix}_API_KEY`) ?? env(d.legacyKeyEnv);
  const baseUrl = env(`${prefix}_BASE_URL`);
  const systemPrompt = env(`${prefix}_SYSTEM_PROMPT`) ?? d.prompt;
  const timeoutMs = parseIntEnv(`${prefix}_TIMEOUT_MS`, 60_000);
  const maxOutputTokens = parseIntEnv(`${prefix}_MAX_OUTPUT_TOKENS`, 1024);
  const temperature = parseFloatEnv(`${prefix}_TEMPERATURE`, 0.3);

  let reasoningEffort: "low" | "medium" | "high" | undefined;
  if (id === "MELCHIOR") {
    const effort = env("OPENAI_REASONING_EFFORT") ?? env("MELCHIOR_REASONING_EFFORT");
    reasoningEffort =
      effort === "medium" || effort === "high" ? effort : "low";
  }

  // ollama is preferred via openai-compatible endpoint
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
    systemPrompt,
    timeoutMs,
    maxOutputTokens,
    temperature,
    reasoningEffort,
  };
}

export function getAllPersonaConfigs(): PersonaConfig[] {
  return (["MELCHIOR", "BALTHASAR", "CASPER"] as MagiId[]).map(getPersonaConfig);
}
