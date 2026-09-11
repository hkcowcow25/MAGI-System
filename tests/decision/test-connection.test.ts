import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { clearSettingsCache } from "@/lib/config/settings";
import { testPersonaConnection } from "@/lib/decision/test-connection";

describe("testPersonaConnection", () => {
  let dir: string;
  const prevMock = process.env.MAGI_MOCK_MODE;
  const prevPath = process.env.MAGI_SETTINGS_PATH;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "magi-tconn-"));
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

  it("returns explicit mock success without calling APIs", async () => {
    const res = await testPersonaConnection("MELCHIOR");
    expect(res.ok).toBe(true);
    expect(res.mock).toBe(true);
    expect(res.status).toBe("success");
    expect(res.message).toContain("模擬");
    expect(res.message).toContain("MAGI_MOCK_MODE");
  });
});
