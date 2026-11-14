import { z } from "zod";
import { definitionSchema, type MessageDefinition } from "./model";
export const recipeNames = {
  unanswered: "未覆客人",
  appointment: "預約提醒",
  completed: "服務後關心",
};
export const recipeDescriptions = {
  unanswered: "客人發訊息後仍未有同事回覆，按時間跟進。",
  appointment: "跟住已確認預約嘅實際時間，喺到訪前提醒。",
  completed: "POS 確認服務完成後，再送上關心訊息。",
};
const publish = z
  .object({
    action: z.literal("publish"),
    commandId: z.uuid(),
    id: z.uuid(),
    revision: z.number().int().nonnegative(),
    name: z.string().trim().min(1).max(100),
    brandId: z.string().min(1).max(100),
    provider: z.enum(["whatsapp", "meta"]),
    connectionId: z.uuid(),
    recipe: z.enum(["unanswered", "appointment", "completed"]),
    purpose: z.enum(["marketing", "service"]),
    enabled: z.boolean(),
    steps: z
      .array(
        z
          .object({
            delayMinutes: z.number().int().min(5).max(43200),
            definition: definitionSchema,
          })
          .strict(),
      )
      .min(1)
      .max(4),
  })
  .strict()
  .superRefine((d, c) => {
    if (
      d.steps.some(
        (s, i) =>
          i > 0 &&
          (d.recipe === "appointment"
            ? s.delayMinutes >= d.steps[i - 1].delayMinutes
            : s.delayMinutes <= d.steps[i - 1].delayMinutes),
      )
    )
      c.addIssue({
        code: "custom",
        message: "預約提醒由較早時間排到較近時間；其他跟進由短至長。",
      });
  });
export const journeyAction = z.union([
  publish,
  z
    .object({
      action: z.literal("toggle"),
      commandId: z.uuid(),
      id: z.uuid(),
      revision: z.number().int().nonnegative(),
      enabled: z.boolean(),
    })
    .strict(),
]);
export type Journey = {
  id: string;
  brand_id: string;
  name: string;
  recipe: keyof typeof recipeNames;
  provider: "whatsapp" | "meta";
  connection_id: string;
  purpose: "marketing" | "service";
  enabled: boolean;
  revision: number;
  published_version: number;
  created_at: string;
  active_runs: number;
  accepted: number;
  steps: { delayMinutes: number; definition: MessageDefinition }[];
};
export type JourneyPage = {
  journeys: Journey[];
  canManage: boolean;
  hasPos: boolean;
  nextCursor: string | null;
};
