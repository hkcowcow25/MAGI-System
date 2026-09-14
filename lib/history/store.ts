/**
 * Deliberation history store backed by sql.js (ASM build).
 *
 * Why sql.js instead of better-sqlite3:
 * - Next.js standalone on node:22-alpine has no build toolchain for native addons.
 * - sql-asm.js is pure JS — no WASM copy step in the Docker image.
 * - File is persisted under MAGI_DATA_DIR (same volume as settings).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { Database, SqlJsStatic } from "sql.js";
import type {
  HistoryInsertInput,
  HistoryListItem,
  HistoryListQuery,
  HistoryListResult,
  HistoryModels,
  HistoryRecord,
  HistorySource,
  HistoryStatus,
  UnitModelRef,
} from "@/lib/history/types";
import { getHistoryDbPath } from "@/lib/history/paths";
import { jsonLooksLikeSecrets, stripSecretsDeep } from "@/lib/history/sanitize";
import type { MagiMode } from "@/types/magi";

type SqlJsModule = SqlJsStatic;

let SQL: SqlJsModule | null = null;
let db: Database | null = null;
let dbPathCached: string | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function loadSqlJs(): Promise<SqlJsModule> {
  if (SQL) return SQL;
  const mod = await import("sql.js/dist/sql-asm.js");
  const factory = (mod as { default?: SqlJsStatic | (() => Promise<SqlJsStatic>) }).default
    ?? (mod as unknown as () => Promise<SqlJsStatic>);
  SQL = typeof factory === "function" ? await factory() : (factory as SqlJsStatic);
  return SQL;
}

function migrate(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS deliberations (
      id TEXT PRIMARY KEY NOT NULL,
      created_at TEXT NOT NULL,
      topic TEXT NOT NULL,
      mode TEXT NOT NULL,
      source TEXT NOT NULL,
      mock INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      models_json TEXT NOT NULL,
      units_json TEXT,
      outcome_json TEXT,
      errors_json TEXT,
      search_blob TEXT NOT NULL
    );
  `);
  database.run(
    `CREATE INDEX IF NOT EXISTS idx_deliberations_created ON deliberations(created_at DESC);`,
  );
  database.run(
    `CREATE INDEX IF NOT EXISTS idx_deliberations_search ON deliberations(search_blob);`,
  );
}

async function persistUnlocked(database: Database, filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const exported = database.export();
  await writeFile(filePath, Buffer.from(exported), { mode: 0o600 });
}

function enqueueWrite(fn: () => Promise<void>): Promise<void> {
  writeChain = writeChain.then(fn, fn);
  return writeChain;
}

export async function openHistoryDb(forcePath?: string): Promise<Database> {
  const filePath = forcePath ?? getHistoryDbPath();
  if (db && dbPathCached === filePath) return db;

  if (db) {
    db.close();
    db = null;
    dbPathCached = null;
  }

  const sql = await loadSqlJs();
  await mkdir(path.dirname(filePath), { recursive: true });
  try {
    const buf = await readFile(filePath);
    db = new sql.Database(new Uint8Array(buf));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== "ENOENT") throw err;
    db = new sql.Database();
  }
  migrate(db);
  dbPathCached = filePath;
  await persistUnlocked(db, filePath);
  return db;
}

export async function closeHistoryDb(): Promise<void> {
  await writeChain;
  if (db) {
    db.close();
    db = null;
  }
  dbPathCached = null;
}

function buildSearchBlob(input: {
  topic: string;
  mode: string;
  source: string;
  status: string;
  models: HistoryModels;
  units: unknown;
  outcome: unknown;
  errors: string[] | null;
}): string {
  const parts = [
    input.topic,
    input.mode,
    input.source,
    input.status,
    JSON.stringify(input.models),
    JSON.stringify(input.units ?? null),
    JSON.stringify(input.outcome ?? null),
    (input.errors ?? []).join(" "),
  ];
  return parts.join("\n").toLowerCase();
}

function summaryFromRow(
  mode: MagiMode,
  status: HistoryStatus,
  outcome: Record<string, unknown> | null,
): string {
  if (status === "error") {
    return "錯誤／未完成";
  }
  if (mode === "verdict") {
    const v = typeof outcome?.verdict === "string" ? outcome.verdict : status;
    return `裁決：${v}`;
  }
  const reco =
    typeof outcome?.recommendation === "string" ? outcome.recommendation : "";
  const snip = reco.replace(/\s+/g, " ").slice(0, 80);
  return snip ? `議會：${snip}` : `議會：${status}`;
}

function rowToListItem(row: Record<string, unknown>): HistoryListItem {
  const mode = row.mode as MagiMode;
  const status = row.status as HistoryStatus;
  let outcome: Record<string, unknown> | null = null;
  try {
    outcome = row.outcome_json
      ? (JSON.parse(String(row.outcome_json)) as Record<string, unknown>)
      : null;
  } catch {
    outcome = null;
  }
  return {
    id: String(row.id),
    createdAt: String(row.created_at),
    topic: String(row.topic),
    mode,
    source: row.source as HistorySource,
    mock: Boolean(row.mock),
    status,
    durationMs: Number(row.duration_ms) || 0,
    summary: summaryFromRow(mode, status, outcome),
  };
}

function rowToRecord(row: Record<string, unknown>): HistoryRecord {
  const base = rowToListItem(row);
  const parse = <T,>(raw: unknown): T | null => {
    if (raw == null || raw === "") return null;
    try {
      return JSON.parse(String(raw)) as T;
    } catch {
      return null;
    }
  };
  return {
    ...base,
    models: parse<HistoryModels>(row.models_json) ?? ({} as HistoryModels),
    units: parse(row.units_json),
    outcome: parse(row.outcome_json),
    errors: parse(row.errors_json),
  };
}

export async function insertDeliberation(
  input: HistoryInsertInput,
): Promise<HistoryRecord> {
  const database = await openHistoryDb();
  const id = input.id ?? randomUUID();
  const createdAt = input.createdAt ?? new Date().toISOString();
  const models = stripSecretsDeep(input.models);
  const units = input.units ? stripSecretsDeep(input.units) : null;
  const outcome = input.outcome ? stripSecretsDeep(input.outcome) : null;
  const errors = input.errors
    ? stripSecretsDeep(input.errors.map(String))
    : null;

  const modelsJson = JSON.stringify(models);
  const unitsJson = units ? JSON.stringify(units) : null;
  const outcomeJson = outcome ? JSON.stringify(outcome) : null;
  const errorsJson = errors ? JSON.stringify(errors) : null;

  for (const j of [modelsJson, unitsJson, outcomeJson, errorsJson]) {
    if (j && jsonLooksLikeSecrets(j)) {
      throw new Error("Refusing to persist secret-like fields in history DB");
    }
  }

  const searchBlob = buildSearchBlob({
    topic: input.topic,
    mode: input.mode,
    source: input.source,
    status: input.status,
    models,
    units,
    outcome,
    errors,
  });

  await enqueueWrite(async () => {
    database.run(
      `INSERT INTO deliberations (
        id, created_at, topic, mode, source, mock, status, duration_ms,
        models_json, units_json, outcome_json, errors_json, search_blob
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        createdAt,
        input.topic,
        input.mode,
        input.source,
        input.mock ? 1 : 0,
        input.status,
        Math.max(0, Math.floor(input.durationMs)),
        modelsJson,
        unitsJson,
        outcomeJson,
        errorsJson,
        searchBlob,
      ],
    );
    await persistUnlocked(database, dbPathCached ?? getHistoryDbPath());
  });

  const rec = await getDeliberation(id);
  if (!rec) throw new Error("Failed to read back inserted deliberation");
  return rec;
}

export async function listDeliberations(
  query: HistoryListQuery = {},
): Promise<HistoryListResult> {
  const database = await openHistoryDb();
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
  const offset = Math.max(query.offset ?? 0, 0);
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (query.q?.trim()) {
    where.push("search_blob LIKE ?");
    params.push(`%${query.q.trim().toLowerCase()}%`);
  }
  if (query.mode && query.mode !== "all") {
    where.push("mode = ?");
    params.push(query.mode);
  }
  if (query.source && query.source !== "all") {
    where.push("source = ?");
    params.push(query.source);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const countStmt = database.prepare(
    `SELECT COUNT(*) AS c FROM deliberations ${whereSql}`,
  );
  countStmt.bind(params);
  let total = 0;
  if (countStmt.step()) {
    const row = countStmt.getAsObject();
    total = Number(row.c) || 0;
  }
  countStmt.free();

  const listStmt = database.prepare(
    `SELECT id, created_at, topic, mode, source, mock, status, duration_ms, outcome_json
     FROM deliberations ${whereSql}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
  );
  listStmt.bind([...params, limit, offset]);
  const items: HistoryListItem[] = [];
  while (listStmt.step()) {
    items.push(rowToListItem(listStmt.getAsObject()));
  }
  listStmt.free();
  return { items, total };
}

export async function getDeliberation(
  id: string,
): Promise<HistoryRecord | null> {
  const database = await openHistoryDb();
  const stmt = database.prepare(
    `SELECT * FROM deliberations WHERE id = ? LIMIT 1`,
  );
  stmt.bind([id]);
  let rec: HistoryRecord | null = null;
  if (stmt.step()) {
    rec = rowToRecord(stmt.getAsObject());
  }
  stmt.free();
  return rec;
}

export async function deleteDeliberation(id: string): Promise<boolean> {
  const database = await openHistoryDb();
  let changes = 0;
  await enqueueWrite(async () => {
    database.run(`DELETE FROM deliberations WHERE id = ?`, [id]);
    const check = database.prepare(
      `SELECT COUNT(*) AS c FROM deliberations WHERE id = ?`,
    );
    check.bind([id]);
    check.step();
    const still = Number(check.getAsObject().c) || 0;
    check.free();
    changes = still === 0 ? 1 : 0;
    await persistUnlocked(database, dbPathCached ?? getHistoryDbPath());
  });
  if (changes === 0) {
    const still = await getDeliberation(id);
    return still === null;
  }
  return true;
}

export function exportDeliberationJson(rec: HistoryRecord): string {
  const payload = stripSecretsDeep({
    id: rec.id,
    createdAt: rec.createdAt,
    topic: rec.topic,
    mode: rec.mode,
    source: rec.source,
    mock: rec.mock,
    status: rec.status,
    durationMs: rec.durationMs,
    models: rec.models,
    units: rec.units,
    outcome: rec.outcome,
    errors: rec.errors,
  });
  const json = JSON.stringify(payload, null, 2) + "\n";
  if (jsonLooksLikeSecrets(json)) {
    throw new Error("Export blocked: secret-like content detected");
  }
  return json;
}

export function fingerprintTopic(topic: string): string {
  return createHash("sha256").update(topic).digest("hex").slice(0, 12);
}

export type { UnitModelRef, HistoryModels };
