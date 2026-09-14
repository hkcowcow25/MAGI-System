import Anthropic from "@anthropic-ai/sdk";
import type { CompletionRequest, CompletionResult, ProviderAdapter } from "./types";

export function createAnthropicAdapter(): ProviderAdapter {
  return {
    async complete(req: CompletionRequest): Promise<CompletionResult> {
      if (!req.apiKey) throw new Error("Missing API key for anthropic provider");
      const client = new Anthropic({
        apiKey: req.apiKey,
        baseURL: req.baseUrl,
        timeout: req.timeoutMs,
      });
      const system = req.messages.find((m) => m.role === "system")?.content;
      const messages = req.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

      const response = await client.messages.create({
        model: req.model,
        max_tokens: req.maxOutputTokens,
        temperature: req.temperature,
        system: system,
        messages,
      });
      const text =
        response.content[0]?.type === "text" ? response.content[0].text : "";
      return {
        text,
        usage: {
          prompt_tokens: response.usage?.input_tokens,
          completion_tokens: response.usage?.output_tokens,
          total_tokens:
            (response.usage?.input_tokens ?? 0) +
            (response.usage?.output_tokens ?? 0),
        },
      };
    },
  };
}
