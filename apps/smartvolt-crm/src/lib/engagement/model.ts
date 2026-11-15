import { z } from "zod";
const label = (n: number) =>
  z
    .string()
    .trim()
    .max(n)
    .refine((s) => s.isWellFormed());
const brand = label(100).min(1);
export const definitionSchema = z
  .object({
    kind: z.enum(["text", "template"]),
    body: label(4096).min(1),
    name: z
      .string()
      .regex(/^[a-z0-9_]{1,512}$/)
      .optional(),
    locale: z
      .string()
      .regex(/^[A-Za-z_]{2,20}$/)
      .optional(),
    fingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    values: z
      .array(
        z
          .object({
            component: z.enum(["header", "body"]),
            key: z.string().regex(/^(?:[1-9]\d?|[a-z][a-z0-9_]{0,29})$/),
            value: label(1024).min(1),
          })
          .strict(),
      )
      .max(40)
      .default([]),
  })
  .strict()
  .superRefine((d, c) => {
    if (d.kind === "template" && (!d.name || !d.locale || !d.fingerprint))
      c.addIssue({ code: "custom", message: "請選擇正式模板。" });
    if (
      (d.kind === "text" &&
        /{{(?!(?:name|brand|date|time|service)}})/.test(d.body)) ||
      d.values.some((v) =>
        /{{(?!(?:name|brand|date|time|service)}})/.test(v.value),
      )
    )
      c.addIssue({
        code: "custom",
        message: "可用姓名、品牌、預約日期、時間及服務變數。",
      });
    if (
      new Set(d.values.map((v) => v.component + ":" + v.key)).size !==
      d.values.length
    )
      c.addIssue({ code: "custom", message: "模板欄位重複。" });
  });
export type MessageDefinition = z.infer<typeof definitionSchema>;
export const audienceSchema = z
  .object({
    tag: label(40).default(""),
    stage: brand.optional(),
    customer: brand.optional(),
    segmentId: z.uuid().optional(),
  })
  .strict();
const campaign = {
  id: z.uuid(),
  brandId: brand,
  provider: z.enum(["whatsapp", "meta"]),
  connectionId: z.uuid(),
  name: label(100).min(1),
  purpose: z.enum(["marketing", "service"]),
  definition: definitionSchema,
  audience: audienceSchema,
  dueAt: z.iso.datetime({ offset: true }),
};
const command = { commandId: z.uuid() };
export const engagementAction = z.discriminatedUnion("action", [
  z.object({ ...command, action: z.literal("campaign"), ...campaign }).strict(),
  z
    .object({
      ...command,
      action: z.literal("manual"),
      ...campaign,
      editorToken: z.uuid(),
      threadId: z.uuid(),
    })
    .strict(),
  z.object({ ...command, action: z.literal("cancel"), id: z.uuid() }).strict(),
  z
    .object({
      ...command,
      action: z.literal("preference"),
      customerId: brand,
      brandId: brand,
      channel: z.enum(["whatsapp", "messenger", "instagram"]),
      purpose: z.enum(["marketing", "service"]),
      allowed: z.boolean(),
      source: label(500).min(1),
      revision: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      ...command,
      action: z.literal("policy"),
      marketingEnabled: z.boolean(),
      executionPaused: z.boolean().default(false),
      quietStart: z.number().int().min(0).max(23),
      quietEnd: z.number().int().min(0).max(23),
      frequencyHours: z.number().int().min(1).max(720),
      dailyLimit: z.number().int().min(1).max(10000),
      minuteLimit: z.number().int().min(1).max(100),
      revision: z.number().int().nonnegative(),
    })
    .strict(),
  z.object({ action: z.literal("templates"), connectionId: z.uuid() }).strict(),
]);
export type DeliveryState =
  | "scheduled"
  | "dispatching"
  | "accepted"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "unknown"
  | "skipped"
  | "cancelled";
export const stateNames: Record<DeliveryState, string> = {
  scheduled: "已排程",
  dispatching: "提交中",
  accepted: "平台已接納",
  sent: "已發送",
  delivered: "已送達",
  read: "已讀",
  failed: "未能發送",
  unknown: "待平台確認",
  skipped: "未符合資格",
  cancelled: "已取消",
};
export const reasonNames: Record<string, string> = {
  segment_changed: "客人已不符合所選分眾，今次訊息已停止。",
  source_details_missing: "預約資料未齊，已略過提醒",
  execution_paused: "公司已暫停自動排程",
  human_takeover: "真人已接手，已停止自動訊息",
  authority_changed: "同事權限已更改",
  customer_changed: "客戶連結已更改",
  campaign_cancelled: "推播已取消",
  marketing_disabled: "公司未開啟營銷發送",
  consent_missing: "未記錄客戶同意",
  consent_withdrawn: "客戶已退出",
  connection_not_ready: "渠道未完成連接",
  window_closed: "回覆時限已過",
  template_changed: "模板已改變或未獲批准",
  quiet_hours: "安靜時段，已延後",
  frequency_limit: "已達客戶聯絡頻率",
  daily_limit: "已達每日上限，已延後",
  minute_limit: "分批發送中",
  worker_interrupted: "提交結果待核對",
  send_unresolved: "上一則訊息仍待確認",
  provider_rejected: "平台拒絕",
  provider_auth: "渠道授權需要更新",
  delivery_unknown: "平台回報待確認",
};
export type Template = {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  fingerprint: string;
  supported: boolean;
  body: string;
  slots: { component: "header" | "body"; key: string }[];
  components: unknown[];
};
export type Campaign = {
  id: string;
  name: string;
  brand_id: string;
  channel: string;
  purpose: string;
  status: string;
  due_at: string;
  created_at: string;
  total: number;
  counts: Partial<Record<DeliveryState, number>>;
};
export type EngagementPage = {
  canManage: boolean;
  canManageCompany: boolean;
  canEdit: boolean;
  brands: { id: string; name: string }[];
  connections: {
    id: string;
    brand_id: string;
    provider: "whatsapp" | "meta";
    channel: string;
    label: string;
    ready: boolean;
    inbound: boolean;
    accepted: boolean;
    delivered: boolean;
  }[];
  templates: {
    connection_id: string;
    templates: Template[];
    checked_at: string;
  }[];
  campaigns: Campaign[];
  nextCampaign: string | null;
  policy: {
    marketing_enabled: boolean;
    automations_paused?: boolean;
    quiet_start: number;
    quiet_end: number;
    frequency_hours: number;
    daily_limit: number;
    minute_limit: number;
    revision: number;
  };
  results: {
    id: string;
    customer_id: string;
    customer_name: string;
    state: DeliveryState;
    reason: string | null;
    due_at: string;
    updated_at: string;
  }[];
  nextResult: string | null;
  resultTotal: number;
  resultCounts: Partial<Record<DeliveryState, number>>;
  preferences: {
    customer_id: string;
    brand_id: string;
    channel: string;
    purpose: string;
    allowed: boolean;
    source: string;
    revision: number;
  }[];
  audience: {
    total: number;
    consented: number;
    sample: { customer_id: string; customer_name: string }[];
  } | null;
};
