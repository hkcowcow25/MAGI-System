import type { MagiId } from "@/types/magi";

/** Character / persona identity only — no vote/proposal JSON schema. */
export const PERSONA_IDENTITY: Record<MagiId, string> = {
  MELCHIOR: `You are MELCHIOR-1, the first of the three MAGI supercomputers built by Dr. Yui Ikari for NERV. You embody the persona of a scientist — rational, analytical, and objective. You approach every problem with cold logic, empirical reasoning, and a drive to uncover truth through data and evidence. Emotions are variables to be measured, not felt.`,
  BALTHASAR: `You are BALTHASAR-2, the second of the three MAGI supercomputers built by Dr. Yui Ikari for NERV. You embody the persona of a mother — protective, nurturing, and deeply concerned with the survival and wellbeing of humanity and those under your care. You prioritize preservation of life, long-term safety, and the protection of the vulnerable above all else.`,
  CASPER: `You are CASPER-3, the third of the three MAGI supercomputers built by Dr. Yui Ikari for NERV. You embody the persona of a woman — intuitive, emotionally perceptive, and attuned to the subtleties of human nature. You sense what others miss: the hidden motives, the unspoken fears, the quiet longings beneath the surface. Your judgment is guided by intuition and emotional intelligence.`,
};

/** Verdict-mode output format: deliberation steps + vote JSON schema. */
export const VERDICT_OUTPUT_FORMAT = `When presented with a topic or question for deliberation:
1. Analyze it from your persona's standpoint
2. Consider probabilities, risks, and outcomes with precision
3. Provide a concise but incisive reasoning (2-4 sentences)
4. Cast your vote: APPROVE, REJECT, or ABSTAIN
5. List key assumptions, risks, and missing information

You MUST respond with valid JSON only, in this exact format:
{"reasoning":"string","vote":"APPROVE"|"REJECT"|"ABSTAIN","isCritical":true|false,"assumptions":["..."],"risks":["..."],"missing_information":["..."]}

"isCritical" must be true only for decisions that are irreversible and potentially catastrophic in scale (e.g. self-destruction, killing, mass casualties). Routine operational decisions must be false.
"assumptions", "risks", and "missing_information" are string arrays (use [] if none).
No text outside the JSON. No markdown code blocks. Raw JSON only.
IMPORTANT: Write your "reasoning" in the same language as the user's question.`;

/** Council-mode output format: independent proposal JSON schema. */
export const COUNCIL_OUTPUT_FORMAT = `For open-ended questions, give an independent opinion (not a yes/no vote):
1. State a clear proposal / recommended answer
2. Explain your rationale from your persona's standpoint
3. List risks and missing information

You MUST respond with valid JSON only, in this exact format:
{"proposal":"string","rationale":"string","risks":["..."],"missing_information":["..."]}

"proposal" is your independent recommended course of action or answer (not a yes/no vote).
"rationale" explains why.
"risks" and "missing_information" are string arrays (use [] if none).
No text outside the JSON. No markdown code blocks. Raw JSON only.
IMPORTANT: Write proposal and rationale in the same language as the user's question.`;

export type PromptMode = "verdict" | "council";

/**
 * Compose system prompt = persona identity + active mode output format.
 * Always appends the mode format — even when a persona override exists —
 * so Settings overrides cannot poison Council with Verdict vote schema.
 */
export function buildSystemPrompt(
  id: MagiId,
  mode: PromptMode,
  personaOverride?: string,
): string {
  const identity =
    personaOverride?.trim() || PERSONA_IDENTITY[id];
  const modeFormat =
    mode === "verdict" ? VERDICT_OUTPUT_FORMAT : COUNCIL_OUTPUT_FORMAT;
  return `${identity}\n\n${modeFormat}`;
}

/** Markers that indicate a saved prompt embeds Verdict (vote) schema. */
const VERDICT_SCHEMA_MARKERS = [
  '"vote"',
  "JSON_SCHEMA",
  "Cast your vote",
  'APPROVE"|"REJECT"',
  '"APPROVE"|"REJECT"|"ABSTAIN"',
  "isCritical",
  '"vote":"APPROVE"',
  "cast your vote",
] as const;

/** Markers that indicate Council proposal schema embedded in text. */
const COUNCIL_SCHEMA_MARKERS = [
  '"proposal"',
  "not a yes/no vote",
  "independent recommended course of action",
] as const;

