"use client";
import { useState } from "react";
import Link from "next/link";
import { BookOpen, Check, PencilLine, LoaderCircle } from "lucide-react";
import type { CoachingCommand, LearningRecord } from "@/lib/coaching/model";
import Evidence from "./Evidence";
import { coachingCommand, knownFailure } from "./client";
type AdoptCommand = Extract<CoachingCommand, { type: "adopt" }>;
const kindNames = { answer: "問答話術", pattern: "溝通方式", gap: "知識缺口" };
export default function LearningCard({
  companyId,
  record,
  canManage,
  disabled,
  onSaved,
}: {
  companyId: string;
  record: LearningRecord;
  canManage: boolean;
  disabled?: boolean;
  onSaved: () => Promise<unknown> | void;
}) {
  const [open, setOpen] = useState(false),
    [title, setTitle] = useState(record.item.title),
    [content, setContent] = useState(record.item.content),
    [validUntil, setValidUntil] = useState(""),
    [pending, setPending] = useState<AdoptCommand | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const adopted = saved || record.status === "adopted";
  const locked = !!disabled || record.stale || !canManage || adopted;
  async function save() {
    if (busy || locked) return;
    const command: AdoptCommand = pending ?? {
      type: "adopt",
      commandId: crypto.randomUUID(),
      analysisId: record.analysisId,
      index: record.index,
      title,
      content,
      validUntil,
    };
    setPending(command);
    setBusy(true);
    setError("");
    try {
      await coachingCommand<{ saved: true; articleId: string }>(
        companyId,
        command,
      );
      setPending(null);
      setSaved(true);
      setOpen(false);
      window.dispatchEvent(new Event("convelta:data-changed"));
      await onSaved();
    } catch (e) {
      if (knownFailure(e)) setPending(null);
      setError(
        e instanceof Error ? e.message : "儲存結果未能確認，請核對同一操作。",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="coach-learning">
      <div className="coach-learning-top">
        <h4>{record.item.title}</h4>
        {adopted ? (
          <span className="coach-adopted">
            <Check size={11} aria-hidden="true" />
            已加入知識
          </span>
        ) : (
          <span className="coach-kind">{kindNames[record.item.kind]}</span>
        )}
      </div>
      {record.item.question && (
        <p>
          <b>{record.item.question}</b>
        </p>
      )}
      <p className="coach-learning-content">{record.item.content}</p>
      <Evidence
        messages={record.item.evidence}
        knowledge={record.item.knowledgeEvidence}
      />
      {record.stale && (
        <p className="coach-muted">來源已更新，請重新分析後再採納。</p>
      )}
      {error && (
        <p className="coach-alert" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="coach-notice" role="status">
          已加入品牌知識，之後嘅 AI 回覆可以使用。
        </p>
      )}
      {record.item.kind === "gap" && (
        <p className="coach-muted">
          待補品牌資料 ·{" "}
          <Link href={`/company/${companyId}/crm?view=bot`}>管理品牌知識</Link>
        </p>
      )}
      {record.item.kind !== "gap" && canManage && !adopted && !open && (
        <div className="coach-actions">
          <button
            type="button"
            disabled={locked}
            onClick={() => {
              setValidUntil(
                new Date(Date.now() + 180 * 86400000 + 8 * 3600000)
                  .toISOString()
                  .slice(0, 10),
              );
              setOpen(true);
            }}
          >
            <PencilLine size={13} aria-hidden="true" />
            編輯並加入知識
          </button>
        </div>
      )}
      {open && (
        <form
          className="coach-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label>
            話術標題
            <input
              required
              maxLength={100}
              value={title}
              disabled={locked || busy || !!pending}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            可重用內容
            <textarea
              required
              rows={5}
              maxLength={1600}
              value={content}
              disabled={locked || busy || !!pending}
              onChange={(e) => setContent(e.target.value)}
            />
          </label>
          <label>
            有效至
            <input
              required
              type="date"
              value={validUntil}
              disabled={locked || busy || !!pending}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </label>
          <div className="coach-actions">
            <button
              className="coach-primary"
              disabled={
                locked ||
                busy ||
                !title.trim() ||
                !content.trim() ||
                !validUntil
              }
            >
              {busy ? (
                <LoaderCircle
                  size={13}
                  className="coach-spin"
                  aria-hidden="true"
                />
              ) : (
                <BookOpen size={13} aria-hidden="true" />
              )}
              {busy ? "儲存中…" : pending ? "核對同一儲存" : "加入品牌知識"}
            </button>
            <button
              type="button"
              disabled={busy || !!pending}
              onClick={() => setOpen(false)}
            >
              取消
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
