import { z } from "zod";
export const productSchema = z.enum(["crm", "pos"]);
export const copilotContext = z
  .object({
    product: productSchema,
    section: z.string().max(40),
    brandId: z.string().min(1).max(100).optional(),
    customerId: z.string().min(1).max(100).optional(),
    activity: z
      .enum(["viewing", "tagging", "replying", "campaign", "booking"])
      .default("viewing"),
  })
  .strict();
export type CopilotContext = z.infer<typeof copilotContext>;
const count = z.number().int().nonnegative();
export const snapshotSchema = z.object({
  at: z.string(),
  from: z.string(),
  product: productSchema,
  brandId: z.string().nullable(),
  revision: count,
  brands: z.array(z.object({ id: z.string(), name: z.string() })),
  customers: count,
  inquiries: count,
  confirmed: count,
  overdue: count,
  dormant: count,
  untagged: count,
  segments: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      leads: count,
      booked: count,
    }),
  ),
  pos: z
    .object({
      appointments: count,
      completed: count,
      noShow: count,
      revenueCents: z.number().int(),
    })
    .nullable(),
  customer: z
    .object({
      id: z.string(),
      tags: z.array(z.string()),
      revision: count,
      lastMessage: z.string(),
      lastMessageAt: z.number().nullable(),
      booked: z.boolean(),
    })
    .nullable(),
  knowledge: z.array(
    z.object({
      id: z.string(),
      brandId: z.string(),
      title: z.string(),
      content: z.string(),
      source: z.string(),
      revision: count,
    }),
  ),
  channels: z.object({ connected: count }),
  lastBroadcastAt: z.string().nullable(),
  broadcastCoverage: z.enum(["verified", "unavailable"]),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Observation = {
  key: string;
  family: string;
  subject: string;
  kind: "tag" | "followup" | "campaign" | "conversion" | "setup";
  title: string;
  detail: string;
  evidence: string[];
  priority: number;
  prompt: string;
  action:
    | { kind: "tag"; customerId: string; tag: string; revision: number }
    | { kind: "open"; path: string }
    | { kind: "campaign"; audience: string };
};
export const outputSchema = z.object({
  answer: z
    .string()
    .min(1)
    .max(6000)
    .describe(
      "Natural concise Traditional Chinese Cantonese. Cite fact IDs in square brackets. Be specific and state missing data honestly.",
    ),
  factIds: z.array(z.string().max(100)).max(16),
  evidence: z
    .array(
      z.object({
        factId: z.string().max(100),
        quote: z.string().min(1).max(400),
      }),
    )
    .max(12),
  nextQuestions: z.array(z.string().max(120)).max(3),
  campaign: z
    .object({
      title: z.string().max(100),
      objective: z.string().max(300),
      audience: z.string().max(500),
      message: z.string().max(1800),
      steps: z.array(z.string().max(250)).max(6),
      measures: z.array(z.string().max(150)).max(5),
    })
    .nullable(),
});
export type CopilotOutput = z.infer<typeof outputSchema>;
export type CopilotAnswer = CopilotOutput & {
  requestId: string;
  threadId: string;
  facts: Fact[];
  createdAt: string;
  scope?: CopilotContext;
  usage?: { input: number | null; output: number | null };
};
export type Fact = { id: string; label: string; value: string; source: string };
export const requestSchema = z
  .object({
    requestId: z.uuid(),
    threadId: z.uuid(),
    message: z.string().trim().min(1).max(2000),
    context: copilotContext,
    mode: z.enum(["conversation", "proactive"]).default("conversation"),
    signalKey: z.string().max(120).optional(),
  })
  .strict();
export type CopilotRequest = z.infer<typeof requestSchema>;
export type Feedback = {
  signal_key: string;
  family: string;
  subject: string;
  status: "seen" | "dismissed" | "snoozed" | "accepted";
  until: string;
  updated_at?: string;
};
export type Task = {
  id: string;
  title: string;
  status: "draft" | "ready" | "complete" | "cancelled";
  revision: number;
  plan: CopilotOutput["campaign"];
  created_at: string;
};
export type Thread = {
  id: string;
  title: string;
  product: "crm" | "pos";
  updated_at: string;
};
export type Message = {
  id: string;
  role: "user" | "assistant";
  body: string;
  result: CopilotAnswer | null;
  created_at: string;
};
