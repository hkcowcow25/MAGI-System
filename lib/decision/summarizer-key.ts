import type { ProviderKind } from "@/lib/config/persona";
import { getPersonaConfig } from "@/lib/config/persona";
import {
  getCachedOrEmpty,
  type SummarizerSettings,
} from "@/lib/config/settings";

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

function normalizeBaseUrl(url: string | undefined): string | undefined {
  if (!url?.trim()) return undefined;
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

export type ResolveSummarizerKeyResult = {
  apiKey?: string;
  configError?: string;
};

/** Resolve API key per summarizer provider (never cross-provider steal). */
export function resolveSummarizerKey(
  provider: ProviderKind,
  opts?: {
    baseUrl?: string;
    melchiorProvider?: ProviderKind;
    melchiorBaseUrl?: string;
  },
): ResolveSummarizerKeyResult {
  const explicit = env("MAGI_SUMMARIZER_API_KEY");

  if (provider === "google") {
    const key = explicit ?? env("GOOGLE_API_KEY");
    if (!key) {
      return {
        configError:
          "Missing Google API key for summarizer. Set MAGI_SUMMARIZER_API_KEY or GOOGLE_API_KEY (do not reuse MELCHIOR_API_KEY).",
      };
    }
    return { apiKey: key };
  }

  if (provider === "anthropic") {
    const key = explicit ?? env("ANTHROPIC_API_KEY");
    if (!key) {
      return {
        configError:
          "Missing Anthropic API key for summarizer. Set MAGI_SUMMARIZER_API_KEY or ANTHROPIC_API_KEY.",
      };
    }
    return { apiKey: key };
  }

  if (provider === "openai") {
    const key = explicit ?? env("OPENAI_API_KEY");
    if (!key) {
      return {
        configError:
          "Missing OpenAI API key for summarizer. Set MAGI_SUMMARIZER_API_KEY or OPENAI_API_KEY.",
      };
    }
    return { apiKey: key };
  }

  if (explicit) return { apiKey: explicit };

  const melchiorProvider = opts?.melchiorProvider;
  const sameProvider =
    melchiorProvider === "openai-compatible" || melchiorProvider === "ollama";
  const sameBase =
    normalizeBaseUrl(opts?.baseUrl) &&
    normalizeBaseUrl(opts?.baseUrl) === normalizeBaseUrl(opts?.melchiorBaseUrl);

  if (sameProvider && sameBase) {
    return { apiKey: env("MELCHIOR_API_KEY") ?? "lm-studio" };
  }

  return { apiKey: "lm-studio" };
}

export type ResolvedSummarizer = {
  provider: ProviderKind;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  timeoutMs: number;
  maxOutputTokens: number;
  temperature: number;
  configError?: string;
};

/**
 * Non-secret summarizer fields with unified precedence:
 *   defaults < environment < settings JSON
 * API keys remain env-only (see resolveSummarizerKey).
 */
export type SummarizerDisplaySettings = {
  /** Saved/resolved enabled flag (default false). Not inferred from model. */
  enabled: boolean;
  provider: ProviderKind;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  maxOutputTokens: number;
  temperature: number;
};

export function peekSummarizerSettings(): SummarizerDisplaySettings {
  // defaults
  let enabled: boolean | undefined;
  let provider: ProviderKind | undefined;
  let model: string | undefined;
  let baseUrl: string | undefined;
  let timeoutMs: number | undefined;
  let maxOutputTokens: number | undefined;
  let temperature: number | undefined;

  // env layer
  if (env("MAGI_SUMMARIZER_PROVIDER")) {
    provider = env("MAGI_SUMMARIZER_PROVIDER") as ProviderKind;
  }
  if (env("MAGI_SUMMARIZER_MODEL")) model = env("MAGI_SUMMARIZER_MODEL");
  if (env("MAGI_SUMMARIZER_BASE_URL")) baseUrl = env("MAGI_SUMMARIZER_BASE_URL");
  if (env("MAGI_SUMMARIZER_TIMEOUT_MS")) {
    const n = Number.parseInt(env("MAGI_SUMMARIZER_TIMEOUT_MS")!, 10);
    if (Number.isFinite(n) && n > 0) timeoutMs = n;
  }
  if (env("MAGI_SUMMARIZER_ENABLED") === "false") enabled = false;
  if (env("MAGI_SUMMARIZER_ENABLED") === "true") enabled = true;

  // settings JSON wins over env
  const file = getCachedOrEmpty();
  const s: SummarizerSettings = file.summarizer ?? {};
  if (typeof s.enabled === "boolean") enabled = s.enabled;
  if (s.provider) provider = s.provider;
  if (s.model?.trim()) model = s.model.trim();
  if (s.baseUrl === null || typeof s.baseUrl === "string") {
    baseUrl = s.baseUrl?.trim() ?? "";
  }
  if (s.timeoutMs !== undefined) timeoutMs = s.timeoutMs;
  if (s.maxOutputTokens !== undefined) maxOutputTokens = s.maxOutputTokens;
  if (s.temperature !== undefined) temperature = s.temperature;

  const providerRaw: ProviderKind = provider ?? "openai-compatible";
  return {
    enabled: enabled === true,
    provider: providerRaw,
    model: model?.trim() ?? "",
    baseUrl: baseUrl?.trim() ?? "",
    timeoutMs: timeoutMs ?? 60_000,
    maxOutputTokens: maxOutputTokens ?? 1024,
    temperature: temperature ?? 0.2,
  };
}

export function resolveSummarizer(): ResolvedSummarizer | null {
  const peeked = peekSummarizerSettings();
  if (!peeked.enabled || !peeked.model.trim()) return null;

  const providerRaw = peeked.provider;
  const provider: ProviderKind =
    providerRaw === "ollama" ? "openai-compatible" : providerRaw;
  const baseUrl =
    peeked.baseUrl.trim() ||
    (providerRaw === "ollama" ? "http://127.0.0.1:11434/v1" : undefined);

  if (provider === "openai-compatible" && !baseUrl?.trim()) {
    return {
      provider,
      model: peeked.model.trim(),
      baseUrl,
      timeoutMs: peeked.timeoutMs,
      maxOutputTokens: peeked.maxOutputTokens,
      temperature: peeked.temperature,
      configError:
        "Missing baseUrl for openai-compatible summarizer (set MAGI_SUMMARIZER_BASE_URL or Settings → 摘要 Base URL).",
    };
  }

  let melchiorProvider: ProviderKind | undefined;
  let melchiorBaseUrl: string | undefined;
  try {
    const melchior = getPersonaConfig("MELCHIOR");
    melchiorProvider = melchior.provider;
    melchiorBaseUrl = melchior.baseUrl;
  } catch {
    /* ignore */
  }

  const keyResult = resolveSummarizerKey(provider, {
    baseUrl,
    melchiorProvider,
    melchiorBaseUrl,
  });

  return {
    provider,
    model: peeked.model.trim(),
    baseUrl,
    apiKey: keyResult.apiKey,
    timeoutMs: peeked.timeoutMs,
    maxOutputTokens: peeked.maxOutputTokens,
    temperature: peeked.temperature,
    configError: keyResult.configError,
  };
}
