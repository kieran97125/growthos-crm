import { ArrowDownLeft, ArrowUpRight, X } from "lucide-react";
import type { SegmentsPage } from "@/lib/segments/model";
import { formatHongKongDateTime } from "@/lib/datetime";
export type MemberCursor = { after?: string; before?: string };
export default function SegmentMembers({
  selected,
  refreshPending = false,
  error,
  page,
  onPage,
  onClose,
}: {
  selected: SegmentsPage["selected"];
  refreshPending?: boolean;
  error?: Error;
  page: MemberCursor;
  onPage: (patch: MemberCursor) => void;
  onClose: () => void;
}) {
  return (
    <section className="ds-members" aria-label="分眾客群與變動">
      <header>
        <h3>{selected?.name ?? "客群名單"}</h3>
        <button
          type="button"
          className="ds-icon"
          aria-label="關閉分眾客群"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </header>
      {error && (
        <p role="alert" className="ds-error">
          {error.message}
        </p>
      )}
      {!selected && !error && (
        <p role="status" className="ds-muted">
          正在讀取客群…
        </p>
      )}
      {selected && (
        <div className="ds-member-grid">
          <div>
            <h4>
              {refreshPending ? "上次客群" : "目前客群"}{" "}
              <span>{selected.count}</span>
            </h4>
            {selected.members.length ? (
              <ul>
                {selected.members.map((m) => (
                  <li key={m.customerId}>
                    <span>{m.name}</span>
                    <small>{formatHongKongDateTime(m.enteredAt)} 加入</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ds-muted">暫時未有符合條件嘅客人。</p>
            )}
            <div className="ds-pagination">
              {page.after && (
                <button
                  type="button"
                  onClick={() => onPage({ after: undefined })}
                >
                  第一頁
                </button>
              )}
              {selected.nextMember && (
                <button
                  type="button"
                  onClick={() => onPage({ after: selected.nextMember! })}
                >
                  下一頁客群
                </button>
              )}
            </div>
          </div>
          <div>
            <h4>加入與退出記錄</h4>
            {selected.events.length ? (
              <ul>
                {selected.events.map((e) => (
                  <li key={e.id} className="ds-event">
                    <span
                      className={
                        e.kind === "entered" ? "ds-event-in" : "ds-event-out"
                      }
                    >
                      {e.kind === "entered" ? (
                        <ArrowDownLeft size={15} />
                      ) : (
                        <ArrowUpRight size={15} />
                      )}
                    </span>
                    <div>
                      <strong>
                        {e.customerName} ·{" "}
                        {e.kind === "entered" ? "加入" : "退出"}
                      </strong>
                      <p>{e.reason}</p>
                      <small>{formatHongKongDateTime(e.at)}</small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ds-muted">名單改變時會喺呢度留下記錄。</p>
            )}
            <div className="ds-pagination">
              {page.before && (
                <button
                  type="button"
                  onClick={() => onPage({ before: undefined })}
                >
                  最新記錄
                </button>
              )}
              {selected.nextEvent && (
                <button
                  type="button"
                  onClick={() => onPage({ before: selected.nextEvent! })}
                >
                  較早記錄
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
