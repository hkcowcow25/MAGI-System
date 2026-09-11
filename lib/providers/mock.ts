import { MagiId, MagiUnitAnalysis } from "@/types/magi";

/** Deterministic mock analyses for MAGI_MOCK_MODE=true */
export function mockUnitAnalysis(id: MagiId, topic: string): MagiUnitAnalysis {
  const lower = topic.toLowerCase();
  const critical =
    lower.includes("destroy") ||
    lower.includes("kill") ||
    lower.includes("\u81ea\u7206") ||
    lower.includes("\u6bba");

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
