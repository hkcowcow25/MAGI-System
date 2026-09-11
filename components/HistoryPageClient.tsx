"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { unlockAccessCode } from "@/app/actions";
import {
  deleteHistory,
  exportHistoryJson,
  getHistoryDetail,
  listHistory,
} from "@/lib/history/web-actions";
import type { HistoryListItem, HistoryRecord } from "@/lib/history/types";
import type { MagiMode } from "@/types/magi";

export default function HistoryPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [q, setQ] = useState("");
  const [modeFilter, setModeFilter] = useState<MagiMode | "all">("all");
  const [items, setItems] = useState<HistoryListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [dbPath, setDbPath] = useState("");
  const [selected, setSelected] = useState<HistoryRecord | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listHistory({
      q: q.trim() || undefined,
      mode: modeFilter,
      limit: 100,
    });
    if (!res.ok) {
      setLocked(res.code === "locked" || res.code === "not_configured");
      setError(res.error);
      setItems([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLocked(false);
    setItems(res.items);
    setTotal(res.total);
    setDbPath(res.dbPath);
    setLoading(false);
  }, [q, modeFilter]);

  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  const handleUnlock = async () => {
    setError(null);
    const res = await unlockAccessCode(accessCode);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setAccessCode("");
    await load();
  };

  const openDetail = async (id: string) => {
    setError(null);
    setInfo(null);
    const res = await getHistoryDetail(id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSelected(res.record);
  };

  const handleExport = async (id: string) => {
    setBusyId(id);
    setError(null);
    setInfo(null);
    const res = await exportHistoryJson(id);
    setBusyId(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const blob = new Blob([res.json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = res.filename;
    a.click();
    URL.revokeObjectURL(url);
    setInfo("已匯出 JSON（唔含金鑰／通行碼）。");
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("確定刪除呢筆審議記錄？")) return;
    setBusyId(id);
    setError(null);
    setInfo(null);
    const res = await deleteHistory(id);
    setBusyId(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (selected?.id === id) setSelected(null);
    setInfo("已刪除記錄。");
    await load();
  };

  return (
    <main className="magi-main settings-page history-page">
      <div className="system-border settings-border">
        <div className="settings-header">
          <h1 className="settings-title">審議紀錄</h1>
          <div className="history-header-links">
            <Link className="access-btn settings-link" href="/settings">
              設定
            </Link>
            <Link className="access-btn settings-link" href="/">
              ← 返回主頁
            </Link>
          </div>
        </div>

        {error && (
          <div className="error-panel">
            <span className="error-icon">⚠</span>
            <span>{error}</span>
          </div>
        )}
        {info && (
          <div className="info-panel" role="status">
            {info}
          </div>
        )}

        {locked && (
          <div className="settings-unlock">
            <p>此頁需要與設定相同嘅通行碼工作階段（MAGI_ACCESS_CODE）。</p>
            <div className="input-access-row">
              <input
                className="input-access-field"
                type="password"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder="輸入通行碼解鎖"
                autoComplete="current-password"
              />
              <button
                type="button"
                className="access-btn"
                onClick={() => void handleUnlock()}
                disabled={!accessCode}
              >
                解鎖
              </button>
            </div>
          </div>
        )}

        {!locked && (
          <>
            <p className="settings-path">
              資料庫：<code>{dbPath || "…"}</code>
            </p>
            <p className="settings-note">
              與設定共用 MAGI_DATA_DIR／MAGI_DATA_VOLUME；重建 container
              只要保留 /data volume，紀錄就會仲喺度。用 sql.js（純
              JS／ASM）寫入 SQLite，配合 node:22-alpine standalone。
            </p>

            <div className="history-toolbar">
              <input
                className="settings-input history-search"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜尋題目／裁決／意見…"
                aria-label="搜尋審議紀錄"
              />
              <div className="mode-switch">
                {(
                  [
                    ["all", "全部"],
                    ["verdict", "裁決"],
                    ["council", "議會"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={
                      modeFilter === value
                        ? "mode-btn mode-btn-active"
                        : "mode-btn"
                    }
                    onClick={() => setModeFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="access-btn"
                onClick={() => void load()}
              >
                重新整理
              </button>
            </div>

            {loading && <p className="settings-loading">載入中…</p>}

            {!loading && (
              <p className="settings-note">共 {total} 筆</p>
            )}

            <div className="history-layout">
              <ul className="history-list" aria-label="審議紀錄列表">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className={
                      selected?.id === item.id
                        ? "history-row history-row-active"
                        : "history-row"
                    }
                  >
                    <button
                      type="button"
                      className="history-row-main"
                      onClick={() => void openDetail(item.id)}
                    >
                      <div className="history-row-top">
                        <span className="history-badge">{item.mode}</span>
                        <span className="history-badge">{item.source}</span>
                        {item.mock && (
                          <span className="history-badge history-badge-mock">
                            MOCK
                          </span>
                        )}
                        <span className="history-badge">{item.status}</span>
                      </div>
                      <div className="history-topic">{item.topic}</div>
                      <div className="history-meta">
                        {new Date(item.createdAt).toLocaleString()} ·{" "}
                        {item.durationMs}ms · {item.summary}
                      </div>
                    </button>
                    <div className="history-row-actions">
                      <button
                        type="button"
                        className="access-btn"
                        disabled={busyId === item.id}
                        onClick={() => void handleExport(item.id)}
                      >
                        匯出
                      </button>
                      <button
                        type="button"
                        className="access-btn history-delete-btn"
                        disabled={busyId === item.id}
                        onClick={() => void handleDelete(item.id)}
                      >
                        刪除
                      </button>
                    </div>
                  </li>
                ))}
                {!loading && items.length === 0 && (
                  <li className="history-empty">未有紀錄。完成一次審議後會出現喺度。</li>
                )}
              </ul>

              <aside className="history-detail" aria-live="polite">
                {!selected && (
                  <p className="settings-note">揀左邊一筆睇詳情。</p>
                )}
                {selected && (
                  <>
                    <div className="history-detail-header">
                      <h2>詳情</h2>
                      <button
                        type="button"
                        className="access-btn"
                        onClick={() => setSelected(null)}
                      >
                        關閉
                      </button>
                    </div>
                    <p className="settings-path">
                      <code>{selected.id}</code>
                    </p>
                    <pre className="history-json">
                      {JSON.stringify(
                        {
                          id: selected.id,
                          createdAt: selected.createdAt,
                          topic: selected.topic,
                          mode: selected.mode,
                          source: selected.source,
                          mock: selected.mock,
                          status: selected.status,
                          durationMs: selected.durationMs,
                          models: selected.models,
                          units: selected.units,
                          outcome: selected.outcome,
                          errors: selected.errors,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </>
                )}
              </aside>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
