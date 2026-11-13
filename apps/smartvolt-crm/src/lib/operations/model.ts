import { z } from "zod";

const id = z.string().trim().min(1).max(100);
const text = (n: number) =>
  z
    .string()
    .trim()
    .max(n)
    .refine((s) => s.isWellFormed());
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const stageSchema = z
  .object({
    id,
    name: text(30).min(1),
    tone: z.enum(["slate", "blue", "violet", "amber", "green", "rose"]),
    kind: z.enum(["open", "won", "lost"]),
    active: z.boolean(),
  })
  .strict();
export type LifecycleStage = z.infer<typeof stageSchema>;
export const routingRuleSchema = z
  .object({
    id: z.uuid(),
    name: text(60).min(1),
    enabled: z.boolean(),
    brandId: id.nullable(),
    channel: z.enum(["all", "whatsapp", "messenger", "instagram"]),
    team: text(40),
    tags: z.array(text(40).min(1)).max(10),
    method: z.enum(["least_open", "round_robin"]),
    onlineOnly: z.boolean(),
    maxOpen: z.number().int().min(1).max(500),
  })
  .strict();
export type RoutingRule = z.infer<typeof routingRuleSchema>;
export const settingsSchema = z
  .object({
    routingEnabled: z.boolean(),
    rules: z.array(routingRuleSchema).max(20),
    followupsEnabled: z.boolean(),
    followupStageIds: z.array(id).max(20),
    followupMinutes: z.number().int().min(5).max(43200),
    stages: z.array(stageSchema).min(2).max(20),
  })
  .strict()
  .superRefine((v, ctx) => {
    for (const key of ["stages", "rules"] as const) {
      if (new Set(v[key].map((x) => x.id)).size !== v[key].length)
        ctx.addIssue({
          code: "custom",
          message: "每個項目必須有獨立識別碼。",
          path: [key],
        });
    }
    const names = v.stages
      .filter((s) => s.active)
      .map((s) => s.name.normalize("NFKC").toLocaleLowerCase());
    if (new Set(names).size !== names.length)
      ctx.addIssue({
        code: "custom",
        message: "啟用中嘅階段名稱需要清楚分開。",
        path: ["stages"],
      });
    if (!v.stages.some((s) => s.id === "new" && s.active && s.kind === "open"))
      ctx.addIssue({
        code: "custom",
        message: "請保留啟用中的新查詢階段。",
        path: ["stages"],
      });
    if (
      v.followupStageIds.some(
        (key) =>
          !v.stages.some((s) => s.id === key && s.active && s.kind === "open"),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "跟進流程只適用於啟用中的待跟進階段。",
        path: ["followupStageIds"],
      });
  });
