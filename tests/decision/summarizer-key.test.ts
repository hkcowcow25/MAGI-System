import { afterEach, describe, expect, it } from "vitest";
import { resolveSummarizerKey } from "@/lib/decision/magi-council";

describe("resolveSummarizerKey", () => {
  const keys = [
    "MAGI_SUMMARIZER_API_KEY",
    "MELCHIOR_API_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GOOGLE_API_KEY",
  ] as const;
  const prev: Record<string, string | undefined> = {};

  function snapshot() {
    for (const k of keys) prev[k] = process.env[k];
  }
  function restore() {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
  function clearAll() {
    for (const k of keys) delete process.env[k];
  }

  afterEach(() => {
    restore();
  });

  it("google does not use MELCHIOR_API_KEY when Melchior key set", () => {
    snapshot();
    clearAll();
    process.env.MELCHIOR_API_KEY = "lm-studio";
    process.env.GOOGLE_API_KEY = "AIza-real-google-key";
    const r = resolveSummarizerKey("google");
    expect(r.configError).toBeUndefined();
    expect(r.apiKey).toBe("AIza-real-google-key");
    expect(r.apiKey).not.toBe("lm-studio");
  });

  it("google with only MELCHIOR_API_KEY → config error (no steal)", () => {
    snapshot();
    clearAll();
    process.env.MELCHIOR_API_KEY = "lm-studio";
    const r = resolveSummarizerKey("google");
    expect(r.apiKey).toBeUndefined();
    expect(r.configError).toMatch(/GOOGLE_API_KEY|MAGI_SUMMARIZER_API_KEY/);
  });

  it("google prefers MAGI_SUMMARIZER_API_KEY over GOOGLE_API_KEY", () => {
    snapshot();
    clearAll();
    process.env.MAGI_SUMMARIZER_API_KEY = "sum-key";
    process.env.GOOGLE_API_KEY = "google-key";
    expect(resolveSummarizerKey("google").apiKey).toBe("sum-key");
  });

  it("anthropic / openai use matching provider keys only", () => {
    snapshot();
    clearAll();
    process.env.MELCHIOR_API_KEY = "lm-studio";
    process.env.ANTHROPIC_API_KEY = "ant-key";
    process.env.OPENAI_API_KEY = "oai-key";
    expect(resolveSummarizerKey("anthropic").apiKey).toBe("ant-key");
    expect(resolveSummarizerKey("openai").apiKey).toBe("oai-key");
  });

  it("openai-compatible defaults to lm-studio and does not steal Melchior unless baseUrl matches", () => {
    snapshot();
    clearAll();
    process.env.MELCHIOR_API_KEY = "melchior-secret";
    const noMatch = resolveSummarizerKey("openai-compatible", {
      baseUrl: "http://127.0.0.1:1234/v1",
      melchiorProvider: "openai-compatible",
      melchiorBaseUrl: "http://127.0.0.1:9999/v1",
    });
    expect(noMatch.apiKey).toBe("lm-studio");

    const match = resolveSummarizerKey("openai-compatible", {
      baseUrl: "http://127.0.0.1:1234/v1/",
      melchiorProvider: "openai-compatible",
      melchiorBaseUrl: "http://127.0.0.1:1234/v1",
    });
    expect(match.apiKey).toBe("melchior-secret");
  });
});
