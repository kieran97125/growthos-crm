"use client";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { X } from "lucide-react";
import {
  stateNames,
  reasonNames,
  type DeliveryState,
} from "@/lib/engagement/model";
import { engagementFetcher } from "./fetcher";
import { formatHongKongDateTime } from "@/lib/datetime";
const reasons: Record<string, string> = {
  customer_replied: "客人已回覆",
  human_replied: "同事已回覆",
  human_takeover: "真人已接手",
  customer_booked: "客人已有預約",
  source_changed: "預約或對話資料已改變",
  journey_changed: "流程已暫停或改版",
};
type History = {
  total: number;
  nextCursor: string | null;
  runs: {
    id: string;
    version: number;
    created_at: string;
    status: string;
    reason: string | null;
    customer_name: string;
    jobs: {
      id: string;
      state: DeliveryState;
      reason: string | null;
      due_at: string;
      updated_at: string;
    }[];
  }[];
};
const date = formatHongKongDateTime;
export default function JourneyHistory({
  companyId,
  journey,
  onClose,
}: {
  companyId: string;
  journey: { id: string; name: string };
  onClose: () => void;
}) {
  const [cursor, setCursor] = useState(""),
    dialog = useRef<HTMLDialogElement>(null);
  const { data, error } = useSWR<History>(
    `/api/companies/${companyId}/journeys/${journey.id}?${cursor}`,
    engagementFetcher,
    { refreshInterval: 10000, keepPreviousData: false },
  );
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="eng-dialog eng-results"
      aria-labelledby="eng-journey-history"
      onClose={onClose}
    >
      <header className="eng-dialog-head">
        <div>
          <span className="eng-eyebrow">JOURNEY HISTORY</span>
          <h2 id="eng-journey-history">{journey.name}</h2>
        </div>
        <button
          aria-label="關閉流程紀錄"
          onClick={() => dialog.current?.close()}
        >
          <X size={20} />
        </button>
      </header>
      {error && <p role="alert">{error.message}</p>}
      {data ? (
        <>
          <p>共 {data.total} 個實際觸發紀錄 · 香港時間</p>
          {data.runs.length ? (
            data.runs.map((r) => (
              <article className="eng-history-run" key={r.id}>
                <h3>
                  {r.customer_name}
                  <small>第 {r.version} 版</small>
                </h3>
                <p>
                  {date(r.created_at)} ·{" "}
                  {r.status === "active"
                    ? "跟進中"
                    : r.status === "completed"
                      ? "已執行完畢"
                      : "已停止"}
                  {r.reason
                    ? " · " +
                      (reasons[r.reason] ??
                        reasonNames[r.reason] ??
                        "來源已更新")
                    : ""}
                </p>
                <div className="eng-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>排程時間</th>
                        <th>結果</th>
                        <th>原因</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.jobs.map((j) => (
                        <tr key={j.id}>
                          <td>{date(j.due_at)}</td>
                          <td>{stateNames[j.state]}</td>
                          <td>
                            {j.reason
                              ? (reasons[j.reason] ??
                                reasonNames[j.reason] ??
                                "需核對渠道紀錄")
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))
          ) : (
            <p>啟用後有符合情境嘅客戶，實際執行紀錄就會出現。</p>
          )}
          <div className="eng-pagination">
            {cursor && <button onClick={() => setCursor("")}>第一頁</button>}
            {data.nextCursor && (
              <button onClick={() => setCursor(data.nextCursor!)}>
                下一頁
              </button>
            )}
          </div>
        </>
      ) : !error ? (
        <p role="status">讀取執行紀錄中…</p>
      ) : null}
    </dialog>
  );
}
