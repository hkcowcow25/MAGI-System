import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MagiId, MagiMode } from "@/types/magi";
import type { ProviderKind } from "@/lib/config/types";

/** Non-secret per-persona overrides persisted to disk. Never stores API keys. */
export interface PersonaSettingsOverride {
  provider?: ProviderKind;
  model?: string;
  baseUrl?: string;
  systemPrompt?: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface SummarizerSettings {
  provider?: ProviderKind;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  temperature?: number;
  /** When false/undefined and model unset → extractive synthesis. */
  enabled?: boolean;
}

export interface MagiSettingsFile {
  version: 1;
  personas?: Partial<Record<MagiId, PersonaSettingsOverride>>;
  summarizer?: SummarizerSettings;
  defaultMode?: MagiMode;
}

const PERSONA_IDS: MagiId[] = ["MELCHIOR", "BALTHASAR", "CASPER"];
const PROVIDERS: ProviderKind[] = [
  "openai",
  "anthropic",
  "google",
  "openai-compatible",
  "ollama",
];

export function getSettingsPath(): string {
  const explicit = process.env.MAGI_SETTINGS_PATH?.trim();
  if (explicit) return explicit;
  const dataDir = process.env.MAGI_DATA_DIR?.trim() || "/data";
  return path.join(dataDir, "magi-settings.json");
}

function isProvider(v: unknown): v is ProviderKind {
  return typeof v === "string" && (PROVIDERS as string[]).includes(v);
}

function asPositiveInt(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return undefined;
  return Math.floor(v);
}

function asFiniteNumber(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return v;
}

function asNonEmptyString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

function sanitizePersona(raw: unknown): PersonaSettingsOverride | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const out: PersonaSettingsOverride = {};
  if (isProvider(o.provider)) out.provider = o.provider;
  const model = asNonEmptyString(o.model);
  if (model) out.model = model;
  // Allow empty string to clear baseUrl override → treat missing only
  if (typeof o.baseUrl === "string") {
    const b = o.baseUrl.trim();
    if (b) out.baseUrl = b;
  }
  if (typeof o.systemPrompt === "string" && o.systemPrompt.trim()) {
    out.systemPrompt = o.systemPrompt;
  }
  const timeoutMs = asPositiveInt(o.timeoutMs);
  if (timeoutMs !== undefined) out.timeoutMs = timeoutMs;
  const maxOutputTokens = asPositiveInt(o.maxOutputTokens);
  if (maxOutputTokens !== undefined) out.maxOutputTokens = maxOutputTokens;
  const temperature = asFiniteNumber(o.temperature);
  if (temperature !== undefined) out.temperature = temperature;
  // Explicitly drop any apiKey / secret fields if present in file
  return out;
}

function sanitizeSummarizer(raw: unknown): SummarizerSettings | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const out: SummarizerSettings = {};
  if (typeof o.enabled === "boolean") out.enabled = o.enabled;
  if (isProvider(o.provider)) out.provider = o.provider;
  const model = asNonEmptyString(o.model);
  if (model) out.model = model;
  if (typeof o.baseUrl === "string" && o.baseUrl.trim()) {
    out.baseUrl = o.baseUrl.trim();
  }
  const timeoutMs = asPositiveInt(o.timeoutMs);
  if (timeoutMs !== undefined) out.timeoutMs = timeoutMs;
  const maxOutputTokens = asPositiveInt(o.maxOutputTokens);
  if (maxOutputTokens !== undefined) out.maxOutputTokens = maxOutputTokens;
  const temperature = asFiniteNumber(o.temperature);
  if (temperature !== undefined) out.temperature = temperature;
  return out;
}

export function sanitizeSettings(raw: unknown): MagiSettingsFile {
  if (!raw || typeof raw !== "object") {
    return { version: 1 };
  }
  const o = raw as Record<string, unknown>;
  const personas: MagiSettingsFile["personas"] = {};
  if (o.personas && typeof o.personas === "object") {
    const p = o.personas as Record<string, unknown>;
    for (const id of PERSONA_IDS) {
      const s = sanitizePersona(p[id]);
      if (s && Object.keys(s).length) personas[id] = s;
    }
  }
  const summarizer = sanitizeSummarizer(o.summarizer);
  const defaultMode =
    o.defaultMode === "council" || o.defaultMode === "verdict"
      ? o.defaultMode
      : undefined;
  return {
    version: 1,
    ...(Object.keys(personas).length ? { personas } : {}),
    ...(summarizer ? { summarizer } : {}),
    ...(defaultMode ? { defaultMode } : {}),
  };
}

/** In-memory cache so hot paths avoid repeated disk reads within a process. */
let cache: { path: string; mtimeMs: number; data: MagiSettingsFile } | null =
  null;

export function clearSettingsCache(): void {
  cache = null;
}

export async function loadSettingsFile(): Promise<MagiSettingsFile> {
  const settingsPath = getSettingsPath();
  try {
    const buf = await readFile(settingsPath);
    const statMtime = Date.now(); // content-based; we always re-parse
    const parsed = JSON.parse(buf.toString("utf8")) as unknown;
    const data = sanitizeSettings(parsed);
    cache = { path: settingsPath, mtimeMs: statMtime, data };
    return data;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      const empty: MagiSettingsFile = { version: 1 };
      cache = { path: settingsPath, mtimeMs: 0, data: empty };
      return empty;
    }
    throw err;
  }
}

export async function saveSettingsFile(
  input: MagiSettingsFile,
): Promise<MagiSettingsFile> {
  const settingsPath = getSettingsPath();
  const clean = sanitizeSettings(input);
  // Strip secrets again — defensive
  const json = JSON.stringify(clean, null, 2) + "\n";
  if (/api[_-]?key|secret|password|token/i.test(json) && /"(apiKey|api_key|secret|password|token)"\s*:/i.test(json)) {
    throw new Error("Refusing to persist secret-like fields in settings file");
  }
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, json, { encoding: "utf8", mode: 0o600 });
  cache = { path: settingsPath, mtimeMs: Date.now(), data: clean };
  return clean;
}

/**
 * Merge incoming persona overrides into current file (non-secrets only).
 * Does not accept or store API keys.
 */
export async function updateSettingsFromClient(input: {
  personas?: Partial<Record<MagiId, PersonaSettingsOverride>>;
  summarizer?: SummarizerSettings | null;
  defaultMode?: MagiMode;
}): Promise<MagiSettingsFile> {
  const current = await loadSettingsFile();
  const next: MagiSettingsFile = {
    version: 1,
    personas: { ...(current.personas ?? {}) },
    summarizer: current.summarizer,
    defaultMode: current.defaultMode,
  };

  if (input.personas) {
    for (const id of PERSONA_IDS) {
      const patch = input.personas[id];
      if (!patch) continue;
      const sanitized = sanitizePersona(patch) ?? {};
      next.personas![id] = {
        ...(next.personas![id] ?? {}),
        ...sanitized,
      };
    }
  }

  if (input.summarizer === null) {
    delete next.summarizer;
  } else if (input.summarizer) {
    next.summarizer = {
      ...(next.summarizer ?? {}),
      ...(sanitizeSummarizer(input.summarizer) ?? {}),
    };
  }

  if (input.defaultMode === "verdict" || input.defaultMode === "council") {
    next.defaultMode = input.defaultMode;
  }

  return saveSettingsFile(next);
}

export function getCachedOrEmpty(): MagiSettingsFile {
  return cache?.data ?? { version: 1 };
}
