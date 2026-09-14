"use client";

import { useCallback, useEffect, useState } from "react";
import MagiDiagram from "@/components/MagiDiagram";
import DeliberationInput from "@/components/DeliberationInput";
import IntroModal from "@/components/IntroModal";
import { MagiId, PartialResults, Verdict } from "@/types/magi";
import {
  deliberate,
  getUiBootstrap,
  logoutSession,
  unlockAccessCode,
} from "@/app/actions";

const UNITS: MagiId[] = ["MELCHIOR", "BALTHASAR", "CASPER"];

export default function Home() {
  const [showIntro, setShowIntro] = useState(true);
  const [topic, setTopic] = useState("");
  const [processingUnits, setProcessingUnits] = useState<Set<MagiId>>(new Set());
  const [partialResults, setPartialResults] = useState<PartialResults>({});
  const [finalVerdict, setFinalVerdict] = useState<Verdict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [accessConfigured, setAccessConfigured] = useState(true);
  const [mockMode, setMockMode] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);

  const isProcessing = processingUnits.size > 0;

  const refreshBootstrap = useCallback(async () => {
    try {
      const boot = await getUiBootstrap();
      setUnlocked(boot.unlocked);
      setAccessConfigured(boot.accessConfigured);
      setMockMode(boot.mockMode);
      if (!boot.accessConfigured) {
        setError(
          "MAGI_ACCESS_CODE is not configured on the server. Set it in .env.local (distinct from MAGI_API_KEY).",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBootstrapping(false);
    }
  }, []);

  useEffect(() => {
    void refreshBootstrap();
  }, [refreshBootstrap]);

  const handleUnlock = async (code: string) => {
    setError(null);
    const res = await unlockAccessCode(code);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setUnlocked(true);
  };

  const handleLogout = async () => {
    setError(null);
    await logoutSession();
    setUnlocked(false);
    setPartialResults({});
    setFinalVerdict(null);
  };

  const handleDeliberate = async () => {
    if (!topic.trim() || isProcessing || !unlocked) return;

    setProcessingUnits(new Set(UNITS));
    setPartialResults({});
    setFinalVerdict(null);
    setError(null);

    try {
      const result = await deliberate(topic);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMockMode(result.mockMode);
      setPartialResults(result.results);
      setFinalVerdict(result.verdict);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProcessingUnits(new Set());
    }
  };

  return (
    <>
      {showIntro && <IntroModal onClose={() => setShowIntro(false)} />}
      <main className="magi-main">
        {mockMode && (
          <div className="mock-mode-banner" role="status">
            MOCK MODE — 模擬結果，非真實模型
          </div>
        )}
        <div className="system-border">
          <MagiDiagram
            partialResults={partialResults}
            processingUnits={processingUnits}
            finalVerdict={finalVerdict}
          />

          {error && (
            <div className="error-panel">
              <span className="error-icon">⚠</span>
              <span>SYSTEM ERROR: {error}</span>
            </div>
          )}

          <DeliberationInput
            topic={topic}
            onTopicChange={setTopic}
            onSubmit={handleDeliberate}
            isProcessing={isProcessing || bootstrapping}
            unlocked={unlocked}
            accessConfigured={accessConfigured}
            onUnlock={handleUnlock}
            onLogout={handleLogout}
          />
        </div>
        <a
          href="https://github.com/hirakujira/MAGI-System"
          target="_blank"
          rel="noopener noreferrer"
          className="github-link"
        >
          ⌥ GitHub
        </a>
      </main>
    </>
  );
}
