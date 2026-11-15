import { Trash2 } from "lucide-react";
import type { SegmentRule } from "@/lib/segments/model";
import { names, channels, defaultRule } from "./rules";

export default function RuleEditor({
  rule,
  index,
  stages,
  includePos,
  canRemove,
  onChange,
  onRemove,
}: {
  rule: SegmentRule;
  index: number;
  stages: { id: string; name: string }[];
  includePos: boolean;
  canRemove: boolean;
  onChange: (r: SegmentRule) => void;
  onRemove: () => void;
}) {
  const values =
    rule.kind === "booking"
      ? [
          { value: "none", label: "未有核實預約" },
          { value: "confirmed", label: "已有核實預約" },
        ]
      : rule.kind === "visit"
        ? [
            { value: "never", label: "未有核實到店" },
            { value: "visited", label: "已有核實到店" },
          ]
        : rule.kind === "payment"
          ? [
              { value: "paid", label: "已有核實付款" },
              { value: "unpaid", label: "未有核實付款" },
            ]
          : rule.kind === "stage"
            ? stages.map((s) => ({ value: s.id, label: s.name }))
            : Object.entries(channels).map(([value, label]) => ({
                value,
                label,
              }));
  return (
    <div className="ds-rule">
      <span className="ds-rule-number">{index + 1}</span>
      <label className="ds-sr">
        條件 {index + 1} 類型
        <select
          aria-label={`條件 ${index + 1} 類型`}
          value={rule.kind}
          onChange={(e) =>
            onChange(defaultRule(e.target.value as SegmentRule["kind"], stages))
          }
        >
          {Object.entries(names)
            .filter(
              ([k]) =>
                ((k !== "visit" && k !== "payment") || includePos) &&
                (k !== "stage" || stages.length || rule.kind === "stage"),
            )
            .map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
        </select>
      </label>
      {"days" in rule ? (
        <label className="ds-days">
          <input
            aria-label={`條件 ${index + 1} 日數`}
            type="number"
            min={1}
            max={3650}
            value={rule.days}
            onChange={(e) =>
              onChange({ ...rule, days: Number(e.target.value) })
            }
          />
          <span>日</span>
        </label>
      ) : rule.kind === "tag" ? (
        <input
          aria-label={`條件 ${index + 1} 標籤`}
          maxLength={40}
          value={rule.value}
          placeholder="輸入客戶標籤"
          onChange={(e) => onChange({ kind: "tag", value: e.target.value })}
        />
      ) : (
        <select
          aria-label={`條件 ${index + 1} 值`}
          value={rule.value}
          onChange={(e) =>
            onChange({ ...rule, value: e.target.value } as SegmentRule)
          }
        >
          {values.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        className="ds-icon"
        aria-label={`移除條件 ${index + 1}`}
        disabled={!canRemove}
        onClick={onRemove}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
