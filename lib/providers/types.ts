export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  /** Explicit opt-in for compatible servers supporting JSON Schema. */
  responseSchema?: Record<string, unknown>;
  model: string;
  messages: ChatMessage[];
  maxOutputTokens: number;
  temperature: number;
  timeoutMs: number;
  apiKey?: string;
  baseUrl?: string;
  /** OpenAI Responses reasoning effort */
  reasoningEffort?: "low" | "medium" | "high";
  /**
   * Opt-in JSON response hint for providers that support it (e.g. Google
   * responseMimeType). Callers should use carefully; prompts remain primary.
   */
  responseJson?: boolean;
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