export type OperationsSettings = z.infer<typeof settingsSchema>;
export const defaultSettings: OperationsSettings = {
  routingEnabled: false,
  rules: [],
  followupsEnabled: false,
  followupStageIds: ["qualified"],
  followupMinutes: 120,
  stages: [
    { id: "new", name: "新查詢", tone: "slate", kind: "open", active: true },
    {
      id: "qualified",
      name: "有意向",
      tone: "blue",
      kind: "open",
      active: true,
    },
    {
      id: "booking",
      name: "安排預約",
      tone: "violet",
      kind: "open",
      active: true,
    },
    {
      id: "customer",
      name: "已成交",
      tone: "green",
      kind: "won",
      active: true,
    },
    { id: "lost", name: "已流失", tone: "rose", kind: "lost", active: true },
  ],
};
const command = { commandId: z.uuid() };
const thread = { provider: z.enum(["meta", "whatsapp"]), threadId: z.uuid() };
export const operationsAction = z.discriminatedUnion("action", [
  z
    .object({
      ...command,
      action: z.literal("settings"),
      revision,
      data: settingsSchema,
    })
    .strict(),
  z
    .object({
      ...command,
      action: z.literal("stage"),
      customerId: id,
      brandId: id,
      revision,
      stageId: id,
      reason: text(500).min(1),
    })
    .strict(),
  z
    .object({
      ...command,
      action: z.literal("agent"),
      userId: z.uuid(),
      revision,
      team: text(40),
      capacity: z.number().int().min(1).max(500),
      brandIds: z.array(id).max(100),
      paused: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("presence"),
      status: z.enum(["online", "away", "offline"]),
    })
    .strict(),
  z
    .object({
      ...command,
      ...thread,
      action: z.literal("handoff"),
      requestId: z.uuid(),
      revision,
      customerId: id,
      linkRevision: revision,
      lifecycleRevision: revision,
      stageId: id.nullable(),
      reason: text(500),
    })
    .strict(),
  z
    .object({
      ...command,
      ...thread,
      action: z.literal("followup-create"),
      title: text(200).min(1),
      dueAt: z.iso.datetime({ offset: true }),
      ownerId: z.uuid().nullable(),
    })
    .strict(),
  z
    .object({
      ...command,
      action: z.literal("followup-update"),
      id: z.uuid(),
      revision,
      status: z.enum(["open", "done", "cancelled"]),
      dueAt: z.iso.datetime({ offset: true }).nullable(),
    })
    .strict(),
]);
export type OperationsAction = z.infer<typeof operationsAction>;
export const operationsQuery = z
  .object({
    brand: id.optional(),
    stage: id.optional(),
    search: text(100).default(""),
    after: z.string().max(500).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .strict();
export type LifecycleRecord = {
  key: string;
  customer_id: string;
  brand_id: string;
  name: string;
  stage_id: string;
  revision: number;
  reason: string;
  updated_at: string;
  priority: string;
  owner_name: string | null;
  follow_up_at: string | null;
  provider: "meta" | "whatsapp" | null;
  thread_id: string | null;
  interest: string | null;
  summary: string | null;
  next_step: string | null;
};
export type Followup = {
  id: string;
  customer_id: string;
  brand_id: string;
  provider: "meta" | "whatsapp";
  thread_id: string;
  name: string;
  title: string;
  due_at: string;
  owner_id: string | null;
  status: "open" | "done" | "cancelled";
  revision: number;
  owner_name: string | null;
  owner_active?: boolean;
};
export type OperationsPage = {
  companyId: string;
  actorId: string;
  canEdit: boolean;
  canManage: boolean;
  hasPos: boolean;
  settings: OperationsSettings;
  revision: number;
  stages: (LifecycleStage & { count: number })[];
  records: LifecycleRecord[];
  nextCursor: string | null;
  followups: Followup[];
  followupCount: number;
  metrics: {
    inquiries: number;
    confirmedBookings: number;
    attended: number;
    overdue: number;
    unassigned: number;
    receivedCents: number | null;
    refundedCents: number | null;
  };
  members: {
    user_id: string;
    display_name: string;
    role: string;
    team: string;
    capacity: number;
    brand_ids: string[];
    paused: boolean;
    revision: number;
    presence: "online" | "away" | "offline";
    open_count: number;
  }[];
  brands: { id: string; name: string }[];
  period: { from: string; to: string };
  checkedAt: string;
};
export type OperationsContext = {
  lifecycle: {
    customer_id: string;
    brand_id: string;
    stage_id: string;
    revision: number;
    reason: string;
  };
  stages: LifecycleStage[];
  followups: Followup[];
  handoff: {
    summary: string;
    interest: string;
    next_step: string;
    created_at: string;
  } | null;
  canEdit: boolean;
  actorId: string;
  canManage: boolean;
};
export type FollowupPage = {
  tasks: Followup[];
  nextCursor: string | null;
  total: number;
};
export const interestNames = {
  high: "高意向",
  medium: "了解中",
  low: "低意向",
  unknown: "待了解",
};
export function inquiryHref(
  company: string,
  provider: string,
  threadId: string,
) {
  return `/company/${company}/crm?${new URLSearchParams({ provider, thread: threadId })}`;
}
