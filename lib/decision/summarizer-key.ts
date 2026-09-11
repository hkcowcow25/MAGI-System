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

export function resolveSummarizer(): ResolvedSummarizer | null {
  const file = getCachedOrEmpty();
  const s: SummarizerSettings = { ...(file.summarizer ?? {}) };
  if (env("MAGI_SUMMARIZER_PROVIDER")) {
    s.provider = env("MAGI_SUMMARIZER_PROVIDER") as ProviderKind;
  }
  if (env("MAGI_SUMMARIZER_MODEL")) s.model = env("MAGI_SUMMARIZER_MODEL");
  if (env("MAGI_SUMMARIZER_BASE_URL")) s.baseUrl = env("MAGI_SUMMARIZER_BASE_URL");
  if (env("MAGI_SUMMARIZER_TIMEOUT_MS")) {
    const n = Number.parseInt(env("MAGI_SUMMARIZER_TIMEOUT_MS")!, 10);
    if (Number.isFinite(n) && n > 0) s.timeoutMs = n;
  }
  if (env("MAGI_SUMMARIZER_ENABLED") === "false") s.enabled = false;
  if (env("MAGI_SUMMARIZER_ENABLED") === "true") s.enabled = true;

  if (s.enabled === false) return null;
  if (!s.model?.trim()) return null;

  const providerRaw = s.provider ?? "openai-compatible";
  const provider: ProviderKind =
    providerRaw === "ollama" ? "openai-compatible" : providerRaw;
  const baseUrl =
    s.baseUrl ??
    (providerRaw === "ollama" ? "http://127.0.0.1:11434/v1" : undefined);

  if (provider === "openai-compatible" && !baseUrl?.trim()) {
    return {
      provider,
      model: s.model.trim(),
      baseUrl,
      timeoutMs: s.timeoutMs ?? 60_000,
      maxOutputTokens: s.maxOutputTokens ?? 1024,
      temperature: s.temperature ?? 0.2,
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
    model: s.model.trim(),
    baseUrl,
    apiKey: keyResult.apiKey,
    timeoutMs: s.timeoutMs ?? 60_000,
    maxOutputTokens: s.maxOutputTokens ?? 1024,
    temperature: s.temperature ?? 0.2,
    configError: keyResult.configError,
  };
}
