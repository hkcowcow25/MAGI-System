import type { CouncilOpinion, MagiSynthesisError } from "@/types/magi";
import { loadSettingsFile } from "@/lib/config/settings";
import { isMockMode } from "@/lib/config/persona";
import {
  llmSynthesis,
  resolveSummarizer,
} from "@/lib/decision/magi-council-impl";

export type SummarizerTestResult = {
  ok: boolean;
  stage: MagiSynthesisError["stage"] | "ok" | "disabled" | "mock";
  message: string;
  provider?: string;
  model?: string;
  finish_reason?: string | null;
  preview?: string;
  httpStatus?: number;
};

const FIXTURE_OPINIONS: CouncilOpinion[] = [
  {
    id: "MELCHIOR",
    number: 1,
    unitStatus: "ok",
    proposal: "Run a two-week pilot with clear metrics.",
    rationale: "Empirical validation before full rollout.",
    risks: ["Sample bias"],
    missing_information: ["Baseline conversion rate"],
  },
  {
    id: "BALTHASAR",
    number: 2,
    unitStatus: "ok",
    proposal: "Add safety review and rollback plan before pilot.",
    rationale: "Protect users and preserve trust.",
    risks: ["Delay"],
    missing_information: ["On-call coverage"],
  },
  {
    id: "CASPER",
    number: 3,
    unitStatus: "ok",
    proposal: "Include user interviews alongside quantitative metrics.",
    rationale: "Catch unspoken friction early.",
    risks: ["Interview fatigue"],
    missing_information: ["Target segment"],
  },
];

/**
 * Standalone summarizer probe — does NOT run three personas.
 * Uses fixture (or caller-supplied) opinions only.
 */
export async function runSummarizerTest(
  sampleOpinions?: CouncilOpinion[],
): Promise<SummarizerTestResult> {
  await loadSettingsFile();

  if (isMockMode()) {
    return {
      ok: true,
      stage: "mock",
      message: "MAGI_MOCK_MODE=true — summarizer not called (模擬成功)。",
      preview: "mock: extractive would be used in mock council",
    };
  }

  const cfg = resolveSummarizer();
  if (!cfg) {
    return {
      ok: false,
      stage: "disabled",
      message:
        "摘要 LLM 未設定或已停用（需要 enabled + model）。設定後再試「測試摘要」。",
    };
  }

  if (cfg.configError) {
    return {
      ok: false,
      stage: "config",
      message: cfg.configError,
      provider: cfg.provider,
      model: cfg.model,
    };
  }

  const opinions = sampleOpinions?.length ? sampleOpinions : FIXTURE_OPINIONS;
  const outcome = await llmSynthesis(
    "Summarizer self-test: synthesize the three fixture opinions.",
    opinions,
  );

  if (outcome.kind === "disabled") {
    return {
      ok: false,
      stage: "disabled",
      message: "摘要 LLM 未設定。",
      provider: cfg.provider,
      model: cfg.model,
    };
  }

  if (outcome.kind === "error") {
    return {
      ok: false,
      stage: outcome.error.stage,
      message: outcome.error.message,
      provider: outcome.error.provider ?? cfg.provider,
      model: outcome.error.model ?? cfg.model,
      finish_reason: outcome.error.finish_reason,
      httpStatus: outcome.error.httpStatus,
    };
  }

  const preview = outcome.fields.recommendation.slice(0, 240);
  return {
    ok: true,
    stage: "ok",
    message: "摘要 LLM 測試成功。",
    provider: cfg.provider,
    model: cfg.model,
    preview,
  };
}
