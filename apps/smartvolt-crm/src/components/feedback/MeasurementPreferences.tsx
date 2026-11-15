"use client";
import { useState } from "react";
import useSWR from "swr";
import type { FeedbackPage } from "@/lib/feedback/model";
import { engagementFetcher } from "@/components/engagement/fetcher";
import { useRecordedCommand } from "@/components/engagement/useRecordedCommand";
export default function MeasurementPreferences({
  companyId,
  customerId,
  brandIds,
  canEdit,
}: {
  companyId: string;
  customerId: string;
  brandIds: string[];
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false),
    [brand, setBrand] = useState(brandIds[0] ?? ""),
    url = `/api/companies/${companyId}/meta-feedback`,
    { data, error, mutate } = useSWR<FeedbackPage>(
      open ? url + "?customer=" + encodeURIComponent(customerId) : null,
      engagementFetcher,
    ),
    c = useRecordedCommand(url, () => mutate()),
    current = data?.consents.find((x) => x.brandId === brand);
  return (
    <details
      className="iq-preferences"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>成效量度資料分享</summary>
      {error && <p role="alert">{error.message}</p>}
      {data && (
        <form
          key={brand + ":" + (current?.revision ?? 0)}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void c.send({
              action: "consent",
              commandId: crypto.randomUUID(),
              brandId: brand,
              customerId,
              allowed: f.has("allowed"),
              consentedAt: new Date(
                String(f.get("at")) + ":00+08:00",
              ).toISOString(),
              source: String(f.get("source")),
              revision: current?.revision ?? 0,
            });
          }}
        >
          <fieldset disabled={!canEdit || c.busy || c.frozen}>
            <label>
              品牌
              <select value={brand} onChange={(e) => setBrand(e.target.value)}>
                {data.brands
                  .filter((b) => brandIds.includes(b.id))
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                name="allowed"
                defaultChecked={current?.allowed ?? false}
              />
              客戶已同意用資料作廣告成效量度
            </label>
            <label>
              同意／撤回時間（香港）
              <input
                name="at"
                required
                type="datetime-local"
                defaultValue={new Date(
                  Date.parse(current?.consentedAt ?? new Date().toISOString()) +
                    8 * 3600000,
                )
                  .toISOString()
                  .slice(0, 16)}
              />
            </label>
            <label>
              實際同意／撤回來源
              <textarea
                name="source"
                required
                maxLength={500}
                defaultValue={current?.source ?? ""}
              />
            </label>
            <p>
              只會向已核實屬於呢個品牌嘅 Meta
              目的地，分享符合時間及來源條件嘅業務結果。
            </p>
            <button>儲存分享偏好</button>
          </fieldset>
        </form>
      )}
      {(c.error || c.notice) && (
        <p role={c.error ? "alert" : "status"}>{c.error || c.notice}</p>
      )}
      {c.frozen && (
        <button disabled={c.busy} onClick={() => void c.retry()}>
          核對同一請求
        </button>
      )}
    </details>
  );
}
