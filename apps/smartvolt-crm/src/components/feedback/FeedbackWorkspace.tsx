"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { feedbackState, type FeedbackPage } from "@/lib/feedback/model";
import { engagementFetcher } from "@/components/engagement/fetcher";
import { useRecordedCommand } from "@/components/engagement/useRecordedCommand";
import "../engagement/engagement.css";
import "../reports/reports.css";
const reasons: Record<string, string> = {
  authority_changed: "設定同事嘅權限已改變",
  destination_changed: "目的地設定已改變",
  source_expired: "來源已過有效時限",
  measurement_consent_missing: "未有有效成效量度同意",
  source_cancelled: "預約已取消",
  payment_changed: "付款／退款狀態已改變",
  matching_data_missing: "未有可核實嘅電話或電郵",
  worker_interrupted: "提交結果待核對",
  provider_result_unknown: "Meta 回報待核對",
};
export default function FeedbackWorkspace({
  companyId,
  initial,
}: {
  companyId: string;
  initial: FeedbackPage;
}) {
  const [brand, setBrand] = useState(initial.brands[0]?.id ?? ""),
    [cursor, setCursor] = useState(""),
    url = `/api/companies/${companyId}/meta-feedback`,
    {
      data = initial,
      error,
      mutate,
    } = useSWR<FeedbackPage>(
      url + (cursor ? "?" + cursor : ""),
      engagementFetcher,
      { fallbackData: cursor ? undefined : initial, refreshInterval: 30000 },
    ),
    c = useRecordedCommand(url, () => mutate()),
    setting = data.settings.find((s) => s.brandId === brand);
  return (
    <main className="eng-work">
      <header className="eng-header">
        <div>
          <span className="eng-eyebrow">META CONVERSIONS</span>
          <h1>將真實結果，回傳 Meta</h1>
          <p>只處理已核實嘅預約確認及全額付款，測試同正式紀錄分開睇。</p>
        </div>
        <Link href={`/company/${companyId}/settings`}>返回公司設定</Link>
      </header>
      {(error || c.error || c.notice) && (
        <p className="eng-alert" role={error || c.error ? "alert" : "status"}>
          {error?.message || c.error || c.notice}
        </p>
      )}
      {c.frozen && (
        <button disabled={c.busy} onClick={() => void c.retry()}>
          核對同一請求
        </button>
      )}
      <label>
        品牌
        <select
          value={brand}
          disabled={c.busy || c.frozen}
          onChange={(e) => setBrand(e.target.value)}
        >
          {data.brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <section className="report-panel">
        <h2>{setting ? setting.label : "連接品牌嘅 Meta 數據集"}</h2>
        {setting && (
          <p>
            數據集 {setting.datasetId} ·{" "}
            {setting.mode === "test" ? "測試" : "正式"} ·{" "}
            {setting.enabled ? "已開啟" : "已暫停"}
          </p>
        )}
        {data.canConfigure ? (
          <form
            key={brand + ":" + (setting?.revision ?? 0)}
            className="eng-form-fields"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                token = String(f.get("token")).trim();
              void c.send({
                action: "setting",
                commandId: crypto.randomUUID(),
                brandId: brand,
                datasetId: String(f.get("dataset")),
                businessId: String(f.get("business")),
                adAccountId: String(f.get("account")).replace(/^act_/, ""),
                ...(token ? { token } : {}),
                enabled: f.has("enabled"),
                mode: String(f.get("mode")),
                testCode: String(f.get("testCode")) || null,
                revision: setting?.revision ?? 0,
                authorized: true,
              });
            }}
          >
            <fieldset disabled={c.busy || c.frozen}>
              <div className="eng-two">
                <label>
                  數據集／Pixel ID
                  <input
                    required
                    name="dataset"
                    inputMode="numeric"
                    pattern="[1-9][0-9]+"
                    defaultValue={setting?.datasetId}
                  />
                </label>
                <label>
                  商業管理平台 ID
                  <input
                    required
                    name="business"
                    inputMode="numeric"
                    pattern="[1-9][0-9]+"
                    defaultValue={setting?.businessId}
                  />
                </label>
              </div>
              <label>
                廣告帳戶 ID
                <input
                  required
                  name="account"
                  defaultValue={setting?.adAccountId}
                  inputMode="numeric"
                />
              </label>
              <label>
                Conversions API Token
                <input
                  name="token"
                  type="password"
                  autoComplete="new-password"
                  required={!setting}
                  placeholder={
                    setting ? "留空沿用目前 Token" : "由 Meta 事件管理工具取得"
                  }
                />
              </label>
              <div className="eng-two">
                <label>
                  回傳模式
                  <select name="mode" defaultValue={setting?.mode ?? "test"}>
                    <option value="test">測試</option>
                    <option value="live">正式</option>
                  </select>
                </label>
                <label>
                  Meta 測試事件代碼
                  <input
                    name="testCode"
                    maxLength={100}
                    defaultValue={setting?.testCode ?? ""}
                  />
                </label>
              </div>
              <label className="eng-check">
                <input
                  name="enabled"
                  type="checkbox"
                  defaultChecked={setting?.enabled ?? false}
                />
                開啟呢個品牌嘅結果回傳
              </label>
              <label className="eng-check">
                <input type="checkbox" required />
                我有權管理以上 Meta 資產，並授權按已記錄嘅客戶分享偏好回傳結果。
              </label>
              <button className="eng-primary">核實資產並儲存</button>
            </fieldset>
          </form>
        ) : (
          <p>由公司擁有人管理回傳目的地，你可以查閱自己有權查看嘅紀錄。</p>
        )}
        <p className="eng-hint">
          系統會核對數據集及廣告帳戶屬於同一個指定商業平台。開啟後只處理新結果；客戶資料需有同意來源，並先作雜湊處理。實際轉化渠道未有證據時使用「其他」，唔會將
          WhatsApp 查詢直接當成廣告成交。
        </p>
      </section>
      <section className="report-panel">
        <h2>回傳紀錄</h2>
        <div className="report-table">
          <table>
            <thead>
              <tr>
                <th>結果</th>
                <th>模式</th>
                <th>狀態</th>
                <th>來源</th>
                <th>核對</th>
              </tr>
            </thead>
            <tbody>
              {data.jobs
                .filter((j) => j.brand_id === brand)
                .map((j) => (
                  <tr key={j.id}>
                    <th>
                      {j.event_name === "Purchase" ? "全額付款" : "確認預約"}
                    </th>
                    <td>{j.mode === "test" ? "測試" : "正式"}</td>
                    <td>
                      {feedbackState[j.state]}
                      {j.reason && (
                        <small>{reasons[j.reason] ?? j.reason}</small>
                      )}
                    </td>
                    <td>
                      <code>{j.source_key}</code>
                    </td>
                    <td>
                      <details>
                        <summary>事件識別</summary>
                        <code>{j.event_id}</code>
                        {j.receipt?.traceId && (
                          <p>Meta 收據：{j.receipt.traceId}</p>
                        )}
                      </details>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!data.jobs.some((j) => j.brand_id === brand) && (
          <p>
            未有呢個品牌嘅回傳紀錄。開啟及符合分享條件後，新業務結果會加入。
          </p>
        )}
        <div className="eng-pagination">
          {cursor && <button onClick={() => setCursor("")}>第一頁</button>}
          {data.next && (
            <button onClick={() => setCursor(data.next!)}>下一頁</button>
          )}
        </div>
        <p className="eng-hint">
          「Meta 已接收」表示 API 接收成功；配對、廣告歸因同優化結果請喺 Meta
          事件管理工具核對。提交結果未明確時會保留事件識別，避免重複回傳。
        </p>
      </section>
    </main>
  );
}
