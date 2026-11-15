"use client";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  CircleDollarSign,
  FileClock,
  MessageCircle,
  NotebookPen,
} from "lucide-react";
import type { MemoryTimelineItem } from "@/lib/customer-memory/model";

export function memoryTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "時間待核對";
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
function eventIcon(item: MemoryTimelineItem) {
  const kind = item.kind + " " + item.source.type;
  if (/message|conversation|whatsapp|meta/.test(kind)) return MessageCircle;
  if (/payment|refund|order/.test(kind)) return CircleDollarSign;
  if (/booking|appointment/.test(kind)) return CalendarDays;
  if (/memory/.test(kind)) return NotebookPen;
  return FileClock;
}
export default function MemoryTimeline({
  items,
  hasMore,
  busy,
  error,
  onMore,
}: {
  items: MemoryTimelineItem[];
  hasMore: boolean;
  busy: boolean;
  error: string;
  onMore: () => void;
}) {
  return (
    <div className="cm-timeline-wrap">
      {!items.length && (
        <div className="cm-empty">
          <FileClock size={24} aria-hidden="true" />
          <strong>由第一個互動開始</strong>
          <p>已連結嘅對話、預約同交易，會按時間集中喺呢度。</p>
        </div>
      )}
      <ol className="cm-timeline" aria-label="客戶完整時間線">
        {items.map((item) => {
          const Icon = eventIcon(item);
          const href = item.source.href;
          // Links are generated server-side. Keep navigation within this app.
          const safeHref =
            href?.startsWith("/company/") && !href.startsWith("//")
              ? href
              : null;
          return (
            <li key={item.id}>
              <span className="cm-timeline-dot">
                <Icon size={15} aria-hidden="true" />
              </span>
              <article>
                <header>
                  <strong>{item.title}</strong>
                  <time dateTime={item.at}>{memoryTime(item.at)}</time>
                </header>
                {item.summary && <p>{item.summary}</p>}
                {safeHref ? (
                  <Link className="cm-source" href={safeHref}>
                    {item.source.label}
                    <ArrowUpRight size={12} aria-hidden="true" />
                  </Link>
                ) : (
                  <span className="cm-source">{item.source.label}</span>
                )}
              </article>
            </li>
          );
        })}
      </ol>
      {error && (
        <p className="cm-alert" role="alert">
          {error}
        </p>
      )}
      {hasMore && (
        <button
          type="button"
          className="cm-more"
          disabled={busy}
          onClick={onMore}
        >
          {busy
            ? "正在讀取較早紀錄…"
            : error
              ? "重新讀取較早紀錄"
              : "載入較早紀錄"}
        </button>
      )}
    </div>
  );
}
