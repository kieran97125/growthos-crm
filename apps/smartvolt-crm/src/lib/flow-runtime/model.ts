import { z } from "zod";
import { flowSchema, type Flow } from "@/components/crm/studio/model";
import { validateFlow } from "@/components/crm/studio/engine";
import { definitionSchema, type EngagementPage } from "@/lib/engagement/model";

export const flowTriggers = {
  manual: "由同事開始",
  unanswered: "收到新查詢",
  appointment: "核實預約更新",
  completed: "實際服務完成",
} as const;
export const publishFlowSchema = z
  .object({
    commandId: z.uuid(),
    action: z.literal("publish"),
    flow: flowSchema,
    revision: z.number().int().nonnegative(),
    trigger: z.enum(["manual", "unanswered", "appointment", "completed"]),
    provider: z.enum(["whatsapp", "meta"]),
    connectionId: z.uuid(),
    purpose: z.enum(["service", "marketing"]),
    enabled: z.boolean(),
    deliveries: z
      .record(z.string().min(1).max(100), definitionSchema)
      .default({}),
  })
  .strict();
const base = { commandId: z.uuid(), flowId: z.string().min(1).max(100) };
export const flowActionSchema = z.discriminatedUnion("action", [
  publishFlowSchema,
  z
    .object({
      ...base,
      action: z.literal("toggle"),
      revision: z.number().int().positive(),
      enabled: z.boolean(),
    })
    .strict(),
  z
    .object({ ...base, action: z.literal("enroll"), threadId: z.uuid() })
    .strict(),
  z.object({ ...base, action: z.literal("cancel"), runId: z.uuid() }).strict(),
  z
    .object({
      ...base,
      action: z.literal("continue"),
      runId: z.uuid(),
      nodeId: z.string().min(1).max(100),
      bookingId: z.uuid().optional(),
      fields: z
        .object({
          service: z.string().trim().min(1).max(100),
          desiredAt: z.iso.datetime({ offset: true }),
          note: z.string().max(1000),
        })
        .strict()
        .optional(),
    })
    .strict(),
]);
export type FlowAction = z.infer<typeof flowActionSchema>;
export type FlowPublication = {
  flow_id: string;
  name: string;
  brand_id: string;
  revision: number;
  published_version: number;
  enabled: boolean;
  trigger_kind: keyof typeof flowTriggers;
  provider: "whatsapp" | "meta";
  connection_id: string;
  purpose: "service" | "marketing";
  graph: Flow;
  deliveries: Record<string, z.infer<typeof definitionSchema>>;
  active: number;
  updated_at: string;
};
export type FlowRun = {
  id: string;
  flow_id: string;
  version: number;
  customer_name: string;
  provider: "whatsapp" | "meta";
  thread_id: string;
  state:
    | "active"
    | "waiting"
    | "review"
    | "form"
    | "delivery"
    | "completed"
    | "stopped"
    | "handoff";
  reason: string | null;
  node_id: string;
  node_title: string;
  due_at: string;
  created_at: string;
  updated_at: string;
  steps: {
    node_id: string;
    kind: string;
    state: string;
    detail: Record<string, unknown>;
    created_at: string;
  }[];
  bookings: { id: string; service: string; desiredAt: string }[];
};
export type FlowRuntimePage = {
  canManage: boolean;
  canEdit: boolean;
  hasPos: boolean;
  publication: FlowPublication | null;
  runs: FlowRun[];
  nextCursor: string | null;
  connections: EngagementPage["connections"];
  templates: EngagementPage["templates"];
  threads: {
    id: string;
    provider: "whatsapp" | "meta";
    name: string;
    channel: string;
    brand_id: string;
    connection_id: string;
  }[];
};
/** Publication uses the same arbitrary graph as the canvas, never a fixed recipe. */
export function validateLiveFlow(
  flow: Flow,
  provider: "whatsapp" | "meta",
  deliveries: Record<string, unknown> = {},
) {
  const issues = validateFlow(flow);
  for (const n of flow.nodes) {
    if (n.kind === "message" && !n.config.message.trim())
      issues.push(`${n.title}：請填寫回覆內容。`);
    if (n.kind === "handoff" && !z.uuid().safeParse(n.config.owner).success)
      issues.push(`${n.title}：請選擇公司同事。`);
    if (n.kind === "delay" && !Number.isInteger(n.config.waitHours))
      issues.push(`${n.title}：等待時間需要整數小時。`);
    const d = deliveries[n.id];
    if (
      !d &&
      n.kind === "reminder" &&
      !definitionSchema.safeParse({
        kind: "text",
        body: n.config.template,
        values: [],
      }).success
    )
      issues.push(
        `${n.title}：正式提醒可用姓名、品牌、服務、日期及時間；請移除未核實嘅費用或分店變數。`,
      );
    if (d && !["message", "reminder"].includes(n.kind))
      issues.push(`${n.title}：此節點不適用訊息模板。`);
    if (d) {
      const parsed = definitionSchema.safeParse(d);
      if (
        !parsed.success ||
        (provider === "meta" &&
          (parsed.data.kind !== "text" || parsed.data.body.length > 1000))
      )
        issues.push(`${n.title}：訊息或模板設定不適用此渠道。`);
    } else if (
      provider === "meta" &&
      n.kind === "message" &&
      n.config.message.length > 1000
    )
      issues.push(`${n.title}：Meta 文字最多1,000字。`);
  }
  if (
    Object.keys(deliveries).some((id) => !flow.nodes.some((n) => n.id === id))
  )
    issues.push("模板對應嘅節點已不存在。");
  return [...new Set(issues)];
}
