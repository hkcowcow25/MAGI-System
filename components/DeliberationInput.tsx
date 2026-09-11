"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import type { MagiMode } from "@/types/magi";

const PLACEHOLDERS: Record<string, Record<MagiMode, string>> = {
  zh: {
    verdict: "輸入可否決問題，按 Enter 送出...",
    council: "輸入開放式問題，按 Enter 召開議會...",
  },
  ja: {
    verdict: "議題を入力して Enter キーで送信...",
    council: "自由記述の質問を入力して Enter...",
  },
  en: {
    verdict: "type yes/no question and press Enter...",
    council: "type open-ended question and press Enter...",
  },
};

interface DeliberationInputProps {
  topic: string;
  onTopicChange: (v: string) => void;
  onSubmit: () => void;
  isProcessing: boolean;
  unlocked: boolean;
  accessConfigured: boolean;
  onUnlock: (code: string) => void | Promise<void>;
  onLogout: () => void | Promise<void>;
  mode: MagiMode;
  onModeChange: (mode: MagiMode) => void;
}

export default function DeliberationInput({
  topic,
  onTopicChange,
  onSubmit,
  isProcessing,
  unlocked,
  accessConfigured,
  onUnlock,
  onLogout,
  mode,
  onModeChange,
}: DeliberationInputProps) {
  const [accessCode, setAccessCode] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  const lang = useSyncExternalStore(
    () => () => {},
    () => {
      const code = navigator.language || "";
      if (code.startsWith("zh")) return "zh";
      if (code.startsWith("ja")) return "ja";
      return "en";
    },
    () => "en",
  );

  const placeholder = PLACEHOLDERS[lang][mode];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isProcessing && unlocked && topic.trim()) {
      onSubmit();
    }
  };

  const handleUnlockKeyDown = async (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Enter" && accessCode && !unlocking) {
      setUnlocking(true);
      try {
        await onUnlock(accessCode);
        setAccessCode("");
      } finally {
        setUnlocking(false);
      }
    }
  };

  const handleUnlockClick = async () => {
    if (!accessCode || unlocking) return;
    setUnlocking(true);
    try {
      await onUnlock(accessCode);
      setAccessCode("");
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <div className="input-container">
      <span className="input-row-label">mode:</span>
      <div className="mode-switch" role="group" aria-label="審議模式">
        <button
          type="button"
          className={`mode-btn ${mode === "verdict" ? "mode-btn-active" : ""}`}
          onClick={() => onModeChange("verdict")}
          disabled={isProcessing}
        >
          表決（Verdict）
        </button>
        <button
          type="button"
          className={`mode-btn ${mode === "council" ? "mode-btn-active" : ""}`}
          onClick={() => onModeChange("council")}
          disabled={isProcessing}
        >
          議會（Council）
        </button>
      </div>

      <span className="input-row-label">access code:</span>
      {unlocked ? (
        <div className="input-access-row">
          <span className="input-access-code" title="session unlocked">
            {"*".repeat(12)} (unlocked)
          </span>
          <Link className="access-btn settings-link" href="/settings">
            設定
          </Link>
          <button
            type="button"
            className="access-btn"
            onClick={() => void onLogout()}
            disabled={isProcessing}
          >
            logout
          </button>
        </div>
      ) : (
        <div className="input-access-row">
          <input
            className="input-access-field"
            type="password"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            onKeyDown={(e) => void handleUnlockKeyDown(e)}
            placeholder={
              accessConfigured
                ? "enter access code to unlock"
                : "MAGI_ACCESS_CODE not configured"
            }
            disabled={isProcessing || unlocking || !accessConfigured}
            autoComplete="current-password"
            spellCheck={false}
          />
          <button
            type="button"
            className="access-btn"
            onClick={() => void handleUnlockClick()}
            disabled={
              isProcessing || unlocking || !accessConfigured || !accessCode
            }
          >
            unlock
          </button>
        </div>
      )}

      <span className="input-row-label">question:</span>
      <input
        className="input-question"
        type="text"
        value={topic}
        onChange={(e) => onTopicChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={unlocked ? placeholder : "unlock access code first..."}
        disabled={isProcessing || !unlocked}
        maxLength={500}
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
}
