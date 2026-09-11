export type ProviderKind =
  | "openai"
  | "anthropic"
  | "google"
  | "openai-compatible"
  | "ollama";

export const PROVIDER_KINDS: ProviderKind[] = [
  "openai",
  "anthropic",
  "google",
  "openai-compatible",
  "ollama",
];
