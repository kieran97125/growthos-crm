import { ChevronDown, Clock3 } from "lucide-react";
import type { DynamicSegment } from "@/lib/segments/model";
import { formatHongKongDateTime } from "@/lib/datetime";
import { describe } from "./rules";
export default function SegmentCard({
  segment: s,
  refreshPending = false,
  selected,
  stages,
  canManage,
  editing,
  onSelect,
  onEdit,
}: {
  segment: DynamicSegment;
  refreshPending?: boolean;
  selected: boolean;
  stages: { id: string; name: string }[];
  canManage: boolean;
  editing: boolean;
  onSelect: () => void;
  onEdit: () => void;
}) {
  return (
    <article className={`ds-card${selected ? " ds-selected" : ""}`}>
      <div className="ds-card-top">
        <div>
          <h3>{s.name}</h3>
          <span className={s.enabled ? "ds-state" : "ds-state ds-paused"}>
            {s.enabled ? "自動更新" : "已暫停"}
          </span>
        </div>
        <strong>
          {s.count}
          <small>{refreshPending ? "位 · 上次結果" : "位客人"}</small>
        </strong>
      </div>
      <p className="ds-rule-summary">
        {s.mode === "all" ? "全部符合" : "符合其中一項"} ·{" "}
        {s.rules.map((r) => describe(r, stages)).join(" · ")}
      </p>
      {s.lastError && (
        <p className="ds-error">未能完成更新，保留上次名單。{s.lastError}</p>
      )}
      <footer>
        <span>
          <Clock3 size={13} />
          {s.evaluatedAt
            ? formatHongKongDateTime(s.evaluatedAt)
            : "等候首次更新"}
        </span>
        <div>
          <button type="button" aria-expanded={selected} onClick={onSelect}>
            查看客群
            <ChevronDown size={14} />
          </button>
          {canManage && (
            <button type="button" disabled={editing} onClick={onEdit}>
              編輯
            </button>
          )}
        </div>
      </footer>
    </article>
  );
}
