import type { PersonaConfig } from "@/lib/config/persona";
import { buildSystemPrompt } from "@/lib/prompts";

/** Always append council output format — never return a raw Verdict override. */
export function resolveCouncilPrompt(config: PersonaConfig): string {
  return buildSystemPrompt(config.id, "council", config.personaDescription);
}
