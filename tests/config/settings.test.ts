import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  clearSettingsCache,
  loadSettingsFile,
  saveSettingsFile,
  updateSettingsFromClient,
  getSettingsPath,
  sanitizeSettings,
} from "@/lib/config/settings";
import { getPersonaConfig, personaApiKeyConfigured } from "@/lib/config/persona";
import { buildSettingsView } from "@/lib/config/settings-view";

describe("settings persistence", () => {
  let dir: string;
  const prevPath = process.env.MAGI_SETTINGS_PATH;
  const prevKey = process.env.MELCHIOR_API_KEY;
  const prevOpen = process.env.OPENAI_API_KEY;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "magi-settings-"));
    process.env.MAGI_SETTINGS_PATH = path.join(dir, "magi-settings.json");
    clearSettingsCache();
    delete process.env.MELCHIOR_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(async () => {
    clearSettingsCache();
    if (prevPath === undefined) delete process.env.MAGI_SETTINGS_PATH;
    else process.env.MAGI_SETTINGS_PATH = prevPath;
    if (prevKey === undefined) delete process.env.MELCHIOR_API_KEY;
    else process.env.MELCHIOR_API_KEY = prevKey;
    if (prevOpen === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevOpen;
    await rm(dir, { recursive: true, force: true });
  });

  it("returns empty settings when file missing", async () => {
    const s = await loadSettingsFile();
    expect(s.version).toBe(1);
    expect(s.personas).toBeUndefined();
  });

  it("saves non-secret overrides and never writes apiKey", async () => {
    await updateSettingsFromClient({
      personas: {
        MELCHIOR: {
          provider: "openai-compatible",
          model: "local-model",
          baseUrl: "http://192.168.1.50:1234/v1",
          temperature: 0.1,
        },
      },
      defaultMode: "council",
    });
    const raw = await readFile(getSettingsPath(), "utf8");
    expect(raw).not.toMatch(/apiKey|api_key|sk-/i);
    expect(raw).toContain("local-model");
    const loaded = await loadSettingsFile();
    expect(loaded.defaultMode).toBe("council");
    expect(loaded.personas?.MELCHIOR?.model).toBe("local-model");
  });

  it("sanitize strips secret-looking fields", () => {
    const clean = sanitizeSettings({
      version: 1,
      personas: {
        MELCHIOR: {
          model: "x",
          apiKey: "SECRET",
          password: "nope",
        },
      },
    });
    expect(JSON.stringify(clean)).not.toContain("SECRET");
    expect(JSON.stringify(clean)).not.toContain("apiKey");
  });

  it("file overrides env for model; api key stays env-only", async () => {
    process.env.MELCHIOR_MODEL = "from-env";
    process.env.MELCHIOR_API_KEY = "env-secret-key";
    await saveSettingsFile({
      version: 1,
      personas: { MELCHIOR: { model: "from-file" } },
    });
    clearSettingsCache();
    await loadSettingsFile();
    const cfg = getPersonaConfig("MELCHIOR");
    expect(cfg.model).toBe("from-file");
    expect(cfg.apiKey).toBe("env-secret-key");
    expect(personaApiKeyConfigured("MELCHIOR")).toBe(true);

    const view = await buildSettingsView(true);
    expect(view.personas.MELCHIOR.model).toBe("from-file");
    expect(view.personas.MELCHIOR.apiKeyStatus).toBe("configured");
    expect(view.personas.MELCHIOR.apiKeyStatusLabel).toBe("由環境設定／已設定");
    expect(JSON.stringify(view)).not.toContain("env-secret-key");
  });

  it("shows 未設定 when no key in env", async () => {
    await loadSettingsFile();
    const view = await buildSettingsView(true);
    expect(view.personas.MELCHIOR.apiKeyStatus).toBe("unset");
    expect(view.personas.MELCHIOR.apiKeyStatusLabel).toBe("未設定");
  });
});
