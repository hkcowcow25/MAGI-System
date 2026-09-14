import type { CompletionResult } from "./types";

/** Reject explicitly truncated responses even when their partial text parses. */
export function assertCompletionNotTruncated(
  completion: CompletionResult,
  label: string,
  maxOutputTokens: number,
): void {
  const reason = completion.finish_reason?.toLowerCase();
  if (reason === "length" || reason === "max_tokens") {
    throw new Error(
      `${label}: output truncated (finish_reason=${completion.finish_reason}, ` +
      `maxOutputTokens=${maxOutputTokens}). Increase Max tokens or request a shorter answer; ` +
      `the partial response was not accepted.`,
    );
  }
}
