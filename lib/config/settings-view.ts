import type { MagiId, MagiMode } from "@/types/magi";
import {
  getPersonaConfig,
  getPersonaUiProvider,
  personaApiKeyConfigured,
} from "@/lib/config/persona";
import type { ProviderKind } from "@/lib/config/types";
import {
  getSettingsPath,
  loadSettingsFile,
} from "@/lib/config/settings";
import { isMockModeEnv } from "@/lib/auth/session";
import {
  peekSummarizerSettings,
  resolveSummarizerKey,
} from "@/lib/decision/summarizer-key";

export type ApiKeyStatusLabel = "configured" | "unset";

export interface PersonaSettingsView {
  councilStructuredOutput?: boolean;
  id: MagiId;
  provider: ProviderKind;
  model: string;
  baseUrl: string;
  systemPrompt: string;
  /** Persona identity only (same as systemPrompt after migration). */
  personaDescription: string;
  timeoutMs: number;
  maxOutputTokens: number;
  temperature: number;
  /** Never the raw key — only status for UI. */
  apiKeyStatus: ApiKeyStatusLabel;
  /** zh-HK label for api key status */
  apiKeyStatusLabel: string;
}

export interface SettingsView {
  unlocked: boolean;
  mockMode: boolean;
  settingsPath: string;
  defaultMode: MagiMode;
  personas: Record<MagiId, PersonaSettingsView>;
  summarizer: {
    enabled: boolean;
    provider?: ProviderKind;
    model?: string;
    baseUrl?: string;
    timeoutMs?: number;
    maxOutputTokens?: number;
    temperature?: number;
    configured: boolean;
    apiKeyStatus: ApiKeyStatusLabel;
    apiKeyStatusLabel: string;
  };
  /** Documented precedence for UI help text */
  precedenceNote: string;
}

function keyLabel(status: ApiKeyStatusLabel): string {
  return status === "configured" ? "由環境設定／已設定" : "未設定";
}

export async function buildSettingsView(
  unlocked: boolean,
): Promise<SettingsView> {
  const file = await loadSettingsFile();
  const personas = {} as Record<MagiId, PersonaSettingsView>;
  for (const id of ["MELCHIOR", "BALTHASAR", "CASPER"] as MagiId[]) {
    const cfg = getPersonaConfig(id);
    const uiProvider = getPersonaUiProvider(id);
    const apiKeyStatus: ApiKeyStatusLabel = personaApiKeyConfigured(id)
      ? "configured"
      : "unset";
    personas[id] = {
      id,
      provider: uiProvider,
      model: cfg.model,
      baseUrl: cfg.baseUrl ?? "",
      // Identity only — Verdict/Council JSON format is appended by engines.
      systemPrompt: cfg.personaDescription,
      personaDescription: cfg.personaDescription,
      timeoutMs: cfg.timeoutMs,
      maxOutputTokens: cfg.maxOutputTokens,
      temperature: cfg.temperature,
      councilStructuredOutput: cfg.councilStructuredOutput === true,
      apiKeyStatus,
      apiKeyStatusLabel: keyLabel(apiKeyStatus),
    };
  }

  // Same resolve helpers as runtime (defaults < env < settings JSON).
  const peeked = peekSummarizerSettings();
  // Checkbox reflects saved enabled boolean only (default false) — not "configured".
  const savedEnabled = file.summarizer?.enabled === true;
  const providerForKey: ProviderKind =
    peeked.provider === "ollama" ? "openai-compatible" : peeked.provider;
  const keyProbe = resolveSummarizerKey(providerForKey, {
    baseUrl: peeked.baseUrl || undefined,
  });
  // openai-compatible may legitimately use placeholder lm-studio
  const sumKeyConfigured = Boolean(keyProbe.apiKey) && !keyProbe.configError;

  return {
    unlocked,
    mockMode: isMockModeEnv(),
    settingsPath: getSettingsPath(),
    defaultMode: file.defaultMode ?? "verdict",
    personas,
    summarizer: {
      enabled: savedEnabled,
      provider: peeked.provider,
      model: peeked.model,
      baseUrl: peeked.baseUrl,
      timeoutMs: peeked.timeoutMs,
      maxOutputTokens: peeked.maxOutputTokens,
      temperature: peeked.temperature,
      configured: Boolean(peeked.model.trim()),
      apiKeyStatus: sumKeyConfigured ? "configured" : "unset",
      apiKeyStatusLabel: keyLabel(sumKeyConfigured ? "configured" : "unset"),
    },
    precedenceNote:
      "非機密設定優先順序：預設值 < 環境變數 < /data/magi-settings.json（設定檔覆蓋環境）。API 金鑰只來自環境變數，設定頁無法寫入或讀取金鑰值。摘要「啟用」掣只反映已儲存嘅 enabled（預設關閉）；唔會因為已設定 model 就自動勾選。人格描述唔應包含 JSON／投票格式；格式由 Verdict／Council 模式自動附加。",
  };
}
