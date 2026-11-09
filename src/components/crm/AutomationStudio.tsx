"use client";

import { useState } from "react";
import { ArrowDown, FlaskConical, GitBranch, Play, Timer } from "lucide-react";
import type { CrmLeadCase } from "@/lib/crm/leadOps";
import {
  automationRuleSchema,
  caseStatuses,
  simulateAutomation,
  statusNames,
  type AutomationRule,
} from "@/lib/crm/operations";

const initialRule: AutomationRule = {
  name: "未到店重新安排",
  status: "no_show",
  source: "all",
  queue: "all",
  treatmentContains: "",
  followUpHours: 24,
};
export function AutomationStudio({
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
  const [rule, setRule] = useState(initialRule);
  const [result, setResult] = useState<ReturnType<
    typeof simulateAutomation
  > | null>(null);
  const [error, setError] = useState("");
  const update = (patch: Partial<AutomationRule>) => {
    setRule((old) => ({ ...old, ...patch }));
    setResult(null);
    setError("");
  };
  const run = () => {
    const parsed = automationRuleSchema.safeParse(rule);
    if (!parsed.success) {
      setError("請輸入規則名稱，並設定 1 至 720 小時內嘅跟進時間。");
      return;
    }
    if (!brand || readError) {
      setError("請先接通資料來源，並選擇一個品牌。");
      return;
    }
    setResult(simulateAutomation(cases, parsed.data, brand, now));
    setError("");
  };
  return (
    <div className="ops-workspace ops-scroll-page">
      <header className="ops-header">
        <div>
          <p className="ops-eyebrow">WORKFLOW STUDIO</p>
          <h1>
            跟進自動化<span className="ops-badge">規則模擬</span>
          </h1>
          <p className="ops-muted">
            用真實條件檢查流程，先睇清楚會影響邊啲查詢。
          </p>
        </div>
        <span className="ops-mode">
          <FlaskConical size={15} />
          只產生建議
        </span>
      </header>
      <div className="ops-page-body">
        <div className="ops-two-columns">
          <section className="ops-card">
            <div className="ops-card-title">
              <h2>設定規則</h2>
              <GitBranch size={18} />
            </div>
            <label className="ops-field">
              <span>規則名稱</span>
              <input
                value={rule.name}
                maxLength={100}
                onChange={(event) => update({ name: event.target.value })}
              />
            </label>
            <label className="ops-field">
              <span>品牌</span>
              <select
                aria-label="自動化品牌"
                value={brand}
                onChange={(event) => {
                  setBrand(event.target.value);
                  setResult(null);
                }}
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
              <span>當客戶狀態係</span>
              <select
                aria-label="規則狀態"
                value={rule.status}
                onChange={(event) =>
                  update({
                    status: event.target.value as AutomationRule["status"],
                  })
                }
              >
                <option value="all">任何狀態</option>
                {caseStatuses.map((status) => (
                  <option key={status} value={status}>
                    {statusNames[status]}
                  </option>
                ))}
              </select>
            </label>
            <label className="ops-field">
              <span>療程名稱包含（可留空）</span>
              <input
                value={rule.treatmentContains}
                maxLength={100}
                placeholder="例如：皮膚護理"
                onChange={(event) =>
                  update({ treatmentContains: event.target.value })
                }
              />
            </label>
            <label className="ops-field">
              <span>建議幾多小時後跟進</span>
              <input
                aria-label="跟進小時"
                type="number"
                min={1}
                max={720}
                value={
                  Number.isNaN(rule.followUpHours) ? "" : rule.followUpHours
                }
                onChange={(event) =>
                  update({ followUpHours: event.target.valueAsNumber })
                }
              />
            </label>
            <button
              className="ops-button ops-button-primary ops-full"
              onClick={run}
            >
              <Play size={15} />
              執行模擬
            </button>
            <p role="alert" className="ops-error">
              {error}
            </p>
          </section>
          <section className="ops-card ops-flow-preview" aria-label="流程預覽">
            <p className="ops-eyebrow">WORKFLOW PREVIEW</p>
            <div className="ops-flow-node">
              <GitBranch size={18} />
              <div>
                <strong>符合篩選條件</strong>
                <p>
                  {rule.status === "all"
                    ? "任何狀態"
                    : statusNames[rule.status]}
                  {rule.treatmentContains ? ` · ${rule.treatmentContains}` : ""}
                </p>
              </div>
            </div>
            <ArrowDown size={20} />
            <div className="ops-flow-node">
              <Timer size={18} />
              <div>
                <strong>建議下一次跟進</strong>
                <p>{rule.followUpHours || "—"} 小時後 · 保留原有時間作比較</p>
              </div>
            </div>
            <ArrowDown size={20} />
            <div className="ops-flow-node">
              <FlaskConical size={18} />
              <div>
                <strong>查看模擬結果</strong>
                <p>唔會改動預約狀態或發送訊息</p>
              </div>
            </div>
            <p className="ops-muted">
              規則同結果只保留喺本頁。正式執行需要可持續運行嘅工作佇列。
            </p>
          </section>
        </div>
        {result ? (
          <section className="ops-card" aria-label="規則模擬結果">
            <div className="ops-card-title">
              <h2>模擬結果</h2>
              <span className="ops-badge">
                {result.proposals.length} 筆跟進建議
              </span>
            </div>
            <p className="ops-muted">
              基於本月最多 500
              筆已載入查詢。以下係建議，未儲存或更改現有跟進時間。
            </p>
            {result.proposals.length ? (
              <div className="ops-table-scroll">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>客戶</th>
                      <th>原有跟進</th>
                      <th>建議跟進（HKT）</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.proposals.map((row) => (
                      <tr key={row.leadId}>
                        <td>{row.customerName}</td>
                        <td>
                          {row.existingFollowUpAt
                            ? formatTime(row.existingFollowUpAt)
                            : "未設定"}
                        </td>
                        <td>{formatTime(row.proposedFollowUpAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="ops-inline-empty">
                冇查詢符合呢個規則。調整條件再試。
              </p>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
function formatTime(value: string) {
  return new Date(value).toLocaleString("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
