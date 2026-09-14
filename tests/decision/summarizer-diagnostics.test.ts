import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CompletionRequest, CompletionResult } from "@/lib/providers/types";
import { buildOpenAICompatibleChatParams } from "@/lib/providers/openai-compatible";
import type { CouncilOpinion } from "@/types/magi";

const completeMock = vi.fn(
  async (req: CompletionRequest): Promise<CompletionResult> => {
    void req;
    return { text: "", finish_reason: "stop" };
  },
);

vi.mock("@/lib/providers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/providers")>();
  return {
    ...actual,
    getProviderAdapter: () => ({
      complete: (req: CompletionRequest) => completeMock(req),
    }),
  };
});

const FIXTURE: CouncilOpinion[] = [
  {
    id: "MELCHIOR",
    number: 1,
    unitStatus: "ok",
    proposal: "A",
    rationale: "ra",
  },
  {
    id: "BALTHASAR",
    number: 2,
    unitStatus: "ok",
    proposal: "B",
    rationale: "rb",
  },
  {
    id: "CASPER",
    number: 3,
    unitStatus: "ok",
    proposal: "C",
    rationale: "rc",
  },
];

describe("summarizer diagnostics", () => {
  let dir: string;
  const prev: Record<string, string | undefined> = {};
  const envKeys = [
    "MAGI_MOCK_MODE",
    "MAGI_SETTINGS_PATH",
    "MAGI_SUMMARIZER_API_KEY",
    "MAGI_SUMMARIZER_PROVIDER",
    "MAGI_SUMMARIZER_MODEL",
    "MAGI_SUMMARIZER_BASE_URL",
    "MAGI_SUMMARIZER_ENABLED",
    "MELCHIOR_API_KEY",
    "GOOGLE_API_KEY",
  ] as const;

  beforeEach(async () => {
    for (const k of envKeys) prev[k] = process.env[k];
    dir = await mkdtemp(path.join(tmpdir(), "magi-sum-diag-"));
    process.env.MAGI_SETTINGS_PATH = path.join(dir, "magi-settings.json");
    process.env.MAGI_MOCK_MODE = "false";
    delete process.env.MAGI_SUMMARIZER_API_KEY;
    delete process.env.MELCHIOR_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    process.env.MAGI_SUMMARIZER_ENABLED = "true";
    process.env.MAGI_SUMMARIZER_PROVIDER = "openai-compatible";
    process.env.MAGI_SUMMARIZER_MODEL = "local-sum";
    process.env.MAGI_SUMMARIZER_BASE_URL = "http://127.0.0.1:1234/v1";
    completeMock.mockReset();

    const { clearSettingsCache } = await import("@/lib/config/settings");
    clearSettingsCache();
    await writeFile(
      process.env.MAGI_SETTINGS_PATH,
      JSON.stringify({
        version: 1,
        summarizer: {
          enabled: true,
          provider: "openai-compatible",
          model: "local-sum",
          baseUrl: "http://127.0.0.1:1234/v1",
        },
        personas: {
          MELCHIOR: {
            provider: "openai-compatible",
            model: "mock-model",
            baseUrl: "http://127.0.0.1:9/v1",
          },
          BALTHASAR: {
            provider: "openai-compatible",
            model: "mock-model",
            baseUrl: "http://127.0.0.1:9/v1",
          },
          CASPER: {
            provider: "openai-compatible",
            model: "mock-model",
            baseUrl: "http://127.0.0.1:9/v1",
          },
        },
      }),
      "utf8",
    );
  });

  afterEach(async () => {
    const { clearSettingsCache } = await import("@/lib/config/settings");
    clearSettingsCache();
    for (const k of envKeys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
    await rm(dir, { recursive: true, force: true });
  });

  it("llmSynthesis surfaces synthesis_error on thrown API error and still returns extractive fields", async () => {
    completeMock.mockImplementation(async (req) => {
      const system = req.messages.find((m) => m.role === "system")?.content ?? "";
      // personas get council calls; summarizer gets summarizer prompt
      if (system.includes("MAGI council summarizer") || system.includes("summarizer")) {
        throw Object.assign(new Error("upstream 400 Bad Request: invalid key"), {
          status: 400,
        });
      }
      return {
        text: JSON.stringify({
          proposal: "P",
          rationale: "R",
          risks: [],
          missing_information: [],
        }),
        finish_reason: "stop",
      };
    });

    const { loadSettingsFile } = await import("@/lib/config/settings");
    const { runMagiCouncil } = await import("@/lib/decision/magi-council");
    await loadSettingsFile();

    const result = await runMagiCouncil("How should we launch?");
    expect(result.synthesis_mode).toBe("extractive");
    expect(result.synthesis_error?.stage).toBe("api");
    expect(result.synthesis_error?.message).toMatch(/400|Bad Request|invalid/i);
    expect(result.synthesis_error?.httpStatus).toBe(400);
    expect(result.recommendation).toMatch(/summarizer LLM failed|extractive/i);
    expect(result.recommendation).toContain("P");
  });

  it("parse failure → stage parse", async () => {
    completeMock.mockImplementation(async (req) => {
      const system = req.messages.find((m) => m.role === "system")?.content ?? "";
      if (system.includes("summarizer") || system.includes("synthesis JSON")) {
        return { text: "NOT JSON AT ALL {{{", finish_reason: "stop" };
      }
      return {
        text: JSON.stringify({
          proposal: "P",
          rationale: "R",
          risks: [],
          missing_information: [],
        }),
        finish_reason: "stop",
      };
    });

    const { loadSettingsFile } = await import("@/lib/config/settings");
    const { runMagiCouncil } = await import("@/lib/decision/magi-council");
    await loadSettingsFile();
    const result = await runMagiCouncil("Topic?");
    expect(result.synthesis_mode).toBe("extractive");
    expect(result.synthesis_error?.stage).toBe("parse");
    expect(result.synthesis_error?.message).toMatch(/Invalid synthesis JSON|JSON/i);
  });

  it("empty content → stage empty with finish_reason", async () => {
    completeMock.mockImplementation(async (req) => {
      const system = req.messages.find((m) => m.role === "system")?.content ?? "";
      if (system.includes("summarizer") || system.includes("synthesis JSON")) {
        return { text: "   ", finish_reason: "length" };
      }
      return {
        text: JSON.stringify({
          proposal: "P",
          rationale: "R",
          risks: [],
          missing_information: [],
        }),
        finish_reason: "stop",
      };
    });

    const { loadSettingsFile } = await import("@/lib/config/settings");
    const { runMagiCouncil } = await import("@/lib/decision/magi-council");
    await loadSettingsFile();
    const result = await runMagiCouncil("Topic?");
    expect(result.synthesis_error?.stage).toBe("empty");
    expect(result.synthesis_error?.finish_reason).toBe("length");
  });

  it("google summarizer without key → config stage (no API call)", async () => {
    process.env.MAGI_SUMMARIZER_PROVIDER = "google";
    process.env.MAGI_SUMMARIZER_MODEL = "gemini-2.0-flash";
    delete process.env.MAGI_SUMMARIZER_BASE_URL;
    delete process.env.GOOGLE_API_KEY;
    process.env.MELCHIOR_API_KEY = "lm-studio";
    completeMock.mockClear();

    const { clearSettingsCache, loadSettingsFile, saveSettingsFile } =
      await import("@/lib/config/settings");
    // File wins over env — write google summarizer into settings JSON
    await saveSettingsFile({
      version: 1,
      summarizer: {
        enabled: true,
        provider: "google",
        model: "gemini-2.0-flash",
      },
    });
    clearSettingsCache();
    await loadSettingsFile();

    const { llmSynthesis } = await import("@/lib/decision/magi-council-impl");
    const outcome = await llmSynthesis("t", FIXTURE);
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") {
      expect(outcome.error.stage).toBe("config");
      expect(outcome.error.message).toMatch(/GOOGLE|MAGI_SUMMARIZER/);
    }
    // No adapter call when config fails before complete
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("openai-compatible builder still has no response_format", () => {
    const body = buildOpenAICompatibleChatParams({
      model: "local",
      messages: [{ role: "user", content: "hi" }],
      maxOutputTokens: 64,
      temperature: 0.2,
      timeoutMs: 1000,
      baseUrl: "http://127.0.0.1:1234/v1",
    }) as Record<string, unknown>;
    expect(body).not.toHaveProperty("response_format");
  });

  it("testSummarizer mock path", async () => {
    process.env.MAGI_MOCK_MODE = "true";
    const { clearSettingsCache } = await import("@/lib/config/settings");
    clearSettingsCache();
    const { runSummarizerTest } = await import(
      "@/lib/decision/test-summarizer"
    );
    const res = await runSummarizerTest();
    expect(res.ok).toBe(true);
    expect(res.stage).toBe("mock");
    expect(res.message).toMatch(/MOCK|模擬/);
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("testSummarizer success preview without secrets", async () => {
    completeMock.mockResolvedValue({
      text: JSON.stringify({
        consensus: ["aligned"],
        disagreements: [],
        recommendation: "Ship the pilot carefully.",
        minority_views: [],
        missing_information: [],
      }),
      finish_reason: "stop",
    });
    const { clearSettingsCache, loadSettingsFile } = await import(
      "@/lib/config/settings"
    );
    clearSettingsCache();
    await loadSettingsFile();
    const { runSummarizerTest } = await import(
      "@/lib/decision/test-summarizer"
    );
    const res = await runSummarizerTest(FIXTURE);
    expect(res.ok).toBe(true);
    expect(res.stage).toBe("ok");
    expect(res.preview).toContain("pilot");
    expect(JSON.stringify(res)).not.toMatch(/apiKey|sk-|AIza/);
  });
  it("truncated MELCHIOR is excluded from summary evidence and stays incomplete", async () => {
    const { updateSettingsFromClient } = await import("@/lib/config/settings");
    await updateSettingsFromClient({ personas: { MELCHIOR: {
      model: "local-truncated", maxOutputTokens: 2048, councilStructuredOutput: true,
    } } });
    completeMock.mockImplementation(async (req) => {
      if (req.model === "local-truncated") {
        expect(req.responseSchema).toHaveProperty("required", ["proposal", "rationale", "risks", "missing_information"]);
        return { text: '{"proposal":"unfinished', finish_reason: "length" };
      }
      if (req.model === "local-sum") {
        const payload = JSON.parse(req.messages[1].content);
        expect(payload.failed_units).toEqual(["MELCHIOR"]);
        expect(payload.successful_units).toEqual(["BALTHASAR", "CASPER"]);
        expect(payload.opinions.map((o: { id: string }) => o.id)).toEqual(["BALTHASAR", "CASPER"]);
        expect(req.messages[0].content).toContain("never attribute agreement");
        expect(req.responseSchema).toBeUndefined();
        return { text: JSON.stringify({ consensus: ["Two support a pilot"], disagreements: [],
          recommendation: "Pilot", minority_views: [], missing_information: [] }), finish_reason: "stop" };
      }
      expect(req.responseSchema).toBeUndefined();
      return { text: JSON.stringify({ proposal: "Pilot", rationale: "Test first", risks: [], missing_information: [] }), finish_reason: "stop" };
    });
    const { runMagiCouncil } = await import("@/lib/decision/magi-council");
    const result = await runMagiCouncil("Long complex topic");
    expect(result.status).toBe("incomplete");
    expect(result.opinions.MELCHIOR.error).toMatch(/truncated.*length.*2048/);
    expect(result.synthesis_mode).toBe("llm");
    expect(result.recommendation).toContain("No valid opinion from MELCHIOR");
    expect(result.missing_information.join(" ")).toContain("MELCHIOR");
    expect(completeMock).toHaveBeenCalledTimes(4);
  });

  it("rejects a truncated summarizer response even if JSON is parseable", async () => {
    const { loadSettingsFile } = await import("@/lib/config/settings");
    await loadSettingsFile();
    completeMock.mockResolvedValue({ text: JSON.stringify({ consensus: [], disagreements: [],
      recommendation: "Partial", minority_views: [], missing_information: [] }), finish_reason: "length" });
    const { llmSynthesis } = await import("@/lib/decision/summarizer-run");
    const result = await llmSynthesis("t", FIXTURE);
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.error.message).toContain("output truncated");
  });

  it("does not call summarizer when all units failed", async () => {
    const { loadSettingsFile } = await import("@/lib/config/settings");
    await loadSettingsFile();
    const { llmSynthesis } = await import("@/lib/decision/summarizer-run");
    const failed = FIXTURE.map((o) => ({ id: o.id, number: o.number, unitStatus: "error" as const, error: "failed" }));
    expect(await llmSynthesis("t", failed)).toEqual({ kind: "disabled" });
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("adds response_format only for explicit JSON schema opt-in", () => {
    const schema = { type: "object", properties: { proposal: { type: "string" } } };
    const body = buildOpenAICompatibleChatParams({ model: "local", messages: [],
      maxOutputTokens: 64, temperature: 0.2, timeoutMs: 1000, responseSchema: schema });
    expect(body.response_format?.json_schema.schema).toEqual(schema);
  });

  it("one valid unit cannot create multi-unit consensus or disagreement", async () => {
    const { loadSettingsFile } = await import("@/lib/config/settings");
    await loadSettingsFile();
    completeMock.mockResolvedValue({ text: JSON.stringify({ consensus: ["Everyone agrees"],
      disagreements: ["Invented difference"], recommendation: "Pilot", minority_views: [], missing_information: [] }), finish_reason: "stop" });
    const { llmSynthesis } = await import("@/lib/decision/summarizer-run");
    const opinions = FIXTURE.map((o, i) => i === 0 ? o : { id: o.id, number: o.number, unitStatus: "error" as const, error: "failed" });
    const result = await llmSynthesis("t", opinions);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.fields.consensus).toEqual([]);
      expect(result.fields.disagreements).toEqual([]);
    }
  });

});
