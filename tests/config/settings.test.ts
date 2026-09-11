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

describe("summarizer enabled / precedence / baseUrl clear", () => {
  let dir: string;
  const prevPath = process.env.MAGI_SETTINGS_PATH;
  const prevSumModel = process.env.MAGI_SUMMARIZER_MODEL;
  const prevSumProv = process.env.MAGI_SUMMARIZER_PROVIDER;
  const prevSumBase = process.env.MAGI_SUMMARIZER_BASE_URL;
  const prevSumEn = process.env.MAGI_SUMMARIZER_ENABLED;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "magi-sum-"));
    process.env.MAGI_SETTINGS_PATH = path.join(dir, "magi-settings.json");
    clearSettingsCache();
    delete process.env.MAGI_SUMMARIZER_MODEL;
    delete process.env.MAGI_SUMMARIZER_PROVIDER;
    delete process.env.MAGI_SUMMARIZER_BASE_URL;
    delete process.env.MAGI_SUMMARIZER_ENABLED;
  });

  afterEach(async () => {
    clearSettingsCache();
    if (prevPath === undefined) delete process.env.MAGI_SETTINGS_PATH;
    else process.env.MAGI_SETTINGS_PATH = prevPath;
    if (prevSumModel === undefined) delete process.env.MAGI_SUMMARIZER_MODEL;
    else process.env.MAGI_SUMMARIZER_MODEL = prevSumModel;
    if (prevSumProv === undefined) delete process.env.MAGI_SUMMARIZER_PROVIDER;
    else process.env.MAGI_SUMMARIZER_PROVIDER = prevSumProv;
    if (prevSumBase === undefined) delete process.env.MAGI_SUMMARIZER_BASE_URL;
    else process.env.MAGI_SUMMARIZER_BASE_URL = prevSumBase;
    if (prevSumEn === undefined) delete process.env.MAGI_SUMMARIZER_ENABLED;
    else process.env.MAGI_SUMMARIZER_ENABLED = prevSumEn;
    await rm(dir, { recursive: true, force: true });
  });

  it("enabled=false persists and is not inferred from configured model", async () => {
    const { viewToForm } = await import("@/components/settings-form-helpers");
    const { resolveSummarizer } = await import("@/lib/decision/summarizer-key");

    await updateSettingsFromClient({
      summarizer: {
        enabled: true,
        provider: "google",
        model: "gemini-2.0-flash",
      },
    });
    let view = await buildSettingsView(true);
    expect(view.summarizer.enabled).toBe(true);
    expect(view.summarizer.configured).toBe(true);
    expect(viewToForm(view).summarizer.enabled).toBe(true);

    await updateSettingsFromClient({
      summarizer: {
        enabled: false,
        provider: "google",
        model: "gemini-2.0-flash",
      },
    });
    clearSettingsCache();
    await loadSettingsFile();
    view = await buildSettingsView(true);
    expect(view.summarizer.enabled).toBe(false);
    expect(view.summarizer.configured).toBe(true);
    expect(viewToForm(view).summarizer.enabled).toBe(false);
    expect(resolveSummarizer()).toBeNull();

    // Saving other persona settings must not re-enable summarizer
    await updateSettingsFromClient({
      defaultMode: "council",
      personas: { MELCHIOR: { temperature: 0.2 } },
    });
    clearSettingsCache();
    await loadSettingsFile();
    view = await buildSettingsView(true);
    expect(view.summarizer.enabled).toBe(false);
    expect(viewToForm(view).summarizer.enabled).toBe(false);
  });

  it("file overrides env for summarizer non-secrets (defaults < env < file)", async () => {
    const { peekSummarizerSettings, resolveSummarizer } = await import(
      "@/lib/decision/summarizer-key"
    );
    process.env.MAGI_SUMMARIZER_PROVIDER = "openai";
    process.env.MAGI_SUMMARIZER_MODEL = "from-env";
    process.env.MAGI_SUMMARIZER_BASE_URL = "http://env.example/v1";
    process.env.MAGI_SUMMARIZER_ENABLED = "true";

    await saveSettingsFile({
      version: 1,
      summarizer: {
        enabled: true,
        provider: "google",
        model: "from-file",
        baseUrl: "http://file.example/v1",
      },
    });
    clearSettingsCache();
    await loadSettingsFile();
    const peeked = peekSummarizerSettings();
    expect(peeked.provider).toBe("google");
    expect(peeked.model).toBe("from-file");
    expect(peeked.baseUrl).toBe("http://file.example/v1");
    const view = await buildSettingsView(true);
    expect(view.summarizer.provider).toBe("google");
    expect(view.summarizer.model).toBe("from-file");
    const resolved = resolveSummarizer();
    expect(resolved?.provider).toBe("google");
    expect(resolved?.model).toBe("from-file");
  });

  it("explicit baseUrl clear removes override (LM Studio → Google)", async () => {
    await updateSettingsFromClient({
      summarizer: {
        enabled: true,
        provider: "openai-compatible",
        model: "local",
        baseUrl: "http://192.168.1.50:1234/v1",
      },
    });
    let loaded = await loadSettingsFile();
    expect(loaded.summarizer?.baseUrl).toContain("1234");

    await updateSettingsFromClient({
      summarizer: {
        enabled: true,
        provider: "google",
        model: "gemini-2.0-flash",
        baseUrl: "",
      },
    });
    clearSettingsCache();
    loaded = await loadSettingsFile();
    expect(loaded.summarizer?.provider).toBe("google");
    expect(loaded.summarizer?.baseUrl).toBeUndefined();
    const raw = await readFile(getSettingsPath(), "utf8");
    expect(raw).not.toContain("1234");
  });
});
