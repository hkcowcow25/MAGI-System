"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { MagiId } from "@/types/magi";
import {
  getSettings,
  saveSettings,
  testConnection,
  testSummarizer,
  unlockAccessCode,
  migratePromptFormats,
  resetDefaultPersonaDescription,
} from "@/app/actions";
import {
  PERSONAS,
  viewToForm,
  type FormState,
  type PersonaForm,
} from "@/components/settings-form-helpers";
import { SettingsPersonaFields } from "@/components/SettingsPersonaFields";
import { SettingsSummarizerFields } from "@/components/SettingsSummarizerFields";

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [settingsPath, setSettingsPath] = useState("");
  const [precedenceNote, setPrecedenceNote] = useState("");
  const [mockMode, setMockMode] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [testMsg, setTestMsg] = useState<Partial<Record<MagiId, string>>>({});
  const [testing, setTesting] = useState<MagiId | null>(null);
  const [testingSummarizer, setTestingSummarizer] = useState(false);
  const [summarizerTestMsg, setSummarizerTestMsg] = useState<string | null>(
    null,
  );
  const [migrating, setMigrating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getSettings();
    if (!res.ok) {
      setLocked(res.code === "locked" || res.code === "not_configured");
      setError(res.error);
      setForm(null);
      setLoading(false);
      return;
    }
    setLocked(false);
    setSettingsPath(res.settingsPath);
    setPrecedenceNote(res.precedenceNote);
    setMockMode(res.mockMode);
    setForm(viewToForm(res));
    setLoading(false);
  }, []);

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

  const updatePersona = <K extends keyof PersonaForm>(
    id: MagiId,
    key: K,
    value: PersonaForm[K],
  ) => {
    setForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        personas: {
          ...prev.personas,
          [id]: { ...prev.personas[id], [key]: value },
        },
      };
    });
  };

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);
    setInfo(null);
    const res = await saveSettings({
      defaultMode: form.defaultMode,
      personas: Object.fromEntries(
        PERSONAS.map((id) => {
          const p = form.personas[id];
          return [
            id,
            {
              provider: p.provider,
              model: p.model,
              baseUrl: p.baseUrl,
              personaDescription: p.systemPrompt,
              systemPrompt: p.systemPrompt,
              timeoutMs: p.timeoutMs,
              maxOutputTokens: p.maxOutputTokens,
              temperature: p.temperature,
            },
          ];
        }),
      ) as unknown as NonNullable<Parameters<typeof saveSettings>[0]["personas"]>,
      summarizer: form.summarizer.enabled
        ? {
            enabled: true,
            provider: form.summarizer.provider,
            model: form.summarizer.model,
            baseUrl: form.summarizer.baseUrl || undefined,
            timeoutMs: form.summarizer.timeoutMs,
            maxOutputTokens: form.summarizer.maxOutputTokens,
            temperature: form.summarizer.temperature,
          }
        : { enabled: false, model: "" },
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setForm(viewToForm(res));
    setSettingsPath(res.settingsPath);
    setInfo("設定已儲存（非機密欄位寫入磁碟；API 金鑰仍只在環境變數）。");
  };

  const handleTest = async (id: MagiId) => {
    setTesting(id);
    setTestMsg((m) => ({ ...m, [id]: "測試中…" }));
    const res = await testConnection(id);
    setTesting(null);
    if (res.ok) {
      setTestMsg((m) => ({
        ...m,
        [id]: `${res.message}（${res.latencyMs}ms）`,
      }));
    } else {
      setTestMsg((m) => ({
        ...m,
        [id]: res.error || res.message || "測試失敗",
      }));
    }
  };

  const handleTestSummarizer = async () => {
    setTestingSummarizer(true);
    setSummarizerTestMsg("測試中…");
    const res = await testSummarizer();
    setTestingSummarizer(false);
    if (res.ok) {
      const bits = [res.message, res.provider, res.model]
        .filter(Boolean)
        .join(" · ");
      const preview = res.preview ? ` 預覽：${res.preview}` : "";
      setSummarizerTestMsg(`${bits}${preview}`);
    } else {
      const bits = [
        res.stage,
        res.provider,
        res.model,
        res.httpStatus != null ? `HTTP ${res.httpStatus}` : null,
        res.finish_reason ? `finish_reason=${res.finish_reason}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      setSummarizerTestMsg(
        `${res.error || res.message || "測試失敗"}${bits ? `（${bits}）` : ""}`,
      );
    }
  };

  const handleApplyMigration = async () => {
    setMigrating(true);
    setError(null);
    setInfo(null);
    const res = await migratePromptFormats();
    setMigrating(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setForm(viewToForm(res));
    setInfo("已套用遷移：剝離 JSON／投票格式，保留人格描述。");
  };

  const handleResetPersona = async (id: MagiId) => {
    setError(null);
    setInfo(null);
    const res = await resetDefaultPersonaDescription(id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setForm(viewToForm(res));
    setInfo(`${id} 已還原預設人格描述（provider／model 不變）。`);
  };

  return (
    <main className="magi-main settings-page">
      {mockMode && (
        <div className="mock-mode-banner" role="status">
          MOCK MODE — 模擬結果，非真實模型
        </div>
      )}
      <div className="system-border settings-border">
        <div className="settings-header">
          <h1 className="settings-title">MAGI 設定</h1>
          <Link className="access-btn settings-link" href="/">
            ← 返回主頁
          </Link>
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
            <p>此頁需要與審議相同嘅通行碼工作階段（MAGI_ACCESS_CODE）。</p>
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

        {loading && !locked && <p className="settings-loading">載入中…</p>}

        {form && !locked && (
          <>
            <p className="settings-path">
              儲存路徑：<code>{settingsPath}</code>
            </p>
            <p className="settings-note">{precedenceNote}</p>
            <SettingsPersonaFields
              form={form}
              setForm={setForm}
              updatePersona={updatePersona}
              testing={testing}
              testMsg={testMsg}
              onTest={(id) => void handleTest(id)}
              onResetPersona={(id) => void handleResetPersona(id)}
              onApplyPromptMigration={() => void handleApplyMigration()}
              migrating={migrating}
            />
            <SettingsSummarizerFields
              form={form}
              setForm={setForm}
              saving={saving}
              onSave={() => void handleSave()}
              testingSummarizer={testingSummarizer}
              summarizerTestMsg={summarizerTestMsg}
              onTestSummarizer={() => void handleTestSummarizer()}
            />
          </>
        )}
      </div>
    </main>
  );
}
