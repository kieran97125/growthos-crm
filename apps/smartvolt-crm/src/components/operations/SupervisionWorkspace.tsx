"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import OperationsNavigation from "@/components/operations/OperationsNavigation";
import useSWR from "swr";
import { ArrowUpRight, Clock3, Settings2, X } from "lucide-react";
import { formatHongKongDateTime } from "@/lib/datetime";
import type {
  OfficePolicy,
  SupervisionPage,
} from "@/lib/operations/supervision";
import { engagementFetcher } from "@/components/engagement/fetcher";
import OfficePolicyForm from "./OfficePolicyForm";
import "../engagement/engagement.css";
import "./supervision.css";
const date = formatHongKongDateTime;
export default function SupervisionWorkspace({
  companyId,
  initial,
}: {
  companyId: string;
  initial: SupervisionPage;
}) {
  const [brand, setBrand] = useState(""),
    [cursor, setCursor] = useState(""),
    [from, setFrom] = useState(initial.period.from),
    [to, setTo] = useState(initial.period.to),
    [settings, setSettings] = useState<{
      brandId: string;
      revision: number;
      data: OfficePolicy;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [frozen, setFrozen] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const pending = useRef<Record<string, unknown> | null>(null),
    dialog = useRef<HTMLDialogElement>(null),
    endpoint = "/api/companies/" + companyId + "/supervision";
  const {
    data,
    error: readError,
    mutate,
  } = useSWR<SupervisionPage>(
    endpoint +
      "?" +
      new URLSearchParams({
        from,
        to,
        ...(brand ? { brand } : {}),
        ...(cursor ? { after: cursor } : {}),
      }),
    engagementFetcher,
    {
      fallbackData:
        !brand &&
        !cursor &&
        from === initial.period.from &&
        to === initial.period.to
          ? initial
          : undefined,
      refreshInterval: 15000,
      keepPreviousData: false,
    },
  );
  useEffect(() => {
    if (settings && !dialog.current?.open) {
      dialog.current?.showModal();
      dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
    }
  }, [settings]);
  async function save(command: Record<string, unknown>) {
    if (busy) return;
    pending.current = command;
    setBusy(true);
    setFrozen(true);
    setError("");
    try {
      const r = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(command),
        }),
        d = await r.json();
      if (!r.ok) {
        if (r.status < 500) {
          pending.current = null;
          setFrozen(false);
        }
        throw Error(d.error);
      }
      pending.current = null;
      setFrozen(false);
      dialog.current?.close();
      setSettings(null);
      setNotice("辦公時間已儲存，之後嘅新查詢會按呢個時間計算。");
      await mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "未能儲存，請核對同一請求。");
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <main className="eng-work">
        <h1>主管工作台</h1>
        <p role={readError ? "alert" : "status"}>
          {readError?.message ?? "讀取跟進情況中…"}
        </p>
      </main>
    );
  const m = data.metrics;
  return (
    <main className="eng-work">
      <header className="eng-header">
        <div>
          <span className="eng-eyebrow">SUPERVISOR DESK</span>
          <h1>睇清楚，邊位客人仲等緊</h1>
          <p>真人回覆、團隊接手同處理時限，集中喺同一個地方。</p>
        </div>
        <Link
          href={"/company/" + companyId + "/crm/operations"}
          className="eng-advanced-link"
        >
          返回跟進工作台
          <ArrowUpRight size={15} />
        </Link>
      </header>
      <OperationsNavigation
        companyId={companyId}
        current="supervision"
        canManage={true}
      />
      {(error || notice || readError) && (
        <p
          role={error || readError ? "alert" : "status"}
          className={error || readError ? "eng-alert" : "eng-notice"}
        >
          {error || readError?.message || notice}
        </p>
      )}
      <div className="eng-toolbar">
        <label>
          品牌
          <select
            value={brand}
            onChange={(e) => {
              setBrand(e.target.value);
              setCursor("");
            }}
          >
            <option value="">全部品牌</option>
            {data.brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={!brand || !data.policy}
          onClick={() => {
            if (data.policy) {
              setError("");
              pending.current = null;
              setFrozen(false);
              setSettings({ brandId: brand, ...structuredClone(data.policy) });
            }
          }}
        >
          <Settings2 size={15} />
          辦公時間
        </button>
        <span>香港時間 · 自動更新</span>
      </div>
      <section className="sup-metrics" aria-label="目前跟進情況">
        <article>
          <h2>待真人回覆</h2>
          <strong>{m.pending}</strong>
          <span>
            {m.unmeasured
              ? m.unmeasured + " 段未有計時基準"
              : "目前所有待覆對話"}
          </span>
        </article>
        <article className={m.overdue ? "sup-urgent" : ""}>
          <h2>已超過回覆目標</h2>
          <strong>{m.overdue}</strong>
          <span>按每輪查詢嘅辦公時間設定</span>
        </article>
        <article>
          <h2>平均首次人工回覆</h2>
          <strong>
            {m.averageResponseMinutes === null
              ? "—"
              : m.averageResponseMinutes < 1
                ? "<1"
                : m.averageResponseMinutes}
            <small>{m.averageResponseMinutes === null ? "" : "分鐘"}</small>
          </strong>
          <span>{m.humanAnswered} 個已回覆樣本 · 所選日期</span>
        </article>
      </section>
      <div className="eng-section-title">
        <h2>而家要跟進</h2>
        <span>較早到期嘅查詢排先</span>
      </div>
      {data.queue.length ? (
        <div className="eng-campaigns">
          {data.queue.map((q) => {
            const overdue =
              q.response_due_at &&
              Date.parse(q.response_due_at) <= Date.parse(data.checkedAt);
            return (
              <article className="eng-campaign" key={q.key}>
                <div className="eng-campaign-icon">
                  <Clock3 size={21} />
                </div>
                <div className="eng-campaign-main">
                  <h2>{q.customer_name}</h2>
                  <p>
                    {q.channel} · {q.owner_name ?? "待分派"}
                  </p>
                  <div className="eng-tags">
                    <span className={overdue ? "sup-overdue" : ""}>
                      {q.response_due_at
                        ? (overdue ? "已過目標 · " : "回覆目標 · ") +
                          date(q.response_due_at)
                        : "未有計時基準"}
                    </span>
                    {q.editing && (
                      <span>{q.editor_name ?? "同事"} 正在回覆</span>
                    )}
                    {q.first_automation_at && (
                      <span>流程已回覆，待真人處理</span>
                    )}
                  </div>
                </div>
                <Link
                  className="sup-open"
                  href={
                    "/company/" +
                    companyId +
                    "/crm?" +
                    new URLSearchParams({
                      provider: q.provider,
                      thread: q.thread_id,
                    })
                  }
                >
                  開啟對話
                  <ArrowUpRight size={15} />
                </Link>
              </article>
            );
          })}
        </div>
      ) : (
        <section className="eng-empty eng-small-empty">
          <h2>目前未有等待真人回覆嘅對話</h2>
          <p>有新查詢或需要接手嘅對話，會喺呢度顯示。</p>
        </section>
      )}
      <div className="eng-pagination">
        {cursor && <button onClick={() => setCursor("")}>第一頁</button>}
        {data.nextCursor && (
          <button onClick={() => setCursor(data.nextCursor!)}>下一頁</button>
        )}
      </div>
      <details className="eng-details">
        <summary>
          團隊處理情況<span>按日期查閱</span>
        </summary>
        <div className="sup-performance">
          <div className="eng-two">
            <label>
              由
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setCursor("");
                }}
              />
            </label>
            <label>
              至
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setCursor("");
                }}
              />
            </label>
          </div>
          <table>
            <tbody>
              <tr>
                <th>收到嘅查詢回合</th>
                <td>{m.episodes}</td>
              </tr>
              <tr>
                <th>真人已回覆</th>
                <td>{m.humanAnswered}</td>
              </tr>
              <tr>
                <th>回覆符合目標</th>
                <td>
                  {m.withinTarget} / {m.humanAnswered}
                </td>
              </tr>
              <tr>
                <th>自動流程曾回覆</th>
                <td>{m.automatedAnswered}</td>
              </tr>
              <tr>
                <th>對話已解決</th>
                <td>{m.resolved}</td>
              </tr>
              <tr>
                <th>對話重開</th>
                <td>{m.reopened}</td>
              </tr>
            </tbody>
          </table>
          <p className="eng-hint">
            計時由工作台實際收件起，至真人回覆獲平台接納；內部備註唔計，真人發送嘅
            AI
            草稿仍屬人工回覆。首次回覆按期內收到嘅查詢回合計；解決／重開按期內實際操作計。
          </p>
          <p className="eng-hint">
            時效紀錄由 {date(data.coverageFrom)}{" "}
            開始；較早未有基準嘅對話唔會當作零分鐘回覆。辦公時間只影響工作台計時，渠道
            24 小時回覆時限仍獨立計算。
          </p>
        </div>
      </details>
      <dialog
        ref={dialog}
        className="eng-dialog"
        aria-labelledby="sup-hours-title"
        onClose={() => setSettings(null)}
      >
        <header className="eng-dialog-head">
          <div>
            <span className="eng-eyebrow">WORKING HOURS</span>
            <h2 id="sup-hours-title">設定辦公時間</h2>
          </div>
          <button
            aria-label="關閉辦公時間"
            disabled={busy}
            onClick={() => dialog.current?.close()}
          >
            <X size={20} />
          </button>
        </header>
        {settings && (
          <OfficePolicyForm
            initial={settings.data}
            disabled={busy || frozen}
            onSave={(d) =>
              void save({
                commandId: crypto.randomUUID(),
                brandId: settings.brandId,
                revision: settings.revision,
                data: d,
              })
            }
          />
        )}{" "}
        {error && (
          <p role="alert" className="eng-alert">
            {error}
          </p>
        )}
        {frozen && (
          <button
            disabled={busy}
            onClick={() => pending.current && void save(pending.current)}
          >
            核對同一請求
          </button>
        )}
      </dialog>
    </main>
  );
}
