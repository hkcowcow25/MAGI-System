export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  model: string;
  messages: ChatMessage[];
  maxOutputTokens: number;
  temperature: number;
  timeoutMs: number;
  apiKey?: string;
  baseUrl?: string;
  /** OpenAI Responses reasoning effort */
  reasoningEffort?: "low" | "medium" | "high";
}

export interface CompletionResult {
  text: string;
  /** Present when the upstream API reports it (e.g. choices[0].finish_reason). */
  finish_reason?: string | null;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface ProviderAdapter {
  complete(req: CompletionRequest): Promise<CompletionResult>;
}
