import type { MagiEngineResult, MagiMode } from "@/types/magi";
import {
  formatDeliberationContent,
  runMagiDeliberation,
} from "@/lib/decision/magi-verdict";
import {
  formatCouncilContent,
  runMagiCouncil,
} from "@/lib/decision/magi-council";
import { loadSettingsFile } from "@/lib/config/settings";
import type { HistorySource } from "@/lib/history/types";
import {
  buildHistoryFromEngineResult,
  buildHistoryFromFailure,
  captureUnitModels,
  recordDeliberationSafe,
} from "@/lib/history/record";

export const MAGI_MODEL_IDS = ["magi-verdict", "magi-council"] as const;
export type MagiModelId = (typeof MAGI_MODEL_IDS)[number];

export type RunMagiEngineOptions = {
  /** Who triggered the run — recorded in history. Default "api". */
  source?: HistorySource;
  /** Set false to skip history (tests). Default true. */
  recordHistory?: boolean;
};

export function modeFromModel(model: string | undefined | null): MagiMode {
  if (model === "magi-council") return "council";
  return "verdict";
}

export function isKnownMagiModel(model: string): model is MagiModelId {
  return (MAGI_MODEL_IDS as readonly string[]).includes(model);
}

/**
 * Shared MAGI engine used by Web UI server actions and /v1 chat completions.
 * Persists each run (including incomplete / thrown errors) to the history DB
 * when recordHistory is enabled.
 */
export async function runMagiEngine(
  topic: string,
  mode: MagiMode = "verdict",
  options: RunMagiEngineOptions = {},
): Promise<MagiEngineResult> {
  const source = options.source ?? "api";
  const shouldRecord = options.recordHistory !== false;
  const started = Date.now();
  await loadSettingsFile();
  const models = captureUnitModels();

  try {
    let result: MagiEngineResult;
    if (mode === "council") {
      const council = await runMagiCouncil(topic);
      result = { mode: "council", ...council };
    } else {
      const verdict = await runMagiDeliberation(topic);
      result = { mode: "verdict", ...verdict };
    }

    if (shouldRecord) {
      await recordDeliberationSafe(
        buildHistoryFromEngineResult({
          topic,
          source,
          result,
          durationMs: Date.now() - started,
          models,
        }),
      );
    }
    return result;
  } catch (err) {
    if (shouldRecord) {
      await recordDeliberationSafe(
        buildHistoryFromFailure({
          topic,
          mode,
          source,
          durationMs: Date.now() - started,
          error: err,
          models,
        }),
      );
    }
    throw err;
  }
}

export function formatEngineContent(result: MagiEngineResult): string {
  if (result.mode === "council") return formatCouncilContent(result);
  return formatDeliberationContent(result);
}
