import OpenAI from "openai";
import type { CompletionRequest, CompletionResult, ProviderAdapter } from "./types";

export function createOpenAIAdapter(): ProviderAdapter {
  return {
    async complete(req: CompletionRequest): Promise<CompletionResult> {
      if (!req.apiKey) throw new Error("Missing API key for openai provider");
      const client = new OpenAI({
        apiKey: req.apiKey,
        baseURL: req.baseUrl,
        timeout: req.timeoutMs,
      });

      const system = req.messages.find((m) => m.role === "system")?.content;
      const input = req.messages
        .filter((m) => m.role !== "system")
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n\n");

      // Prefer Responses API when no custom base URL (official OpenAI)
      if (!req.baseUrl) {
        const response = await client.responses.create({
          model: req.model,
          instructions: system,
          input: input || req.messages[req.messages.length - 1]?.content || "",
          reasoning: req.reasoningEffort
            ? { effort: req.reasoningEffort }
            : undefined,
          max_output_tokens: req.maxOutputTokens,
        });
        return {
          text: response.output_text ?? "",
          usage: response.usage
            ? {
                prompt_tokens: response.usage.input_tokens,
                completion_tokens: response.usage.output_tokens,
                total_tokens: response.usage.total_tokens,
              }
            : undefined,
        };
      }

      // Custom base URL → Chat Completions (openai-compatible style)
      const chat = await client.chat.completions.create({
        model: req.model,
        messages: req.messages,
        max_tokens: req.maxOutputTokens,
        temperature: req.temperature,
      });
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
