"use client";

import { useSyncExternalStore } from "react";

interface Lang {
  units: [string, string, string];
  steps: string[];
  confirm: string;
}

const LANGS: Record<string, Lang> = {
  zh: {
    units: [
      "可設定 Provider — 科學家的視角",
      "可設定 Provider — 母親的視角",
      "可設定 Provider — 女性的視角",
    ],
    steps: [
      "在下方輸入欄輸入是非題形式的議題，按下 Enter 送出",
      "三台電腦同時審議，完成後以多數決顯示最終裁決",
      "點擊任一電腦可查看詳細推理說明",
      "⚠ 若兩台以上判定為重大議題，切換為全票制：三台必須一致同意才能執行；技術錯誤會顯示「不完」而非棄権",
    ],
    confirm: "CONFIRM — 開始審議",
  },
  en: {
    units: [
      "Configurable provider — Scientist's perspective",
      "Configurable provider — Mother's perspective",
      "Configurable provider — Woman's perspective",
    ],
    steps: [
      "Type a yes/no question in the input below and press Enter",
      "All three units deliberate simultaneously and reach a verdict by majority vote",
      "Click any unit to read its full reasoning",
      "⚠ If two or more units flag the topic as critical, unanimous approval is required. Technical failures show INCOMPLETE — never fake ABSTAIN",
    ],
    confirm: "CONFIRM — BEGIN DELIBERATION",
  },
  ja: {
    units: [
      "Provider 設定可 — 科学者の視点",
      "Provider 設定可 — 母親の視点",
      "Provider 設定可 — 女性の視点",
    ],
    steps: [
      "賛否を問う形式の議題を入力し、Enter キーで送信",
      "3台が同時に審議を行い、多数決で最終決定を表示",
      "各ユニットをクリックすると詳細な判断理由を確認できます",
      "⚠ 2台以上が重大事項と判断した場合、全会一致が要求されます。技術エラーは棄権ではなく「不完」になります",
    ],
    confirm: "CONFIRM — 審議を開始",
  },
};

const STEP_PREFIXES = ["▸", "▸", "▸", "▸"];

interface Props {
  onClose: () => void;
}

export default function IntroModal({ onClose }: Props) {
  const lang = useSyncExternalStore(
    () => () => {},
    () => {
      const code = navigator.language || "";
      if (code.startsWith("zh")) return LANGS.zh;
      if (code.startsWith("ja")) return LANGS.ja;
      return LANGS.en;
    },
    () => LANGS.en,
  );

  return (
    <div className="modal-overlay">
      <div className="modal-box intro-modal-box">
        <div className="modal-header">
          <span className="modal-title">MAGI SYSTEM — NERV</span>
        </div>
        <div className="modal-body">
          <table className="intro-table">
            <tbody>
              {(["MELCHIOR · 1", "BALTHASAR · 2", "CASPER · 3"] as const).map((unit, i) => (
                <tr key={unit}>
                  <td className="intro-unit">{unit.replace("·", "·\u00a0")}</td>
                  <td>{lang.units[i]}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <ol className="intro-steps">
            {lang.steps.map((step, i) => (
              <li key={i}>
                <span className="intro-step-prefix">{STEP_PREFIXES[i]}</span>
                {step.includes("Enter") ? (
                  <>
                    {step.split("Enter")[0]}
                    <kbd>Enter</kbd>
                    {step.split("Enter")[1]}
                  </>
                ) : step}
              </li>
            ))}
          </ol>

          <div className="intro-verdict-ref">
            <span style={{ color: "#52e691" }}>承認</span>
            <span style={{ color: "#a41413" }}>否決</span>
            <span style={{ color: "#3caee0" }}>棄権</span>
            <span style={{ color: "#ff8d00" }}>膠着</span>
            <span style={{ color: "#f7ca62" }}>不完</span>
          </div>

          <button className="intro-confirm" onClick={onClose}>
            {lang.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
