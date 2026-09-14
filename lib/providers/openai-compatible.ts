import OpenAI from "openai";
import type { CompletionRequest, CompletionResult, ProviderAdapter } from "./types";

/**
 * Pure request-body builder for openai-compatible chat completions.
 * Intentionally omits response_format — mode schemas live in system prompts.
 */
export function buildOpenAICompatibleChatParams(req: CompletionRequest) {
  return {
    model: req.model,
    messages: req.messages,
    max_tokens: req.maxOutputTokens,
    temperature: req.temperature,
  };
}

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
      const params = buildOpenAICompatibleChatParams(req);
      const chat = await client.chat.completions.create(params);
      const choice = chat.choices[0];
      const text = choice?.message?.content ?? "";
      return {
        text,
        finish_reason: choice?.finish_reason ?? null,
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
