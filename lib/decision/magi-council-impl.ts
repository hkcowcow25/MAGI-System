import {
  MagiId,
  MagiCouncilResult,
  CouncilOpinion,
} from "@/types/magi";
import { MAGI_UNITS } from "@/lib/decision/verdict";
import {
  getPersonaConfig,
  isMockMode,
  type PersonaConfig,
} from "@/lib/config/persona";
import { loadSettingsFile } from "@/lib/config/settings";
import { COUNCIL_RESPONSE_SCHEMA } from "@/lib/providers/council-schema";
import { assertCompletionNotTruncated } from "@/lib/providers/completion-validation";
import { getProviderAdapter } from "@/lib/providers";
import {
  parseCouncilOpinion,
} from "@/lib/providers/parse-json";
import { mockCouncilOpinion } from "@/lib/providers/mock";
import { toAsciiHyphens } from "@/lib/auth/session";
import { MagiConfigError } from "@/lib/decision/magi-verdict";
import { debugLlmLog, inspectResponseKeys } from "@/lib/debug-llm";
import { resolveCouncilPrompt } from "@/lib/decision/resolve-council-prompt";
import {
  extractiveSynthesis,
  llmSynthesis,
} from "@/lib/decision/summarizer-run";

export { extractiveSynthesis };

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${ms}ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runCouncilUnit(
  config: PersonaConfig,
  topic: string,
): Promise<CouncilOpinion> {
  const base: Pick<CouncilOpinion, "id" | "number"> = {
    id: config.id,
    number: config.number,
  };

  try {
    if (isMockMode()) {
      const analysis = mockCouncilOpinion(config.id, topic);
      return {
        ...base,
        unitStatus: "ok",
        proposal: analysis.proposal,
        rationale: analysis.rationale,
        risks: analysis.risks,
        missing_information: analysis.missing_information,
      };
    }

    if (!config.apiKey && config.provider !== "openai-compatible") {
      throw new MagiConfigError(
        `Missing API key for ${config.id} (provider=${config.provider}). Set ${config.id}_API_KEY or enable MAGI_MOCK_MODE=true.`,
      );
    }
    if (config.provider === "openai-compatible" && !config.baseUrl) {
      throw new MagiConfigError(
        `Missing BASE_URL for ${config.id} openai-compatible provider.`,
      );
    }

    const adapter = getProviderAdapter(config.provider);
    const systemPrompt = resolveCouncilPrompt(config);
    const completion = await withTimeout(
      adapter.complete({
        model: config.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: topic },
        ],
        maxOutputTokens: config.maxOutputTokens,
        temperature: config.temperature,
        timeoutMs: config.timeoutMs,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        reasoningEffort: config.reasoningEffort,
        responseSchema: config.provider === "openai-compatible" && config.councilStructuredOutput
          ? COUNCIL_RESPONSE_SCHEMA : undefined,
      }),
      config.timeoutMs,
      config.id,
    );

    try {
      assertCompletionNotTruncated(completion, config.id, config.maxOutputTokens);
      const analysis = parseCouncilOpinion(completion.text);
      debugLlmLog({
        mode: "council",
        personaId: config.id,
        provider: config.provider,
        model: config.model,
        finish_reason: completion.finish_reason ?? null,
        responseLength: completion.text.length,
        questionLength: topic.length,
        ...inspectResponseKeys(completion.text),
      });
      return {
        ...base,
        unitStatus: "ok",
        proposal: analysis.proposal,
        rationale: analysis.rationale,
        risks: analysis.risks,
        missing_information: analysis.missing_information,
      };
    } catch (parseErr) {
      const schemaError =
        parseErr instanceof Error ? parseErr.message : String(parseErr);
      debugLlmLog({
        mode: "council",
        personaId: config.id,
        provider: config.provider,
        model: config.model,
        finish_reason: completion.finish_reason ?? null,
        responseLength: completion.text.length,
        questionLength: topic.length,
        schemaError,
        ...inspectResponseKeys(completion.text),
      });
      throw parseErr;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ...base,
      unitStatus: "error",
      error: message,
    };
  }
}


