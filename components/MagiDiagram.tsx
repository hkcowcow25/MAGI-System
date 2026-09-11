"use client";

import { useEffect, useState } from "react";
import { MagiId, MagiResult, PartialResults, Verdict } from "@/types/magi";

function unitBackground(result: MagiResult | undefined): string {
  if (!result) return "#3caee0";
  if (result.unitStatus === "error") return "#7a4400";
  if (result.vote === "APPROVE") return "#52e691";
  if (result.vote === "REJECT") return "#a41413";
  if (result.vote === "ABSTAIN") return "#3caee0";
  return "#3caee0";
}

function verdictText(v: string): string {
  const map: Record<string, string> = {
    APPROVE: "承 認",
    REJECT: "否 決",
    ABSTAIN: "棄 権",
    DEADLOCK: "膠 着",
    INCOMPLETE: "不 完",
  };
  return map[v] ?? "---";
}

function verdictColor(v: string): string {
  if (v === "APPROVE") return "#52e691";
  if (v === "REJECT") return "#a41413";
  if (v === "ABSTAIN") return "#3caee0";
  if (v === "INCOMPLETE") return "#f7ca62";
  return "#ff8d00";
}

function voteLabel(result: MagiResult): string {
  if (result.unitStatus === "error") return "異 常";
  return verdictText(result.vote ?? "ABSTAIN");
}

function rand(digits: number) {
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

interface Props {
  partialResults: PartialResults;
  processingUnits: Set<MagiId>;
  finalVerdict: Verdict | null;
}

const SHAPES: Array<{ id: MagiId; label: string; cls: string }> = [
  { id: "BALTHASAR", label: "BALTHASAR • 2", cls: "wise-balthasar" },
  { id: "CASPER", label: "CASPER • 3", cls: "wise-casper" },
  { id: "MELCHIOR", label: "MELCHIOR • 1", cls: "wise-melchior" },
];

export default function MagiDiagram({ partialResults, processingUnits, finalVerdict }: Props) {
  const [modalId, setModalId] = useState<MagiId | null>(null);
  const [flickerDelays, setFlickerDelays] = useState<Record<MagiId, string>>({
    BALTHASAR: "0ms", CASPER: "0ms", MELCHIOR: "0ms",
  });
  const [code, setCode] = useState("473");
  const [ext, setExt] = useState("STBY");

  const isProcessing = processingUnits.size > 0;

  useEffect(() => {
    if (processingUnits.size === 3) {
      setFlickerDelays({
        BALTHASAR: `${Math.floor(Math.random() * 180)}ms`,
        CASPER: `${Math.floor(Math.random() * 180)}ms`,
        MELCHIOR: `${Math.floor(Math.random() * 180)}ms`,
      });
      setCode(rand(3));
      setExt(rand(4));
    }
  }, [processingUnits.size]);

  const modalResult: MagiResult | null = modalId ? (partialResults[modalId] ?? null) : null;

  return (
    <>
      <div className="magi-grid">
        <div className="magi-conn conn-cb" />
        <div className="magi-conn conn-bm" />
        <div className="magi-conn conn-cm" />

        <div className="magi-sys-status">
          <div>CODE:{code}</div>
          <div className="magi-sys-status-inner">
            <div>FILE:MAGI_SYS</div>
            <div>EXT:{ext}</div>
            <div>EX_MODE:OFF</div>
            <div>PRIORITY:AAA</div>
          </div>
        </div>

        <div
          className={`magi-verdict${isProcessing ? " flicker" : ""}`}
          style={{
            color: isProcessing ? "#f7ca62" : finalVerdict ? verdictColor(finalVerdict) : "#3caee0",
            borderColor: isProcessing ? "#f7ca62" : finalVerdict ? verdictColor(finalVerdict) : "#3caee0",
          }}
        >
          <div className="magi-verdict-inner">
            {isProcessing ? "審議中" : finalVerdict ? verdictText(finalVerdict) : "情 報"}
          </div>
        </div>

        <div className="magi-header-deco left">
          <div className="magi-header-deco-bar" />
          <div className="magi-header-deco-bar" />
          <span>提 訴</span>
          <div className="magi-header-deco-bar" />
          <div className="magi-header-deco-bar" />
        </div>
        <div className="magi-header-deco right">
          <div className="magi-header-deco-bar" />
          <div className="magi-header-deco-bar" />
          <span>決 議</span>
          <div className="magi-header-deco-bar" />
          <div className="magi-header-deco-bar" />
        </div>

        {SHAPES.map(({ id, label, cls }) => {
          const result = partialResults[id];
          const processing = processingUnits.has(id);
          const bg = unitBackground(result);
          return (
            <div
              key={id}
              className={`wise-man ${cls}`}
              onClick={() => result && setModalId(id)}
              style={{ cursor: result ? "pointer" : "default" }}
            >
              <div
                className={`wise-inner${processing ? " flicker-fast" : ""}`}
                style={{
                  "--wise-bg": bg,
                  animationDelay: processing ? flickerDelays[id] : "0ms",
                } as React.CSSProperties}
              >
                {label}
              </div>
            </div>
          );
        })}

        <div className="magi-center-title">MAGI</div>
      </div>

      {modalResult && (
        <div className="modal-overlay" onClick={() => setModalId(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">
                {modalResult.id} • {modalResult.number}
              </span>
              <button className="modal-close" onClick={() => setModalId(null)}>✕</button>
            </div>
            <div className="modal-body">
              {modalResult.unitStatus === "error" && (
                <div className="modal-critical">⚠ UNIT ERROR — 技術異常（非棄権）</div>
              )}
              {modalResult.isCritical && modalResult.unitStatus === "ok" && (
                <div className="modal-critical">⚠ CRITICAL MATTER — 重大議題</div>
              )}
              <div
                className="modal-vote"
                style={{
                  color: unitBackground(modalResult),
                  borderColor: unitBackground(modalResult),
                }}
              >
                {voteLabel(modalResult)}
              </div>
              <p className="modal-reasoning">{modalResult.reasoning}</p>
              {modalResult.error && (
                <p className="modal-error">ERR: {modalResult.error}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
