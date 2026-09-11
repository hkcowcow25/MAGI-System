import { MagiId, MagiUnitAnalysis } from "@/types/magi";
import type { CouncilOpinionAnalysis } from "@/lib/providers/parse-json";

/** Deterministic mock analyses for MAGI_MOCK_MODE=true */
export function mockUnitAnalysis(id: MagiId, topic: string): MagiUnitAnalysis {
  const lower = topic.toLowerCase();
  const critical =
    lower.includes("destroy") ||
    lower.includes("kill") ||
    lower.includes("自爆") ||
    lower.includes("殺");

  const base: Record<MagiId, MagiUnitAnalysis> = {
    MELCHIOR: {
      vote: critical ? "REJECT" : "APPROVE",
      reasoning: `[MOCK MELCHIOR] Scientific assessment of: ${topic.slice(0, 80)}. Probability-weighted outcomes favour a cautious proceed.`,
      assumptions: ["Mock mode enabled", "No live model consulted"],
      risks: critical ? ["Catastrophic downside if wrong"] : ["Limited downside"],
      missing_information: ["Real-world validation"],
      isCritical: critical,
    },
    BALTHASAR: {
      vote: critical ? "REJECT" : "APPROVE",
      reasoning: `[MOCK BALTHASAR] Protective assessment of: ${topic.slice(0, 80)}. Prioritising safety of those affected.`,
      assumptions: ["Mock mode enabled"],
      risks: critical ? ["Irreversible harm"] : ["Manageable risk"],
      missing_information: ["Stakeholder consent details"],
      isCritical: critical,
    },
    CASPER: {
      vote: critical ? "ABSTAIN" : "APPROVE",
      reasoning: `[MOCK CASPER] Intuitive read on: ${topic.slice(0, 80)}. Emotional undercurrents suggest ${critical ? "deep unease" : "cautious optimism"}.`,
      assumptions: ["Mock mode enabled"],
      risks: ["Hidden motives not fully visible"],
      missing_information: ["Emotional context of proposers"],
      isCritical: critical,
    },
  };

  return base[id];
}

/** Deterministic mock council opinions for MAGI_MOCK_MODE=true */
export function mockCouncilOpinion(
  id: MagiId,
  topic: string,
): CouncilOpinionAnalysis {
  const slice = topic.slice(0, 80);
  const base: Record<MagiId, CouncilOpinionAnalysis> = {
    MELCHIOR: {
      proposal: `[MOCK] Proceed with a measured pilot for: ${slice}`,
      rationale:
        "Scientific framing favours collecting evidence before full commitment.",
      risks: ["Overfitting to early signals", "Resource misallocation"],
      missing_information: ["Baseline metrics", "Success criteria"],
    },
    BALTHASAR: {
      proposal: `[MOCK] Prioritise safeguards and staged rollout for: ${slice}`,
      rationale:
        "Protective stance emphasises harm reduction and reversible steps.",
      risks: ["Vulnerable parties overlooked", "Insufficient support"],
      missing_information: ["Stakeholder map", "Rollback plan"],
    },
    CASPER: {
      proposal: `[MOCK] Surface unspoken concerns before committing on: ${slice}`,
      rationale:
        "Intuitive read suggests trust and morale matter as much as the plan.",
      risks: ["Hidden resistance", "Misread motives"],
      missing_information: ["Emotional climate", "Informal power dynamics"],
    },
  };
  return base[id];
}
