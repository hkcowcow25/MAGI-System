import type { MagiId, MagiMode } from "@/types/magi";
import { MAGI_UNITS } from "@/lib/decision/verdict";
import { getPersonaConfig, isMockMode } from "@/lib/config/persona";
import {
  insertDeliberation,
  type HistoryModels,
} from "@/lib/history/store";
import type {
  EngineSnapshot,
  HistoryInsertInput,
  HistoryRecord,
  HistorySource,
  HistoryStatus,
} from "@/lib/history/types";
import { stripSecretsDeep } from "@/lib/history/sanitize";

export function captureUnitModels(): HistoryModels {
  const models = {} as HistoryModels;
  for (const id of MAGI_UNITS) {
    const c = getPersonaConfig(id);
    models[id] = {
      provider: c.provider,
      model: c.model,
    };
  }
  return models;
}

function collectUnitErrors(
  units: Record<MagiId, { unitStatus?: string; error?: string }> | null,
): string[] {
  if (!units) return [];
  const out: string[] = [];
  for (const id of MAGI_UNITS) {
    const u = units[id];
    if (u?.unitStatus === "error" && u.error) {
      out.push(`${id}: ${u.error}`);
    }
  }
  return out;
}

export function buildHistoryFromEngineResult(args: {
  topic: string;
  source: HistorySource;
  result: EngineSnapshot;
  durationMs: number;
  models?: HistoryModels;
}): HistoryInsertInput {
  const { topic, source, result, durationMs } = args;
  const models = args.models ?? captureUnitModels();
  const mock = isMockMode();

  if (result.mode === "verdict") {
    const status: HistoryStatus =
      result.status === "incomplete" ? "incomplete" : "complete";
    const errors = collectUnitErrors(result.results);
    return {
      topic,
      mode: "verdict",
      source,
      mock,
      status,
      durationMs,
      models,
      units: stripSecretsDeep(result.results),
      outcome: stripSecretsDeep({
        verdict: result.verdict,
        status: result.status,
        disagreements: result.disagreements,
        missing_information: result.missing_information,
        next_steps: result.next_steps,
      }),
      errors: errors.length ? errors : null,
    };
  }

  const status: HistoryStatus =
    result.status === "incomplete" ? "incomplete" : "complete";
  const errors = collectUnitErrors(result.opinions);
  return {
    topic,
    mode: "council",
    source,
    mock,
    status,
    durationMs,
    models,
    units: stripSecretsDeep(result.opinions),
    outcome: stripSecretsDeep({
      status: result.status,
      consensus: result.consensus,
      disagreements: result.disagreements,
      recommendation: result.recommendation,
      minority_views: result.minority_views,
      missing_information: result.missing_information,
      synthesis_mode: result.synthesis_mode,
    }),
    errors: errors.length ? errors : null,
  };
}

export function buildHistoryFromFailure(args: {
  topic: string;
  mode: MagiMode;
  source: HistorySource;
  durationMs: number;
  error: unknown;
  models?: HistoryModels;
}): HistoryInsertInput {
  const message =
    args.error instanceof Error ? args.error.message : String(args.error);
  return {
    topic: args.topic || "(empty)",
    mode: args.mode,
    source: args.source,
    mock: isMockMode(),
    status: "error",
    durationMs: args.durationMs,
    models: args.models ?? captureUnitModels(),
    units: null,
    outcome: null,
    errors: [message],
  };
}

/**
 * Persist a deliberation (success, incomplete, or failure).
 * Never throws to callers of the engine — logging failures are swallowed.
 */
export async function recordDeliberationSafe(
  input: HistoryInsertInput,
): Promise<HistoryRecord | null> {
  try {
    return await insertDeliberation(input);
  } catch (err) {
    console.error(
      "[magi-history] failed to persist deliberation:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
