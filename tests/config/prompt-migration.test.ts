import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  clearSettingsCache,
  loadSettingsFile,
  migrateSettingsPrompts,
  resetPersonaIdentity,
  sanitizeSettings,
} from "@/lib/config/settings";
import {
  MELCHIOR_PROMPT,
  PERSONA_IDENTITY,
  VERDICT_OUTPUT_FORMAT,
  extractPersonaIdentity,
} from "@/lib/prompts";
import { getPersonaConfig } from "@/lib/config/persona";

describe("prompt migration", () => {
  let dir: string;
  const prevPath = process.env.MAGI_SETTINGS_PATH;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "magi-migrate-"));
    process.env.MAGI_SETTINGS_PATH = path.join(dir, "magi-settings.json");
    clearSettingsCache();
  });

  afterEach(async () => {
    clearSettingsCache();
    if (prevPath === undefined) delete process.env.MAGI_SETTINGS_PATH;
    else process.env.MAGI_SETTINGS_PATH = prevPath;
    await rm(dir, { recursive: true, force: true });
  });

  it("sanitize extracts identity from Verdict-laden systemPrompt", () => {
    const custom =
      "You are MELCHIOR custom — cite p-values.\n\n" + VERDICT_OUTPUT_FORMAT;
    const clean = sanitizeSettings({
      version: 1,
      personas: { MELCHIOR: { systemPrompt: custom, model: "x" } },
    });
    expect(clean.personas?.MELCHIOR?.personaDescription).toContain(
      "cite p-values",
    );
    expect(clean.personas?.MELCHIOR?.personaDescription).not.toContain(
      '"vote"',
    );
    expect(clean.personas?.MELCHIOR?.systemPrompt).toBe(
      clean.personas?.MELCHIOR?.personaDescription,
    );
  });

  it("loadSettingsFile migrates and stamps promptMigrationVersion", async () => {
    await writeFile(
      process.env.MAGI_SETTINGS_PATH!,
      JSON.stringify({
        version: 1,
        personas: {
          MELCHIOR: { systemPrompt: MELCHIOR_PROMPT, model: "m1" },
        },
      }),
      "utf8",
    );
    const loaded = await loadSettingsFile();
    expect(loaded.promptMigrationVersion).toBe(1);
    expect(loaded.personas?.MELCHIOR?.personaDescription).toBe(
      PERSONA_IDENTITY.MELCHIOR,
    );
    const raw = await readFile(process.env.MAGI_SETTINGS_PATH!, "utf8");
    expect(raw).toContain("personaDescription");
    expect(raw).toContain("promptMigrationVersion");

    const cfg = getPersonaConfig("MELCHIOR");
    expect(cfg.personaDescription).toBe(PERSONA_IDENTITY.MELCHIOR);
    expect(cfg.model).toBe("m1");
  });

  it("migrateSettingsPrompts keeps custom persona sentence", () => {
    const custom = "Custom mother persona who prioritizes kids.";
    const migrated = migrateSettingsPrompts({
      version: 1,
      personas: {
        BALTHASAR: {
          systemPrompt: custom + "\n\n" + VERDICT_OUTPUT_FORMAT,
        },
      },
    });
    expect(migrated.personas?.BALTHASAR?.personaDescription).toContain(
      "prioritizes kids",
    );
    expect(migrated.personas?.BALTHASAR?.personaDescription).not.toContain(
      '"vote"',
    );
  });

  it("resetPersonaIdentity restores built-in identity only", () => {
    const file = resetPersonaIdentity(
      {
        version: 1,
        personas: {
          CASPER: {
            model: "keep-me",
            provider: "openai-compatible",
            personaDescription: "totally custom",
          },
        },
      },
      "CASPER",
    );
    expect(file.personas?.CASPER?.personaDescription).toBe(
      PERSONA_IDENTITY.CASPER,
    );
    expect(file.personas?.CASPER?.model).toBe("keep-me");
    expect(file.personas?.CASPER?.provider).toBe("openai-compatible");
  });

  it("extractPersonaIdentity unit check", () => {
    expect(extractPersonaIdentity(MELCHIOR_PROMPT)).toBe(
      PERSONA_IDENTITY.MELCHIOR,
    );
  });
});
