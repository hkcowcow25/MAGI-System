import OpenAI from "openai";
import type { CompletionRequest, CompletionResult, ProviderAdapter } from "./types";

export function createOpenAICompatibleAdapter(): ProviderAdapter {
  return {
    async complete(req: CompletionRequest): Promise<CompletionResult> {
      const baseURL = req.baseUrl;
      if (!baseURL) {
        throw new Error("BASE_URL required for openai-compatible / ollama");
      }
      const client = new OpenAI({
        apiKey: req.apiKey || "ollama",
        baseURL,
        timeout: req.timeoutMs,
      });
      const chat = await client.chat.completions.create({
        model: req.model,
        messages: req.messages,
        max_tokens: req.maxOutputTokens,
        temperature: req.temperature,
      });
      const text = chat.choices[0]?.message?.content ?? "";
      return {
        text,
        usage: chat.usage
          ? {
              prompt_tokens: chat.usage.prompt_tokens,
              completion_tokens: chat.usage.completion_tokens,
              total_tokens: chat.usage.total_tokens,
            }
          : undefined,
      };
    },
  };
}
