import { describe, expect, it } from "vitest";
import {
  buildSystemPrompt,
  extractPersonaIdentity,
  PERSONA_IDENTITY,
  VERDICT_OUTPUT_FORMAT,
  COUNCIL_OUTPUT_FORMAT,
  MELCHIOR_PROMPT,
} from "@/lib/prompts";

describe("buildSystemPrompt", () => {
  it("mode=council with identity-only override has council format and no vote schema", () => {
    const custom =
      "You are MELCHIOR custom scientist who loves Bayesian priors.";
    const prompt = buildSystemPrompt("MELCHIOR", "council", custom);
    expect(prompt.startsWith(custom)).toBe(true);
    expect(prompt).toContain(COUNCIL_OUTPUT_FORMAT);
    expect(prompt.endsWith(COUNCIL_OUTPUT_FORMAT)).toBe(true);
    expect(prompt).not.toContain('"vote"');
    expect(prompt).not.toContain("Cast your vote");
    expect(prompt).not.toContain("isCritical");
    expect(prompt).toContain('"proposal"');
  });

  it("mode=council still appends COUNCIL format when override text looks like Verdict", () => {
    const prompt = buildSystemPrompt("MELCHIOR", "council", MELCHIOR_PROMPT);
    expect(prompt.endsWith(COUNCIL_OUTPUT_FORMAT)).toBe(true);
    expect(prompt).toContain(COUNCIL_OUTPUT_FORMAT);
  });

  it("mode=verdict includes vote schema", () => {
    const prompt = buildSystemPrompt("BALTHASAR", "verdict");
    expect(prompt).toContain(PERSONA_IDENTITY.BALTHASAR);
    expect(prompt).toContain(VERDICT_OUTPUT_FORMAT);
    expect(prompt).toContain('"vote"');
    expect(prompt).toContain("APPROVE");
    expect(prompt).not.toContain('"proposal"');
  });

  it("backward-compat MELCHIOR_PROMPT equals buildSystemPrompt verdict", () => {
    expect(MELCHIOR_PROMPT).toBe(buildSystemPrompt("MELCHIOR", "verdict"));
  });
});

describe("extractPersonaIdentity", () => {
  it("strips vote JSON block but keeps custom persona sentence", () => {
    const custom =
      "You are MELCHIOR custom — always cite sample sizes.\n\n" +
      VERDICT_OUTPUT_FORMAT;
    const extracted = extractPersonaIdentity(custom);
    expect(extracted).toContain("always cite sample sizes");
    expect(extracted).not.toContain('"vote"');
    expect(extracted).not.toContain("Cast your vote");
    expect(extracted).not.toContain("isCritical");
  });

  it("extracts built-in identity from full default MELCHIOR_PROMPT", () => {
    const extracted = extractPersonaIdentity(MELCHIOR_PROMPT);
    expect(extracted).toBe(PERSONA_IDENTITY.MELCHIOR);
  });
});
