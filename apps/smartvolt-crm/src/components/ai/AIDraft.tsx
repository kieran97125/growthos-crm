"use client";
import { useState } from "react";
import {
  Sparkles,
  ArrowUpRight,
  BookOpen,
  Check,
  ClipboardCopy,
} from "lucide-react";
import type { CompanyAnswer } from "@/lib/ai/protocol";
import { replyGoals, type ReplyGoal } from "@/lib/ai/goals";
type Context = { companyId: string; brandId: string } & (
  | { source: "playground"; message: string }
  | { source: "conversation"; conversationId: string }
  | { source: "meta" | "whatsapp"; threadId: string }
);
export default function AIDraft({
  context,
  disabled,
  onInsert,
  onGenerated,
  onRequestState,
}: {
  context: Context;
  disabled?: boolean;
  onInsert?: (text: string) => void;
  onGenerated?: () => void;
  onRequestState?: (locked: boolean) => void;
}) {
  const [result, setResult] = useState<CompanyAnswer | null>(null),
    [goal, setGoal] = useState<ReplyGoal>("answer"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [pending, setPending] = useState<
    (Context & { requestId: string; goal: ReplyGoal }) | null
  >(null);
  async function generate() {
    if (busy || disabled) return;
    setBusy(true);
    onRequestState?.(true);
    setError("");
    setNotice("");
    const input = pending ?? {
      ...context,
      goal,
      requestId: crypto.randomUUID(),
    };
    setPending(input);
    try {
      const r = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }),
        data = await r.json();
      if (!r.ok) {
        if (data.code || r.status < 500) {
          setPending(null);
          onRequestState?.(false);
        }
        throw new Error(data.error ?? "生成結果未能確認，請核對同一請求。");
      }
      if (data.state === "running") {
        setNotice("AI 仲處理緊同一個請求，請稍後核對結果。");
        return;
      }
      onRequestState?.(false);
      setResult(data);
      setPending(null);
      setNotice("真實 AI 建議已準備好，未向客戶發送。");
      onGenerated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "連線中斷，請核對生成結果。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ai-draft" aria-label="AI 回覆建議">
      <div className="ai-draft-top">
        <span>
          <Sparkles size={16} aria-hidden="true" />
          AI 回覆助手
        </span>
        <small>草稿</small>
      </div>
      <fieldset className="ai-goals" disabled={busy || !!pending || disabled}>
        <legend>回覆目的</legend>
        {Object.entries(replyGoals).map(([id, g]) => (
          <button
            type="button"
            key={id}
            aria-pressed={goal === id}
            onClick={() => {
              setGoal(id as ReplyGoal);
              setResult(null);
              setNotice("");
            }}
          >
            {g.label}
          </button>
        ))}
      </fieldset>
      <button
        className="ai-solid"
        onClick={() => void generate()}
        disabled={busy || disabled}
      >
        {busy
          ? "正在整理建議…"
          : pending
            ? "核對 AI 結果"
            : result
              ? "重新生成建議"
              : "準備 AI 回覆建議"}
        <ArrowUpRight size={15} aria-hidden="true" />
      </button>
      {error && (
        <p className="ai-message ai-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="ai-message ai-success" role="status">
          {notice}
        </p>
      )}
      {result && (
        <div className="ai-generated">
          <div className="ai-result-heading">
            <b>
              {result.decision === "handoff"
                ? "需要同事核實"
                : replyGoals[result.goal ?? goal].label + " · 建議回覆"}
            </b>
            <span>真實 AI · {result.model}</span>
          </div>
          {result.decision !== "draft" && (
            <p className="ai-result-reason">{result.reason}</p>
          )}
          <blockquote>{result.reply}</blockquote>
          <div className="ai-result-actions">
            <button
              onClick={() => {
                if (onInsert) {
                  onInsert(result.reply);
                  setNotice("已加入回覆草稿，請確認內容後再發送。");
                } else
                  void navigator.clipboard.writeText(result.reply).then(
                    () => setNotice("建議已複製，未向客戶發送。"),
                    () => setError("未能自動複製，請選取建議文字。"),
                  );
              }}
            >
              <ClipboardCopy size={14} aria-hidden="true" />
              {onInsert ? "加入回覆草稿" : "複製建議"}
            </button>
          </div>
          <dl className="ai-result-details">
            <div>
              <dt>客戶需要</dt>
              <dd>{result.summary || "資料未齊，請再了解需要。"}</dd>
            </div>
            <div>
              <dt>下一步</dt>
              <dd>{result.nextStep}</dd>
            </div>
            <div>
              <dt>意向判斷 · 供參考</dt>
              <dd>
                {
                  {
                    high: "較高",
                    medium: "中等",
                    low: "較低",
                    unknown: "資料未足",
                  }[result.interest]
                }
              </dd>
            </div>
          </dl>
          {!!result.missing.length && (
            <div className="ai-missing">
              <b>可以補問</b>
              {result.missing.map((m) => (
                <span key={m}>{m}</span>
              ))}
            </div>
          )}
          {!!result.sources.length && (
            <details className="ai-citations" open>
              <summary>
                <BookOpen size={14} aria-hidden="true" />
                答案依據
              </summary>
              {result.sources.map((s) => (
                <article key={s.id}>
                  <b>
                    <Check size={12} aria-hidden="true" />
                    {s.title} <small>v{s.revision}</small>
                  </b>
                  <p>
                    {result.evidence
                      ?.filter((e) => e.sourceId === s.id)
                      .map((e) => e.quote)
                      .join("；")}
                  </p>
                  <small>{s.source}</small>
                </article>
              ))}
            </details>
          )}
        </div>
      )}
    </section>
  );
}
