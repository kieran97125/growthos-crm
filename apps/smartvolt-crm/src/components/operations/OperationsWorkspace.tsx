"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import useSWRInfinite from "swr/infinite";
import { operationsFetcher, operationsReadOptions } from "./fetcher";
import {
  ArrowUpRight,
  Clock3,
  Layers3,
  RefreshCw,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import {
  type OperationsPage,
  type OperationsSettings,
  type LifecycleRecord,
} from "@/lib/operations/model";
import OperationsPipeline from "./OperationsPipeline";
import FollowupQueue from "./FollowupQueue";
import TeamRouting from "./TeamRouting";
import RoutingAutomation from "./RoutingAutomation";
import { useOperationsMutation } from "./useOperationsMutation";
import { when } from "./format";
type Tab = "pipeline" | "followups" | "team" | "rules";
const tabs = {
  pipeline: "客戶階段",
  followups: "跟進事項",
  team: "團隊接客",
  rules: "自動流程",
};

export default function OperationsWorkspace({
  companyId,
  actorId,
  initialTab = "pipeline",
}: {
  companyId: string;
  actorId: string;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab),
    [brand, setBrand] = useState(""),
    [stage, setStage] = useState(""),
    [search, setSearch] = useState(""),
    [input, setInput] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [editing, setEditing] = useState<{
      record: LifecycleRecord;
      stage: string;
      reason: string;
    } | null>(null),
    [settings, setSettings] = useState<{
      data: OperationsSettings;
      revision: number;
    } | null>(null),
    [agent, setAgent] = useState<OperationsPage["members"][number] | null>(
      null,
    );
  const query = new URLSearchParams({
    ...(brand ? { brand } : {}),
    ...(stage ? { stage } : {}),
    search,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  }).toString();
  const {
    data: pages,
    error: readError,
    isValidating: loading,
    size,
    setSize,
    mutate,
  } = useSWRInfinite<OperationsPage>(
    (index, previous: OperationsPage | null) =>
      index && !previous?.nextCursor
        ? null
        : [
            `/api/companies/${companyId}/operations?${query}${index ? "&after=" + encodeURIComponent(previous!.nextCursor!) : ""}`,
            actorId,
          ],
    operationsFetcher<OperationsPage>,
    {
      ...operationsReadOptions,
      revalidateAll: true,
      refreshInterval: editing || settings || agent ? 0 : 60000,
    },
  );
  const refresh = useCallback(async () => {
    await mutate().catch(() => undefined);
  }, [mutate]);
  const mutation = useOperationsMutation(companyId, () => void refresh());
  const page = pages?.[0]
    ? {
        ...pages[0],
        records: [
          ...new Map(
            pages.flatMap((p) => p.records).map((r) => [r.key, r]),
          ).values(),
        ],
        nextCursor: pages.at(-1)?.nextCursor ?? null,
      }
    : null;
  const error = readError?.message ?? "";
  async function loadMore() {
    if (page?.nextCursor && !loading)
      await setSize(size + 1).catch(() => undefined);
  }
  const updateSettings = (next: OperationsSettings) =>
    setSettings((old) => ({
      data: next,
      revision: old?.revision ?? page?.revision ?? 0,
    }));
  const config = settings?.data ?? page?.settings;
  return (
    <main className="co-workspace" aria-busy={loading}>
      <header className="co-heading">
        <div>
          <span className="co-eyebrow">
            <Layers3 size={14} /> CONVERSATION OPERATIONS
          </span>
          <h1>
            跟進與轉化<span>。</span>
          </h1>
        </div>
        <div className="co-heading-actions">
          <Link href={`/company/${companyId}/crm`} className="co-secondary">
            開啟收件匣 <ArrowUpRight size={15} />
          </Link>
          <button
            className="co-icon"
            aria-label="重新整理營運資料"
            disabled={loading || mutation.locked}
            onClick={() => void refresh()}
          >
            <RefreshCw size={17} className={loading ? "co-spin" : ""} />
          </button>
        </div>
      </header>
      <div className="co-filterbar">
        <label>
          <span className="co-sr">品牌</span>
          <select
            aria-label="營運品牌"
            value={brand}
            onChange={(e) => {
              setBrand(e.target.value);
              setStage("");
            }}
          >
            <option value="">所有品牌</option>
            {page?.brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <details className="co-period">
          <summary>
            <Clock3 size={14} />
            {page ? `${page.period.from} — ${page.period.to}` : "最近 30 日"}
          </summary>
          <div>
            <label>
              由
              <input
                type="date"
                value={from || page?.period.from || ""}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              至
              <input
                type="date"
                value={to || page?.period.to || ""}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <small>香港時間；階段數量顯示目前狀態。</small>
          </div>
        </details>
        <span className="co-freshness">
          {page ? `${when(page.checkedAt)} 更新` : "正在讀取"}
        </span>
      </div>
      {(error || mutation.error) && (
        <div className="co-error" role="alert">
          {mutation.error || error}
        </div>
      )}
      {mutation.pending && !mutation.busy && (
        <button
          className="co-primary"
          onClick={() => void mutation.run(mutation.pending!)}
        >
          核對同一儲存結果 <RefreshCw size={14} />
        </button>
      )}
      {mutation.notice && (
        <p className="co-status" role="status">
          {mutation.notice}
        </p>
      )}
      <section className="co-metrics" aria-label="營運成效">
        {[
          { label: "新查詢", value: page?.metrics.inquiries, icon: Layers3 },
          {
            label: "已確認預約",
            value: page?.metrics.confirmedBookings,
            icon: ShieldCheck,
          },
          {
            label: "已到店",
            value: page?.hasPos ? page.metrics.attended : null,
            icon: UsersRound,
          },
          { label: "到期跟進", value: page?.metrics.overdue, icon: Clock3 },
        ].map((m) => (
          <article key={m.label}>
            <span>
              <m.icon size={16} />
              {m.label}
            </span>
            <strong>{m.value ?? "—"}</strong>
            <small>
              {m.label === "到期跟進"
                ? "目前待處理"
                : m.label === "已到店" && page && !page.hasPos
                  ? "需開通 POS"
                  : "所選期間"}
            </small>
          </article>
        ))}
      </section>
      <nav className="co-tabs" aria-label="營運檢視">
        {Object.entries(tabs).map(([id, name]) => (
          <button
            key={id}
            aria-pressed={tab === id}
            onClick={() => setTab(id as Tab)}
          >
            {name}
            {id === "followups" && !!page?.followupCount && (
              <span>{page.followupCount}</span>
            )}
          </button>
        ))}
      </nav>
      {!page ? (
        <div className="co-empty">
          <Layers3 size={30} />
          <h2>{loading ? "正在整理工作佇列…" : "未能讀取工作佇列"}</h2>
        </div>
      ) : (
        <>
          {tab === "pipeline" && (
            <OperationsPipeline
              page={page}
              companyId={companyId}
              stage={stage}
              setStage={setStage}
              search={search}
              setSearch={setSearch}
              input={input}
              setInput={setInput}
              editing={editing}
              setEditing={setEditing}
              mutation={mutation}
              loading={loading}
              loadMore={loadMore}
            />
          )}
          {tab === "followups" && (
            <FollowupQueue
              brand={brand}
              page={page}
              companyId={companyId}
              mutation={mutation}
            />
          )}
          {tab === "team" && (
            <TeamRouting
              page={page}
              agent={agent}
              setAgent={setAgent}
              mutation={mutation}
            />
          )}
          {tab === "rules" && config && (
            <RoutingAutomation
              page={page}
              config={config}
              configRevision={settings?.revision ?? page.revision}
              updateSettings={updateSettings}
              mutation={mutation}
              saved={() => setSettings(null)}
            />
          )}
        </>
      )}
    </main>
  );
}
