"use client";
import {
  ArrowRight,
  BookOpen,
  Check,
  FileText,
  Hand,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { AssistantResult as Result } from "./engine";
export function AssistantResultCard({
  result,
  onInsert,
  onFollowUp,
}: {
  result: Result;
  onInsert?: (text: string) => void;
  onFollowUp?: () => void;
}) {
  const label =
    result.decision === "blocked"
      ? "需要處理"
      : result.decision === "handoff"
        ? "交畀真人"
        : result.decision === "auto-demo"
          ? "模擬自動回覆"
          : "建議回覆";
  return (
    <div className="st-assistant-result">
      <div className="st-result-header">
        <span className={`st-result-label st-result-${result.decision}`}>
          {result.decision === "handoff" ? (
            <Hand size={13} />
          ) : (
            <Sparkles size={13} />
          )}
          {label}
        </span>
        <small>示範答案 · 未接模型</small>
      </div>
      <div className="st-result-reason">
        <ShieldCheck size={14} />
        <p>{result.reason}</p>
      </div>
      {result.reply && <blockquote>{result.reply}</blockquote>}
      {result.sources.length > 0 && (
        <div className="st-answer-sources">
          <strong>
            <BookOpen size={12} />
            參考資料
          </strong>
          {result.sources.map((s) => (
            <span key={s.id}>
              <Check size={11} />
              {s.title}
              <small>
                v{s.revision} · {s.source}
              </small>
            </span>
          ))}
        </div>
      )}
      {result.missing.length > 0 && (
        <div className="st-missing-fields">
          <strong>需要補問</strong>
          {result.missing.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
      )}
      <div className="st-result-actions">
        {onInsert && result.reply && result.decision !== "blocked" && (
          <button
            className="st-button st-primary"
            onClick={() => onInsert(result.reply)}
          >
            插入回覆草稿
            <ArrowRight size={13} />
          </button>
        )}
        {onFollowUp && result.intent === "booking" && (
          <button className="st-button" onClick={onFollowUp}>
            <FileText size={13} />
            建立預約跟進
          </button>
        )}
      </div>
    </div>
  );
}
