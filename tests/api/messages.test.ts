import { describe, expect, it } from "vitest";
import {
  extractTopicFromMessages,
  MAX_INPUT_CHARS,
  MessageValidationError,
} from "@/lib/api/messages";

describe("extractTopicFromMessages", () => {
  it("extracts latest user message", () => {
    const { topic, truncated } = extractTopicFromMessages([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
      { role: "user", content: "Should we deploy?" },
    ]);
    expect(topic).toContain("Should we deploy?");
    expect(truncated).toBe(false);
  });

  it("rejects image content", () => {
    expect(() =>
      extractTopicFromMessages([
        {
          role: "user",
          content: [{ type: "image_url", image_url: { url: "http://x" } }],
        },
      ]),
    ).toThrow(MessageValidationError);
  });

  it("rejects tool roles", () => {
    expect(() =>
      extractTopicFromMessages([
        { role: "user", content: "hi" },
        { role: "tool", content: "result" },
      ]),
    ).toThrow(/Tool/);
  });

  it("truncates oversized prior context", () => {
    const prior = "x".repeat(MAX_INPUT_CHARS);
    const { topic, truncated } = extractTopicFromMessages([
      { role: "user", content: prior },
      { role: "user", content: "Final question?" },
    ]);
    expect(truncated).toBe(true);
    expect(topic.length).toBeLessThanOrEqual(MAX_INPUT_CHARS);
    expect(topic).toContain("Final question?");
  });

  it("rejects empty messages", () => {
    expect(() => extractTopicFromMessages([])).toThrow(/non-empty/);
  });
});
