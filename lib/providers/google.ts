import { GoogleGenerativeAI } from "@google/generative-ai";
import type { CompletionRequest, CompletionResult, ProviderAdapter } from "./types";

export function createGoogleAdapter(): ProviderAdapter {
  return {
    async complete(req: CompletionRequest): Promise<CompletionResult> {
      if (!req.apiKey) throw new Error("Missing API key for google provider");
      const genAI = new GoogleGenerativeAI(req.apiKey);
      const system = req.messages.find((m) => m.role === "system")?.content;
      const model = genAI.getGenerativeModel({
        model: req.model,
        systemInstruction: system,
      });

      const history = req.messages.filter((m) => m.role !== "system");
      const contents = history.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), req.timeoutMs);
      try {
        const result = await model.generateContent({
          contents,
          generationConfig: {
            maxOutputTokens: req.maxOutputTokens,
            temperature: req.temperature,
          },
        });
        const text = result.response.text();
        const usageMeta = result.response.usageMetadata;
        return {
          text,
          usage: usageMeta
            ? {
                prompt_tokens: usageMeta.promptTokenCount,
                completion_tokens: usageMeta.candidatesTokenCount,
                total_tokens: usageMeta.totalTokenCount,
              }
            : undefined,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
