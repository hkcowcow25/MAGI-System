import { describe, expect, it } from "vitest";
import { parseUnitAnalysis } from "@/lib/providers/parse-json";

describe("parseUnitAnalysis", () => {
  it("parses valid JSON", () => {
    const a = parseUnitAnalysis(
      JSON.stringify({
        reasoning: "Looks fine",
        vote: "APPROVE",
        isCritical: false,
        assumptions: ["a"],
        risks: [],
        missing_information: ["b"],
      }),
    );
    expect(a.vote).toBe("APPROVE");
    expect(a.assumptions).toEqual(["a"]);
    expect(a.missing_information).toEqual(["b"]);
  });

  it("accepts rationale alias", () => {
    const a = parseUnitAnalysis(
      '{"rationale":"ok","vote":"REJECT","isCritical":true}',
    );
    expect(a.reasoning).toBe("ok");
    expect(a.isCritical).toBe(true);
  });

  it("rejects invalid vote instead of coercing to ABSTAIN", () => {
    expect(() =>
      parseUnitAnalysis('{"reasoning":"x","vote":"MAYBE","isCritical":false}'),
    ).toThrow(/Invalid or missing vote/);
  });

  it("strips markdown fences", () => {
    const a = parseUnitAnalysis(
      '```json\n{"reasoning":"x","vote":"ABSTAIN","isCritical":false}\n```',
    );
    expect(a.vote).toBe("ABSTAIN");
  });
});
