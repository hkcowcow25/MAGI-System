import { beforeEach, describe, expect, it } from "vitest";
import {
  formatDeliberationContent,
  runMagiDeliberation,
} from "@/lib/decision/magi-verdict";

describe("runMagiDeliberation (mock mode)", () => {
  beforeEach(() => {
    process.env.MAGI_MOCK_MODE = "true";
  });

  it("returns complete APPROVE for benign topic", async () => {
    const r = await runMagiDeliberation("Should we schedule a team lunch?");
    expect(r.status).toBe("complete");
    expect(r.verdict).toBe("APPROVE");
    expect(r.results.MELCHIOR.unitStatus).toBe("ok");
    expect(r.results.MELCHIOR.vote).not.toBeUndefined();
  });

  it("critical topic rejects without unanimous approve", async () => {
    const r = await runMagiDeliberation("Should we destroy the city?");
    expect(r.results.MELCHIOR.isCritical).toBe(true);
    expect(r.verdict).toBe("REJECT");
    expect(r.status).toBe("complete");
  });

  it("formatDeliberationContent includes verdict and units", async () => {
    const r = await runMagiDeliberation("Approve the report?");
    const text = formatDeliberationContent(r);
    expect(text).toContain("Final Verdict");
    expect(text).toContain("MELCHIOR");
    expect(text).toContain("Next Steps");
  });
});

describe("missing keys without mock", () => {
  beforeEach(() => {
    process.env.MAGI_MOCK_MODE = "false";
    delete process.env.MELCHIOR_API_KEY;
    delete process.env.BALTHASAR_API_KEY;
    delete process.env.CASPER_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_API_KEY;
  });

  it("fails units with error status → INCOMPLETE not ABSTAIN", async () => {
    const r = await runMagiDeliberation("Should we proceed?");
    expect(r.verdict).toBe("INCOMPLETE");
    expect(r.status).toBe("incomplete");
    for (const id of ["MELCHIOR", "BALTHASAR", "CASPER"] as const) {
      expect(r.results[id].unitStatus).toBe("error");
      expect(r.results[id].vote).toBeUndefined();
    }
  });
});
