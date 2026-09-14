import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MagiId, MagiMode } from "@/types/magi";
import type { ProviderKind } from "@/lib/config/types";
import {
  PERSONA_IDENTITY,
  PROMPT_MIGRATION_VERSION,
  looksLikeCouncilSchema,
  looksLikeVerdictSchema,
  normalizePersonaDescription,
} from "@/lib/prompts";

export interface PersonaSettingsOverride {
  /** Opt-in JSON schema for Council on compatible servers such as LM Studio. */
  councilStructuredOutput?: boolean;
  provider?: ProviderKind;
  model?: string;
  /** Empty string or null clears a previously saved baseUrl override. */
  baseUrl?: string | null;
  personaDescription?: string;
  /** @deprecated alias for personaDescription */
  systemPrompt?: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface SummarizerSettings {
  provider?: ProviderKind;
  model?: string;
  /** Empty string or null clears a previously saved baseUrl override. */
  baseUrl?: string | null;
  timeoutMs?: number;
  maxOutputTokens?: number;
  temperature?: number;
  enabled?: boolean;
}

export interface MagiSettingsFile {
  version: 1;
  promptMigrationVersion?: number;
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

/** True when client explicitly clears baseUrl ("" or null). */
export function isBaseUrlClear(v: unknown): boolean {
  return v === null || (typeof v === "string" && !v.trim());
}


function sanitizePersona(raw: unknown): PersonaSettingsOverride | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const out: PersonaSettingsOverride = {};
  if (typeof o.councilStructuredOutput === "boolean") {
    out.councilStructuredOutput = o.councilStructuredOutput;
  }
  if (isProvider(o.provider)) out.provider = o.provider;
  const model = asNonEmptyString(o.model);
  if (model) out.model = model;
  if (o.baseUrl === null || typeof o.baseUrl === "string") {
    out.baseUrl = o.baseUrl?.trim() ?? "";
  }
  const rawDesc =
    (typeof o.personaDescription === "string" && o.personaDescription.trim()
      ? o.personaDescription
      : undefined) ??
    (typeof o.systemPrompt === "string" && o.systemPrompt.trim()
      ? o.systemPrompt
      : undefined);
  if (rawDesc) {
    const normalized = normalizePersonaDescription(rawDesc, undefined);
    out.personaDescription = normalized;
    out.systemPrompt = normalized;
  }
  const timeoutMs = asPositiveInt(o.timeoutMs);
  if (timeoutMs !== undefined) out.timeoutMs = timeoutMs;
  const maxOutputTokens = asPositiveInt(o.maxOutputTokens);
  if (maxOutputTokens !== undefined) out.maxOutputTokens = maxOutputTokens;
  const temperature = asFiniteNumber(o.temperature);
  if (temperature !== undefined) out.temperature = temperature;
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
  if (o.baseUrl === null || typeof o.baseUrl === "string") {
    out.baseUrl = o.baseUrl?.trim() ?? "";
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
  if (!raw || typeof raw !== "object") return { version: 1 };
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
  const promptMigrationVersion =
    typeof o.promptMigrationVersion === "number" &&
    Number.isFinite(o.promptMigrationVersion)
      ? Math.floor(o.promptMigrationVersion)
      : undefined;
  return {
    version: 1,
    ...(promptMigrationVersion !== undefined
      ? { promptMigrationVersion }
      : {}),
    ...(Object.keys(personas).length ? { personas } : {}),
    ...(summarizer ? { summarizer } : {}),
    ...(defaultMode ? { defaultMode } : {}),
  };
}

export function settingsNeedPromptMigration(file: MagiSettingsFile): boolean {
  if ((file.promptMigrationVersion ?? 0) >= PROMPT_MIGRATION_VERSION) return false;
  for (const id of PERSONA_IDS) {
    const p = file.personas?.[id];
    if (!p) continue;
    const raw = p.systemPrompt ?? p.personaDescription ?? "";
    if (p.personaDescription && !p.systemPrompt) continue;
    if (
      looksLikeVerdictSchema(raw) ||
      looksLikeCouncilSchema(raw) ||
      (p.systemPrompt && !p.personaDescription)
    ) {
      return true;
    }
  }
  return (
    (file.promptMigrationVersion ?? 0) < PROMPT_MIGRATION_VERSION &&
    Boolean(file.personas && Object.keys(file.personas).length)
  );
}

export function migrateSettingsPrompts(file: MagiSettingsFile): MagiSettingsFile {
  const personas: MagiSettingsFile["personas"] = {};
  for (const id of PERSONA_IDS) {
    const p = file.personas?.[id];
    if (!p) continue;
    const next: PersonaSettingsOverride = { ...p };
    const raw = p.personaDescription ?? p.systemPrompt;
    if (raw?.trim()) {
      const identity = normalizePersonaDescription(raw, id);
      next.personaDescription = identity;
      next.systemPrompt = identity;
    }
    personas[id] = next;
  }
  return {
    ...file,
    version: 1,
    promptMigrationVersion: PROMPT_MIGRATION_VERSION,
    ...(Object.keys(personas).length ? { personas } : { personas: file.personas }),
  };
}

export function resetPersonaIdentity(
  file: MagiSettingsFile,
  id: MagiId,
): MagiSettingsFile {
  const current = file.personas?.[id] ?? {};
  const identity = PERSONA_IDENTITY[id];
  return {
    ...file,
    personas: {
      ...(file.personas ?? {}),
      [id]: {
        ...current,
        personaDescription: identity,
        systemPrompt: identity,
      },
    },
  };
}

let cache: { path: string; mtimeMs: number; data: MagiSettingsFile } | null = null;

export function clearSettingsCache(): void {
  cache = null;
}

export async function loadSettingsFile(): Promise<MagiSettingsFile> {
  const settingsPath = getSettingsPath();
  try {
    const buf = await readFile(settingsPath);
    const statMtime = Date.now();
    const parsed = JSON.parse(buf.toString("utf8")) as unknown;
    let data = sanitizeSettings(parsed);
    if (
      (data.promptMigrationVersion ?? 0) < PROMPT_MIGRATION_VERSION &&
      data.personas &&
      Object.keys(data.personas).length > 0
    ) {
      const migrated = migrateSettingsPrompts(data);
      try {
        data = await saveSettingsFile(migrated);
      } catch {
        data = migrated;
        cache = { path: settingsPath, mtimeMs: statMtime, data };
        return data;
      }
      return data;
    }
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
  if (
    input.promptMigrationVersion !== undefined &&
    clean.promptMigrationVersion === undefined
  ) {
    clean.promptMigrationVersion = input.promptMigrationVersion;
  }
  const json = JSON.stringify(clean, null, 2) + "\n";
  if (
    /api[_-]?key|secret|password|token/i.test(json) &&
    /"(apiKey|api_key|secret|password|token)"\s*:/i.test(json)
  ) {
    throw new Error("Refusing to persist secret-like fields in settings file");
  }
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, json, { encoding: "utf8", mode: 0o600 });
  cache = { path: settingsPath, mtimeMs: Date.now(), data: clean };
  return clean;
}

export async function updateSettingsFromClient(input: {
  personas?: Partial<Record<MagiId, PersonaSettingsOverride>>;
  summarizer?: SummarizerSettings | null;
  defaultMode?: MagiMode;
}): Promise<MagiSettingsFile> {
  const current = await loadSettingsFile();
  const next: MagiSettingsFile = {
    version: 1,
    promptMigrationVersion:
      current.promptMigrationVersion ?? PROMPT_MIGRATION_VERSION,
    personas: { ...(current.personas ?? {}) },
    summarizer: current.summarizer,
    defaultMode: current.defaultMode,
  };
  if (input.personas) {
    for (const id of PERSONA_IDS) {
      const patch = input.personas[id];
      if (!patch) continue;
      const sanitized = sanitizePersona(patch) ?? {};
      if (sanitized.systemPrompt && !sanitized.personaDescription) {
        sanitized.personaDescription = sanitized.systemPrompt;
      }
      const merged: PersonaSettingsOverride = {
        ...(next.personas![id] ?? {}),
        ...sanitized,
      };
      if ("baseUrl" in patch && isBaseUrlClear(patch.baseUrl)) {
        merged.baseUrl = "";
      }
      next.personas![id] = merged;
    }
  }
  if (input.summarizer === null) {
    delete next.summarizer;
  } else if (input.summarizer) {
    const sanitized = sanitizeSummarizer(input.summarizer) ?? {};
    const merged: SummarizerSettings = {
      ...(next.summarizer ?? {}),
      ...sanitized,
    };
    // Explicit enabled=false must persist (do not drop the key).
    if (typeof input.summarizer.enabled === "boolean") {
      merged.enabled = input.summarizer.enabled;
    }
    if ("baseUrl" in input.summarizer && isBaseUrlClear(input.summarizer.baseUrl)) {
      merged.baseUrl = "";
    }
    next.summarizer = merged;
  }
  if (input.defaultMode === "verdict" || input.defaultMode === "council") {
    next.defaultMode = input.defaultMode;
  }
  return saveSettingsFile(next);
}

export async function applyPromptMigration(): Promise<MagiSettingsFile> {
  const current = await loadSettingsFile();
  return saveSettingsFile(migrateSettingsPrompts(current));
}

export async function resetPersonaDescription(
  id: MagiId,
): Promise<MagiSettingsFile> {
  const current = await loadSettingsFile();
  const next = resetPersonaIdentity(current, id);
  next.promptMigrationVersion =
    next.promptMigrationVersion ?? PROMPT_MIGRATION_VERSION;
  return saveSettingsFile(next);
}

export function getCachedOrEmpty(): MagiSettingsFile {
  return cache?.data ?? { version: 1 };
}
