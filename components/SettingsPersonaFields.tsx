"use client";

import type { MagiId } from "@/types/magi";
import type { ProviderKind } from "@/lib/config/types";
import {
  PERSONAS,
  PROVIDERS,
  type FormState,
  type PersonaForm,
} from "@/components/settings-form-helpers";

export type SettingsPersonaFieldsProps = {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState | null>>;
  updatePersona: <K extends keyof PersonaForm>(
    id: MagiId,
    key: K,
    value: PersonaForm[K],
  ) => void;
  testing: MagiId | null;
  testMsg: Partial<Record<MagiId, string>>;
  onTest: (id: MagiId) => void;
};

export function SettingsPersonaFields({
  form,
  setForm,
  updatePersona,
  testing,
  testMsg,
  onTest,
}: SettingsPersonaFieldsProps) {
  return (
    <>
<section className="settings-section">
              <h2>預設模式</h2>
              <div className="mode-switch">
                <button
                  type="button"
                  className={`mode-btn ${form.defaultMode === "verdict" ? "mode-btn-active" : ""}`}
                  onClick={() =>
                    setForm((f) => f && { ...f, defaultMode: "verdict" })
                  }
                >
                  表決（magi-verdict）
                </button>
                <button
                  type="button"
                  className={`mode-btn ${form.defaultMode === "council" ? "mode-btn-active" : ""}`}
                  onClick={() =>
                    setForm((f) => f && { ...f, defaultMode: "council" })
                  }
                >
                  議會（magi-council）
                </button>
              </div>
            </section>

            {PERSONAS.map((id) => {
              const p = form.personas[id];
              return (
                <section key={id} className="settings-section persona-card">
                  <h2>{id}</h2>
                  <label className="settings-label">
                    Provider
                    <select
                      className="settings-input"
                      value={p.provider}
                      onChange={(e) =>
                        updatePersona(
                          id,
                          "provider",
                          e.target.value as ProviderKind,
                        )
                      }
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
                      value={p.model}
                      onChange={(e) =>
                        updatePersona(id, "model", e.target.value)
                      }
                    />
                  </label>
                  <label className="settings-label">
                    Base URL
                    <input
                      className="settings-input"
                      value={p.baseUrl}
                      onChange={(e) =>
                        updatePersona(id, "baseUrl", e.target.value)
                      }
                      placeholder="openai-compatible / ollama"
                    />
                  </label>
                  <label className="settings-label">
                    System Prompt 覆寫
                    <textarea
                      className="settings-textarea"
                      value={p.systemPrompt}
                      onChange={(e) =>
                        updatePersona(id, "systemPrompt", e.target.value)
                      }
                      rows={4}
                    />
                  </label>
                  <div className="settings-grid3">
                    <label className="settings-label">
                      Timeout (ms)
                      <input
                        className="settings-input"
                        type="number"
                        value={p.timeoutMs}
                        onChange={(e) =>
                          updatePersona(
                            id,
                            "timeoutMs",
                            Number(e.target.value) || 60000,
                          )
                        }
                      />
                    </label>
                    <label className="settings-label">
                      Max tokens
                      <input
                        className="settings-input"
                        type="number"
                        value={p.maxOutputTokens}
                        onChange={(e) =>
                          updatePersona(
                            id,
                            "maxOutputTokens",
                            Number(e.target.value) || 1024,
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
                        value={p.temperature}
                        onChange={(e) =>
                          updatePersona(
                            id,
                            "temperature",
                            Number(e.target.value),
                          )
                        }
                      />
                    </label>
                  </div>
                  <p className="settings-key-status">
                    API 金鑰：<strong>{p.apiKeyStatusLabel}</strong>
                    <span className="settings-key-hint">
                      （只讀狀態；金鑰經環境變數設定，唔會存入瀏覽器）
                    </span>
                  </p>
                  <div className="settings-test-row">
                    <button
                      type="button"
                      className="access-btn"
                      disabled={testing === id}
                      onClick={() => void onTest(id)}
                    >
                      {testing === id ? "測試中…" : "測試連線"}
                    </button>
                    {testMsg[id] && (
                      <span className="settings-test-msg">{testMsg[id]}</span>
                    )}
                  </div>
                </section>
              );
            })}

                </>
  );
}
