"use client";
import Link from "next/link";
import { ArrowUpRight, ListChecks } from "lucide-react";
import { lossLabels, type CoachingSource } from "@/lib/coaching/model";
import { useCoachingPage } from "./client";
import "./coaching.css";
const sourceHref = (
  companyId: string,
  brandId: string,
  source: CoachingSource,
  sourceId: string,
) =>
  `/company/${companyId}/crm/ai?${new URLSearchParams({ mode: "replies", brand: brandId, coachSource: source, coachId: sourceId })}`;
export default function CoachingOverview({
  companyId,
  brandId,
}: {
  companyId: string;
  brandId: string;
}) {
  const { data, error, isLoading, mutate } = useCoachingPage({
    companyId,
    brandId,
  });
  const latest = new Map<
    string,
    NonNullable<typeof data>["analyses"][number]
  >();
  for (const analysis of [...(data?.analyses ?? [])].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  )) {
    const key = `${analysis.source}:${analysis.sourceId}`;
    if (!latest.has(key)) latest.set(key, analysis);
  }
  const analyses = [...latest.values()];
  const sampleDates = analyses.map((analysis) => analysis.createdAt).sort();
  const sampleDate = (value: string) =>
    new Intl.DateTimeFormat("zh-HK", {
      timeZone: "Asia/Hong_Kong",
      month: "numeric",
      day: "numeric",
    }).format(new Date(value));
  const lossCounts = new Map<string, number>();
  for (const analysis of analyses) {
    if (analysis.stale) continue;
    const code =
      analysis.latestReview?.lossCode ??
      (analysis.quality.lossReason.evidence.length
        ? analysis.quality.lossReason.code
        : "unknown");
    if (code !== "unknown")
      lossCounts.set(
        lossLabels[code],
        (lossCounts.get(lossLabels[code]) ?? 0) + 1,
      );
  }
  const topConcerns = [...lossCounts].sort((a, b) => b[1] - a[1]).slice(0, 3);
  return (
    <section className="coach-workroom" aria-label="客服質檢概覽">
      <header className="coach-workroom-header">
        <div>
          <h2>
            <ListChecks size={18} aria-hidden="true" />
            回覆質檢
          </h2>
          <p>
            最近 {analyses.length} 段已分析對話
            {sampleDates.length
              ? ` · ${sampleDate(sampleDates[0])}–${sampleDate(sampleDates.at(-1)!)}`
              : ""}
            ，每段只計最新分析；顧慮統計只包括來源仍有效嘅記錄。
          </p>
        </div>
        <Link href={`/company/${companyId}/crm/ai?mode=replies`}>
          分析與品牌話術
          <ArrowUpRight size={13} aria-hidden="true" />
        </Link>
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
          正在讀取質檢記錄…
        </p>
      )}
      {!!topConcerns.length && (
        <div className="coach-tags" aria-label="最近分析常見顧慮">
          {topConcerns.map(([label, count]) => (
            <span key={label}>
              {label} · {count}
            </span>
          ))}
        </div>
      )}
      {!!analyses.length && (
        <div className="coach-overview-list">
          {analyses.slice(0, 6).map((analysis) => {
            const count = analysis.quality.findings.filter(
              (finding) =>
                !analysis.latestReview?.dismissedFindingCodes.includes(
                  finding.code,
                ),
            ).length;
            return (
              <Link
                className="coach-overview-row"
                key={analysis.id}
                href={sourceHref(
                  companyId,
                  brandId,
                  analysis.source,
                  analysis.sourceId,
                )}
              >
                <div>
                  <b>{analysis.nextAction.title}</b>
                  <small>
                    {analysis.stale
                      ? "來源已更新"
                      : count
                        ? `${count} 項改善建議`
                        : "暫未發現明顯問題"}{" "}
                    · {analysis.latestReview ? "主管已覆核" : "AI 判斷"}
                  </small>
                </div>
                <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      )}
      {!isLoading && !error && !analyses.length && (
        <div className="coach-workroom-empty">
          團隊分析對話後，質檢同顧慮會集中喺呢度。
        </div>
      )}
    </section>
  );
}
