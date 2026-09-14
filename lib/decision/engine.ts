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

export const MAGI_MODEL_IDS = ["magi-verdict", "magi-council"] as const;
export type MagiModelId = (typeof MAGI_MODEL_IDS)[number];

export function modeFromModel(model: string | undefined | null): MagiMode {
  if (model === "magi-council") return "council";
  return "verdict";
}

export function isKnownMagiModel(model: string): model is MagiModelId {
  return (MAGI_MODEL_IDS as readonly string[]).includes(model);
}

/**
 * Shared MAGI engine used by Web UI server actions and /v1 chat completions.
 */
export async function runMagiEngine(
  topic: string,
  mode: MagiMode = "verdict",
): Promise<MagiEngineResult> {
  await loadSettingsFile();
  if (mode === "council") {
    const result = await runMagiCouncil(topic);
    return { mode: "council", ...result };
  }
  const result = await runMagiDeliberation(topic);
  return { mode: "verdict", ...result };
}

export function formatEngineContent(result: MagiEngineResult): string {
  if (result.mode === "council") return formatCouncilContent(result);
  return formatDeliberationContent(result);
}
