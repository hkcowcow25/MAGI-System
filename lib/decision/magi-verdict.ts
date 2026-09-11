import { MagiId, MagiDeliberationResult, MagiResult } from "@/types/magi";
import { computeFinalVerdict, MAGI_UNITS } from "@/lib/decision/verdict";
import {
  getPersonaConfig,
  isMockMode,
  type PersonaConfig,
} from "@/lib/config/persona";
import { getProviderAdapter, parseUnitAnalysis } from "@/lib/providers";
import { mockUnitAnalysis } from "@/lib/providers/mock";
import { toAsciiHyphens } from "@/lib/auth/session";
import { loadSettingsFile } from "@/lib/config/settings";

export class MagiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MagiConfigError";
  }
}

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

async function runUnit(
  config: PersonaConfig,
  topic: string,
): Promise<MagiResult> {
  const base: Pick<MagiResult, "id" | "number"> = {
    id: config.id,
    number: config.number,
  };

  try {
    if (isMockMode()) {
      const analysis = mockUnitAnalysis(config.id, topic);
      return {
        ...base,
        unitStatus: "ok",
        vote: analysis.vote,
        reasoning: analysis.reasoning,
        isCritical: analysis.isCritical,
        assumptions: analysis.assumptions,
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
    const completion = await withTimeout(
      adapter.complete({
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
      }),
      config.timeoutMs,
      config.id,
    );

    const analysis = parseUnitAnalysis(completion.text);
    return {
      ...base,
      unitStatus: "ok",
      vote: analysis.vote,
      reasoning: analysis.reasoning,
      isCritical: analysis.isCritical,
      assumptions: analysis.assumptions,
      risks: analysis.risks,
      missing_information: analysis.missing_information,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ...base,
      unitStatus: "error",
      reasoning: `SYSTEM ERROR: ${message}`,
      error: message,
    };
  }
}

function collectDisagreements(results: MagiResult[]): string[] {
  const ok = results.filter((r) => r.unitStatus === "ok" && r.vote);
  if (ok.length < 2) return [];
  const votes = new Set(ok.map((r) => r.vote));
  if (votes.size <= 1) return [];
  return ok.map((r) => `${r.id}: ${r.vote} - ${r.reasoning.slice(0, 120)}`);
}

function collectMissing(results: MagiResult[]): string[] {
  const set = new Set<string>();
  for (const r of results) {
    for (const m of r.missing_information ?? []) set.add(m);
    if (r.unitStatus === "error") {
      set.add(`${r.id} unit failed: ${r.error ?? "unknown error"}`);
    }
  }
  return [...set];
}

function suggestNextSteps(
  verdict: MagiDeliberationResult["verdict"],
  results: MagiResult[],
): string[] {
  const steps: string[] = [];
  if (verdict === "INCOMPLETE") {
    steps.push("Retry deliberation after fixing unit errors / API configuration.");
    for (const r of results.filter((x) => x.unitStatus === "error")) {
      steps.push(`Investigate ${r.id}: ${r.error}`);
    }
  } else if (verdict === "DEADLOCK") {
    steps.push("Reframe the question or provide more context to break the deadlock.");
  } else if (verdict === "REJECT") {
    steps.push("Address the stated risks and dissenting rationale before re-proposing.");
  } else if (verdict === "ABSTAIN") {
    steps.push("Supply the missing information listed by the units.");
  } else if (verdict === "APPROVE") {
    steps.push("Proceed with documented assumptions; monitor listed risks.");
  }
  const missing = collectMissing(results).filter(
    (m) => !m.includes("unit failed"),
  );
  if (missing.length) {
    steps.push(`Clarify: ${missing.slice(0, 3).join("; ")}`);
  }
  return steps;
}

/**
 * Shared MAGI decision engine used by web UI actions and /v1 chat completions.
 */
export async function runMagiDeliberation(
  topic: string,
): Promise<MagiDeliberationResult> {
  await loadSettingsFile();
  const trimmed = topic.trim();
  if (!trimmed) {
    throw new Error("Topic/question must not be empty");
  }

  const configs = MAGI_UNITS.map((id) => getPersonaConfig(id));
  const settled = await Promise.all(
    configs.map((c) => runUnit(c, trimmed)),
  );

  const results = Object.fromEntries(
    settled.map((r) => [r.id, r]),
  ) as Record<MagiId, MagiResult>;

  const verdict = computeFinalVerdict(settled);
  const status = verdict === "INCOMPLETE" ? "incomplete" : "complete";

  return {
    status,
    verdict,
    results,
    disagreements: collectDisagreements(settled),
    missing_information: collectMissing(settled),
    next_steps: suggestNextSteps(verdict, settled),
  };
}

/** Format deliberation for OpenAI-compatible assistant content. */
export function formatDeliberationContent(
  deliberation: MagiDeliberationResult,
): string {
  const lines: string[] = [];
  lines.push(`## Final Verdict: ${deliberation.verdict}`);
  lines.push(`Status: ${deliberation.status}`);
  lines.push("");
  lines.push("## Unit Votes");
  for (const id of MAGI_UNITS) {
    const r = deliberation.results[id];
    if (r.unitStatus === "error") {
      lines.push(`### ${id} - ERROR`);
      lines.push(r.reasoning);
    } else {
      lines.push(
        `### ${id} - ${r.vote}${r.isCritical ? " (CRITICAL)" : ""}`,
      );
      lines.push(r.reasoning);
      if (r.assumptions?.length) {
        lines.push(`Assumptions: ${r.assumptions.join("; ")}`);
      }
      if (r.risks?.length) {
        lines.push(`Risks: ${r.risks.join("; ")}`);
      }
    }
    lines.push("");
  }
  if (deliberation.disagreements.length) {
    lines.push("## Disagreements");
    for (const d of deliberation.disagreements) lines.push(`- ${d}`);
    lines.push("");
  }
  if (deliberation.missing_information.length) {
    lines.push("## Missing Information");
    for (const m of deliberation.missing_information) lines.push(`- ${m}`);
    lines.push("");
  }
  if (deliberation.next_steps.length) {
    lines.push("## Next Steps");
    for (const s of deliberation.next_steps) lines.push(`- ${s}`);
  }
  // ASCII hyphens only — Unicode em/en dashes mojibake in PowerShell / legacy encodings.
  return toAsciiHyphens(lines.join("\n"));
}
