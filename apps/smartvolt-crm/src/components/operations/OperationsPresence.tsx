"use client";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import useSWR from "swr";
import { Check, Clock3 } from "lucide-react";
import { operationsFetcher, operationsReadOptions } from "./fetcher";
type Presence = "online" | "away" | "offline";
type Attention = { presence: Presence; due: number; canEdit: boolean };
const names = { online: "在線接客", away: "暫離", offline: "離線" };
export default function OperationsPresence({
  companyId,
  actorId,
}: {
  companyId: string;
  actorId: string;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const endpoint = `/api/companies/${companyId}/operations`;
  const {
    data,
    error: readError,
    mutate,
  } = useSWR<Attention>(
    [endpoint + "?mode=attention", actorId],
    operationsFetcher<Attention>,
    { ...operationsReadOptions, refreshInterval: 60000 },
  );
  const serial = useRef<Promise<unknown>>(Promise.resolve()),
    desired = useRef<Presence | null>(null);
  const publish = useCallback(
    (status: Presence, heartbeat = false) => {
      const next = serial.current
        .catch(() => undefined)
        .then(async () => {
          if (heartbeat && desired.current && desired.current !== "online")
            return;
          const r = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "presence", status }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error ?? "未能更新接客狀態。");
          return d;
        });
      serial.current = next;
      return next;
    },
    [endpoint],
  );
  useEffect(() => {
    if (data?.presence !== "online" || !data.canEdit || busy) return;
    const ping = () => {
      if (!document.hidden)
        void publish("online", true)
          .then(() => mutate())
          .catch(() => setError("接客狀態待核對。"));
    };
    const timer = setInterval(ping, 45000);
    document.addEventListener("visibilitychange", ping);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [data?.presence, data?.canEdit, busy, mutate, publish]);
  useEffect(() => {
    const changed = () => {
      void mutate().catch(() => undefined);
    };
    window.addEventListener("convelta:data-changed", changed);
    return () => window.removeEventListener("convelta:data-changed", changed);
  }, [mutate]);
  const change = useCallback(
    async (event: MouseEvent<HTMLButtonElement>) => {
      const status = event.currentTarget.dataset.presence as Presence;
      if (!names[status]) return;
      const details = event.currentTarget.closest("details");
      setBusy(true);
      setError("");
      desired.current = status;
      try {
        await publish(status);
        await mutate();
        details?.removeAttribute("open");
      } catch (e) {
        setError(e instanceof Error ? e.message : "未能更新接客狀態。");
      } finally {
        setBusy(false);
      }
    },
    [publish, mutate],
  );
  if (!data || !names[data.presence]) return null;
  const uncertain = !!(readError || error),
    label = uncertain ? "狀態待核對" : names[data.presence];
  return (
    <details
      className="co-presence-control"
      data-status={uncertain ? "unknown" : data.presence}
    >
      <summary
        aria-label={`接客狀態：${label}${data.due ? `，${data.due} 項到期跟進` : ""}`}
      >
        <i />
        <span>{label}</span>
        {!!data.due && <b>{data.due}</b>}
      </summary>
      <div>
        {data.canEdit &&
          (Object.keys(names) as Presence[]).map((s) => (
            <button
              key={s}
              disabled={busy}
              aria-pressed={!uncertain && data.presence === s}
              data-presence={s}
              onClick={change}
            >
              {!uncertain && data.presence === s && <Check size={12} />}
              {names[s]}
            </button>
          ))}
        <Link href={`/company/${companyId}/crm?queue=overdue`}>
          <Clock3 size={13} />
          跟進與轉化{data.due ? ` · ${data.due}` : ""}
        </Link>
        {uncertain ? (
          <small role="status">{error || "資料未能更新，請稍後核對。"}</small>
        ) : (
          <small>在線狀態會隨工作頁面活動更新。</small>
        )}
      </div>
    </details>
  );
}
