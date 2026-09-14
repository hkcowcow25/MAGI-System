# Council reliability follow-up to PR #3

This branch is based on `feature/magi-history` at
`a3b21cfe1b9eee0d14e2398f20620cbec9aea414`. It is a separate reviewable change;
no merge is required to test its ZIP locally.

## User evidence and diagnosis

MELCHIOR is LM Studio, while the summarizer is Perplexity Sonar. They are separate
requests and credentials. The provided LM Studio response had `finish_reason: length`,
494 prompt tokens and 2048 completion tokens, with unfinished JSON. That is an output
limit, not evidence that the 8192-token context was full. Truncated outputs are now
rejected with a specific message, even if the partial JSON happens to parse. There
is no automatic paid retry or fabricated JSON repair.

Gemini previously returned `User location is not supported for the API use`.
The provider-key fallback defect was separate; it was not the established cause of
that request's failure. Sonar was user-tested with `https://api.perplexity.ai`
(no `/v1`). This PR does not change the user's keys or providers.

## Local test setup

1. Download the new PR branch ZIP. Copy its project files into the existing
   `C:\Users\hkcow\Projects\MAGI-System-Council` folder. Preserve `.env.local`
   and the existing Compose volume/project identity. The ZIP includes a complete
   `package-lock.json`; old compressed lock parts are no longer used.
2. From that same folder run:

   ```powershell
   docker compose --env-file .env.local up -d --build --force-recreate magi
   ```

3. Settings → MELCHIOR: retain the LM Studio provider, URL and model; set Max tokens
   to **4096** as a starting test budget. Enable **議會 JSON 結構輸出** and save.
   This checkbox affects Council only. The ordinary connection test checks reachability,
   not Council schema output; test with a real Council question afterwards.
4. Keep the summarizer on `openai-compatible`, `sonar`,
   `https://api.perplexity.ai` and its dedicated environment key. Save before using
   “測試摘要”. No Docker rebuild is needed for these saved UI fields.
5. Retry the original long Council question. Expect three valid units and `llm`
   synthesis if all upstream responses succeed. If a unit fails, expect `incomplete`,
   a coverage warning and a summary limited to successful opinions. Prompt constraints
   reduce false attribution but cannot prove all generated prose is factually faithful;
   inspect the summary alongside the source opinions.
6. Check History, recreate the container with the same command, then verify the
   record remains. Do not remove the `/data` volume.

Structured output is explicitly opt-in because compatible endpoints differ. The
request uses [LM Studio's documented JSON Schema format](https://lmstudio.ai/docs/developer/openai-compat/structured-output).
The default request body for xAI/Perplexity and other personas is unchanged. Schema
constraints do not eliminate token limits or validate the substance of an opinion.

## Settings and history behavior

- Summarizer runs only when its effective `enabled` is true; model alone cannot enable it.
- A saved blank or null Base URL becomes an explicit empty override and survives reload,
  overriding an old environment URL. Omitting the field still inherits environment/defaults.
- All history operations, including first open and reads, are serialized. Mutations use a
  private database copy; a same-directory temporary file is renamed over the database
  before the new in-memory copy becomes visible. Failed persistence leaves the previous
  database intact. Reads no longer rewrite the file.
- This sql.js store supports **one Node process per database file**. Do not share the file
  among multiple containers/workers. Each write still exports the entire database and
  temporarily copies it in memory; larger deployments need a different storage design.
  Atomic replacement is not a guarantee against every power-loss/filesystem failure.

## Validation boundary

Automated tests cover truncated output, schema opt-in, failed participant exclusion,
zero/one valid opinion, disabled summarizer, persistent URL clearing, concurrent cold
history writes, reopen persistence, and simulated file-replacement failure/recovery.
Real LM Studio, Sonar, Windows Docker and Synology execution require the user's environment.
