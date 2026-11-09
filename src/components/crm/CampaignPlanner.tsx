"use client";

import { useState } from "react";
import { CheckCheck, Layers3, ShieldCheck, UsersRound } from "lucide-react";
import type { CrmLeadCase } from "@/lib/crm/leadOps";
import {
  caseStatuses,
  defaultInboxFilter,
  exclusionNames,
  filterCases,
  previewBroadcast,
  sourceNames,
  sourceTypes,
  statusNames,
  type InboxFilter,
} from "@/lib/crm/operations";

export function CampaignPlanner({
  cases,
  now,
  readError,
}: {
  cases: CrmLeadCase[];
  now: number;
  readError: boolean;
}) {
  const brands = [
    ...new Map(cases.map((row) => [row.brandSlug, row.brandName])).entries(),
  ].sort();
  const [brand, setBrand] = useState(brands[0]?.[0] ?? "");
  const [status, setStatus] = useState<InboxFilter["status"]>("all");
  const [source, setSource] = useState<InboxFilter["source"]>("all");
  const matches = brand
    ? filterCases(cases, { ...defaultInboxFilter, brand, status, source }, now)
    : [];
  // The legacy read model has no verified tenant, consent ledger, channel or template evidence.
  // Missing facts stay missing. An enquiry is never interpreted as marketing opt-in.
  const preview = previewBroadcast(
    matches.map((row) => ({
      id: row.id,
      clientId: null,
      brandId: row.brandSlug,
      phone: row.normalizedPhone,
      consent: "unknown" as const,
      consentEvidenceId: null,
      suppressed: false,
      lastMarketingAt: null,
    })),
    {
      clientId: null,
      brandId: brand,
      connected: false,
      template: { status: "unknown", verifiedAt: null },
      frequencyHours: 24,
      templateMaxAgeHours: 24,
      now,
    },
  );
  const byId = new Map(matches.map((row) => [row.id, row]));
  return (
    <div className="ops-workspace ops-scroll-page">
      <header className="ops-header">
        <div>
          <p className="ops-eyebrow">AUDIENCES & CAMPAIGNS</p>
          <h1>
            受眾與推播<span className="ops-badge">名單預演</span>
          </h1>
          <p className="ops-muted">先確定對象，再檢查每一位客戶嘅聯絡資格。</p>
        </div>
        <span className="ops-mode">
          <ShieldCheck size={15} />
          未啟用發送
        </span>
      </header>
      <div className="ops-page-body">
        {readError ? (
          <p role="alert" className="ops-notice ops-notice-warning">
            資料讀取失敗。以下預演不可視為完整名單。
          </p>
        ) : null}
        <div className="ops-two-columns">
          <section className="ops-card">
            <div className="ops-card-title">
              <h2>01 / 建立受眾</h2>
              <UsersRound size={18} />
            </div>
            <p className="ops-muted">
              只涵蓋本月已載入嘅最多 500 筆查詢。每次選擇單一品牌。
            </p>
            <label className="ops-field">
              <span>品牌</span>
              <select
                aria-label="推播品牌"
                value={brand}
                onChange={(event) => setBrand(event.target.value)}
              >
                {!brands.length ? <option value="">未有品牌資料</option> : null}
                {brands.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="ops-field">
              <span>客戶階段</span>
              <select
                aria-label="推播客戶階段"
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as InboxFilter["status"])
                }
              >
                <option value="all">全部階段</option>
                {caseStatuses.map((key) => (
                  <option key={key} value={key}>
                    {statusNames[key]}
                  </option>
                ))}
              </select>
            </label>
            <label className="ops-field">
              <span>查詢來源</span>
              <select
                aria-label="推播查詢來源"
                value={source}
                onChange={(event) =>
                  setSource(event.target.value as InboxFilter["source"])
                }
              >
                <option value="all">全部來源</option>
                {sourceTypes.map((key) => (
                  <option key={key} value={key}>
                    {sourceNames[key]}
                  </option>
                ))}
              </select>
            </label>
          </section>
          <section className="ops-card">
            <div className="ops-card-title">
              <h2>02 / 發送前檢查</h2>
              <CheckCheck size={18} />
            </div>
            <p className="ops-muted">
              查詢紀錄未包含以下證據。補齊並逐位重新驗證後，先可批准發送。
            </p>
            <div className="ops-checklist">
              {[
                "客戶／品牌存取權限",
                "行銷同意及退訂紀錄",
                "獨立 WhatsApp 連線",
                "已批准訊息範本及變數",
                "完整名單及發送頻次紀錄",
              ].map((item) => (
                <div key={item}>
                  <span>{item}</span>
                  <span className="ops-badge ops-badge-warning">待接駁</span>
                </div>
              ))}
            </div>
            <button className="ops-button ops-button-primary ops-full" disabled>
              批准並排入發送佇列
            </button>
          </section>
        </div>
        <section className="ops-summary-grid" aria-label="受眾預演結果">
          {[
            ["符合查詢", preview.totalRows],
            ["不同收件人", preview.uniqueRecipients],
            ["重複紀錄", preview.duplicates],
            ["已具備發送資格", preview.eligible],
          ].map(([label, value]) => (
            <div className="ops-stat" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </section>
        <section className="ops-card">
          <div className="ops-card-title">
            <h2>03 / 逐位資格預覽</h2>
            <Layers3 size={18} />
          </div>
          <p className="ops-muted">
            同品牌、同完整國際號碼會合併預覽；同一收件人任何一筆排除紀錄都會保留。未有發送或提交資料。
          </p>
          {preview.decisions.length ? (
            <div className="ops-table-scroll">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>客戶</th>
                    <th>來源紀錄</th>
                    <th>資格檢查</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.decisions.map((row) => (
                    <tr key={row.recipientId}>
                      <td>{byId.get(row.recipientId)?.customerName}</td>
                      <td>{row.sourceIds.length} 筆</td>
                      <td>
                        <div className="ops-chip-row">
                          {row.reasons.map((reason) => (
                            <span
                              className="ops-badge ops-badge-warning"
                              key={reason}
                            >
                              {exclusionNames[reason]}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="ops-inline-empty">暫時未有符合條件嘅受眾。</div>
          )}
        </section>
      </div>
    </div>
  );
}
