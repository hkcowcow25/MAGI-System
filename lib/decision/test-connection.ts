import {
  getPersonaConfig,
  isMockMode,
  type PersonaConfig,
} from "@/lib/config/persona";
import { getProviderAdapter } from "@/lib/providers";
import { loadSettingsFile } from "@/lib/config/settings";
import type { MagiId } from "@/types/magi";

export type ConnectionStatus =
  | "success"
  | "auth_failure"
  | "model_not_found"
  | "timeout"
  | "other";

export interface ConnectionTestResult {
  ok: boolean;
  status: ConnectionStatus;
  /** zh-HK user-facing message */
  message: string;
  mock: boolean;
  persona: MagiId;
  provider: string;
  model: string;
  latencyMs: number;
}

function classifyError(err: unknown): {
  status: ConnectionStatus;
  message: string;
} {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (
    lower.includes("timed out") ||
    lower.includes("timeout") ||
    lower.includes("etimedout") ||
    lower.includes("abort")
  ) {
    return {
      status: "timeout",
      message: `連線逾時：${raw}`,
    };
  }

  if (
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("unauthorized") ||
    lower.includes("forbidden") ||
    lower.includes("invalid api key") ||
    lower.includes("authentication") ||
    lower.includes("incorrect api key") ||
    lower.includes("invalid_api_key")
  ) {
    return {
      status: "auth_failure",
      message: `認證失敗（請檢查環境變數 API 金鑰）：${raw}`,
    };
  }

  if (
    lower.includes("model_not_found") ||
    lower.includes("model not found") ||
    lower.includes("does not exist") ||
    lower.includes("404") ||
    lower.includes("not_found") ||
    (lower.includes("model") && lower.includes("not"))
  ) {
    return {
      status: "model_not_found",
      message: `找不到模型：${raw}`,
    };
  }

  return {
    status: "other",
    message: `連線測試失敗：${raw}`,
  };
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Connection test timed out after ${ms}ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Probe a persona's configured provider/model with a tiny completion.
 * In MAGI_MOCK_MODE returns explicit mock success without calling paid APIs.
 */
export async function testPersonaConnection(
  persona: MagiId,
): Promise<ConnectionTestResult> {
  await loadSettingsFile();
  const config: PersonaConfig = getPersonaConfig(persona);
  const started = Date.now();

  if (isMockMode()) {
    return {
      ok: true,
      status: "success",
      message: `【模擬】${persona} 連線測試成功（MAGI_MOCK_MODE，未呼叫付費 API）`,
      mock: true,
      persona,
      provider: config.provider,
      model: config.model,
      latencyMs: Date.now() - started,
    };
  }

  try {
    if (!config.apiKey && config.provider !== "openai-compatible") {
      return {
        ok: false,
        status: "auth_failure",
        message: `${persona} 未設定 API 金鑰（環境變數 ${persona}_API_KEY）。UI 無法寫入金鑰，請喺伺服器環境設定。`,
        mock: false,
        persona,
        provider: config.provider,
        model: config.model,
        latencyMs: Date.now() - started,
      };
    }
    if (config.provider === "openai-compatible" && !config.baseUrl) {
      return {
        ok: false,
        status: "other",
        message: `${persona} openai-compatible／ollama 需要 Base URL。`,
        mock: false,
        persona,
        provider: config.provider,
        model: config.model,
      latencyMs: Date.now() - started,
      };
    }

    const timeoutMs = Math.min(config.timeoutMs, 30_000);
    const adapter = getProviderAdapter(config.provider);
    await withTimeout(
      adapter.complete({
        model: config.model,
        messages: [
          {
            role: "user",
            content: 'Reply with exactly: {"ok":true}',
          },
        ],
        maxOutputTokens: 32,
        temperature: 0,
        timeoutMs,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        reasoningEffort: config.reasoningEffort,
      }),
      timeoutMs,
    );

    return {
      ok: true,
      status: "success",
      message: `${persona} 連線成功（provider=${config.provider}, model=${config.model}）`,
      mock: false,
      persona,
      provider: config.provider,
      model: config.model,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    const classified = classifyError(err);
    return {
      ok: false,
      status: classified.status,
      message: classified.message,
      mock: false,
      persona,
      provider: config.provider,
      model: config.model,
      latencyMs: Date.now() - started,
    };
  }
}
