export type Vote = "APPROVE" | "REJECT" | "ABSTAIN";

export type MagiId = "MELCHIOR" | "BALTHASAR" | "CASPER";

export type UnitStatus = "ok" | "error";

/** Overall deliberation outcome. INCOMPLETE means fewer than 3 valid votes. */
export type Verdict = Vote | "DEADLOCK" | "INCOMPLETE";

/** Web UI / API deliberation mode. */
export type MagiMode = "verdict" | "council";

export interface MagiResult {
  id: MagiId;
  number: 1 | 2 | 3;
  /** Technical outcome of the unit call. Errors are NEVER disguised as ABSTAIN. */
  unitStatus: UnitStatus;
  reasoning: string;
  /** Present only when unitStatus === "ok". */
  vote?: Vote;
  isCritical?: boolean;
  assumptions?: string[];
  risks?: string[];
  missing_information?: string[];
  error?: string;
}

export type PartialResults = Partial<Record<MagiId, MagiResult>>;

export interface MagiUnitAnalysis {
  vote: Vote;
  reasoning: string;
  assumptions: string[];
  risks: string[];
  missing_information: string[];
  isCritical: boolean;
}

export interface MagiDeliberationResult {
  status: "complete" | "incomplete";
  verdict: Verdict;
  results: Record<MagiId, MagiResult>;
  disagreements: string[];
  missing_information: string[];
  next_steps: string[];
}

/** Open-ended council opinion from one persona (no APPROVE/REJECT vote). */
export interface CouncilOpinion {
  id: MagiId;
  number: 1 | 2 | 3;
  unitStatus: UnitStatus;
  proposal?: string;
  rationale?: string;
  risks?: string[];
  missing_information?: string[];
  error?: string;
}

export interface MagiCouncilResult {
  status: "complete" | "incomplete";
  opinions: Record<MagiId, CouncilOpinion>;
  /** Points where units broadly agree. */
  consensus: string[];
  /** Points of disagreement (minority views preserved). */
  disagreements: string[];
  /** Synthesized recommendation without erasing minority views. */
  recommendation: string;
  /** Explicit minority / dissenting notes. */
  minority_views: string[];
  missing_information: string[];
  /** How the synthesis was produced. */
  synthesis_mode: "llm" | "extractive" | "mock";
}

export type MagiEngineResult =
  | ({ mode: "verdict" } & MagiDeliberationResult)
  | ({ mode: "council" } & MagiCouncilResult);
