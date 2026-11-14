"use client";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { X, FileText } from "lucide-react";
import type { EngagementPage, MessageDefinition } from "@/lib/engagement/model";
import MessageFields from "./MessageFields";
import { engagementFetcher } from "./fetcher";
import "./engagement.css";
type Context = {
  customerId: string;
  brandId: string;
  connection: EngagementPage["connections"][number];
  templates: EngagementPage["templates"];
  serviceAllowed: boolean;
  canSync: boolean;
};
export default function ManualTemplateReply({
  companyId,
  threadId,
  disabled,
  acquire,
  touch,
  onSent,
}: {
  companyId: string;
  threadId: string;
  disabled: boolean;
  acquire: () => Promise<string | null>;
  touch: () => void;
  onSent: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [frozen, setFrozen] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [value, setValue] = useState<MessageDefinition>({
      kind: "text",
      body: "",
      values: [],
    });
  const dialog = useRef<HTMLDialogElement>(null),
    pending = useRef<Record<string, unknown> | null>(null);
  const { data, error: readError } = useSWR<Context>(
    open
      ? `/api/companies/${companyId}/engagement/manual?thread=${threadId}`
      : null,
    engagementFetcher,
    { revalidateOnFocus: false },
  );
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  async function send() {
    if (busy || !data) return;
    setBusy(true);
    setError("");
    try {
      let command = pending.current;
      if (!command) {
        const token = await acquire();
        if (!token) {
          setError("請先取得呢段對話嘅回覆權。");
          return;
        }
        command = {
          action: "manual",
          commandId: crypto.randomUUID(),
          id: crypto.randomUUID(),
          brandId: data.brandId,
          provider: "whatsapp",
          connectionId: data.connection.id,
          threadId,
          editorToken: token,
          name: "對話服務模板",
          purpose: "service",
          definition: value,
          audience: { customer: data.customerId },
          dueAt: new Date().toISOString(),
        };
        pending.current = command;
      }
      setFrozen(true);
      const r = await fetch(`/api/companies/${companyId}/engagement`, {
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
        throw Error(d.error ?? "未能提交模板。");
      }
      pending.current = null;
      setFrozen(false);
      setNotice(
        d.schedulerPending
          ? "模板已記錄，派送待恢復。"
          : "模板已加入發送，實際結果會顯示喺對話。",
      );
      dialog.current?.close();
      await onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "未能確認，請核對同一請求。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen(true);
          setNotice("");
        }}
      >
        {" "}
        <FileText size={14} />
        服務模板
      </button>
      {notice && <span role="status">{notice}</span>}
      <dialog
        ref={dialog}
        className="eng-dialog"
        aria-labelledby="manual-template-title"
        onClose={() => setOpen(false)}
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <header className="eng-dialog-head">
          <h2 id="manual-template-title">用服務模板回覆</h2>
          <button
            type="button"
            aria-label="關閉服務模板"
            disabled={busy}
            onClick={() => dialog.current?.close()}
          >
            <X size={20} />
          </button>
        </header>
        <p className="eng-hint">
          只發送畀而家呢段對話嘅客人。超過 24
          小時仍須使用獲批嘅服務模板；唔會自動加入營銷名單。
        </p>
        {readError && <p role="alert">{readError.message}</p>}
        {!data && !readError && <p role="status">讀取已批准模板…</p>}
        {data && !data.serviceAllowed && (
          <p className="eng-alert">
            未有呢個品牌嘅服務聯絡同意紀錄。請先喺客戶資料內記錄實際同意來源。
          </p>
        )}
        {data && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <fieldset
              className="eng-form-fields"
              disabled={busy || frozen}
              onFocus={() => void acquire()}
              onChange={touch}
            >
              <MessageFields
                companyId={companyId}
                connection={data.connection}
                purpose="service"
                initialTemplates={data.templates}
                value={value}
                onChange={setValue}
                canSync={data.canSync}
              />
            </fieldset>
            {error && (
              <p className="eng-alert" role="alert">
                {error}
              </p>
            )}
            <button
              className="eng-primary"
              disabled={
                busy ||
                (!frozen && (!data.serviceAllowed || value.kind !== "template"))
              }
            >
              {busy ? "提交中…" : frozen ? "核對同一請求" : "發送服務模板"}
            </button>
          </form>
        )}
      </dialog>
    </>
  );
}
