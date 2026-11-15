"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BookOpen, Sparkles } from "lucide-react";
import CoachPanel from "./CoachPanel";
import LearningCard from "./LearningCard";
import { useCoachingPage } from "./client";
import type { CoachingSource } from "@/lib/coaching/model";
import "./coaching.css";
export default function CoachingWorkroom({
  companyId,
  brandId,
  disabled,
  canAnalyze = true,
  onKnowledgeChanged,
  initialSource,
}: {
  companyId: string;
  brandId: string;
  disabled?: boolean;
  canAnalyze?: boolean;
  onKnowledgeChanged?: () => void;
  initialSource?: { source: CoachingSource; sourceId: string };
}) {
  const [view, setView] = useState<"conversation" | "library">("conversation"),
    [selection, setSelection] = useState(
      initialSource ? `${initialSource.source}:${initialSource.sourceId}` : "",
    );
  const { data, error, isLoading, isValidating, mutate } = useCoachingPage({
    companyId,
    brandId,
  });
  const sourceKey = (source: { source: string; sourceId: string }) =>
    `${source.source}:${source.sourceId}`;
  const sources = data?.sources ?? [];
  const options =
    initialSource &&
    !sources.some((source) => sourceKey(source) === sourceKey(initialSource))
      ? [
          { ...initialSource, brandId, label: "指定對話", preview: "" },
          ...sources,
        ]
      : sources;
  const selected =
    options.find((source) => sourceKey(source) === selection) ?? options[0];
  async function saved() {
    await mutate();
    onKnowledgeChanged?.();
  }
  return (
    <section className="coach-workroom" aria-label="對話學習工作區">
      <header className="coach-workroom-header">
        <div>
          <h2>
            <Sparkles size={18} aria-hidden="true" />
            對話學習
          </h2>
          <p>用已儲存對話，改善回覆同累積品牌話術。</p>
        </div>
        <nav className="coach-workroom-nav" aria-label="對話學習內容">
          <button
            type="button"
            aria-pressed={view === "conversation"}
            onClick={() => setView("conversation")}
          >
            對話分析
          </button>
          <button
            type="button"
            aria-pressed={view === "library"}
            onClick={() => setView("library")}
          >
            品牌話術
          </button>
        </nav>
      </header>
      {error && (
        <p className="coach-alert" role="alert">
          {error.message}
          <br />
          <button
            type="button"
            onClick={() => void mutate().catch(() => undefined)}
          >
            重新讀取
          </button>
        </p>
      )}
      {isLoading && (
        <p className="coach-muted" role="status">
          正在讀取對話與話術…
        </p>
      )}
      {view === "conversation" ? (
        selected ? (
          <>
            <label>
              選擇已儲存對話
              <select
                value={sourceKey(selected)}
                onChange={(e) => setSelection(e.target.value)}
              >
                {options.map((source) => (
                  <option key={sourceKey(source)} value={sourceKey(source)}>
                    {source.label}
                  </option>
                ))}
              </select>
            </label>
            {selected.preview && (
              <p className="coach-muted">{selected.preview}</p>
            )}
            <CoachPanel
              companyId={companyId}
              brandId={brandId}
              source={selected.source}
              sourceId={selected.sourceId}
              disabled={disabled || !canAnalyze}
              onGenerated={onKnowledgeChanged}
            />
          </>
        ) : (
          !isLoading &&
          !error && (
            <div className="coach-workroom-empty">
              有已儲存對話後，就可以喺呢度分析回覆同整理話術。
              <div className="coach-actions">
                <Link href={`/company/${companyId}/crm`}>
                  開啟收件匣
                  <ArrowUpRight size={12} aria-hidden="true" />
                </Link>
              </div>
            </div>
          )
        )
      ) : (
        <>
          <p className="coach-library-count">
            最近 {data?.learning.length ?? 0} 項建議與已採納話術
          </p>
          {data?.learning.length ? (
            <div className="coach-library-grid">
              {data.learning.map((record) => (
                <section
                  className="coach-panel"
                  key={`${record.analysisId}:${record.index}`}
                >
                  <header className="coach-head">
                    <span className="coach-kind">
                      <BookOpen size={13} aria-hidden="true" />
                      {record.verifiedBooking ? "有核實預約紀錄" : "對話學習"}
                    </span>
                  </header>
                  <div className="coach-body">
                    <LearningCard
                      companyId={companyId}
                      record={record}
                      canManage={data.canManage}
                      disabled={disabled || isValidating || !!error}
                      onSaved={saved}
                    />
                  </div>
                </section>
              ))}
            </div>
          ) : (
            !isLoading &&
            !error && (
              <div className="coach-workroom-empty">
                分析對話後，有依據嘅話術建議會集中喺呢度。
              </div>
            )
          )}
        </>
      )}
    </section>
  );
}
