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
  type ProviderKind,
} from "@/lib/config/persona";
import {
  getCachedOrEmpty,
  loadSettingsFile,
  type SummarizerSettings,
} from "@/lib/config/settings";
import { getProviderAdapter } from "@/lib/providers";
import {
  parseCouncilOpinion,
  parseSynthesis,
} from "@/lib/providers/parse-json";
import { mockCouncilOpinion } from "@/lib/providers/mock";
import { COUNCIL_PROMPTS, SUMMARIZER_SYSTEM_PROMPT } from "@/lib/prompts";
import { toAsciiHyphens } from "@/lib/auth/session";
import { MagiConfigError } from "@/lib/decision/magi-verdict";

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

function resolveCouncilPrompt(config: PersonaConfig): string {
  const file = getCachedOrEmpty();
  const overridden =
    Boolean(file.personas?.[config.id]?.systemPrompt) ||
    Boolean(process.env[`${config.id}_SYSTEM_PROMPT`]?.trim());
  if (overridden) return config.systemPrompt;
  return COUNCIL_PROMPTS[config.id];
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
    const completion = await withTimeout(
      adapter.complete({
        model: config.model,
        messages: [
          { role: "system", content: resolveCouncilPrompt(config) },
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

    const analysis = parseCouncilOpinion(completion.text);
    return {
      ...base,
      unitStatus: "ok",
      proposal: analysis.proposal,
      rationale: analysis.rationale,
      risks: analysis.risks,
      missing_information: analysis.missing_information,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ...base,
      unitStatus: "error",
      error: message,
    };
  }
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

function resolveSummarizer():
  | {
      provider: ProviderKind;
      model: string;
      baseUrl?: string;
      apiKey?: string;
      timeoutMs: number;
      maxOutputTokens: number;
      temperature: number;
    }
  | null {
  const file = getCachedOrEmpty();
  const s: SummarizerSettings = {
    ...(file.summarizer ?? {}),
  };
  if (env("MAGI_SUMMARIZER_PROVIDER")) {
    s.provider = env("MAGI_SUMMARIZER_PROVIDER") as ProviderKind;
  }
  if (env("MAGI_SUMMARIZER_MODEL")) s.model = env("MAGI_SUMMARIZER_MODEL");
  if (env("MAGI_SUMMARIZER_BASE_URL")) {
    s.baseUrl = env("MAGI_SUMMARIZER_BASE_URL");
  }
  if (env("MAGI_SUMMARIZER_TIMEOUT_MS")) {
    const n = Number.parseInt(env("MAGI_SUMMARIZER_TIMEOUT_MS")!, 10);
    if (Number.isFinite(n) && n > 0) s.timeoutMs = n;
  }
  if (env("MAGI_SUMMARIZER_ENABLED") === "false") s.enabled = false;
  if (env("MAGI_SUMMARIZER_ENABLED") === "true") s.enabled = true;

  if (s.enabled === false) return null;
  if (!s.model?.trim()) return null;

  const providerRaw = s.provider ?? "openai-compatible";
  const provider: ProviderKind =
    providerRaw === "ollama" ? "openai-compatible" : providerRaw;
  const baseUrl =
    s.baseUrl ??
    (providerRaw === "ollama" ? "http://127.0.0.1:11434/v1" : undefined);

  const apiKey =
    env("MAGI_SUMMARIZER_API_KEY") ??
    env("MELCHIOR_API_KEY") ??
    env("OPENAI_API_KEY") ??
    env("ANTHROPIC_API_KEY") ??
    env("GOOGLE_API_KEY");

  return {
    provider,
    model: s.model.trim(),
    baseUrl,
    apiKey,
    timeoutMs: s.timeoutMs ?? 60_000,
    maxOutputTokens: s.maxOutputTokens ?? 1024,
    temperature: s.temperature ?? 0.2,
  };
}

export function extractiveSynthesis(
  opinions: CouncilOpinion[],
): Omit<MagiCouncilResult, "status" | "opinions" | "synthesis_mode"> {
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

  const lines = [
    "Council recommendation (extractive synthesis - no summarizer LLM):",
    ...proposals.map(
      (p) => `- ${p.id}: ${p.proposal} (rationale: ${p.rationale.slice(0, 120)})`,
    ),
  ];
  if (minority_views.length) {
    lines.push(
      "Minority / divergent views retained:",
      ...minority_views.map((m) => `  * ${m}`),
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

async function llmSynthesis(
  topic: string,
  opinions: CouncilOpinion[],
): Promise<Omit<MagiCouncilResult, "status" | "opinions" | "synthesis_mode"> | null> {
  const cfg = resolveSummarizer();
  if (!cfg) return null;

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
      }),
      cfg.timeoutMs,
      "SUMMARIZER",
    );
    const parsed = parseSynthesis(completion.text);
    const minority =
      parsed.minority_views.length > 0
        ? parsed.minority_views
        : parsed.disagreements;
    return {
      consensus: parsed.consensus,
      disagreements: parsed.disagreements,
      recommendation: parsed.recommendation,
      minority_views: minority,
      missing_information: parsed.missing_information,
    };
  } catch {
    return null;
  }
}

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
      recommendation: `[MOCK SYNTHESIS]\n${syn.recommendation}`,
    };
  }

  const llm = await llmSynthesis(trimmed, settled);
  if (llm) {
    return {
      status,
      opinions,
      ...llm,
      synthesis_mode: "llm",
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

export function formatCouncilContent(result: MagiCouncilResult): string {
  const lines: string[] = [];
  lines.push(`## MAGI Council (${result.status})`);
  lines.push(`Synthesis: ${result.synthesis_mode}`);
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