/**
 * One-round MAGI council: three independent open-ended opinions + synthesis.
 */
export async function runMagiCouncil(topic: string): Promise<MagiCouncilResult> {
  await loadSettingsFile();
  const trimmed = topic.trim();
  if (!trimmed) throw new Error("Topic/question must not be empty");

  const configs = MAGI_UNITS.map((id) => getPersonaConfig(id));
  const settled = await Promise.all(
    configs.map((c) => runCouncilUnit(c, trimmed)),
  );

  const opinions = Object.fromEntries(
    settled.map((o) => [o.id, o]),
  ) as Record<MagiId, CouncilOpinion>;

  const okCount = settled.filter((o) => o.unitStatus === "ok").length;
  const status = okCount === 3 ? "complete" : "incomplete";

  if (isMockMode()) {
    const syn = extractiveSynthesis(settled);
    return {
      status,
      opinions,
      ...syn,
      synthesis_mode: "mock",
      recommendation:
        `[MOCK SYNTHESIS]\n${syn.recommendation}`,
    };
  }

  const llm = await llmSynthesis(trimmed, settled);
  if (llm.kind === "ok") {
    return {
      status,
      opinions,
      ...llm.fields,
      synthesis_mode: "llm",
    };
  }

  if (llm.kind === "error") {
    const syn = extractiveSynthesis(settled, { failedSummarizer: true });
    return {
      status,
      opinions,
      ...syn,
      synthesis_mode: "extractive",
      synthesis_error: llm.error,
    };
  }

  const syn = extractiveSynthesis(settled);
  return {
    status,
    opinions,
    ...syn,
    synthesis_mode: "extractive",
  };
}

/** Format council result for OpenAI-compatible assistant content. */
export function formatCouncilContent(result: MagiCouncilResult): string {
  const lines: string[] = [];
  lines.push(`## MAGI Council (${result.status})`);
  lines.push(`Synthesis: ${result.synthesis_mode}`);
  if (result.synthesis_error) {
    lines.push(
      `Synthesis error (${result.synthesis_error.stage}): ${result.synthesis_error.message}`,
    );
  }
  lines.push("");
  lines.push("## Independent Opinions");
  for (const id of MAGI_UNITS) {
    const o = result.opinions[id];
    if (o.unitStatus === "error") {
      lines.push(`### ${id} - ERROR`);
      lines.push(o.error ?? "unknown error");
    } else {
      lines.push(`### ${id}`);
      lines.push(`Proposal: ${o.proposal}`);
      lines.push(`Rationale: ${o.rationale}`);
      if (o.risks?.length) lines.push(`Risks: ${o.risks.join("; ")}`);
      if (o.missing_information?.length) {
        lines.push(`Missing: ${o.missing_information.join("; ")}`);
      }
    }
    lines.push("");
  }
  if (result.consensus.length) {
    lines.push("## Consensus");
    for (const c of result.consensus) lines.push(`- ${c}`);
    lines.push("");
  }
  if (result.disagreements.length) {
    lines.push("## Disagreements");
    for (const d of result.disagreements) lines.push(`- ${d}`);
    lines.push("");
  }
  if (result.minority_views.length) {
    lines.push("## Minority Views (retained)");
    for (const m of result.minority_views) lines.push(`- ${m}`);
    lines.push("");
  }
  lines.push("## Recommendation");
  lines.push(result.recommendation);
  if (result.missing_information.length) {
    lines.push("");
    lines.push("## Missing Information");
    for (const m of result.missing_information) lines.push(`- ${m}`);
  }
  return toAsciiHyphens(lines.join("\n"));
}

export { resolveSummarizer } from "@/lib/decision/summarizer-key";
export { llmSynthesis } from "@/lib/decision/summarizer-run";
export type { LlmSynthesisOutcome } from "@/lib/decision/summarizer-run";