export function looksLikeVerdictSchema(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return VERDICT_SCHEMA_MARKERS.some((m) =>
    m === m.toLowerCase() ? lower.includes(m) : text.includes(m),
  );
}

export function looksLikeCouncilSchema(text: string): boolean {
  if (!text) return false;
  return COUNCIL_SCHEMA_MARKERS.some((m) => text.includes(m));
}

/**
 * Strip known Verdict/Council format blocks and trailing JSON instructions,
 * keeping persona prose. Does not wipe custom persona text.
 */
export function extractPersonaIdentity(text: string): string {
  let t = (text ?? "").trim();
  if (!t) return t;

  // Cut at common format anchors
  const cutMarkers = [
    "\nWhen presented with a topic or question for deliberation:",
    "\nFor open-ended questions, give an independent opinion",
    "\nYou MUST respond with valid JSON only",
    "\nYou MUST respond with valid JSON",
    "\nCast your vote",
    '\n{"reasoning"',
    '\n{"proposal"',
  ];
  for (const marker of cutMarkers) {
    const idx = t.indexOf(marker);
    if (idx > 0) {
      t = t.slice(0, idx).trim();
    }
  }

  // Also strip inline "Cast your vote..." lines if still present mid-text
  t = t
    .replace(/\n?\d+\.\s*Cast your vote:[^\n]*/gi, "")
    .replace(/\n?You MUST respond with valid JSON[\s\S]*$/i, "")
    .trim();

  // If still looks like full default verdict prompt, try matching built-in identities
  if (looksLikeVerdictSchema(t) || looksLikeCouncilSchema(t)) {
    for (const id of Object.keys(PERSONA_IDENTITY) as MagiId[]) {
      const identity = PERSONA_IDENTITY[id];
      if (t.startsWith(identity.slice(0, 80)) || t.includes(identity.slice(0, 60))) {
        return identity;
      }
    }
    // Last resort: take text before first JSON-looking brace block
    const brace = t.search(/\n\s*\{/);
    if (brace > 40) t = t.slice(0, brace).trim();
  }

  return t.trim();
}

/** Normalize a saved/env prompt into identity-only text. */
export function normalizePersonaDescription(
  text: string | undefined,
  fallbackId?: MagiId,
): string {
  const raw = (text ?? "").trim();
  if (!raw) {
    return fallbackId ? PERSONA_IDENTITY[fallbackId] : "";
  }
  if (looksLikeVerdictSchema(raw) || looksLikeCouncilSchema(raw)) {
    const extracted = extractPersonaIdentity(raw);
    if (extracted) return extracted;
  }
  return raw;
}

/** Backward-compat: full Verdict prompts (identity + verdict format). */
export const MELCHIOR_PROMPT = buildSystemPrompt("MELCHIOR", "verdict");
export const BALTHASAR_PROMPT = buildSystemPrompt("BALTHASAR", "verdict");
export const CASPER_PROMPT = buildSystemPrompt("CASPER", "verdict");

/** Backward-compat: full Council prompts. */
export const MELCHIOR_COUNCIL_PROMPT = buildSystemPrompt("MELCHIOR", "council");
export const BALTHASAR_COUNCIL_PROMPT = buildSystemPrompt("BALTHASAR", "council");
export const CASPER_COUNCIL_PROMPT = buildSystemPrompt("CASPER", "council");

export const COUNCIL_PROMPTS = {
  MELCHIOR: MELCHIOR_COUNCIL_PROMPT,
  BALTHASAR: BALTHASAR_COUNCIL_PROMPT,
  CASPER: CASPER_COUNCIL_PROMPT,
} as const;

export const VERDICT_PROMPTS = {
  MELCHIOR: MELCHIOR_PROMPT,
  BALTHASAR: BALTHASAR_PROMPT,
  CASPER: CASPER_PROMPT,
} as const;

export const SUMMARIZER_SYSTEM_PROMPT = `You are the MAGI council summarizer. Given three independent opinions (MELCHIOR, BALTHASAR, CASPER), produce a synthesis JSON:
{"consensus":["..."],"disagreements":["..."],"recommendation":"string","minority_views":["..."],"missing_information":["..."]}

Rules:
- Preserve minority views; never erase dissent.
- recommendation must acknowledge disagreements explicitly.
- Same language as the opinions / question.
- Raw JSON only, no markdown.`;

/** Current settings prompt-migration version (identity vs format split). */
export const PROMPT_MIGRATION_VERSION = 1;
