"use server";

import { MagiId, MagiResult } from "@/types/magi";
import { getPersonaConfig, isMockMode } from "@/lib/config/persona";
import { getProviderAdapter, parseUnitAnalysis } from "@/lib/providers";
import { mockUnitAnalysis } from "@/lib/providers/mock";
import { runMagiDeliberation } from "@/lib/decision/magi-verdict";

const UNIT_NUMBER: Record<MagiId, 1 | 2 | 3> = {
  MELCHIOR: 1,
  BALTHASAR: 2,
  CASPER: 3,
};

/**
 * Run a single MAGI unit. Technical failures → unitStatus: "error"
 * (NEVER fake ABSTAIN as a vote).
 */
async function deliberateOne(id: MagiId, topic: string): Promise<MagiResult> {
  const number = UNIT_NUMBER[id];
  const config = getPersonaConfig(id);
  try {
    if (isMockMode()) {
      const a = mockUnitAnalysis(id, topic);
      return {
        id,
        number,
        unitStatus: "ok",
        vote: a.vote,
        reasoning: a.reasoning,
        isCritical: a.isCritical,
        assumptions: a.assumptions,
        risks: a.risks,
        missing_information: a.missing_information,
      };
    }

    if (!config.apiKey && config.provider !== "openai-compatible") {
      return {
        id,
        number,
        unitStatus: "error",
        reasoning: `SYSTEM ERROR: Missing API key. Set ${id}_API_KEY or MAGI_MOCK_MODE=true.`,
        error: "Missing API key",
      };
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
    const a = parseUnitAnalysis(completion.text);
    return {
      id,
      number,
      unitStatus: "ok",
      vote: a.vote,
      reasoning: a.reasoning,
      isCritical: a.isCritical,
      assumptions: a.assumptions,
      risks: a.risks,
      missing_information: a.missing_information,
    };
  } catch (err) {
    return {
      id,
      number,
      unitStatus: "error",
      reasoning: `SYSTEM ERROR: ${err instanceof Error ? err.message : String(err)}`,
      error: String(err),
    };
  }
}

export async function deliberateMelchior(topic: string): Promise<MagiResult> {
  return deliberateOne("MELCHIOR", topic);
}

export async function deliberateBalthasar(topic: string): Promise<MagiResult> {
  return deliberateOne("BALTHASAR", topic);
}

export async function deliberateCasper(topic: string): Promise<MagiResult> {
  return deliberateOne("CASPER", topic);
}

/** Full three-unit deliberation via the shared engine. */
export async function deliberateAll(topic: string) {
  return runMagiDeliberation(topic);
}
