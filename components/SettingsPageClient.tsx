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
  formFingerprint,
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
  const [savedFingerprint, setSavedFingerprint] = useState<string>("");
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
    const nextForm = viewToForm(res);
    setForm(nextForm);
    setSavedFingerprint(formFingerprint(nextForm));
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
              // Empty string clears persisted baseUrl override
              baseUrl: p.baseUrl,
              personaDescription: p.systemPrompt,
              systemPrompt: p.systemPrompt,
              timeoutMs: p.timeoutMs,
              maxOutputTokens: p.maxOutputTokens,
              temperature: p.temperature,
            councilStructuredOutput: p.councilStructuredOutput === true,
            },
          ];
        }),
      ) as unknown as NonNullable<Parameters<typeof saveSettings>[0]["personas"]>,
      // Always send enabled explicitly; keep model/provider when disabled so
      // unchecking does not wipe config, and never implicitly re-enable.
      summarizer: {
        enabled: form.summarizer.enabled === true,
        provider: form.summarizer.provider,
        model: form.summarizer.model,
        baseUrl:
          form.summarizer.provider === "google" ? "" : form.summarizer.baseUrl,
        timeoutMs: form.summarizer.timeoutMs,
        maxOutputTokens: form.summarizer.maxOutputTokens,
        temperature: form.summarizer.temperature,
      },
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const nextForm = viewToForm(res);
    setForm(nextForm);
    setSavedFingerprint(formFingerprint(nextForm));
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

  const buildSavePayload = (current: FormState) => ({
    defaultMode: current.defaultMode,
    personas: Object.fromEntries(
      PERSONAS.map((id) => {
        const p = current.personas[id];
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
            councilStructuredOutput: p.councilStructuredOutput === true,
          },
        ];
      }),
    ) as unknown as NonNullable<Parameters<typeof saveSettings>[0]["personas"]>,
    summarizer: {
      enabled: current.summarizer.enabled === true,
      provider: current.summarizer.provider,
      model: current.summarizer.model,
      baseUrl:
        current.summarizer.provider === "google"
          ? ""
          : current.summarizer.baseUrl,
      timeoutMs: current.summarizer.timeoutMs,
      maxOutputTokens: current.summarizer.maxOutputTokens,
      temperature: current.summarizer.temperature,
    },
  });

  const handleTestSummarizer = async () => {
    if (!form) return;
    const dirty = formFingerprint(form) !== savedFingerprint;
    if (dirty) {
      setSummarizerTestMsg(
        "表單有未儲存變更。請先撳「儲存設定」，再測試摘要（測試只用已儲存嘅 provider／model，唔會用未儲存表單）。",
      );
      return;
    }
    setTestingSummarizer(true);
    setSummarizerTestMsg("正在確認已儲存設定後測試摘要…");
    // Re-save current form so test always hits the saved config (never stale provider).
    const saveRes = await saveSettings(buildSavePayload(form));
    if (!saveRes.ok) {
      setTestingSummarizer(false);
      setSummarizerTestMsg(
        `無法儲存設定，已取消測試：${saveRes.error || "儲存失敗"}`,
      );
      return;
    }
    const synced = viewToForm(saveRes);
    setForm(synced);
    setSavedFingerprint(formFingerprint(synced));
    setSettingsPath(saveRes.settingsPath);
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
    const nextForm = viewToForm(res);
    setForm(nextForm);
    setSavedFingerprint(formFingerprint(nextForm));
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
    const nextForm = viewToForm(res);
    setForm(nextForm);
    setSavedFingerprint(formFingerprint(nextForm));
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
                placeholder="輸入通行碼解鎖"
                autoComplete="current-password"
                onChange={(e) => setAccessCode(e.target.value)}
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
