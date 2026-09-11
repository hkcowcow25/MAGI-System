import path from "node:path";

/**
 * SQLite history DB path.
 * Default: ${MAGI_DATA_DIR:-/data}/magi-history.sqlite
 * Override with MAGI_HISTORY_DB_PATH.
 *
 * Same volume as settings (MAGI_DATA_VOLUME → /data). Uses sql.js (pure JS/asm)
 * so Next.js standalone on node:22-alpine needs no native rebuild.
 */
export function getHistoryDbPath(): string {
  const explicit = process.env.MAGI_HISTORY_DB_PATH?.trim();
  if (explicit) return explicit;
  const dataDir = process.env.MAGI_DATA_DIR?.trim() || "/data";
  return path.join(dataDir, "magi-history.sqlite");
}

export function getDataDir(): string {
  return process.env.MAGI_DATA_DIR?.trim() || "/data";
}
