"use client";

import { useState } from "react";
import MagiDiagram from "@/components/MagiDiagram";
import DeliberationInput from "@/components/DeliberationInput";
import IntroModal from "@/components/IntroModal";
import { MagiId, PartialResults, Verdict } from "@/types/magi";
import { computeVerdict } from "@/lib/decision/verdict";
import { deliberateMelchior, deliberateBalthasar, deliberateCasper } from "@/app/actions";

const UNITS: MagiId[] = ["MELCHIOR", "BALTHASAR", "CASPER"];

export default function Home() {
  const [showIntro, setShowIntro] = useState(true);
  const [topic, setTopic] = useState("");
  const [processingUnits, setProcessingUnits] = useState<Set<MagiId>>(new Set());
  const [partialResults, setPartialResults] = useState<PartialResults>({});
  const [error, setError] = useState<string | null>(null);

  const isProcessing = processingUnits.size > 0;
  const finalVerdict: Verdict | null = computeVerdict(partialResults);

  const handleDeliberate = async () => {
    if (!topic.trim() || isProcessing) return;

    setProcessingUnits(new Set(UNITS));
    setPartialResults({});
    setError(null);

    const actions = {
      MELCHIOR: deliberateMelchior,
      BALTHASAR: deliberateBalthasar,
      CASPER: deliberateCasper,
    };

    const runUnit = async (unit: MagiId) => {
      try {
        const result = await actions[unit](topic);
        setPartialResults((prev) => ({ ...prev, [unit]: result }));
      } finally {
        setProcessingUnits((prev) => {
          const next = new Set(prev);
          next.delete(unit);
          return next;
        });
      }
    };

    UNITS.forEach((unit) => runUnit(unit));
  };

  return (
    <>
      {showIntro && <IntroModal onClose={() => setShowIntro(false)} />}
      <main className="magi-main">
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
            isProcessing={isProcessing}
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
