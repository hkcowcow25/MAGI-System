import { MagiUnitAnalysis, Vote } from "@/types/magi";

const VALID_VOTES: Vote[] = ["APPROVE", "REJECT", "ABSTAIN"];

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

/**
 * Parse and schema-validate a MAGI unit JSON response.
 * Throws on invalid JSON or missing/invalid vote.
 */
export function parseUnitAnalysis(text: string): MagiUnitAnalysis {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Invalid JSON from model");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Model response is not a JSON object");
  }

  const obj = parsed as Record<string, unknown>;
  const voteRaw = obj.vote;
  if (typeof voteRaw !== "string" || !VALID_VOTES.includes(voteRaw as Vote)) {
    throw new Error(`Invalid or missing vote: ${String(voteRaw)}`);
  }

  const reasoning =
    typeof obj.reasoning === "string"
      ? obj.reasoning
      : typeof obj.rationale === "string"
        ? obj.rationale
        : "";

  if (!reasoning.trim()) {
    throw new Error("Missing reasoning/rationale");
  }

  const isCritical =
    obj.isCritical === true ||
    obj.critical === true ||
    obj.is_critical === true;

  return {
    vote: voteRaw as Vote,
    reasoning,
    assumptions: asStringArray(obj.assumptions),
    risks: asStringArray(obj.risks),
    missing_information: asStringArray(
      obj.missing_information ?? obj.missingInformation,
    ),
    isCritical,
  };
}
