"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import MagiDiagram from "@/components/MagiDiagram";
import DeliberationInput from "@/components/DeliberationInput";
import IntroModal from "@/components/IntroModal";
import CouncilPanel from "@/components/CouncilPanel";
import {
  MagiCouncilResult,
  MagiId,
  MagiMode,
  PartialResults,
  Verdict,
} from "@/types/magi";
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
  const [mode, setMode] = useState<MagiMode>("verdict");
  const [processingUnits, setProcessingUnits] = useState<Set<MagiId>>(new Set());
  const [partialResults, setPartialResults] = useState<PartialResults>({});
  const [finalVerdict, setFinalVerdict] = useState<Verdict | null>(null);
  const [councilResult, setCouncilResult] = useState<MagiCouncilResult | null>(
    null,
  );
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
      setMode(boot.defaultMode ?? "verdict");
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
    setCouncilResult(null);
  };

  const handleModeChange = (next: MagiMode) => {
    setMode(next);
    setPartialResults({});
    setFinalVerdict(null);
    setCouncilResult(null);
    setError(null);
  };

  const handleDeliberate = async () => {
    if (!topic.trim() || isProcessing || !unlocked) return;

    setProcessingUnits(new Set(UNITS));
    setPartialResults({});
    setFinalVerdict(null);
    setCouncilResult(null);
    setError(null);

    try {
      const result = await deliberate(topic, mode);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMockMode(result.mockMode);
      if (result.mode === "council") {
        setCouncilResult({
          status: result.status,
          opinions: result.opinions,
          consensus: result.consensus,
          disagreements: result.disagreements,
          recommendation: result.recommendation,
          minority_views: result.minority_views,
          missing_information: result.missing_information,
          synthesis_mode: result.synthesis_mode,
        });
      } else {
        setPartialResults(result.results);
        setFinalVerdict(result.verdict);
      }
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
          {mode === "verdict" ? (
            <MagiDiagram
              partialResults={partialResults}
              processingUnits={processingUnits}
              finalVerdict={finalVerdict}
            />
          ) : (
            <div className="council-diagram-slot">
              <MagiDiagram
                partialResults={{}}
                processingUnits={processingUnits}
                finalVerdict={null}
              />
              {councilResult && <CouncilPanel result={councilResult} />}
              {!councilResult && !isProcessing && (
                <p className="council-idle-hint">
                  議會模式：三單位各自提出建議／理據／風險，再保留少數意見作出綜合建議。
                </p>
              )}
            </div>
          )}

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
            mode={mode}
            onModeChange={handleModeChange}
          />
        </div>
        <div className="footer-links">
          <a
            href="https://github.com/hirakujira/MAGI-System"
            target="_blank"
            rel="noopener noreferrer"
            className="github-link"
          >
            ⌥ GitHub
          </a>
          {unlocked && (
            <>
              <Link href="/history" className="github-link">
                ⌥ 紀錄
              </Link>
              <Link href="/settings" className="github-link">
                ⌥ 設定
              </Link>
            </>
          )}
        </div>
      </main>
    </>
  );
}
