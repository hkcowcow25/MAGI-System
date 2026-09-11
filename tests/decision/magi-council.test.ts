import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { clearSettingsCache } from "@/lib/config/settings";
import {
  extractiveSynthesis,
  formatCouncilContent,
  runMagiCouncil,
} from "@/lib/decision/magi-council";
import type { CouncilOpinion } from "@/types/magi";

describe("magi-council", () => {
  let dir: string;
  const prevMock = process.env.MAGI_MOCK_MODE;
  const prevPath = process.env.MAGI_SETTINGS_PATH;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "magi-council-"));
    process.env.MAGI_SETTINGS_PATH = path.join(dir, "magi-settings.json");
    process.env.MAGI_MOCK_MODE = "true";
    clearSettingsCache();
  });

  afterEach(async () => {
    clearSettingsCache();
    if (prevMock === undefined) delete process.env.MAGI_MOCK_MODE;
    else process.env.MAGI_MOCK_MODE = prevMock;
    if (prevPath === undefined) delete process.env.MAGI_SETTINGS_PATH;
    else process.env.MAGI_SETTINGS_PATH = prevPath;
    await rm(dir, { recursive: true, force: true });
  });

  it("runs mock council with three opinions and synthesis", async () => {
    const result = await runMagiCouncil("How should we launch the product?");
    expect(result.status).toBe("complete");
    expect(result.opinions.MELCHIOR.unitStatus).toBe("ok");
    expect(result.opinions.BALTHASAR.proposal).toBeTruthy();
    expect(result.opinions.CASPER.rationale).toBeTruthy();
    expect(result.recommendation).toContain("MOCK");
    expect(result.synthesis_mode).toBe("mock");
  });

  it("formatCouncilContent preserves minority section and ASCII hyphens", () => {
    const formatted = formatCouncilContent({
      status: "complete",
      opinions: {
        MELCHIOR: {
          id: "MELCHIOR",
          number: 1,
          unitStatus: "ok",
          proposal: "Pilot A",
          rationale: "Science",
          risks: [],
          missing_information: [],
        },
        BALTHASAR: {
          id: "BALTHASAR",
          number: 2,
          unitStatus: "ok",
          proposal: "Safeguard B",
          rationale: "Care",
          risks: [],
          missing_information: [],
        },
        CASPER: {
          id: "CASPER",
          number: 3,
          unitStatus: "ok",
          proposal: "Listen C",
          rationale: "Feel",
          risks: [],
          missing_information: [],
        },
      },
      consensus: ["Shared caution"],
      disagreements: ["CASPER differs"],
      recommendation: "Keep all views - do not erase",
      minority_views: ["CASPER: Listen C"],
      missing_information: [],
      synthesis_mode: "extractive",
    });
    expect(formatted).toContain("Minority Views");
    expect(formatted).toContain("CASPER: Listen C");
    expect(formatted).not.toMatch(/[\u2012\u2013\u2014\u2015]/);
  });

  it("extractiveSynthesis retains each proposal", () => {
    const opinions: CouncilOpinion[] = [
      {
        id: "MELCHIOR",
        number: 1,
        unitStatus: "ok",
        proposal: "Alpha path",
        rationale: "logic",
      },
      {
        id: "BALTHASAR",
        number: 2,
        unitStatus: "ok",
        proposal: "Beta path",
        rationale: "care",
      },
      {
        id: "CASPER",
        number: 3,
        unitStatus: "ok",
        proposal: "Gamma path",
        rationale: "feel",
      },
    ];
    const syn = extractiveSynthesis(opinions);
    expect(syn.recommendation).toContain("Alpha path");
    expect(syn.recommendation).toContain("Beta path");
    expect(syn.recommendation).toContain("Gamma path");
    expect(syn.minority_views.length).toBeGreaterThan(0);
  });
});
