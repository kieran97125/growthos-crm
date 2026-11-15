import type { SegmentRule } from "@/lib/segments/model";
export const names: Record<SegmentRule["kind"], string> = {
  tag: "客戶標籤",
  stage: "跟進階段",
  channel: "查詢渠道",
  inactive: "一段時間未有查詢",
  recent_inbound: "最近有新查詢",
  booking: "核實預約",
  visit: "核實到店",
  payment: "核實付款",
};
export const channels = {
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram",
  website: "官網",
};
export function defaultRule(
  kind: SegmentRule["kind"],
  stages: { id: string; name: string }[],
): SegmentRule {
  switch (kind) {
    case "inactive":
      return { kind, days: 30 };
    case "recent_inbound":
      return { kind, days: 7 };
    case "booking":
      return { kind, value: "none" };
    case "visit":
      return { kind, value: "never" };
    case "payment":
      return { kind, value: "paid" };
    case "channel":
      return { kind, value: "whatsapp" };
    case "stage":
      return { kind, value: stages[0]?.id ?? "new" };
    default:
      return { kind, value: "" };
  }
}
export function describe(
  rule: SegmentRule,
  stages: { id: string; name: string }[],
) {
  switch (rule.kind) {
    case "inactive":
      return `${rule.days} 日未有查詢`;
    case "recent_inbound":
      return `最近 ${rule.days} 日有查詢`;
    case "tag":
      return `標籤：${rule.value}`;
    case "stage":
      return stages.find((s) => s.id === rule.value)?.name ?? "指定跟進階段";
    case "channel":
      return channels[rule.value];
    case "booking":
      return rule.value === "none" ? "未有核實預約" : "已有核實預約";
    case "visit":
      return rule.value === "never" ? "未有核實到店" : "已有核實到店";
    case "payment":
      return rule.value === "paid" ? "已有核實付款" : "未有核實付款";
  }
}
