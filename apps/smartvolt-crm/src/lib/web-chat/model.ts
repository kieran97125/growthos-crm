import { z } from "zod";

export type WebChatReadiness = "ready" | "pending" | "unavailable";

export const publicChatId = z.uuid();
export function normalizeChatOrigin(value: string): string {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    u.pathname !== "/" ||
    u.search ||
    u.hash ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(
      u.hostname,
    ) ||
    /\.(?:localhost|local|internal|test|invalid)$/.test(u.hostname)
  )
    throw new Error("chat_origin_invalid");
  return u.origin;
}
const origin = z
  .string()
  .max(260)
  .transform((value, ctx) => {
    try {
      return normalizeChatOrigin(value);
    } catch {
      ctx.addIssue({ code: "custom", message: "請輸入完整 HTTPS 網址。" });
      return z.NEVER;
    }
  });
export const chatSettingsAction = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("save"),
      commandId: z.uuid(),
      id: z.uuid(),
      revision: z.number().int().nonnegative(),
      brandId: z.string().min(1).max(100),
      name: z.string().trim().min(1).max(60),
      greeting: z.string().trim().min(1).max(240),
      origins: z
        .array(origin)
        .min(1)
        .max(10)
        .transform((a) => [...new Set(a)]),
      enabled: z.boolean(),
      aiEnabled: z.boolean().optional(),
      aiKnowledgeMode: z.enum(["selected", "brand_public"]).optional(),
      aiArticleIds: z.array(z.string().min(1).max(150)).max(100).optional(),
      accentColor: z
        .string()
        .regex(/^#[a-f0-9]{6}$/i)
        .optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("activate"),
      commandId: z.uuid(),
      id: z.uuid(),
      revision: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      action: z.literal("verify"),
      commandId: z.uuid(),
      id: z.uuid(),
      revision: z.number().int().nonnegative(),
      origin,
      method: z.enum(["dns", "html"]).default("dns"),
    })
    .strict(),
]);
export const chatStaffAction = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("reply"),
      commandId: z.uuid(),
      threadId: z.uuid(),
      revision: z.number().int().nonnegative(),
      body: z.string().trim().min(1).max(2000),
    })
    .strict(),
  z
    .object({
      action: z.enum(["close", "reopen"]),
      commandId: z.uuid(),
      threadId: z.uuid(),
      revision: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      action: z.enum(["claim", "pauseC", "resumeC"]),
      commandId: z.uuid(),
      threadId: z.uuid(),
      revision: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      action: z.literal("linkCustomer"),
      commandId: z.uuid(),
      threadId: z.uuid(),
      revision: z.number().int().nonnegative(),
      customerId: z.string().min(1).max(100),
    })
    .strict(),
]);
export const publicChatAction = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("start"),
      threadId: z.uuid(),
      origin,
      name: z.string().trim().max(60),
      website: z.literal(""),
    })
    .strict(),
  z
    .object({
      action: z.literal("send"),
      threadId: z.uuid(),
      origin,
      commandId: z.uuid(),
      body: z.string().trim().min(1).max(2000),
      kind: z
        .enum(["message", "human", "human_only", "resume_c"])
        .default("message"),
      website: z.literal(""),
    })
    .strict(),
]);
export type WebChatConfig = {
  id: string;
  brandId: string;
  name: string;
  greeting: string;
  origins: string[];
  verifiedOrigins: string[];
  enabled: boolean;
  revision: number;
  verification: string;
  aiEnabled?: boolean;
  aiKnowledgeMode?: "selected" | "brand_public";
  aiArticleIds?: string[];
  accentColor?: string;
};
export type WebChatSettings = {
  companyId: string;
  canManage: boolean;
  brands: { id: string; name: string }[];
  configs: WebChatConfig[];
  publicArticles?: {
    id: string;
    brandId: string;
    title: string;
    autoPublic?: boolean;
  }[];
  canManageAI?: boolean;
};
export type WebChatThread = {
  id: string;
  brandId: string;
  brandName: string;
  visitorName: string;
  preview: string;
  lastMessageAt: string;
  unread: boolean;
  customerId: string | null;
  status: "open" | "closed";
  revision: number;
  site: string;
  humanWaiting?: boolean;
  waitingMinutes?: number;
  humanRequestedAt?: string | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  cPaused?: boolean;
  preference?: "cooperate" | "human_only";
  intent?: string;
  intentBasis?: "stated" | "inferred" | "unknown";
  summary?: string;
  unanswered?: string;
  aiState?: string | null;
  aiEnabled?: boolean;
};
export type WebChatMessage = {
  id: string;
  body: string;
  direction: "incoming" | "outgoing";
  createdAt: string;
  actorName: string | null;
  sequence: number;
  sender?: "visitor" | "staff" | "c";
};
export type WebChatPage = {
  scopeStamp?: string;
  threads: WebChatThread[];
  canReply: boolean;
  nextCursor: string | null;
};
export type WebChatConversation = {
  thread: WebChatThread;
  messages: WebChatMessage[];
  nextCursor: number | null;
  canReply: boolean;
};
export function chatFramePolicy(origins: readonly string[], nonce: string) {
  const allowed = origins.map(normalizeChatOrigin);
  return `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors ${allowed.length ? allowed.join(" ") : "'none'"}`;
}
