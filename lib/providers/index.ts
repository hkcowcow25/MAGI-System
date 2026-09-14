import type { ProviderKind } from "@/lib/config/persona";
import type { ProviderAdapter } from "./types";
import { createOpenAIAdapter } from "./openai";
import { createOpenAICompatibleAdapter } from "./openai-compatible";
import { createAnthropicAdapter } from "./anthropic";
import { createGoogleAdapter } from "./google";

export function getProviderAdapter(kind: ProviderKind): ProviderAdapter {
  switch (kind) {
    case "openai":
      return createOpenAIAdapter();
    case "openai-compatible":
    case "ollama":
      return createOpenAICompatibleAdapter();
    case "anthropic":
      return createAnthropicAdapter();
    case "google":
      return createGoogleAdapter();
    default:
      throw new Error(`Unsupported provider: ${kind}`);
  }
}

export type { CompletionRequest, CompletionResult, ChatMessage } from "./types";
export {
  parseUnitAnalysis,
  parseCouncilOpinion,
  parseSynthesis,
} from "./parse-json";
