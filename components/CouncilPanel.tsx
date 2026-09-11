"use client";

import type { MagiCouncilResult, MagiId, MagiSynthesisError } from "@/types/magi";

const ORDER: MagiId[] = ["MELCHIOR", "BALTHASAR", "CASPER"];

interface Props {
  result: MagiCouncilResult;
}

function synthesisModeLabel(result: MagiCouncilResult): string {
  if (result.synthesis_mode === "mock") return "模擬";
  if (result.synthesis_mode === "llm") return "LLM 摘要";
  if (result.synthesis_error) {
    return "抽取式（摘要 LLM 失敗）";
  }
  return "抽取式（無額外 LLM）";
}

function synthesisErrorLines(err: MagiSynthesisError): string[] {
  const lines: string[] = [];
  switch (err.stage) {
    case "config":
      lines.push("摘要 LLM 設定錯誤（config）");
      break;
    case "api":
      lines.push("摘要 LLM 失敗（API）");
      break;
    case "parse":
      lines.push("摘要 LLM 失敗（解析）");
      break;
    case "empty":
      lines.push("摘要 LLM 失敗（空白回應）");
      break;
    default:
      lines.push("摘要 LLM 失敗");
  }
  const meta: string[] = [];
  if (err.provider) meta.push(err.provider);
  if (err.model) meta.push(err.model);
  if (err.httpStatus != null) meta.push(`HTTP ${err.httpStatus}`);
  if (err.finish_reason) meta.push(`finish_reason=${err.finish_reason}`);
  if (meta.length) lines.push(meta.join(" · "));
  lines.push(err.message);
  return lines;
}

export default function CouncilPanel({ result }: Props) {
  return (
    <div className="council-panel">
      <div className="council-header">
        <span className="council-title">MAGI COUNCIL</span>
        <span className="council-meta">
          {result.status === "complete" ? "完整" : "不完整"} · 合成：
          {synthesisModeLabel(result)}
        </span>
      </div>

      {result.synthesis_error && (
        <div className="council-synth-error" role="status">
          {synthesisErrorLines(result.synthesis_error).map((line) => (
            <p key={line} className="council-synth-error-line">
              {line}
            </p>
          ))}
        </div>
      )}

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
