import { MagiUnitAnalysis, Vote } from "@/types/magi";

const VALID_VOTES: Vote[] = ["APPROVE", "REJECT", "ABSTAIN"];

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

/**
 * Parse and schema-validate a MAGI unit JSON response.
 * Throws on invalid JSON or missing/invalid vote.
 */
export function parseUnitAnalysis(text: string): MagiUnitAnalysis {
  const cleaned = stripFences(text);

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

export interface CouncilOpinionAnalysis {
  proposal: string;
  rationale: string;
  risks: string[];
  missing_information: string[];
}

export function parseCouncilOpinion(text: string): CouncilOpinionAnalysis {
  const cleaned = stripFences(text);
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
  const proposal =
    typeof obj.proposal === "string"
      ? obj.proposal
      : typeof obj.recommendation === "string"
        ? obj.recommendation
        : "";
  const rationale =
    typeof obj.rationale === "string"
      ? obj.rationale
      : typeof obj.reasoning === "string"
        ? obj.reasoning
        : "";
  if (!proposal.trim()) {
    // Do NOT invent proposal from vote — surface Verdict-schema confusion clearly.
    if (typeof obj.vote === "string") {
      throw new Error(
        "Missing proposal (response looks like Verdict vote schema)",
      );
    }
    throw new Error("Missing proposal");
  }
  if (!rationale.trim()) throw new Error("Missing rationale");
  return {
    proposal,
    rationale,
    risks: asStringArray(obj.risks),
    missing_information: asStringArray(
      obj.missing_information ?? obj.missingInformation,
    ),
  };
}

export interface SynthesisAnalysis {
  consensus: string[];
  disagreements: string[];
  recommendation: string;
  minority_views: string[];
  missing_information: string[];
}

export function parseSynthesis(text: string): SynthesisAnalysis {
  const cleaned = stripFences(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Invalid synthesis JSON from model");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Synthesis is not a JSON object");
  }
  const obj = parsed as Record<string, unknown>;
  const recommendation =
    typeof obj.recommendation === "string" ? obj.recommendation.trim() : "";
  if (!recommendation) throw new Error("Missing recommendation");
  return {
    consensus: asStringArray(obj.consensus),
    disagreements: asStringArray(obj.disagreements),
    recommendation,
    minority_views: asStringArray(
      obj.minority_views ?? obj.minorityViews,
    ),
    missing_information: asStringArray(
      obj.missing_information ?? obj.missingInformation,
    ),
  };
}
