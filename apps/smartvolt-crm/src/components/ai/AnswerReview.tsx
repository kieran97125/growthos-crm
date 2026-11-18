"use client";
import { BookOpen, Hand, ShieldCheck } from "lucide-react";
import type { CompanyAnswer } from "@/lib/ai/protocol";

export default function AnswerReview({ answer }: { answer: CompanyAnswer }) {
  const handoff = answer.decision === "handoff";
  const reasons =
    handoff && answer.review?.handoffReasons.length
      ? answer.review.handoffReasons
      : [answer.reason];
  return (
    <section
      className={`ai-answer-review ${handoff ? "needs-human" : ""}`}
      aria-label="試答檢查結果"
    >
      <div className="ai-review-decision">
        <h3>
          {handoff ? (
            <Hand size={15} aria-hidden="true" />
          ) : (
            <ShieldCheck size={15} aria-hidden="true" />
          )}
          {handoff ? "轉真人原因" : "處理方式"}
        </h3>
        <ul>
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        {handoff && <small>呢次係試答，未有通知同事或建立客戶交接。</small>}
      </div>
      <div className="ai-review-sources">
        <h3>
          <BookOpen size={15} aria-hidden="true" />
          資料來源 <span>{answer.sources.length} 篇</span>
        </h3>
        {answer.sources.length ? (
          answer.sources.map((source) => (
            <article key={source.id}>
              <b>
                {source.title}
                <small>v{source.revision}</small>
              </b>
              {answer.evidence
                ?.filter((item) => item.sourceId === source.id)
                .map((item, i) => (
                  <p key={i}>{item.quote}</p>
                ))}
              <small>{source.source}</small>
            </article>
          ))
        ) : (
          <p>
            {handoff
              ? "呢次交接未採用知識來源；同事可以按交接原因繼續核實。"
              : "此結果未附資料來源，採用前請先核實。"}
          </p>
        )}
      </div>
    </section>
  );
}
