import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { clearSettingsCache } from "@/lib/config/settings";
import {
  isKnownMagiModel,
  modeFromModel,
  runMagiEngine,
} from "@/lib/decision/engine";

describe("shared engine", () => {
  let dir: string;
  const prevMock = process.env.MAGI_MOCK_MODE;
  const prevPath = process.env.MAGI_SETTINGS_PATH;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "magi-engine-"));
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

  it("maps model ids to modes", () => {
    expect(modeFromModel("magi-council")).toBe("council");
    expect(modeFromModel("magi-verdict")).toBe("verdict");
    expect(isKnownMagiModel("magi-council")).toBe(true);
    expect(isKnownMagiModel("gpt-4")).toBe(false);
  });

  it("runs verdict and council modes via shared entry", async () => {
    const v = await runMagiEngine("Should we ship?", "verdict", {
      recordHistory: false,
    });
    expect(v.mode).toBe("verdict");
    if (v.mode === "verdict") expect(v.verdict).toBeTruthy();

    const c = await runMagiEngine("How should we ship?", "council", {
      recordHistory: false,
    });
    expect(c.mode).toBe("council");
    if (c.mode === "council") {
      expect(c.opinions.MELCHIOR.proposal).toBeTruthy();
    }
  });
});
