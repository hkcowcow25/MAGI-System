/**
 * Compatibility façade — prefer runMagiDeliberation from lib/decision/magi-verdict.
 * Kept so existing imports continue to work during migration.
 */
import { MagiId, MagiUnitAnalysis } from "@/types/magi";
import { getPersonaConfig, isMockMode } from "@/lib/config/persona";
import { getProviderAdapter, parseUnitAnalysis } from "@/lib/providers";
import { mockUnitAnalysis } from "@/lib/providers/mock";
import { MagiConfigError } from "@/lib/decision/magi-verdict";

async function queryUnit(id: MagiId, topic: string): Promise<MagiUnitAnalysis> {
  const config = getPersonaConfig(id);
  if (isMockMode()) {
    return mockUnitAnalysis(id, topic);
  }
  if (!config.apiKey && config.provider !== "openai-compatible") {
    throw new MagiConfigError(
      `Missing API key for ${id}. Set ${id}_API_KEY or MAGI_MOCK_MODE=true.`,
    );
  }
  const adapter = getProviderAdapter(config.provider);
  const completion = await adapter.complete({
    model: config.model,
    messages: [
      { role: "system", content: config.systemPrompt },
      { role: "user", content: topic },
    ],
    maxOutputTokens: config.maxOutputTokens,
    temperature: config.temperature,
    timeoutMs: config.timeoutMs,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    reasoningEffort: config.reasoningEffort,
  });
  return parseUnitAnalysis(completion.text);
}

export async function queryMelchior(topic: string) {
  return queryUnit("MELCHIOR", topic);
}
export async function queryBalthasar(topic: string) {
  return queryUnit("BALTHASAR", topic);
}
export async function queryCasper(topic: string) {
  return queryUnit("CASPER", topic);
}
