import { z } from "zod";

export const inboxQueues = {
  all: "待跟進",
  mine: "我負責",
  unassigned: "待分派",
  overdue: "到期跟進",
  priority: "優先處理",
  unread: "未讀",
  resolved: "已處理",
} as const;
export type InboxQueue = keyof typeof inboxQueues;
export const inboxQuerySchema = z.object({
  queue: z
    .enum(Object.keys(inboxQueues) as [InboxQueue, ...InboxQueue[]])
    .default("all"),
  channel: z.enum(["all", "messenger", "instagram"]).default("all"),
  search: z.string().trim().max(100).default(""),
});
const plainText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => v.isWellFormed());
export const threadOperationsSchema = z
  .object({
    customer_name: plainText(100),
    assignee_id: z.uuid().nullable(),
    priority: z.enum(["normal", "high", "urgent"]),
    follow_up_at: z.iso.datetime({ offset: true }).nullable(),
    next_step: plainText(500),
    status: z.enum(["open", "resolved"]),
  })
  .strict();
export type ThreadOperations = z.infer<typeof threadOperationsSchema>;
export type InboxMember = { user_id: string; display_name: string };
export type ThreadActivity = {
  command_id: string;
  actor_name: string;
  created_at: string;
  previous: ThreadOperations;
  next: ThreadOperations;
};
export const priorityNames = { normal: "一般", high: "優先", urgent: "緊急" };

// datetime-local is deliberately displayed and interpreted as Hong Kong time,
// independent of the operator's computer or VPN time zone.
export function toHongKongInput(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return new Date(d.getTime() + 8 * 3600000).toISOString().slice(0, 16);
}
export function fromHongKongInput(value: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("請輸入有效嘅香港跟進時間。");
  const d = new Date(value + ":00+08:00");
  if (
    !Number.isFinite(d.getTime()) ||
    toHongKongInput(d.toISOString()) !== value
  )
    throw new Error("請輸入有效嘅香港跟進時間。");
  return d.toISOString();
}
export function operationsOf(t: Partial<ThreadOperations>): ThreadOperations {
  return {
    customer_name: t.customer_name ?? "",
    assignee_id: t.assignee_id ?? null,
    priority: t.priority ?? "normal",
    follow_up_at: t.follow_up_at ?? null,
    next_step: t.next_step ?? "",
    status: t.status ?? "open",
  };
}
