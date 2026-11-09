"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Inbox,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import type { CrmLeadCase } from "@/lib/crm/leadOps";
import {
  caseStatuses,
  defaultInboxFilter,
  filterCases,
  inboxFilterSchema,
  inQueue,
  sourceNames,
  sourceTypes,
  statusNames,
  type InboxFilter,
} from "@/lib/crm/operations";
import { CrmInboxTable } from "./CrmInboxTable";

const queues: { key: InboxFilter["queue"]; label: string }[] = [
  { key: "all", label: "全部查詢" },
  { key: "unassigned", label: "待分派" },
  { key: "follow_up_due", label: "到期跟進" },
  { key: "no_follow_up", label: "未設下次跟進" },
  { key: "no_show", label: "未到店" },
];
export function CrmInboxWorkspace({
  cases,
  initialFilter,
  now,
  readError,
  writesEnabled,
}: {
  cases: CrmLeadCase[];
  initialFilter: InboxFilter;
  now: number;
  readError: boolean;
  writesEnabled: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState(initialFilter);
  const visible = useMemo(
    () => filterCases(cases, filter, now),
    [cases, filter, now],
  );
  const brands = [
    ...new Map(cases.map((row) => [row.brandSlug, row.brandName])).entries(),
  ].sort();
  const owners = [
    ...new Set(
      cases.flatMap((row) => (row.assignedTo ? [row.assignedTo] : [])),
    ),
  ].sort();
  const update = (patch: Partial<InboxFilter>) => {
    const next = inboxFilterSchema.parse({ ...filter, ...patch });
    setFilter(next);
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(next)) {
      if (value && value !== "all") url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    window.history.replaceState(window.history.state, "", url);
  };
  return (
    <div className="ops-workspace">
      <header className="ops-header">
        <div>
          <p className="ops-eyebrow">CUSTOMER OPERATIONS</p>
          <h1>
            業務收件匣
            <span className="ops-badge">
              {writesEnabled ? "操作已開啟" : "唯讀"}
            </span>
          </h1>
          <p className="ops-muted">每個查詢，都有清晰嘅負責人同下一步。</p>
        </div>
        <div className="ops-header-actions">
          <button className="ops-button" onClick={() => router.refresh()}>
            <RefreshCw size={15} />
            更新資料
          </button>
          <Link className="ops-button ops-button-primary" href="/crm/campaigns">
            受眾預演
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </header>
      {readError ? (
        <div role="alert" className="ops-notice ops-notice-warning">
          暫時未能讀取最新查詢。請更新資料後再試；目前畫面不可視為完整名單。
        </div>
      ) : null}
      <section aria-label="跟進佇列" className="ops-queues">
        {queues.map(({ key, label }) => (
          <button
            key={key}
            aria-pressed={filter.queue === key}
            className={`ops-queue ${filter.queue === key ? "is-active" : ""}`}
            onClick={() => update({ queue: key })}
          >
            <span>{label}</span>
            <strong>
              {cases.filter((item) => inQueue(item, key, now)).length}
            </strong>
          </button>
        ))}
      </section>
      <section className="ops-toolbar" aria-label="篩選查詢">
        <label className="ops-search">
          <Search size={16} />
          <span className="sr-only">搜尋查詢</span>
          <input
            value={filter.query}
            maxLength={200}
            onChange={(event) => update({ query: event.target.value })}
            placeholder="姓名、電話、療程、廣告或 CTWA ID"
          />
        </label>
        <label>
          <span className="sr-only">品牌</span>
          <select
            aria-label="品牌"
            value={filter.brand}
            onChange={(event) => update({ brand: event.target.value })}
          >
            <option value="all">全部品牌</option>
            {brands.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">狀態</span>
          <select
            aria-label="狀態"
            value={filter.status}
            onChange={(event) =>
              update({ status: event.target.value as InboxFilter["status"] })
            }
          >
            <option value="all">全部狀態</option>
            {caseStatuses.map((status) => (
              <option key={status} value={status}>
                {statusNames[status]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">來源</span>
          <select
            aria-label="來源"
            value={filter.source}
            onChange={(event) =>
              update({ source: event.target.value as InboxFilter["source"] })
            }
          >
            <option value="all">全部來源</option>
            {sourceTypes.map((source) => (
              <option key={source} value={source}>
                {sourceNames[source]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">負責人</span>
          <select
            aria-label="負責人"
            value={filter.owner}
            onChange={(event) => update({ owner: event.target.value })}
          >
            <option value="all">全部負責人</option>
            <option value="unassigned">未指派</option>
            {owners.map((owner) => (
              <option key={owner}>{owner}</option>
            ))}
          </select>
        </label>
        <button
          className="ops-button ops-button-quiet"
          onClick={() => update(defaultInboxFilter)}
        >
          <SlidersHorizontal size={15} />
          重設
        </button>
      </section>
      <div className="ops-result-bar" role="status">
        <span>
          顯示 <strong>{visible.length}</strong> / {cases.length}{" "}
          筆本月已載入查詢<span className="ops-muted"> · 最多載入 500 筆</span>
        </span>
        <time dateTime={new Date(now).toISOString()}>
          {new Date(now).toLocaleString("zh-HK", {
            timeZone: "Asia/Hong_Kong",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          HKT
        </time>
      </div>
      {visible.length ? (
        <CrmInboxTable cases={visible} />
      ) : (
        <div className="ops-empty">
          <Inbox size={32} strokeWidth={1.3} />
          <h2>{cases.length ? "冇符合條件嘅查詢" : "等待第一筆查詢"}</h2>
          <p>
            {cases.length
              ? "調整篩選條件，或者重設全部篩選。"
              : "接通你自己嘅資料來源後，查詢會喺呢度顯示。"}
          </p>
          <Link className="ops-button" href="/crm/system">
            查看接駁同功能進度
            <ArrowUpRight size={15} />
          </Link>
        </div>
      )}
    </div>
  );
}
