import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as healthz } from "@/app/api/healthz/route";
import { GET as models } from "@/app/api/v1/models/route";
import { POST as chat } from "@/app/api/v1/chat/completions/route";

function req(
  url: string,
  init?: { method?: string; body?: unknown; headers?: Record<string, string> },
) {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  return new NextRequest(url, {
    method: init?.method ?? "GET",
    headers,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

describe("GET /healthz", () => {
  it("returns ok without auth or LLM", async () => {
    const res = await healthz();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
  });
});

describe("GET /v1/models", () => {
  beforeEach(() => {
    process.env.MAGI_API_KEY = "test-secret";
  });

  it("rejects missing bearer", async () => {
    const res = await models(req("http://localhost/v1/models"));
    expect(res.status).toBe(401);
  });

  it("lists magi-verdict and magi-council with valid bearer", async () => {
    const res = await models(
      req("http://localhost/v1/models", {
        headers: { authorization: "Bearer test-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    const ids = json.data.map((m: { id: string }) => m.id);
    expect(ids).toContain("magi-verdict");
    expect(ids).toContain("magi-council");
  });
});

describe("POST /v1/chat/completions", () => {
  beforeEach(() => {
    process.env.MAGI_API_KEY = "test-secret";
    process.env.MAGI_MOCK_MODE = "true";
  });

  it("rejects missing auth", async () => {
    const res = await chat(
      req("http://localhost/v1/chat/completions", {
        method: "POST",
        body: { model: "magi-verdict", messages: [{ role: "user", content: "hi" }] },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects stream=true", async () => {
    const res = await chat(
      req("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: { authorization: "Bearer test-secret" },
        body: {
          model: "magi-verdict",
          stream: true,
          messages: [{ role: "user", content: "Approve?" }],
        },
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("stream_not_supported");
  });

  it("rejects wrong model", async () => {
    const res = await chat(
      req("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: { authorization: "Bearer test-secret" },
        body: {
          model: "gpt-4",
          messages: [{ role: "user", content: "Approve?" }],
        },
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("model_not_found");
  });

  it("returns OpenAI-compatible schema with mock deliberation", async () => {
    const res = await chat(
      req("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: { authorization: "Bearer test-secret" },
        body: {
          model: "magi-verdict",
          stream: false,
          messages: [{ role: "user", content: "Should we ship the feature?" }],
        },
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.object).toBe("chat.completion");
    expect(json.model).toBe("magi-verdict");
    expect(json.choices[0].message.role).toBe("assistant");
    expect(json.choices[0].message.content).toContain("Final Verdict");
    expect(json.choices[0].message.content).not.toMatch(/[\u2012\u2013\u2014\u2015]/);
    expect(json.magi.verdict).toBeTruthy();
    expect(json.usage).toBeUndefined();
    expect(res.headers.get("content-type") || "").toMatch(/charset=utf-8/i);
  });

  it("bearer still required (wrong key)", async () => {
    const res = await chat(
      req("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: { authorization: "Bearer wrong" },
        body: {
          model: "magi-verdict",
          messages: [{ role: "user", content: "Approve?" }],
        },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns magi-council mock deliberation", async () => {
    const res = await chat(
      req("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: { authorization: "Bearer test-secret" },
        body: {
          model: "magi-council",
          stream: false,
          messages: [{ role: "user", content: "How should we plan the launch?" }],
        },
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.model).toBe("magi-council");
    expect(json.magi.mode).toBe("council");
    expect(json.choices[0].message.content).toContain("MAGI Council");
    expect(json.choices[0].message.content).toContain("Minority Views");
  });
});
