"use client";

import type { ProviderKind } from "@/lib/config/types";
import { PROVIDERS, type FormState } from "@/components/settings-form-helpers";

export type SettingsSummarizerFieldsProps = {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState | null>>;
  saving: boolean;
  onSave: () => void;
  testingSummarizer?: boolean;
  summarizerTestMsg?: string | null;
  onTestSummarizer?: () => void;
};

export function SettingsSummarizerFields({
  form,
  setForm,
  saving,
  onSave,
  testingSummarizer = false,
  summarizerTestMsg = null,
  onTestSummarizer,
}: SettingsSummarizerFieldsProps) {
  const googleProvider = form.summarizer.provider === "google";

  return (
    <>
      <section className="settings-section">
        <h2>議會摘要 LLM（可選）</h2>
        <p className="settings-note">
          啟用掣只反映已儲存嘅 enabled（預設關閉）。未啟用或未設定 model
          時，議會會用抽取式合成（唔呼叫額外 LLM），並保留少數意見。優先順序：預設值
          &lt; 環境變數 &lt; 設定檔；API 金鑰只來自環境變數。
        </p>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={form.summarizer.enabled === true}
            onChange={(e) =>
              setForm(
                (f) =>
                  f && {
                    ...f,
                    summarizer: {
                      ...f.summarizer,
                      enabled: e.target.checked,
                    },
                  },
              )
            }
          />
          啟用摘要 LLM
        </label>
        {form.summarizer.enabled && (
          <>
            <label className="settings-label">
              Provider
              <select
                className="settings-input"
                value={form.summarizer.provider}
                onChange={(e) => {
                  const next = e.target.value as ProviderKind;
                  setForm(
                    (f) =>
                      f && {
                        ...f,
                        summarizer: {
                          ...f.summarizer,
                          provider: next,
                          // Switching to Google: clear custom Base URL so LM Studio URL 唔會殘留
                          baseUrl: next === "google" ? "" : f.summarizer.baseUrl,
                        },
                      },
                  );
                }}
              >
                {PROVIDERS.map((pr) => (
                  <option key={pr} value={pr}>
                    {pr}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings-label">
              Model
              <input
                className="settings-input"
                value={form.summarizer.model}
                onChange={(e) =>
                  setForm(
                    (f) =>
                      f && {
                        ...f,
                        summarizer: {
                          ...f.summarizer,
                          model: e.target.value,
                        },
                      },
                  )
                }
              />
            </label>
            {googleProvider ? (
              <p className="settings-note" role="note">
                Google 唔使用自訂 Base URL（切換過來時會清除舊嘅 Base URL
                覆寫）。
              </p>
            ) : (
              <label className="settings-label">
                Base URL
                <input
                  className="settings-input"
                  value={form.summarizer.baseUrl}
                  onChange={(e) =>
                    setForm(
                      (f) =>
                        f && {
                          ...f,
                          summarizer: {
                            ...f.summarizer,
                            baseUrl: e.target.value,
                          },
                        },
                    )
                  }
                  placeholder="留空＝清除覆寫（改回環境／預設）"
                />
              </label>
            )}
            <div className="settings-grid3">
              <label className="settings-label">
                Timeout (ms)
                <input
                  className="settings-input"
                  type="number"
                  value={form.summarizer.timeoutMs}
                  onChange={(e) =>
                    setForm(
                      (f) =>
                        f && {
                          ...f,
                          summarizer: {
                            ...f.summarizer,
                            timeoutMs: Number(e.target.value) || 60000,
                          },
                        },
                    )
                  }
                />
              </label>
              <label className="settings-label">
                Max tokens
                <input
                  className="settings-input"
                  type="number"
                  value={form.summarizer.maxOutputTokens}
                  onChange={(e) =>
                    setForm(
                      (f) =>
                        f && {
                          ...f,
                          summarizer: {
                            ...f.summarizer,
                            maxOutputTokens: Number(e.target.value) || 1024,
                          },
                        },
                    )
                  }
                />
              </label>
              <label className="settings-label">
                Temperature
                <input
                  className="settings-input"
                  type="number"
                  step="0.1"
                  value={form.summarizer.temperature}
                  onChange={(e) =>
                    setForm(
                      (f) =>
                        f && {
                          ...f,
                          summarizer: {
                            ...f.summarizer,
                            temperature: Number(e.target.value),
                          },
                        },
                    )
                  }
                />
              </label>
            </div>
            <p className="settings-key-status">
              摘要 API 金鑰：
              <strong>{form.summarizer.apiKeyStatusLabel}</strong>
            </p>
          </>
        )}
      </section>

      <div className="settings-actions">
        <button
          type="button"
          className="access-btn"
          disabled={testingSummarizer || !form.summarizer.enabled}
          onClick={() => onTestSummarizer?.()}
        >
          {testingSummarizer ? "測試中…" : "測試摘要"}
        </button>
        <button
          type="button"
          className="intro-confirm"
          disabled={saving}
          onClick={() => void onSave()}
        >
          {saving ? "儲存中…" : "儲存設定"}
        </button>
      </div>
      {summarizerTestMsg && (
        <p className="settings-test-msg" role="status">
          {summarizerTestMsg}
        </p>
      )}
    </>
  );
}
