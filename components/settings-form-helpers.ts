import type { MagiId, MagiMode } from "@/types/magi";
import type { ProviderKind } from "@/lib/config/types";
import type { SettingsView } from "@/lib/config/settings-view";

export const PERSONAS: MagiId[] = ["MELCHIOR", "BALTHASAR", "CASPER"];
export const PROVIDERS: ProviderKind[] = [
  "openai",
  "anthropic",
  "google",
  "openai-compatible",
  "ollama",
];

export type PersonaForm = {
  provider: ProviderKind;
  model: string;
  baseUrl: string;
  systemPrompt: string;
  timeoutMs: number;
  maxOutputTokens: number;
  temperature: number;
  apiKeyStatusLabel: string;
};

export type FormState = {
  defaultMode: MagiMode;
  personas: Record<MagiId, PersonaForm>;
  summarizer: {
    enabled: boolean;
    provider: ProviderKind;
    model: string;
    baseUrl: string;
    timeoutMs: number;
    maxOutputTokens: number;
    temperature: number;
    apiKeyStatusLabel: string;
  };
};

export function viewToForm(view: SettingsView): FormState {
  const personas = {} as Record<MagiId, PersonaForm>;
  for (const id of PERSONAS) {
    const p = view.personas[id];
    personas[id] = {
      provider: p.provider,
      model: p.model,
      baseUrl: p.baseUrl,
      systemPrompt: p.systemPrompt,
      timeoutMs: p.timeoutMs,
      maxOutputTokens: p.maxOutputTokens,
      temperature: p.temperature,
      apiKeyStatusLabel: p.apiKeyStatusLabel,
    };
  }
  return {
    defaultMode: view.defaultMode,
    personas,
    summarizer: {
      // Saved enabled boolean only (default false). Never infer from configured/model.
      enabled: view.summarizer.enabled === true,
      provider: (view.summarizer.provider as ProviderKind) || "openai-compatible",
      model: view.summarizer.model || "",
      baseUrl: view.summarizer.baseUrl || "",
      timeoutMs: view.summarizer.timeoutMs || 60000,
      maxOutputTokens: view.summarizer.maxOutputTokens || 1024,
      temperature: view.summarizer.temperature ?? 0.2,
      apiKeyStatusLabel: view.summarizer.apiKeyStatusLabel,
    },
  };
}

/** Stable JSON fingerprint for dirty-checking the settings form. */
export function formFingerprint(form: FormState): string {
  return JSON.stringify({
    defaultMode: form.defaultMode,
    personas: form.personas,
    summarizer: {
      enabled: form.summarizer.enabled,
      provider: form.summarizer.provider,
      model: form.summarizer.model,
      baseUrl: form.summarizer.baseUrl,
      timeoutMs: form.summarizer.timeoutMs,
      maxOutputTokens: form.summarizer.maxOutputTokens,
      temperature: form.summarizer.temperature,
    },
  });
}
