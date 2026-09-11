"use server";

import { cookies } from "next/headers";
import {
  MAGI_SESSION_COOKIE,
  isAccessConfigured,
  verifySessionToken,
} from "@/lib/auth/session";
import {
  listDeliberations,
  getDeliberation,
  deleteDeliberation,
  exportDeliberationJson,
  getHistoryDbPath,
} from "@/lib/history";
import type {
  HistoryListItem,
  HistoryListQuery,
  HistoryRecord,
} from "@/lib/history/types";

type GateFailure = {
  ok: false;
  error: string;
  code: "locked" | "not_configured";
};

async function requireUnlocked(): Promise<GateFailure | null> {
  if (!isAccessConfigured()) {
    return {
      ok: false,
      code: "not_configured",
      error:
        "MAGI_ACCESS_CODE is not configured. Set MAGI_ACCESS_CODE in the server environment to unlock the web UI (fail-closed).",
    };
  }
  const jar = await cookies();
  const token = jar.get(MAGI_SESSION_COOKIE)?.value;
  if (!verifySessionToken(token)) {
    return {
      ok: false,
      code: "locked",
      error: "Web UI is locked. Enter the access code to unlock before deliberating.",
    };
  }
  return null;
}

export async function listHistory(
  query: HistoryListQuery = {},
): Promise<
  | { ok: true; items: HistoryListItem[]; total: number; dbPath: string }
  | { ok: false; error: string; code: "locked" | "not_configured" | "server_error" }
> {
  const gate = await requireUnlocked();
  if (gate) return gate;
  try {
    const { items, total } = await listDeliberations(query);
    return { ok: true, items, total, dbPath: getHistoryDbPath() };
  } catch (err) {
    return {
      ok: false,
      code: "server_error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function getHistoryDetail(
  id: string,
): Promise<
  | { ok: true; record: HistoryRecord }
  | {
      ok: false;
      error: string;
      code: "locked" | "not_configured" | "not_found" | "server_error";
    }
> {
  const gate = await requireUnlocked();
  if (gate) return gate;
  try {
    const record = await getDeliberation(id);
    if (!record) {
      return { ok: false, code: "not_found", error: "搵唔到呢筆記錄" };
    }
    return { ok: true, record };
  } catch (err) {
    return {
      ok: false,
      code: "server_error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function exportHistoryJson(
  id: string,
): Promise<
  | { ok: true; json: string; filename: string }
  | {
      ok: false;
      error: string;
      code: "locked" | "not_configured" | "not_found" | "server_error";
    }
> {
  const gate = await requireUnlocked();
  if (gate) return gate;
  try {
    const record = await getDeliberation(id);
    if (!record) {
      return { ok: false, code: "not_found", error: "搵唔到呢筆記錄" };
    }
    const json = exportDeliberationJson(record);
    return {
      ok: true,
      json,
      filename: `magi-history-${record.id}.json`,
    };
  } catch (err) {
    return {
      ok: false,
      code: "server_error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function deleteHistory(
  id: string,
): Promise<
  | { ok: true }
  | {
      ok: false;
      error: string;
      code: "locked" | "not_configured" | "not_found" | "server_error";
    }
> {
  const gate = await requireUnlocked();
  if (gate) return gate;
  try {
    const existing = await getDeliberation(id);
    if (!existing) {
      return { ok: false, code: "not_found", error: "搵唔到呢筆記錄" };
    }
    await deleteDeliberation(id);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      code: "server_error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
