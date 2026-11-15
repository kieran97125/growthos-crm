import { z } from "zod";
const label = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((s) => s.isWellFormed());
export const segmentRuleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tag"), value: label(40).min(1) }).strict(),
  z.object({ kind: z.literal("stage"), value: label(100).min(1) }).strict(),
  z
    .object({
      kind: z.literal("channel"),
      value: z.enum(["whatsapp", "messenger", "instagram", "website"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("inactive"),
      days: z.number().int().min(1).max(3650),
    })
    .strict(),
  z
    .object({
      kind: z.literal("recent_inbound"),
      days: z.number().int().min(1).max(3650),
    })
    .strict(),
  z
    .object({
      kind: z.literal("booking"),
      value: z.enum(["none", "confirmed"]),
    })
    .strict(),
  z
    .object({ kind: z.literal("visit"), value: z.enum(["never", "visited"]) })
    .strict(),
  z
    .object({ kind: z.literal("payment"), value: z.enum(["unpaid", "paid"]) })
    .strict(),
]);
export type SegmentRule = z.infer<typeof segmentRuleSchema>;
export const segmentDefinitionSchema = z
  .object({
    brandId: label(100).min(1),
    mode: z.enum(["all", "any"]),
    rules: z.array(segmentRuleSchema).min(1).max(10),
    includePos: z.boolean().default(false),
  })
  .strict()
  .superRefine((x, c) => {
    if (
      !x.includePos &&
      x.rules.some((r) => r.kind === "visit" || r.kind === "payment")
    )
      c.addIssue({ code: "custom", message: "到店及收款條件需要 POS 權限。" });
  });
const definition = {
  brandId: label(100).min(1),
  mode: z.enum(["all", "any"]),
  rules: z.array(segmentRuleSchema).min(1).max(10),
  includePos: z.boolean().default(false),
};
export const segmentActionSchema = z
  .discriminatedUnion("action", [
    z.object({ action: z.literal("preview"), ...definition }).strict(),
    z
      .object({
        action: z.literal("upsert"),
        commandId: z.uuid(),
        id: z.uuid(),
        name: label(100).min(1),
        enabled: z.boolean(),
        revision: z.number().int().min(0),
        ...definition,
      })
      .strict(),
    z
      .object({
        action: z.literal("refresh"),
        commandId: z.uuid(),
        id: z.uuid(),
      })
      .strict(),
  ])
  .superRefine((x, c) => {
    if (
      x.action !== "refresh" &&
      !x.includePos &&
      x.rules.some((r) => r.kind === "visit" || r.kind === "payment")
    )
      c.addIssue({ code: "custom", message: "到店及收款條件需要 POS 權限。" });
  });
export type DynamicSegment = {
  id: string;
  brandId: string;
  name: string;
  mode: "all" | "any";
  rules: SegmentRule[];
  includePos: boolean;
  enabled: boolean;
  revision: number;
  count: number;
  evaluatedAt: string | null;
  sourceStamp: string | null;
  lastError: string | null;
};
export type SegmentMember = {
  customerId: string;
  name: string;
  enteredAt: string;
};
export type SegmentEvent = {
  id: string;
  customerId: string;
  customerName: string;
  kind: "entered" | "exited";
  at: string;
  reason: string;
  segmentRevision: number;
};
export type SegmentsPage = {
  refreshPending?: boolean;
  stages: { id: string; name: string }[];
  brands: { id: string; name: string }[];
  canManage: boolean;
  hasPos: boolean;
  segments: DynamicSegment[];
  selected?: DynamicSegment & {
    members: SegmentMember[];
    events: SegmentEvent[];
    nextMember: string | null;
    nextEvent: string | null;
  };
};
export type SegmentPreview = {
  preview: { total: number; sample: { customerId: string; name: string }[] };
};
