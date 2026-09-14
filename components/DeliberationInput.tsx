"use client";

import { useState, useSyncExternalStore } from "react";

const PLACEHOLDERS: Record<string, string> = {
  zh: "輸入議題，按 Enter 送出...",
  ja: "議題を入力して Enter キーで送信...",
  en: "type question and press Enter...",
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
}: DeliberationInputProps) {
  const [accessCode, setAccessCode] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  const placeholder = useSyncExternalStore(
    () => () => {},
    () => {
      const code = navigator.language || "";
      if (code.startsWith("zh")) return PLACEHOLDERS.zh;
      if (code.startsWith("ja")) return PLACEHOLDERS.ja;
      return PLACEHOLDERS.en;
    },
    () => PLACEHOLDERS.en,
  );

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
      <span className="input-row-label">access code:</span>
      {unlocked ? (
        <div className="input-access-row">
          <span className="input-access-code" title="session unlocked">
            {"*".repeat(12)} (unlocked)
          </span>
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
