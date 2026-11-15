"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ClipboardCopy,
  ListChecks,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import {
  lossLabels,
  type CoachingAnalysis,
  type CoachingCommand,
  type CoachingSource,
  type LearningRecord,
} from "@/lib/coaching/model";
import { coachingCommand, knownFailure, useCoachingPage } from "./client";
import Evidence from "./Evidence";
import LearningCard from "./LearningCard";
import QualityReview from "./QualityReview";
import "./coaching.css";
type AnalyzeCommand = Extract<CoachingCommand, { type: "analyze" }>;
type Operation = {
  command: AnalyzeCommand | null;
  busy: boolean;
  error: string;
  notice: string;
};
const date = (value: string) =>
  new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
export default function CoachPanel({
  companyId,
  brandId,
  source,
  sourceId,
  sourceRevision,
  disabled = false,
  currentDraft = "",
  onInsert,
  onGenerated,
}: {
  companyId: string;
  brandId: string;
  source: CoachingSource;
  sourceId: string;
  sourceRevision?: number;
  disabled?: boolean;
  currentDraft?: string;
  onInsert?: (text: string) => void;
  onGenerated?: () => void;
}) {
  const {
    data,
    error: readError,
    mutate,
    scopeKey,
    isLoading,
    isValidating,
  } = useCoachingPage({ companyId, brandId, source, sourceId, sourceRevision });
  const [tab, setTab] = useState<"next" | "quality" | "learning">("next"),
    [operations, setOperations] = useState<
      Record<string, Operation | undefined>
    >({}),
    [generated, setGenerated] = useState<{
      scope: string;
      analysis: CoachingAnalysis;
    } | null>(null),
    [edited, setEdited] = useState<{ id: string; value: string } | null>(null),
    [insertChoice, setInsertChoice] = useState<string | null>(null),
    [notice, setNotice] = useState<{ scope: string; text: string } | null>(
      null,
    );
  const activeScope = useRef(scopeKey);
  useEffect(() => {
    activeScope.current = scopeKey;
  }, [scopeKey]);
  const local = generated?.scope === scopeKey ? generated.analysis : null;
  // The readback owns freshness, even when a POST supplied the initial result.
  const analysis =
    data?.analyses.find((item) => item.id === local?.id) ??
    local ??
    data?.analyses[0] ??
    null;
  const operationKey = `${companyId}:${brandId}:${source}:${sourceId}`;
  const currentOperation = operations[operationKey];
  const busy = Object.values(operations).some((operation) => operation?.busy);
  const pending = currentOperation?.command ?? null;
  function recordOperation(key: string, operation?: Operation) {
    setOperations((old) => ({ ...old, [key]: operation }));
  }
  const reply =
    analysis && edited?.id === analysis.id
      ? edited.value
      : (analysis?.nextAction.suggestedReply ?? "");
  const stale = !!analysis?.stale;
  const locked =
    disabled || busy || stale || isLoading || isValidating || !!readError;
  async function analyze() {
    if (busy || disabled || !data?.canGenerate) return;
    const command: AnalyzeCommand = pending ?? {
      type: "analyze",
      requestId: crypto.randomUUID(),
      brandId,
      source,
      sourceId,
    };
    const startedScope = scopeKey,
      startedOperation = operationKey;
    recordOperation(startedOperation, {
      command,
      busy: true,
      error: "",
      notice: "",
    });
    try {
      const response = await coachingCommand<{
        analysis?: CoachingAnalysis;
        state?: "running";
      }>(companyId, command);
      if (response.state === "running") {
        recordOperation(startedOperation, {
          command,
          busy: false,
          error: "",
          notice: "分析仍在處理，請稍後核對同一請求。",
        });
        return;
      }
      if (!response.analysis) throw Error("分析結果未能確認，請核對同一請求。");
      if (activeScope.current === startedScope) {
        setGenerated({
          scope: startedScope,
          analysis: { ...response.analysis, stale: true },
        });
        setEdited(null);
        setInsertChoice(null);
      }
      await mutate();
      recordOperation(startedOperation);
      if (activeScope.current === startedScope) {
        setNotice({
          scope: startedScope,
          text: "分析已儲存，建議未向客戶發送。",
        });
        onGenerated?.();
      }
    } catch (e) {
      recordOperation(startedOperation, {
        command: knownFailure(e) ? null : command,
        busy: false,
        error:
          e instanceof Error ? e.message : "結果未能確認，請核對同一請求。",
        notice: "",
      });
    }
  }
  function insert(mode?: "append" | "replace") {
    if (
      !analysis ||
      locked ||
      !reply.trim() ||
      activeScope.current !== scopeKey
    )
      return;
    if (!onInsert) {
      void navigator.clipboard.writeText(reply).then(
        () => setNotice({ scope: scopeKey, text: "建議已複製。" }),
        () =>
          setNotice({
            scope: scopeKey,
            text: "未能自動複製，請選取建議文字。",
          }),
      );
      return;
    }
    if (!mode && currentDraft.trim() && currentDraft !== reply) {
      setInsertChoice(analysis.id);
      return;
    }
    onInsert(
      mode === "append" ? `${currentDraft.trimEnd()}\n\n${reply}` : reply,
    );
    setInsertChoice(null);
    setNotice({ scope: scopeKey, text: "已加入回覆草稿，請確認後再發送。" });
  }
  async function refreshed() {
    await mutate();
    onGenerated?.();
  }
  const selectedNotice = notice?.scope === scopeKey ? notice.text : "";
  const selectedError = currentOperation?.error || readError?.message || "";
  return (
    <section className="coach-panel" aria-label="AI 客服教練" aria-busy={busy}>
      <header className="coach-head">
        <div className="coach-head-title">
          <span className="coach-symbol">
            <Sparkles size={16} aria-hidden="true" />
          </span>
          <div>
            <h3>AI 客服教練</h3>
            <small>下一步 · 回覆質素 · 品牌話術</small>
          </div>
        </div>
        {analysis && (
          <button
            className="coach-refresh"
            type="button"
            aria-label={pending ? "核對同一分析" : "更新分析"}
            title={pending ? "核對同一分析" : "更新分析"}
            disabled={disabled || busy || !data?.canGenerate}
            onClick={() => void analyze()}
          >
            {busy ? (
              <LoaderCircle
                className="coach-spin"
                size={14}
                aria-hidden="true"
              />
            ) : (
              <RefreshCw size={14} aria-hidden="true" />
            )}
          </button>
        )}
      </header>
      {selectedError && (
        <div className="coach-alert" role="alert">
          {selectedError}
          {readError && (
            <div>
              <button
                type="button"
                onClick={() => void mutate().catch(() => undefined)}
              >
                重新讀取
              </button>
            </div>
          )}
        </div>
      )}
      {currentOperation?.notice && (
        <p className="coach-alert" role="status">
          {currentOperation.notice}
        </p>
      )}
      {selectedNotice && (
        <p className="coach-notice" role="status">
          {selectedNotice}
        </p>
      )}
      {stale && (
        <p className="coach-alert" role="status">
          對話或知識已更新，請更新分析後再使用建議。
        </p>
      )}
      {!analysis ? (
        <div className="coach-empty">
          <p>
            {isLoading
              ? "正在讀取分析記錄…"
              : "整理下一句點覆，同時搵出可改善嘅地方。"}
          </p>
          <button
            type="button"
            className="coach-primary"
            disabled={disabled || busy || !data?.canGenerate}
            onClick={() => void analyze()}
          >
            {busy ? (
              <LoaderCircle
                className="coach-spin"
                size={14}
                aria-hidden="true"
              />
            ) : (
              <Sparkles size={14} aria-hidden="true" />
            )}
            {busy ? "正在分析…" : pending ? "核對同一分析" : "分析呢段對話"}
          </button>
          {data && !data.canGenerate && (
            <small className="coach-muted">目前權限可查看已儲存分析。</small>
          )}
        </div>
      ) : (
        <>
          <nav className="coach-tabs" aria-label="客服教練內容">
            <button
              type="button"
              aria-pressed={tab === "next"}
              onClick={() => setTab("next")}
            >
              <MessageSquareText size={12} aria-hidden="true" />
              下一步
            </button>
            <button
              type="button"
              aria-pressed={tab === "quality"}
              onClick={() => setTab("quality")}
            >
              <ListChecks size={12} aria-hidden="true" />
              回覆質檢
            </button>
            <button
              type="button"
              aria-pressed={tab === "learning"}
              onClick={() => setTab("learning")}
            >
              <BookOpen size={12} aria-hidden="true" />
              話術學習
            </button>
          </nav>
          <div className="coach-body">
            {tab === "next" && (
              <>
                <h4>{analysis.nextAction.title}</h4>
                <p>{analysis.nextAction.reason}</p>
                {!!analysis.nextAction.missingFields.length && (
                  <div className="coach-tags" aria-label="可以補問嘅資料">
                    {analysis.nextAction.missingFields.map((field) => (
                      <span key={field}>{field}</span>
                    ))}
                  </div>
                )}
                {analysis.nextAction.suggestedReply && (
                  <>
                    <label>
                      建議回覆
                      <textarea
                        rows={4}
                        maxLength={1800}
                        value={reply}
                        disabled={locked}
                        onChange={(e) =>
                          setEdited({ id: analysis.id, value: e.target.value })
                        }
                      />
                    </label>
                    <div className="coach-actions">
                      <button
                        type="button"
                        className="coach-primary"
                        disabled={locked || !reply.trim()}
                        onClick={() => insert()}
                      >
                        <ClipboardCopy size={13} aria-hidden="true" />
                        {onInsert ? "加入回覆草稿" : "複製建議"}
                      </button>
                    </div>
                    {insertChoice === analysis.id && (
                      <div className="coach-insert-choice">
                        <p>回覆框已有草稿，要點樣加入？</p>
                        <div className="coach-actions">
                          <button
                            type="button"
                            disabled={locked}
                            onClick={() => insert("append")}
                          >
                            追加至草稿
                          </button>
                          <button
                            type="button"
                            disabled={locked}
                            onClick={() => insert("replace")}
                          >
                            取代現有草稿
                          </button>
                          <button
                            type="button"
                            onClick={() => setInsertChoice(null)}
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
                <Evidence
                  messages={analysis.nextAction.evidence}
                  knowledge={analysis.nextAction.knowledgeEvidence}
                />
              </>
            )}
            {tab === "quality" && (
              <>
                {analysis.quality.status === "insufficient" && (
                  <p className="coach-muted">有效對話不足，暫未能完整評估。</p>
                )}
                {!analysis.quality.findings.length &&
                  analysis.quality.status === "reviewed" && (
                    <p className="coach-muted">
                      今次分析未發現明顯需要改善嘅地方。
                    </p>
                  )}
                {analysis.quality.findings.map((finding, index) => {
                  const dismissed =
                    analysis.latestReview?.dismissedFindingCodes.includes(
                      finding.code,
                    );
                  return (
                    <article
                      className={`coach-finding${dismissed ? " is-dismissed" : ""}`}
                      key={`${finding.code}:${index}`}
                    >
                      <h4>
                        {dismissed ? (
                          <Check size={13} aria-hidden="true" />
                        ) : (
                          <TriangleAlert size={13} aria-hidden="true" />
                        )}
                        {finding.title}
                      </h4>
                      {dismissed && (
                        <small className="coach-muted">主管已標記不適用</small>
                      )}
                      <p>{finding.detail}</p>
                      <p className="coach-suggestion">{finding.suggestion}</p>
                      <Evidence messages={finding.evidence} />
                    </article>
                  );
                })}
                <div className="coach-loss">
                  <small className="coach-muted">
                    {analysis.latestReview
                      ? "主管覆核顧慮"
                      : "未預約顧慮 · AI 判斷"}
                  </small>
                  <strong>
                    {
                      lossLabels[
                        analysis.latestReview?.lossCode ??
                          (analysis.quality.lossReason.evidence.length
                            ? analysis.quality.lossReason.code
                            : "unknown")
                      ]
                    }
                  </strong>
                  {analysis.latestReview ? (
                    <p className="coach-muted">
                      {analysis.latestReview.reason}
                      <br />
                      {analysis.latestReview.actorName} ·{" "}
                      {date(analysis.latestReview.createdAt)}
                    </p>
                  ) : (
                    <Evidence messages={analysis.quality.lossReason.evidence} />
                  )}
                </div>
                {data?.canManage && (
                  <QualityReview
                    key={`${analysis.id}:${analysis.latestReview?.commandId ?? "unreviewed"}`}
                    companyId={companyId}
                    analysis={analysis}
                    disabled={locked}
                    onSaved={refreshed}
                  />
                )}
              </>
            )}
            {tab === "learning" && (
              <>
                <div
                  className={`coach-outcome${analysis.outcome.verifiedBooking ? " is-verified" : ""}`}
                >
                  <Check size={12} aria-hidden="true" />
                  {analysis.outcome.label}
                </div>
                {!analysis.learning.length && (
                  <p className="coach-muted">暫未有足夠依據整理可重用話術。</p>
                )}
                {analysis.learning.map((item, index) => {
                  const savedRecord = data?.learning.find(
                    (record) =>
                      record.analysisId === analysis.id &&
                      record.index === index,
                  );
                  const record: LearningRecord = savedRecord ?? {
                    analysisId: analysis.id,
                    index,
                    brandId,
                    item,
                    status: "suggested",
                    articleId: null,
                    createdAt: analysis.createdAt,
                    stale,
                    verifiedBooking: analysis.outcome.verifiedBooking,
                  };
                  return (
                    <LearningCard
                      key={`${analysis.id}:${index}`}
                      companyId={companyId}
                      record={{ ...record, stale: stale || record.stale }}
                      canManage={!!data?.canManage}
                      disabled={locked}
                      onSaved={refreshed}
                    />
                  );
                })}
              </>
            )}
          </div>
          <footer className="coach-stamp">
            <span>{analysis.coverage.label}</span>
            <time dateTime={analysis.createdAt}>
              {date(analysis.createdAt)}
            </time>
          </footer>
          {pending && !busy && (
            <div className="coach-actions" style={{ padding: "0 15px 13px" }}>
              <button
                type="button"
                className="coach-primary"
                disabled={disabled || !data?.canGenerate}
                onClick={() => void analyze()}
              >
                核對同一分析
                <ArrowUpRight size={13} aria-hidden="true" />
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
