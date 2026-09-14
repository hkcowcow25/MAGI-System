import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  closeHistoryDb,
  deleteDeliberation,
  exportDeliberationJson,
  getDeliberation,
  insertDeliberation,
  listDeliberations,
  openHistoryDb,
} from "@/lib/history/store";
import { getHistoryDbPath } from "@/lib/history/paths";
import { jsonLooksLikeSecrets } from "@/lib/history/sanitize";
import {
  buildHistoryFromEngineResult,
  buildHistoryFromFailure,
  recordDeliberationSafe,
} from "@/lib/history/record";
import { clearSettingsCache } from "@/lib/config/settings";
import { runMagiEngine } from "@/lib/decision/engine";

describe("history store", () => {
  let dir: string;
  const prevHist = process.env.MAGI_HISTORY_DB_PATH;
  const prevData = process.env.MAGI_DATA_DIR;
  const prevMock = process.env.MAGI_MOCK_MODE;
  const prevSettings = process.env.MAGI_SETTINGS_PATH;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "magi-hist-"));
    process.env.MAGI_DATA_DIR = dir;
    process.env.MAGI_HISTORY_DB_PATH = path.join(dir, "magi-history.sqlite");
    process.env.MAGI_SETTINGS_PATH = path.join(dir, "magi-settings.json");
    process.env.MAGI_MOCK_MODE = "true";
    clearSettingsCache();
    await closeHistoryDb();
  });

  afterEach(async () => {
    await closeHistoryDb();
    clearSettingsCache();
    if (prevHist === undefined) delete process.env.MAGI_HISTORY_DB_PATH;
    else process.env.MAGI_HISTORY_DB_PATH = prevHist;
    if (prevData === undefined) delete process.env.MAGI_DATA_DIR;
    else process.env.MAGI_DATA_DIR = prevData;
    if (prevMock === undefined) delete process.env.MAGI_MOCK_MODE;
    else process.env.MAGI_MOCK_MODE = prevMock;
    if (prevSettings === undefined) delete process.env.MAGI_SETTINGS_PATH;
    else process.env.MAGI_SETTINGS_PATH = prevSettings;
    await rm(dir, { recursive: true, force: true });
  });

  it("insert / list / search / delete", async () => {
    const a = await insertDeliberation({
      topic: "Should we approve the maintenance window?",
      mode: "verdict",
      source: "web",
      mock: true,
      status: "complete",
      durationMs: 42,
      models: {
        MELCHIOR: { provider: "openai", model: "gpt-4o-mini" },
        BALTHASAR: { provider: "anthropic", model: "claude-haiku-4-5" },
        CASPER: { provider: "google", model: "gemini-2.0-flash" },
      },
      units: {
        MELCHIOR: {
          id: "MELCHIOR",
          number: 1,
          unitStatus: "ok",
          vote: "APPROVE",
          reasoning: "Logic ok",
        },
        BALTHASAR: {
          id: "BALTHASAR",
          number: 2,
          unitStatus: "ok",
          vote: "APPROVE",
          reasoning: "Emotion ok",
        },
        CASPER: {
          id: "CASPER",
          number: 3,
          unitStatus: "ok",
          vote: "APPROVE",
          reasoning: "Social ok",
        },
      },
      outcome: { verdict: "APPROVE", status: "complete" },
      errors: null,
    });

    await insertDeliberation({
      topic: "Council: how to schedule the window",
      mode: "council",
      source: "api",
      mock: true,
      status: "complete",
      durationMs: 99,
      models: {
        MELCHIOR: { provider: "openai", model: "gpt-4o-mini" },
        BALTHASAR: { provider: "anthropic", model: "claude-haiku-4-5" },
        CASPER: { provider: "google", model: "gemini-2.0-flash" },
      },
      units: null,
      outcome: {
        recommendation: "Stagger the maintenance",
        synthesis_mode: "mock",
      },
      errors: null,
    });

    const all = await listDeliberations();
    expect(all.total).toBe(2);

    const search = await listDeliberations({ q: "maintenance" });
    expect(search.total).toBeGreaterThanOrEqual(1);
    expect(search.items.some((i) => i.id === a.id)).toBe(true);

    const modeFilter = await listDeliberations({ mode: "council" });
    expect(modeFilter.items.every((i) => i.mode === "council")).toBe(true);

    const detail = await getDeliberation(a.id);
    expect(detail?.topic).toContain("maintenance");
    expect(detail?.mock).toBe(true);

    const ok = await deleteDeliberation(a.id);
    expect(ok).toBe(true);
    expect(await getDeliberation(a.id)).toBeNull();
    const after = await listDeliberations();
    expect(after.total).toBe(1);
  });

  it("never stores secrets in JSON", async () => {
    const rec = await insertDeliberation({
      topic: "Probe secrets",
      mode: "verdict",
      source: "api",
      mock: false,
      status: "error",
      durationMs: 1,
      models: {
        MELCHIOR: { provider: "openai", model: "gpt-4o-mini" },
        BALTHASAR: { provider: "anthropic", model: "claude-haiku-4-5" },
        CASPER: { provider: "google", model: "gemini-2.0-flash" },
      },
      units: {
        MELCHIOR: {
          id: "MELCHIOR",
          number: 1,
          unitStatus: "error",
          reasoning: "fail",
          error: "upstream said Bearer sk-this-is-not-a-real-secret-value-xx",
          apiKey: "sk-should-be-stripped-aaaaaaaa",
        },
        BALTHASAR: {
          id: "BALTHASAR",
          number: 2,
          unitStatus: "ok",
          vote: "ABSTAIN",
          reasoning: "n/a",
        },
        CASPER: {
          id: "CASPER",
          number: 3,
          unitStatus: "ok",
          vote: "ABSTAIN",
          reasoning: "n/a",
        },
      } as never,
      outcome: {
        verdict: "INCOMPLETE",
        accessCode: "should-not-persist",
        sessionSecret: "nope",
      } as never,
      errors: ["Bearer sk-another-fake-token-zzzzzzzz"],
    });

    const exported = exportDeliberationJson(rec);
    expect(jsonLooksLikeSecrets(exported)).toBe(false);
    expect(exported).not.toMatch(/apiKey|accessCode|sessionSecret/i);
    expect(exported).not.toContain("sk-should-be-stripped");
    expect(exported).toContain("[REDACTED]");
  });

  it("marks mock flag from MAGI_MOCK_MODE via engine recording", async () => {
    const result = await runMagiEngine("Mock history probe?", "verdict", {
      source: "web",
      recordHistory: true,
    });
    expect(result.mode).toBe("verdict");

    const listed = await listDeliberations({ q: "Mock history probe" });
    expect(listed.total).toBeGreaterThanOrEqual(1);
    expect(listed.items[0]?.mock).toBe(true);
    expect(listed.items[0]?.source).toBe("web");
  });

  it("records failures too", async () => {
    const input = buildHistoryFromFailure({
      topic: "boom",
      mode: "council",
      source: "api",
      durationMs: 5,
      error: new Error("simulated failure"),
      models: {
        MELCHIOR: { provider: "openai", model: "x" },
        BALTHASAR: { provider: "anthropic", model: "y" },
        CASPER: { provider: "google", model: "z" },
      },
    });
    const rec = await recordDeliberationSafe(input);
    expect(rec?.status).toBe("error");
    expect(rec?.errors?.[0]).toContain("simulated failure");
  });

  it("persists DB file under MAGI_DATA_DIR for volume rebuild", async () => {
    await openHistoryDb();
    await insertDeliberation(
      buildHistoryFromEngineResult({
        topic: "persist check",
        source: "web",
        durationMs: 3,
        result: {
          mode: "verdict",
          status: "complete",
          verdict: "APPROVE",
          results: {
            MELCHIOR: {
              id: "MELCHIOR",
              number: 1,
              unitStatus: "ok",
              vote: "APPROVE",
              reasoning: "ok",
            },
            BALTHASAR: {
              id: "BALTHASAR",
              number: 2,
              unitStatus: "ok",
              vote: "APPROVE",
              reasoning: "ok",
            },
            CASPER: {
              id: "CASPER",
              number: 3,
              unitStatus: "ok",
              vote: "APPROVE",
              reasoning: "ok",
            },
          },
          disagreements: [],
          missing_information: [],
          next_steps: [],
        },
        models: {
          MELCHIOR: { provider: "openai", model: "m1" },
          BALTHASAR: { provider: "anthropic", model: "m2" },
          CASPER: { provider: "google", model: "m3" },
        },
      }),
    );

    const dbPath = getHistoryDbPath();
    expect(dbPath.startsWith(dir)).toBe(true);
    await access(dbPath);

    // Simulate container recreate: close handle, reopen same volume path
    await closeHistoryDb();
    const again = await listDeliberations({ q: "persist check" });
    expect(again.total).toBe(1);
  });

  it("retains synthesis_error in stored council outcome", async () => {
    const input = buildHistoryFromEngineResult({
      topic: "synthesis error retained",
      source: "web",
      durationMs: 12,
      result: {
        mode: "council",
        status: "complete",
        opinions: {
          MELCHIOR: {
            id: "MELCHIOR",
            number: 1,
            unitStatus: "ok",
            proposal: "A",
            rationale: "r",
            risks: [],
            missing_information: [],
          },
          BALTHASAR: {
            id: "BALTHASAR",
            number: 2,
            unitStatus: "ok",
            proposal: "B",
            rationale: "r",
            risks: [],
            missing_information: [],
          },
          CASPER: {
            id: "CASPER",
            number: 3,
            unitStatus: "ok",
            proposal: "C",
            rationale: "r",
            risks: [],
            missing_information: [],
          },
        },
        consensus: [],
        disagreements: [],
        recommendation: "extractive fallback",
        minority_views: [],
        missing_information: [],
        synthesis_mode: "extractive",
        synthesis_error: {
          stage: "api",
          message: "400 Bad Request: User location is not supported for the API use.",
          provider: "google",
          model: "gemini-2.0-flash",
          httpStatus: 400,
        },
      },
      models: {
        MELCHIOR: { provider: "openai", model: "m1" },
        BALTHASAR: { provider: "anthropic", model: "m2" },
        CASPER: { provider: "google", model: "m3" },
      },
    });
    const rec = await insertDeliberation(input);
    expect(rec.units).toBeTruthy();
    const outcome = rec.outcome as Record<string, unknown>;
    expect(outcome.synthesis_error).toMatchObject({
      stage: "api",
      httpStatus: 400,
      provider: "google",
    });
    expect(String((outcome.synthesis_error as { message: string }).message)).toContain(
      "User location is not supported",
    );
  });

  it("records once per engine run (single-record semantics)", async () => {
    await runMagiEngine("single-record probe web", "verdict", {
      source: "web",
      recordHistory: true,
    });
    await runMagiEngine("single-record probe api", "verdict", {
      source: "api",
      recordHistory: true,
    });
    const web = await listDeliberations({ q: "single-record probe web" });
    const api = await listDeliberations({ q: "single-record probe api" });
    expect(web.total).toBe(1);
    expect(api.total).toBe(1);
    expect(web.items[0]?.source).toBe("web");
    expect(api.items[0]?.source).toBe("api");
  });
});
