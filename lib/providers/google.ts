import { GoogleGenerativeAI } from "@google/generative-ai";
import type { CompletionRequest, CompletionResult, ProviderAdapter } from "./types";
import { extractProviderFailure } from "./errors";

/**
 * Google Generative AI adapter.
 * Does not attach Verdict/Council response_format schemas — prompts carry schema.
 * Optional req.responseJson may set responseMimeType=application/json (caller-opt-in).
 */
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

      const generationConfig: {
        maxOutputTokens: number;
        temperature: number;
        responseMimeType?: string;
      } = {
        maxOutputTokens: req.maxOutputTokens,
        temperature: req.temperature,
      };
      // Opt-in only — summarizer may request JSON mime; default relies on prompt.
      if (req.responseJson) {
        generationConfig.responseMimeType = "application/json";
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), req.timeoutMs);
      try {
        const result = await model.generateContent({
          contents,
          generationConfig,
        });
        const candidate = result.response.candidates?.[0];
        const finishRaw = candidate?.finishReason;
        const finish_reason =
          finishRaw != null && String(finishRaw).length > 0
            ? String(finishRaw)
            : null;

        let text = "";
        try {
          text = result.response.text() ?? "";
        } catch (textErr) {
          // Blocked / empty candidates — keep empty text when finish_reason present
          if (!finish_reason) throw textErr;
          text = "";
        }

        const usageMeta = result.response.usageMetadata;
        return {
          text,
          finish_reason,
          usage: usageMeta
            ? {
                prompt_tokens: usageMeta.promptTokenCount,
                completion_tokens: usageMeta.candidatesTokenCount,
                total_tokens: usageMeta.totalTokenCount,
              }
            : undefined,
        };
      } catch (err) {
        const { message, httpStatus } = extractProviderFailure(err);
        const wrapped = new Error(
          httpStatus
            ? `Google Generative AI ${httpStatus}: ${message}`
            : `Google Generative AI error: ${message}`,
        );
        (wrapped as Error & { httpStatus?: number }).httpStatus = httpStatus;
        throw wrapped;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
