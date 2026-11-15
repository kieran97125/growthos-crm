import { z } from "zod";

export const memoryCategorySchema = z.enum([
  "need",
  "preference",
  "constraint",
  "context",
]);
export type MemoryCategory = z.infer<typeof memoryCategorySchema>;
export const memoryCategoryNames: Record<MemoryCategory, string> = {
  need: "客戶需要",
  preference: "偏好",
  constraint: "注意事項",
  context: "其他背景",
};
const id = z.string().min(1).max(100);
const reason = z
  .string()
  .trim()
  .min(3)
  .max(300)
  .refine((v) => v.isWellFormed());
const base = {
  commandId: z.uuid(),
  memoryId: z.uuid(),
  brandId: id,
  expectedRevision: z.number().int().nonnegative(),
  reason,
};
export const memoryCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      ...base,
      action: z.literal("save"),
      category: memoryCategorySchema,
      content: z
        .string()
        .trim()
        .min(1)
        .max(1000)
        .refine((v) => v.isWellFormed()),
    })
    .strict(),
  z.object({ ...base, action: z.literal("archive") }).strict(),
]);
export type MemoryCommand = z.infer<typeof memoryCommandSchema>;
export type CustomerMemory = {
  id: string;
  revision: number;
  category: MemoryCategory;
  content: string;
  status: "active" | "archived";
  updatedAt: string;
  actorName: string;
  reason: string;
  source: { kind: "staff"; label: string };
};
export type MemoryTimelineItem = {
  id: string;
  at: string;
  kind: string;
  title: string;
  summary: string;
  source: {
    type: string;
    id: string;
    label: string;
    href: string | null;
    threadId?: string;
    provider?: string;
  };
};
export type CustomerMemoryPage = {
  brandId: string;
  customerId: string;
  brands: { id: string; name: string }[];
  canEdit: boolean;
  memories: CustomerMemory[];
  history: CustomerMemory[];
  timeline: MemoryTimelineItem[];
  nextCursor: string | null;
  coverage: {
    timelinePageSize: number;
    historyLimit: number;
    moreHistory: boolean;
  };
};
export const memoryQuerySchema = z
  .object({ brandId: id.optional(), before: z.string().max(1000).optional() })
  .strict();
export const memoryCursorSchema = z
  .object({
    at: z.iso.datetime({ offset: true }),
    key: z.string().min(1).max(300),
  })
  .strict();
