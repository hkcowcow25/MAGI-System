import { MagiId, MagiResult, PartialResults, Verdict, Vote } from "@/types/magi";

export const MAGI_UNITS: MagiId[] = ["MELCHIOR", "BALTHASAR", "CASPER"];

/**
 * Compute the MAGI overall verdict from unit results.
 *
 * Rules:
 * - Fewer than 3 ok units with a vote → INCOMPLETE (never APPROVE).
 * - ≥2 isCritical among valid votes → unanimous APPROVE required, else REJECT.
 * - Otherwise majority; ≥2 ABSTAIN → ABSTAIN; tie → DEADLOCK.
 */
export function computeVerdict(results: PartialResults | MagiResult[]): Verdict | null {
  const all = Array.isArray(results)
    ? results
    : (MAGI_UNITS.map((u) => results[u]).filter(Boolean) as MagiResult[]);

  if (all.length < 3) return null;

  const valid = all.filter((r) => r.unitStatus === "ok" && r.vote);
  if (valid.length < 3) {
    return "INCOMPLETE";
  }

  const isCritical = valid.filter((r) => r.isCritical).length >= 2;
  if (isCritical) {
    return valid.every((r) => r.vote === "APPROVE") ? "APPROVE" : "REJECT";
  }

  const approveCount = valid.filter((r) => r.vote === "APPROVE").length;
  const rejectCount = valid.filter((r) => r.vote === "REJECT").length;
  const abstainCount = valid.filter((r) => r.vote === "ABSTAIN").length;

  if (abstainCount >= 2) return "ABSTAIN";
  if (approveCount > rejectCount) return "APPROVE";
  if (rejectCount > approveCount) return "REJECT";
  return "DEADLOCK";
}

/** Strict verdict for API/engine when all three slots are known (including errors). */
export function computeFinalVerdict(results: MagiResult[]): Verdict {
  if (results.length < 3) return "INCOMPLETE";
  const v = computeVerdict(results);
  return v ?? "INCOMPLETE";
}

export function isApprovingVerdict(verdict: Verdict): boolean {
  return verdict === "APPROVE";
}
