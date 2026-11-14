"use client";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import type { EngagementPage, MessageDefinition } from "@/lib/engagement/model";
type Connection = EngagementPage["connections"][number];
export default function MessageFields({
  companyId,
  connection,
  purpose,
  initialTemplates,
  value,
  onChange,
  canSync = true,
}: {
  companyId: string;
  connection: Connection;
  purpose: "marketing" | "service";
  initialTemplates: EngagementPage["templates"];
  value: MessageDefinition;
  onChange: (v: MessageDefinition) => void;
  canSync?: boolean;
}) {
  const [inventories, setInventories] = useState(initialTemplates),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const inventory = inventories.find((i) => i.connection_id === connection.id),
    templates =
      inventory?.templates.filter(
        (t) =>
          t.status === "APPROVED" &&
          t.supported &&
          t.category === (purpose === "marketing" ? "MARKETING" : "UTILITY"),
      ) ?? [],
    selected = templates.find((t) => t.fingerprint === value.fingerprint);
  async function sync() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/companies/${companyId}/engagement`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "templates",
            connectionId: connection.id,
          }),
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      setInventories((v) => [
        ...v.filter((i) => i.connection_id !== connection.id),
        {
          connection_id: connection.id,
          templates: d.templates,
          checked_at: new Date().toISOString(),
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "未能同步模板。");
    } finally {
      setBusy(false);
    }
  }
  if (connection.provider !== "whatsapp")
    return (
      <label>
        訊息內容
        <textarea
          required
          maxLength={1000}
          rows={4}
          value={value.body}
          onChange={(e) =>
            onChange({ kind: "text", body: e.target.value, values: [] })
          }
          placeholder="你好 {{name}}，…"
        />
        <span>只可喺客人最後訊息後 24 小時內發送；到時會再核對。</span>
      </label>
    );
  return (
    <div className="eng-message-fields">
      <div className="eng-template-head">
        <label>
          官方模板
          <select
            required
            value={selected?.fingerprint ?? ""}
            onChange={(e) => {
              const t = templates.find((t) => t.fingerprint === e.target.value);
              if (t)
                onChange({
                  kind: "template",
                  body: t.body,
                  name: t.name,
                  locale: t.language,
                  fingerprint: t.fingerprint,
                  values: t.slots.map((s) => ({ ...s, value: "" })),
                });
            }}
          >
            <option value="">揀選已獲批准嘅文字模板</option>
            {templates.map((t) => (
              <option key={t.fingerprint} value={t.fingerprint}>
                {t.name} · {t.language}
              </option>
            ))}
          </select>
        </label>
        {canSync && (
          <button type="button" disabled={busy} onClick={() => void sync()}>
            <RefreshCw size={15} />
            {busy ? "同步中…" : "同步模板"}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="eng-alert">
          {error}
        </p>
      )}
      {selected?.slots.map((s) => (
        <label key={s.component + ":" + s.key}>
          {s.component === "header" ? "標題" : "內容"}欄位 {s.key}
          <input
            required
            maxLength={1024}
            value={
              value.values.find(
                (v) => v.component === s.component && v.key === s.key,
              )?.value ?? ""
            }
            onChange={(e) =>
              onChange({
                ...value,
                values: selected.slots.map((slot) => ({
                  ...slot,
                  value:
                    slot.key === s.key && slot.component === s.component
                      ? e.target.value
                      : (value.values.find(
                          (v) =>
                            v.component === slot.component &&
                            v.key === slot.key,
                        )?.value ?? ""),
                })),
              })
            }
            placeholder="可用 {{name}} 放入客戶姓名"
          />
        </label>
      ))}
      {selected && (
        <div className="eng-message-preview">
          <span>訊息預覽</span>
          <p>
            {selected.components
              .map((raw) => {
                const c = raw as { type: string; text?: string };
                return (c.text ?? "").replace(
                  /{{([^{}]+)}}/g,
                  (_, key) =>
                    value.values.find(
                      (v) =>
                        v.component === c.type.toLowerCase() && v.key === key,
                    )?.value || "…",
                );
              })
              .filter(Boolean)
              .join("\n")}
          </p>
        </div>
      )}
      <p className="eng-hint">
        只使用 Meta 正式批准嘅模板；狀態或內容改變後會停止發送。
      </p>
    </div>
  );
}
