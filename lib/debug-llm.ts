/**
 * Guarded LLM debug logging. Enable with MAGI_DEBUG_LLM=true.
 * Never logs API keys, Authorization headers, or full user questions by default.
 */

export function isMagiDebugLlm(): boolean {
  return process.env.MAGI_DEBUG_LLM === "true";
}

export type MagiDebugLlmFields = {
  mode?: "verdict" | "council" | "test" | "summarizer";
  personaId?: string;
  provider?: string;
  model?: string;
  finish_reason?: string | null;
  responseLength?: number;
  schemaError?: string;
  hasProposal?: boolean;
  hasVote?: boolean;
  hasReasoning?: boolean;
  questionLength?: number;
  [key: string]: string | number | boolean | null | undefined;
};

export function debugLlmLog(fields: MagiDebugLlmFields): void {
  if (!isMagiDebugLlm()) return;
  console.log("[MAGI_DEBUG_LLM]", JSON.stringify(fields));
}

/** Inspect raw model text for key presence without logging content. */
export function inspectResponseKeys(text: string): {
  hasProposal: boolean;
  hasVote: boolean;
  hasReasoning: boolean;
} {
  const t = text ?? "";
  return {
    hasProposal: /"proposal"\s*:/.test(t),
    hasVote: /"vote"\s*:/.test(t),
    hasReasoning: /"reasoning"\s*:|"rationale"\s*:/.test(t),
  };
}
