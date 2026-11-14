"use client";
import { useRef, useState, type FormEvent } from "react";
import useSWR from "swr";
import type { EngagementPage } from "@/lib/engagement/model";
import { engagementFetcher } from "./fetcher";
export default function ContactPreferences({
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
    [channel, setChannel] = useState("whatsapp"),
    [purpose, setPurpose] = useState("marketing"),
    [busy, setBusy] = useState(false),
    [frozen, setFrozen] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const pending = useRef<Record<string, unknown> | null>(null),
    endpoint = `/api/companies/${companyId}/engagement`,
    {
      data,
      mutate,
      error: readError,
    } = useSWR<EngagementPage>(
      open
        ? endpoint + "?" + new URLSearchParams({ customer: customerId })
        : null,
      engagementFetcher,
      { refreshInterval: 60000 },
    );
  const current = data?.preferences.find(
      (p) =>
        p.brand_id === brand && p.channel === channel && p.purpose === purpose,
    ),
    key = brand + channel + purpose + String(current?.revision ?? 0);
  async function send(command: Record<string, unknown>) {
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
      setNotice("收訊偏好已更新，發送前會再核對。");
      await mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "未能儲存，請核對同一請求。");
    } finally {
      setBusy(false);
    }
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (frozen) {
      if (pending.current) void send(pending.current);
      return;
    }
    const f = new FormData(e.currentTarget);
    void send({
      action: "preference",
      commandId: crypto.randomUUID(),
      customerId,
      brandId: brand,
      channel,
      purpose,
      allowed: f.get("allowed") === "yes",
      source: String(f.get("source")),
      revision: current?.revision ?? 0,
    });
  }
  return (
    <details
      className="iq-preferences"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>收訊偏好</summary>
      {readError && <p role="alert">{readError.message}</p>}
      {data ? (
        <>
          <p>
            {current
              ? current.allowed
                ? "已記錄同意收取"
                : "已停止收取"
              : "未記錄客戶同意；系統唔會自動當作已同意。"}
          </p>
          <form onSubmit={submit} key={key}>
            <fieldset disabled={!canEdit || busy || frozen}>
              <label>
                品牌
                <select
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                >
                  {data.brands
                    .filter((b) => brandIds.includes(b.id))
                    .map((b) => (
                      <option value={b.id} key={b.id}>
                        {b.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                渠道
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="messenger">Messenger</option>
                  <option value="instagram">Instagram</option>
                </select>
              </label>
              <label>
                用途
                <select
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                >
                  <option value="marketing">營銷訊息</option>
                  <option value="service">服務通知</option>
                </select>
              </label>
              <label>
                客人選擇
                <select
                  name="allowed"
                  defaultValue={current?.allowed ? "yes" : "no"}
                >
                  <option value="no">停止／未同意</option>
                  <option value="yes">已明確同意</option>
                </select>
              </label>
              <label>
                同意或退出來源
                <input
                  name="source"
                  maxLength={500}
                  required
                  placeholder="例如：客人於今日對話明確確認"
                  defaultValue={current?.source ?? ""}
                />
              </label>
              {canEdit && <button type="submit">儲存偏好</button>}
            </fieldset>
            {frozen && (
              <button
                type="button"
                disabled={busy}
                onClick={() => pending.current && void send(pending.current)}
              >
                核對同一請求
              </button>
            )}
          </form>
        </>
      ) : open && !readError ? (
        <p role="status">讀取中…</p>
      ) : null}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </details>
  );
}
