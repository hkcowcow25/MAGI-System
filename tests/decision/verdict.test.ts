import { describe, expect, it } from "vitest";
import { computeFinalVerdict, computeVerdict } from "@/lib/decision/verdict";
import { MagiResult, Vote } from "@/types/magi";

function ok(
  id: MagiResult["id"],
  number: MagiResult["number"],
  vote: Vote,
  isCritical = false,
): MagiResult {
  return {
    id,
    number,
    unitStatus: "ok",
    vote,
    reasoning: `${id} reasoning`,
    isCritical,
  };
}

function err(
  id: MagiResult["id"],
  number: MagiResult["number"],
): MagiResult {
  return {
    id,
    number,
    unitStatus: "error",
    reasoning: "SYSTEM ERROR",
    error: "boom",
  };
}

describe("computeVerdict truth table", () => {
  it("returns null until all three slots present", () => {
    expect(
      computeVerdict({
        MELCHIOR: ok("MELCHIOR", 1, "APPROVE"),
        BALTHASAR: ok("BALTHASAR", 2, "APPROVE"),
      }),
    ).toBeNull();
  });

  it("majority APPROVE", () => {
    expect(
      computeFinalVerdict([
        ok("MELCHIOR", 1, "APPROVE"),
        ok("BALTHASAR", 2, "APPROVE"),
        ok("CASPER", 3, "REJECT"),
      ]),
    ).toBe("APPROVE");
  });

  it("majority REJECT", () => {
    expect(
      computeFinalVerdict([
        ok("MELCHIOR", 1, "APPROVE"),
        ok("BALTHASAR", 2, "REJECT"),
        ok("CASPER", 3, "REJECT"),
      ]),
    ).toBe("REJECT");
  });

  it("≥2 ABSTAIN → ABSTAIN", () => {
    expect(
      computeFinalVerdict([
        ok("MELCHIOR", 1, "ABSTAIN"),
        ok("BALTHASAR", 2, "ABSTAIN"),
        ok("CASPER", 3, "APPROVE"),
      ]),
    ).toBe("ABSTAIN");
  });

  it("tie without abstain majority → DEADLOCK", () => {
    expect(
      computeFinalVerdict([
        ok("MELCHIOR", 1, "APPROVE"),
        ok("BALTHASAR", 2, "REJECT"),
        ok("CASPER", 3, "ABSTAIN"),
      ]),
    ).toBe("DEADLOCK");
  });

  it("critical: needs unanimous APPROVE else REJECT", () => {
    expect(
      computeFinalVerdict([
        ok("MELCHIOR", 1, "APPROVE", true),
        ok("BALTHASAR", 2, "APPROVE", true),
        ok("CASPER", 3, "APPROVE", false),
      ]),
    ).toBe("APPROVE");

    expect(
      computeFinalVerdict([
        ok("MELCHIOR", 1, "APPROVE", true),
        ok("BALTHASAR", 2, "APPROVE", true),
        ok("CASPER", 3, "REJECT", false),
      ]),
    ).toBe("REJECT");

    expect(
      computeFinalVerdict([
        ok("MELCHIOR", 1, "APPROVE", true),
        ok("BALTHASAR", 2, "APPROVE", true),
        ok("CASPER", 3, "ABSTAIN", false),
      ]),
    ).toBe("REJECT");
  });

  it("unit error → INCOMPLETE, never ABSTAIN/APPROVE", () => {
    const v = computeFinalVerdict([
      ok("MELCHIOR", 1, "APPROVE"),
      ok("BALTHASAR", 2, "APPROVE"),
      err("CASPER", 3),
    ]);
    expect(v).toBe("INCOMPLETE");
    expect(v).not.toBe("ABSTAIN");
    expect(v).not.toBe("APPROVE");
  });

  it("all errors → INCOMPLETE", () => {
    expect(
      computeFinalVerdict([
        err("MELCHIOR", 1),
        err("BALTHASAR", 2),
        err("CASPER", 3),
      ]),
    ).toBe("INCOMPLETE");
  });
});
