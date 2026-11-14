"use client";
import { useState } from "react";
import Link from "next/link";
import OperationsNavigation from "@/components/operations/OperationsNavigation";
import useSWR from "swr";
import type { SalesPage } from "@/lib/sales/model";
import { engagementFetcher } from "@/components/engagement/fetcher";
import { useRecordedCommand } from "@/components/engagement/useRecordedCommand";
import "../engagement/engagement.css";
const labels: Record<string, string> = {
  new: "新查詢",
  contacted: "已聯絡",
  demo_scheduled: "已約示範",
  closed: "已結束",
};
const localTime = (v: string) =>
  new Date(Date.parse(v) + 8 * 3600000).toISOString().slice(0, 16);
export default function SalesWorkspace({
  companyId,
  initial,
}: {
  companyId: string;
  initial: SalesPage;
}) {
  const [cursor, setCursor] = useState(""),
    url = `/api/companies/${companyId}/sales`,
    {
      data = initial,
      mutate,
      error,
    } = useSWR<SalesPage>(
      url + (cursor ? "?" + cursor : ""),
      engagementFetcher,
      { fallbackData: cursor ? undefined : initial, refreshInterval: 30000 },
    ),
    command = useRecordedCommand(url, () => mutate());
  return (
    <main className="eng-work">
      <header className="eng-header">
        <div>
          <span className="eng-eyebrow">WEBSITE ENQUIRIES</span>
          <h1>官網查詢，接得住</h1>
          <p>集中處理 Convelta 官網提交，指定同事、約示範同安排下一次跟進。</p>
        </div>
        <Link href={`/company/${companyId}/crm/operations`}>
          返回跟進工作台
        </Link>
      </header>
      <OperationsNavigation
        companyId={companyId}
        current="sales"
        canManage={data.canManage}
      />
      {(error || command.error || command.notice) && (
        <p
          role={error || command.error ? "alert" : "status"}
          className="eng-alert"
        >
          {error?.message || command.error || command.notice}
        </p>
      )}
      {command.frozen && (
        <button disabled={command.busy} onClick={() => void command.retry()}>
          核對同一請求
        </button>
      )}
      {!data.available ? (
        <section className="eng-empty">
          <h2>呢個公司未連接 Convelta 官網收件來源</h2>
          <p>網站查詢按已設定嘅來源公司獨立處理。</p>
        </section>
      ) : (
        <>
          {data.canConfigure && (
            <details className="eng-details" open={!data.setting?.enabled}>
              <summary>查詢交接設定</summary>
              <form
                className="eng-form-fields"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void command.send({
                    action: "setting",
                    commandId: crypto.randomUUID(),
                    brandId: String(f.get("brand")),
                    enabled: f.has("enabled"),
                    revision: data.setting?.revision ?? 0,
                  });
                }}
              >
                <fieldset disabled={command.busy || command.frozen}>
                  <label>
                    查詢所屬品牌
                    <select
                      name="brand"
                      defaultValue={data.setting?.brandId ?? data.brands[0]?.id}
                      disabled={data.total > 0}
                    >
                      {data.brands.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                    {data.total > 0 && (
                      <input
                        type="hidden"
                        name="brand"
                        value={data.setting?.brandId ?? ""}
                      />
                    )}
                  </label>
                  <label className="eng-check">
                    <input
                      name="enabled"
                      type="checkbox"
                      defaultChecked={data.setting?.enabled ?? false}
                    />
                    將新查詢交到工作台
                  </label>
                  <p className="eng-hint">
                    按原始提交識別記錄客戶；有同一個電話嘅現有客戶可以由團隊核對後連結。網站同意紀錄會保留喺來源內，渠道發送仍核對各自嘅聯絡偏好。
                  </p>
                  <button>儲存交接設定</button>
                </fieldset>
              </form>
            </details>
          )}
          <div className="eng-section-title">
            <h2>收到嘅查詢</h2>
            <span>{data.total} 個</span>
          </div>
          <section className="eng-campaigns">
            {data.rows.map((e) => (
              <article className="eng-campaign" key={e.source_id}>
                <div className="eng-campaign-main">
                  <h2>{e.source_snapshot.name}</h2>
                  <p>
                    {e.reference} · {e.source_snapshot.company_name} ·{" "}
                    {labels[e.status]}
                  </p>
                  <p>{e.source_snapshot.message}</p>
                  <p>
                    {e.source_snapshot.phone}
                    {e.source_snapshot.email && " · " + e.source_snapshot.email}
                  </p>
                  <Link
                    href={`/company/${companyId}/crm/customers?contact=${encodeURIComponent(e.customer_id)}`}
                  >
                    開啟客戶紀錄
                  </Link>
                  <details>
                    <summary>跟進呢個查詢</summary>
                    <form
                      key={e.revision}
                      className="eng-form-fields"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const f = new FormData(event.currentTarget),
                          due = String(f.get("due"));
                        void command.send({
                          action: "update",
                          commandId: crypto.randomUUID(),
                          id: e.source_id,
                          revision: e.revision,
                          status: String(f.get("status")),
                          ownerId: String(f.get("owner")) || null,
                          followUpAt: due
                            ? new Date(due + ":00+08:00").toISOString()
                            : null,
                          note: String(f.get("note")),
                        });
                      }}
                    >
                      <fieldset
                        disabled={
                          !data.canEdit || command.busy || command.frozen
                        }
                      >
                        <div className="eng-two">
                          <label>
                            進度
                            <select name="status" defaultValue={e.status}>
                              {Object.entries(labels).map(([v, t]) => (
                                <option key={v} value={v}>
                                  {t}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            跟進同事
                            <select
                              name="owner"
                              defaultValue={e.owner_id ?? ""}
                            >
                              <option value="">待分派</option>
                              {data.members.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <label>
                          下次跟進（香港）
                          <input
                            type="datetime-local"
                            name="due"
                            defaultValue={
                              e.follow_up_at ? localTime(e.follow_up_at) : ""
                            }
                          />
                        </label>
                        <label>
                          跟進備註
                          <textarea
                            name="note"
                            maxLength={2000}
                            defaultValue={e.note}
                          />
                        </label>
                        <button>儲存跟進</button>
                      </fieldset>
                    </form>
                    <p className="eng-hint">
                      收到時間：
                      {new Date(e.source_created_at).toLocaleString("zh-HK", {
                        timeZone: "Asia/Hong_Kong",
                      })}{" "}
                      · 來源同意版本：{e.source_snapshot.consent_version}
                    </p>
                  </details>
                </div>
              </article>
            ))}
          </section>
          {!data.rows.length && (
            <section className="eng-empty">
              <h2>未有已交接嘅查詢</h2>
              <p>啟用後，合資格嘅官網提交會喺呢度出現。</p>
            </section>
          )}
          <div className="eng-pagination">
            {cursor && <button onClick={() => setCursor("")}>第一頁</button>}
            {data.next && (
              <button onClick={() => setCursor(data.next!)}>下一頁</button>
            )}
          </div>
        </>
      )}
    </main>
  );
}
