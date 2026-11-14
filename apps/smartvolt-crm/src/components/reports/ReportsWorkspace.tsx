"use client";
import { useState } from "react";
import Link from "next/link";
import OperationsNavigation from "@/components/operations/OperationsNavigation";
import dynamic from "next/dynamic";
import useSWR from "swr";
import { BarChart3, RefreshCw } from "lucide-react";
import {
  outcomeNames,
  reportMoney,
  type ReportPage,
} from "@/lib/reports/model";
import { engagementFetcher } from "@/components/engagement/fetcher";
import { useRecordedCommand } from "@/components/engagement/useRecordedCommand";
import "../engagement/engagement.css";
import "../operations/supervision.css";
import "./reports.css";
const Chart = dynamic(() => import("./ReportChart"), {
  ssr: false,
  loading: () => <p role="status">載入趨勢圖…</p>,
});
const at = (s: string) =>
  new Date(s).toLocaleString("zh-HK", { timeZone: "Asia/Hong_Kong" });
export default function ReportsWorkspace({
  companyId,
  initial,
}: {
  companyId: string;
  initial: ReportPage;
}) {
  const [query, setQuery] = useState(initial.query),
    [campaignCursor, setCampaignCursor] = useState(""),
    [eventCursor, setEventCursor] = useState(""),
    url = `/api/companies/${companyId}/reports`,
    params = new URLSearchParams({
      ...query,
      ...(query.brand ? {} : { brand: undefined }),
    } as Record<string, string>);
  if (!query.brand) params.delete("brand");
  const { data, error, mutate } = useSWR<ReportPage>(
      url +
        "?" +
        params +
        (campaignCursor ? "&" + campaignCursor : "") +
        (eventCursor ? "&" + eventCursor : ""),
      engagementFetcher,
      {
        fallbackData:
          query === initial.query && !campaignCursor && !eventCursor
            ? initial
            : undefined,
        revalidateOnFocus: false,
      },
    ),
    c = useRecordedCommand(url, () => mutate());
  function update(next: Partial<typeof query>) {
    setQuery({ ...query, ...next });
    setCampaignCursor("");
    setEventCursor("");
  }
  if (!data)
    return (
      <main className="eng-work">
        <h1>成效報表</h1>
        <p role={error ? "alert" : "status"}>
          {error?.message ?? "核對來源資料中…"}
        </p>
      </main>
    );
  const m = data.metrics,
    net =
      m.receiptsCents === null || m.refundsCents === null
        ? null
        : m.receiptsCents - m.refundsCents;
  return (
    <main className="eng-work">
      <header className="eng-header">
        <div>
          <span className="eng-eyebrow">PERFORMANCE</span>
          <h1>由查詢，睇到實際結果</h1>
          <p>預約、到店同核實收款，各自跟返原有來源。</p>
        </div>
        <Link href={`/company/${companyId}/crm/operations`}>
          返回跟進工作台
        </Link>
      </header>
      <OperationsNavigation
        companyId={companyId}
        current="reports"
        canManage={true}
      />
      <form
        className="eng-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          update({
            from: String(f.get("from")),
            to: String(f.get("to")),
            brand: String(f.get("brand")),
            mode: String(f.get("mode")) as "period" | "cohort",
            asOf: new Date(String(f.get("cutoff")) + ":00+08:00").toISOString(),
          });
        }}
      >
        <label>
          由<input type="date" name="from" required defaultValue={query.from} />
        </label>
        <label>
          至<input type="date" name="to" required defaultValue={query.to} />
        </label>
        <label>
          品牌
          <select name="brand" defaultValue={query.brand}>
            <option value="">全部品牌</option>
            {data.brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          統計方式
          <select name="mode" defaultValue={query.mode}>
            <option value="period">期內發生嘅結果</option>
            <option value="cohort">期內首次查詢嘅客戶</option>
          </select>
        </label>
        <label>
          統計截止（香港）
          <input
            name="cutoff"
            type="datetime-local"
            required
            defaultValue={new Date(Date.parse(query.asOf) + 8 * 3600000)
              .toISOString()
              .slice(0, 16)}
            max={new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 16)}
          />
        </label>
        <button className="eng-primary">
          <BarChart3 size={15} />
          查看
        </button>
        <button
          type="button"
          onClick={() => update({ asOf: new Date().toISOString() })}
        >
          <RefreshCw size={15} />
          更新截止
        </button>
      </form>
      {(error || c.error || c.notice) && (
        <p role={error || c.error ? "alert" : "status"} className="eng-alert">
          {error?.message || c.error || c.notice}
        </p>
      )}
      {c.frozen && (
        <button disabled={c.busy} onClick={() => void c.retry()}>
          核對同一請求
        </button>
      )}
      <p className="eng-hint">
        截止 {at(query.asOf)}（香港）。
        {query.mode === "cohort"
          ? "只追蹤所選期間首次查詢嘅客戶，其後結果計至截止時間。"
          : "按結果實際記錄時間計算所選期間。"}{" "}
        只使用截止前已記錄嘅結果。新查詢按原始對話／網站提交計；同一客人有幾個渠道，亦會分開顯示。
      </p>
      <section className="sup-metrics report-metrics" aria-label="成效總覽">
        {[
          ["新查詢", m.inquiries],
          ["首次查詢客戶", m.customers],
          ["有效預約確認", m.confirmed],
          ["到店紀錄", data.hasPos ? m.attended : "—"],
          ["核實淨收款", reportMoney(net)],
        ].map(([label, value]) => (
          <article key={label}>
            <h2>{label}</h2>
            <strong>{value}</strong>
          </article>
        ))}
      </section>
      <section className="report-panel">
        <h2>每日趨勢</h2>
        <Chart data={data.trend} />
        <details>
          <summary>查看每日數字</summary>
          <div className="report-table">
            <table>
              <caption>每日查詢及預約確認</caption>
              <thead>
                <tr>
                  <th>日期</th>
                  <th>查詢</th>
                  <th>預約確認紀錄</th>
                </tr>
              </thead>
              <tbody>
                {data.trend.map((t) => (
                  <tr key={t.day}>
                    <th>{t.day}</th>
                    <td>{t.inquiries}</td>
                    <td>{t.confirmed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
      <div className="eng-two">
        <section className="report-panel">
          <h2>查詢渠道</h2>
          <table>
            <thead>
              <tr>
                <th>渠道</th>
                <th>查詢</th>
              </tr>
            </thead>
            <tbody>
              {data.channels.map((x) => (
                <tr key={x.channel}>
                  <th>{x.channel}</th>
                  <td>{x.inquiries}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="report-panel">
          <h2>真人回覆表現</h2>
          <div className="report-table">
            <table>
              <thead>
                <tr>
                  <th>同事</th>
                  <th>已回覆回合</th>
                  <th>平均工作分鐘</th>
                </tr>
              </thead>
              <tbody>
                {data.staff.map((s) => (
                  <tr key={s.id}>
                    <th>{s.name || "未記錄姓名"}</th>
                    <td>{s.replies}</td>
                    <td>{s.response_minutes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="eng-hint">
            按實際首次人工回覆時嘅同事及當時辦公時間計。
          </p>
        </section>
      </div>
      <section className="report-panel">
        <div className="eng-section-title">
          <h2>推播之後發生咩事</h2>
          <span>{data.campaignTotal} 個推播</span>
        </div>
        <div className="report-table">
          <table>
            <caption>推播關聯成效</caption>
            <thead>
              <tr>
                <th>推播</th>
                <th>收件人</th>
                <th>送達回執</th>
                <th>回覆客戶</th>
                <th>退訂</th>
                <th>確認預約</th>
                <th>到店</th>
                {data.hasPos && (
                  <>
                    <th>關聯淨收款</th>
                    <th>已核實成本</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {data.campaigns.map((p) => (
                <tr key={p.id}>
                  <th>{p.name}</th>
                  <td>{p.recipients}</td>
                  <td>{p.delivered}</td>
                  <td>{p.replied}</td>
                  <td>{p.optouts}</td>
                  <td>{p.confirmed}</td>
                  <td>{data.hasPos ? p.attended : "—"}</td>
                  {data.hasPos && (
                    <>
                      <td>{reportMoney(p.net_cents)}</td>
                      <td>
                        {p.cost_cents === null
                          ? "未記錄"
                          : reportMoney(p.cost_cents)}
                        {data.canManageCosts && (
                          <details>
                            <summary>成本來源</summary>
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                const f = new FormData(e.currentTarget);
                                void c.send({
                                  commandId: crypto.randomUUID(),
                                  id: p.id,
                                  revision: p.cost_revision ?? 0,
                                  amountCents: Math.round(
                                    Number(f.get("cost")) * 100,
                                  ),
                                  source: String(f.get("source")),
                                });
                              }}
                            >
                              <fieldset disabled={c.busy || c.frozen}>
                                <label>
                                  成本（港元）
                                  <input
                                    name="cost"
                                    type="number"
                                    min="0"
                                    max="1000000000"
                                    step="0.01"
                                    defaultValue={
                                      p.cost_cents === null
                                        ? ""
                                        : p.cost_cents / 100
                                    }
                                    required
                                  />
                                </label>
                                <label>
                                  核實來源
                                  <input
                                    name="source"
                                    maxLength={500}
                                    defaultValue={p.cost_source ?? ""}
                                    required
                                  />
                                </label>
                                <button>儲存成本</button>
                              </fieldset>
                            </form>
                          </details>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="eng-pagination">
          {campaignCursor && (
            <button onClick={() => setCampaignCursor("")}>第一頁</button>
          )}
          {data.nextCampaign && (
            <button onClick={() => setCampaignCursor(data.nextCampaign!)}>
              下一頁推播
            </button>
          )}
        </div>
        <p className="eng-hint">
          採用事件發生前 7
          日內、最近一次獲平台接納嘅推播作關聯，同一事件只歸一個推播。關聯唔代表推播造成結果；缺成本會保留「未記錄」。有{" "}
          {m.unassociated} 項結果未能連到推播。
        </p>
      </section>
      <details className="eng-details">
        <summary>核對來源與口徑</summary>
        <p className="eng-hint">
          預約確認／到店時點由 {at(data.coverageFrom)} 開始記錄；
          {m.baselineUnknown}{" "}
          項較早狀態未有實際發生時間，唔會補作今日事件。到店按已記錄簽到／完成；收款及退款按
          POS 核實收據，取消預約及意向標籤唔當付款。
        </p>
        {data.hasPos && (
          <p>
            核實收款 {reportMoney(m.receiptsCents)} · 核實退款{" "}
            {reportMoney(m.refundsCents)}
          </p>
        )}
        <div className="report-table">
          <table>
            <thead>
              <tr>
                <th>結果</th>
                <th>來源</th>
                <th>發生時間（香港）</th>
                <th>金額</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((e) => (
                <tr key={e.id}>
                  <th>{outcomeNames[e.kind]}</th>
                  <td>
                    <code>{e.source_key}</code> · v{e.source_version}
                  </td>
                  <td>{e.occurred_at ? at(e.occurred_at) : "未有實際時間"}</td>
                  <td>{reportMoney(e.amount_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="eng-pagination">
          {eventCursor && (
            <button onClick={() => setEventCursor("")}>來源第一頁</button>
          )}
          {data.nextEvent && (
            <button onClick={() => setEventCursor(data.nextEvent!)}>
              下一頁來源
            </button>
          )}
        </div>
      </details>
    </main>
  );
}
