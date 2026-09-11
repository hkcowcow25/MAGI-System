import type {
  MagiCouncilResult,
  CouncilOpinion,
  MagiSynthesisError,
} from "@/types/magi";
import { getProviderAdapter } from "@/lib/providers";
import { parseSynthesis } from "@/lib/providers/parse-json";
import { extractProviderFailure } from "@/lib/providers/errors";
import { SUMMARIZER_SYSTEM_PROMPT } from "@/lib/prompts";
import { debugLlmLog, inspectResponseKeys } from "@/lib/debug-llm";
import { resolveSummarizer } from "@/lib/decision/summarizer-key";

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

/** Deterministic extractive synthesis — no extra LLM call. */
export function extractiveSynthesis(
  opinions: CouncilOpinion[],
  opts?: { failedSummarizer?: boolean },
): Omit<MagiCouncilResult, "status" | "opinions" | "synthesis_mode" | "synthesis_error"> {
  const ok = opinions.filter((o) => o.unitStatus === "ok");
  const consensus: string[] = [];
  const disagreements: string[] = [];
  const minority_views: string[] = [];
  const missing = new Set<string>();

  for (const o of opinions) {
    for (const m of o.missing_information ?? []) missing.add(m);
    if (o.unitStatus === "error") {
      missing.add(`${o.id} unit failed: ${o.error ?? "unknown error"}`);
    }
  }

  if (ok.length === 0) {
    return {
      consensus: [],
      disagreements: ["No successful council opinions."],
      recommendation:
        "Council incomplete — fix unit errors and retry. Minority views unavailable.",
      minority_views: [],
      missing_information: [...missing],
    };
  }

  // Simple heuristic: if proposals share a leading verb / keyword, note agreement
  const proposals = ok.map((o) => ({
    id: o.id,
    proposal: (o.proposal ?? "").trim(),
    rationale: (o.rationale ?? "").trim(),
  }));

  if (proposals.length >= 2) {
    consensus.push(
      `All responding units (${proposals.map((p) => p.id).join(", ")}) offered independent proposals.`,
    );
  }

  // Treat differing proposal texts as disagreements / minority
  for (const p of proposals) {
    const others = proposals.filter((x) => x.id !== p.id);
    const similar = others.some(
      (o) =>
        o.proposal.toLowerCase().includes(p.proposal.toLowerCase().slice(0, 24)) ||
        p.proposal.toLowerCase().includes(o.proposal.toLowerCase().slice(0, 24)),
    );
    if (!similar && others.length) {
      disagreements.push(`${p.id} differs: ${p.proposal.slice(0, 160)}`);
      minority_views.push(`${p.id}: ${p.proposal.slice(0, 200)}`);
    }
  }

  if (!disagreements.length && proposals.length >= 2) {
    consensus.push("Proposals appear broadly aligned on direction.");
  }

  const header = opts?.failedSummarizer
    ? "Council recommendation (extractive fallback — summarizer LLM failed):"
    : "Council recommendation (extractive synthesis — no summarizer LLM):";

  // Preserve every unit's proposal in the recommendation body
  const lines = [
    header,
    ...proposals.map(
      (p) => `- ${p.id}: ${p.proposal} (rationale: ${p.rationale.slice(0, 120)})`,
    ),
  ];
  if (minority_views.length) {
    lines.push(
      "Minority / divergent views retained:",
      ...minority_views.map((m) => `  • ${m}`),
    );
  }

  return {
    consensus,
    disagreements,
    recommendation: lines.join("\n"),
    minority_views,
    missing_information: [...missing],
  };
}

type SynthesisFields = Omit<
  MagiCouncilResult,
  "status" | "opinions" | "synthesis_mode" | "synthesis_error"
>;

export type LlmSynthesisOutcome =
  | { kind: "disabled" }
  | { kind: "ok"; fields: SynthesisFields }
  | { kind: "error"; error: MagiSynthesisError };

export async function llmSynthesis(
  topic: string,
  opinions: CouncilOpinion[],
): Promise<LlmSynthesisOutcome> {
  const cfg = resolveSummarizer();
  if (!cfg) return { kind: "disabled" };

  if (cfg.configError) {
    return {
      kind: "error",
      error: {
        stage: "config",
        message: cfg.configError,
        provider: cfg.provider,
        model: cfg.model,
      },
    };
  }

  const payload = {
    topic,
    opinions: opinions.map((o) =>
      o.unitStatus === "ok"
        ? {
            id: o.id,
            proposal: o.proposal,
            rationale: o.rationale,
            risks: o.risks,
            missing_information: o.missing_information,
          }
        : { id: o.id, error: o.error },
    ),
  };

  try {
    const adapter = getProviderAdapter(cfg.provider);
    const completion = await withTimeout(
      adapter.complete({
        model: cfg.model,
        messages: [
          { role: "system", content: SUMMARIZER_SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(payload) },
        ],
        maxOutputTokens: cfg.maxOutputTokens,
        temperature: cfg.temperature,
        timeoutMs: cfg.timeoutMs,
        apiKey: cfg.apiKey,
        baseUrl: cfg.baseUrl,
        // Do NOT set responseJson by default — prompts carry schema; Google mime is opt-in.
      }),
      cfg.timeoutMs,
      "SUMMARIZER",
    );

    debugLlmLog({
      mode: "summarizer",
      provider: cfg.provider,
      model: cfg.model,
      finish_reason: completion.finish_reason ?? null,
      responseLength: completion.text?.length ?? 0,
      questionLength: topic.length,
      ...inspectResponseKeys(completion.text ?? ""),
    });

    if (!completion.text?.trim()) {
      return {
        kind: "error",
        error: {
          stage: "empty",
          message: "Summarizer returned empty content",
          provider: cfg.provider,
          model: cfg.model,
          finish_reason: completion.finish_reason ?? null,
        },
      };
    }

    try {
      const parsed = parseSynthesis(completion.text);
      const minority =
        parsed.minority_views.length > 0
          ? parsed.minority_views
          : parsed.disagreements;
      return {
        kind: "ok",
        fields: {
          consensus: parsed.consensus,
          disagreements: parsed.disagreements,
          recommendation: parsed.recommendation,
          minority_views: minority,
          missing_information: parsed.missing_information,
        },
      };
    } catch (parseErr) {
      const msg =
        parseErr instanceof Error ? parseErr.message : String(parseErr);
      return {
        kind: "error",
        error: {
          stage: "parse",
          message: msg,
          provider: cfg.provider,
          model: cfg.model,
          finish_reason: completion.finish_reason ?? null,
        },
      };
    }
  } catch (err) {
    const { message, httpStatus } = extractProviderFailure(err);
    return {
      kind: "error",
      error: {
        stage: "api",
        message,
        provider: cfg.provider,
        model: cfg.model,
        httpStatus,
      },
    };
  }
}
