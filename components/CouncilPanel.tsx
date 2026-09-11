"use client";

import type { MagiCouncilResult, MagiId } from "@/types/magi";

const ORDER: MagiId[] = ["MELCHIOR", "BALTHASAR", "CASPER"];

interface Props {
  result: MagiCouncilResult;
}

export default function CouncilPanel({ result }: Props) {
  return (
    <div className="council-panel">
      <div className="council-header">
        <span className="council-title">MAGI COUNCIL</span>
        <span className="council-meta">
          {result.status === "complete" ? "完整" : "不完整"} · 合成：
          {result.synthesis_mode === "mock"
            ? "模擬"
            : result.synthesis_mode === "llm"
              ? "LLM 摘要"
              : "抽取式（無額外 LLM）"}
        </span>
      </div>

      <div className="council-opinions">
        {ORDER.map((id) => {
          const o = result.opinions[id];
          return (
            <div
              key={id}
              className={`council-opinion ${o.unitStatus === "error" ? "council-error" : ""}`}
            >
              <div className="council-opinion-id">{id}</div>
              {o.unitStatus === "error" ? (
                <p className="council-text">錯誤：{o.error}</p>
              ) : (
                <>
                  <p className="council-label">建議</p>
                  <p className="council-text">{o.proposal}</p>
                  <p className="council-label">理據</p>
                  <p className="council-text">{o.rationale}</p>
                  {!!o.risks?.length && (
                    <>
                      <p className="council-label">風險</p>
                      <ul className="council-list">
                        {o.risks.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {!!o.missing_information?.length && (
                    <>
                      <p className="council-label">欠缺資訊</p>
                      <ul className="council-list">
                        {o.missing_information.map((m) => (
                          <li key={m}>{m}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {!!result.consensus.length && (
        <section className="council-section">
          <h3>共識</h3>
          <ul className="council-list">
            {result.consensus.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      )}

      {!!result.disagreements.length && (
        <section className="council-section">
          <h3>分歧</h3>
          <ul className="council-list">
            {result.disagreements.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </section>
      )}

      {!!result.minority_views.length && (
        <section className="council-section council-minority">
          <h3>少數意見（保留）</h3>
          <ul className="council-list">
            {result.minority_views.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="council-section council-reco">
        <h3>綜合建議</h3>
        <pre className="council-reco-body">{result.recommendation}</pre>
      </section>
    </div>
  );
}
