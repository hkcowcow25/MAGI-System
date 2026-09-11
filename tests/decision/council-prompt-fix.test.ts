import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CompletionRequest, CompletionResult } from "@/lib/providers/types";
import {
  MELCHIOR_PROMPT,
  buildSystemPrompt,
  COUNCIL_OUTPUT_FORMAT,
  PERSONA_IDENTITY,
} from "@/lib/prompts";
import {
  parseCouncilOpinion,
  parseUnitAnalysis,
} from "@/lib/providers/parse-json";
import { buildOpenAICompatibleChatParams } from "@/lib/providers/openai-compatible";

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

describe("parseCouncilOpinion schema errors", () => {
  it("throws clearer error when response looks like Verdict vote schema", () => {
    const verdictJson = JSON.stringify({
      reasoning: "Looks fine",
      vote: "APPROVE",
      isCritical: false,
      assumptions: [],
      risks: [],
      missing_information: [],
    });
    expect(() => parseCouncilOpinion(verdictJson)).toThrow(
      /Missing proposal \(response looks like Verdict vote schema\)/,
    );
  });

  it("parses proper council JSON → proposal", () => {
    const a = parseCouncilOpinion(
      JSON.stringify({
        proposal: "Pilot in one region",
        rationale: "Limit blast radius",
        risks: ["ops load"],
        missing_information: [],
      }),
    );
    expect(a.proposal).toBe("Pilot in one region");
    expect(a.rationale).toBe("Limit blast radius");
  });

  it("does not invent proposal from vote", () => {
    expect(() =>
      parseCouncilOpinion(
        JSON.stringify({ vote: "REJECT", reasoning: "nope" }),
      ),
    ).toThrow(/Missing proposal/);
  });
});

describe("verdict parser regression", () => {
  it("parseUnitAnalysis still works", () => {
    const a = parseUnitAnalysis(
      JSON.stringify({
        reasoning: "ok",
        vote: "APPROVE",
        isCritical: false,
      }),
    );
    expect(a.vote).toBe("APPROVE");
  });

  it("buildSystemPrompt verdict OK", () => {
    const p = buildSystemPrompt("CASPER", "verdict");
    expect(p).toContain('"vote"');
  });
});

describe("openai-compatible adapter request shape", () => {
  it("does not send verdict-only response_format", () => {
    const req: CompletionRequest = {
      model: "local",
      messages: [
        {
          role: "system",
          content: buildSystemPrompt("MELCHIOR", "council"),
        },
        { role: "user", content: "Q?" },
      ],
      maxOutputTokens: 256,
      temperature: 0.2,
      timeoutMs: 5000,
      baseUrl: "http://127.0.0.1:1234/v1",
    };
    const body = buildOpenAICompatibleChatParams(req) as Record<
      string,
      unknown
    >;
    expect(body).not.toHaveProperty("response_format");
    expect(Object.keys(body).sort()).toEqual(
      ["max_tokens", "messages", "model", "temperature"].sort(),
    );
  });
});

describe("council run path with mocked adapter", () => {
  let dir: string;
  const prevMock = process.env.MAGI_MOCK_MODE;
  const prevPath = process.env.MAGI_SETTINGS_PATH;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "magi-council-fix-"));
    process.env.MAGI_SETTINGS_PATH = path.join(dir, "magi-settings.json");
    process.env.MAGI_MOCK_MODE = "false";
    completeMock.mockReset();

    const { clearSettingsCache } = await import("@/lib/config/settings");
    clearSettingsCache();

    await writeFile(
      process.env.MAGI_SETTINGS_PATH,
      JSON.stringify({
        version: 1,
        personas: {
          MELCHIOR: {
            provider: "openai-compatible",
            model: "mock-model",
            baseUrl: "http://127.0.0.1:9/v1",
            systemPrompt: MELCHIOR_PROMPT,
          },
          BALTHASAR: {
            provider: "openai-compatible",
            model: "mock-model",
            baseUrl: "http://127.0.0.1:9/v1",
            systemPrompt: MELCHIOR_PROMPT,
          },
          CASPER: {
            provider: "openai-compatible",
            model: "mock-model",
            baseUrl: "http://127.0.0.1:9/v1",
            systemPrompt: MELCHIOR_PROMPT,
          },
        },
      }),
      "utf8",
    );
  });

  afterEach(async () => {
    const { clearSettingsCache } = await import("@/lib/config/settings");
    clearSettingsCache();
    if (prevMock === undefined) delete process.env.MAGI_MOCK_MODE;
    else process.env.MAGI_MOCK_MODE = prevMock;
    if (prevPath === undefined) delete process.env.MAGI_SETTINGS_PATH;
    else process.env.MAGI_SETTINGS_PATH = prevPath;
    await rm(dir, { recursive: true, force: true });
  });

  it("Verdict JSON during council → Missing proposal / Verdict schema; incomplete; no fake proposal", async () => {
    const verdictText = JSON.stringify({
      reasoning: "Approve for science",
      vote: "APPROVE",
      isCritical: false,
      assumptions: [],
      risks: [],
      missing_information: [],
    });
    completeMock.mockImplementation(async (req) => {
      const system =
        req.messages.find((m) => m.role === "system")?.content ?? "";
      expect(system).toContain(COUNCIL_OUTPUT_FORMAT);
      expect(system).not.toContain('"vote"');
      return { text: verdictText, finish_reason: "stop" };
    });

    const { loadSettingsFile } = await import("@/lib/config/settings");
    const { getPersonaConfig } = await import("@/lib/config/persona");
    const { runMagiCouncil } = await import("@/lib/decision/magi-council");

    await loadSettingsFile();
    const cfg = getPersonaConfig("MELCHIOR");
    // Migration strips Verdict schema from saved override
    expect(cfg.personaDescription).toBe(PERSONA_IDENTITY.MELCHIOR);
    expect(cfg.personaDescription).not.toContain('"vote"');

    const result = await runMagiCouncil("How should we launch?");
    expect(result.status).toBe("incomplete");
    for (const id of ["MELCHIOR", "BALTHASAR", "CASPER"] as const) {
      const o = result.opinions[id];
      expect(o.unitStatus).toBe("error");
      expect(o.error).toMatch(/Missing proposal/);
      expect(o.error).toMatch(/Verdict vote schema/);
      expect(o.proposal).toBeUndefined();
    }
  });

  it("proper council JSON → proposals parsed; complete", async () => {
    const councilText = JSON.stringify({
      proposal: "Staged rollout",
      rationale: "Reduce risk",
      risks: [],
      missing_information: [],
    });
    completeMock.mockResolvedValue({
      text: councilText,
      finish_reason: "stop",
    });

    const { loadSettingsFile } = await import("@/lib/config/settings");
    const { runMagiCouncil } = await import("@/lib/decision/magi-council");
    await loadSettingsFile();

    const result = await runMagiCouncil("How should we launch?");
    expect(result.status).toBe("complete");
    expect(result.opinions.MELCHIOR.proposal).toBe("Staged rollout");
    expect(result.opinions.BALTHASAR.unitStatus).toBe("ok");
    expect(result.opinions.CASPER.proposal).toBeTruthy();
  });
});
