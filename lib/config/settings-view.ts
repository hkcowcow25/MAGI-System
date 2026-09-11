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
  type SummarizerSettings,
} from "@/lib/config/settings";
import { isMockModeEnv } from "@/lib/auth/session";

export type ApiKeyStatusLabel = "configured" | "unset";

export interface PersonaSettingsView {
  id: MagiId;
  provider: ProviderKind;
  model: string;
  baseUrl: string;
  systemPrompt: string;
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
  summarizer: SummarizerSettings & {
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
      systemPrompt: cfg.systemPrompt,
      timeoutMs: cfg.timeoutMs,
      maxOutputTokens: cfg.maxOutputTokens,
      temperature: cfg.temperature,
      apiKeyStatus,
      apiKeyStatusLabel: keyLabel(apiKeyStatus),
    };
  }

  const sum = file.summarizer ?? {};
  const sumKey =
    Boolean(process.env.MAGI_SUMMARIZER_API_KEY?.trim()) ||
    Boolean(process.env.MELCHIOR_API_KEY?.trim()) ||
    Boolean(process.env.OPENAI_API_KEY?.trim());
  const sumKeyStatus: ApiKeyStatusLabel = sumKey ? "configured" : "unset";
  const sumModel =
    process.env.MAGI_SUMMARIZER_MODEL?.trim() || sum.model || "";

  return {
    unlocked,
    mockMode: isMockModeEnv(),
    settingsPath: getSettingsPath(),
    defaultMode: file.defaultMode ?? "verdict",
    personas,
    summarizer: {
      ...sum,
      model: sumModel || sum.model,
      provider:
        (process.env.MAGI_SUMMARIZER_PROVIDER?.trim() as ProviderKind) ||
        sum.provider,
      baseUrl:
        process.env.MAGI_SUMMARIZER_BASE_URL?.trim() || sum.baseUrl || "",
      configured: Boolean(sumModel),
      apiKeyStatus: sumKeyStatus,
      apiKeyStatusLabel: keyLabel(sumKeyStatus),
    },
    precedenceNote:
      "非機密設定優先順序：預設值 < 環境變數 < /data/magi-settings.json。API 金鑰只來自環境變數，設定頁無法寫入或讀取金鑰值。",
  };
}
