/** Browser transport never receives provider credentials or raw webhook events. */
import { z } from "zod";
import type {
  WaConnectionsResponse,
  WaConversationSummary,
  WaInboxResponse,
  WaMessagesResponse,
  WaSaveConnectionResponse,
  WaSendResponse,
} from "@/lib/whatsapp/responses";

const timestamp = z.number().int().nonnegative().nullable();
const messageState = z.enum([
  "dispatching",
  "accepted",
  "unknown",
  "sent",
  "delivered",
  "read",
  "failed",
]);
const connectionSchema = z.object({
  id: z.string().min(1),
  companyId: z.string(),
  brandId: z.string(),
  appId: z.string(),
  accountId: z.string(),
  messagingAccountId: z.string().nullable(),
  phoneNumberId: z.string(),
  displayPhone: z.string().nullable(),
  state: z.enum(["configured", "active", "disabled"]),
  webhookVerifiedAt: z.string().nullable(),
  lastInboundAt: timestamp,
  createdAt: z.string(),
  webhookUrl: z.string(),
});
const conversationSchema = z.object({
  id: z.string().min(1),
  connectionId: z.string(),
  contactId: z.string(),
  brandId: z.string(),
  customerName: z.string(),
  customerPhone: z.string().nullable(),
  status: z.enum(["open", "resolved"]),
  unreadCount: z.number().int().nonnegative(),
  lastInboundAt: timestamp,
  lastMessageAt: timestamp,
  revision: z.number().int().nonnegative(),
  lastMessagePreview: z.string(),
  hasAdReferral: z.boolean(),
});
const messageSchema = z.object({
  id: z.string().min(1),
  seq: z.number().int().nonnegative(),
  direction: z.enum(["incoming", "outgoing", "note"]),
  body: z.string(),
  messageType: z.string(),
  providerAt: timestamp,
  createdAt: z.string(),
  authorName: z.string().nullable(),
  state: messageState,
  statusAt: timestamp.optional(),
  errorCode: z.string().nullable(),
  replyTo: z.string().nullable(),
});
function verified<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new WhatsAppRequestError(
      "伺服器回應未能核實，請重新核對。現有資料及草稿已保留。",
      502,
    );
  return result.data;
}
export const verifiedConnections = (value: unknown): WaConnectionsResponse =>
  verified(
    z.object({
      connections: z.array(connectionSchema),
      encryptionReady: z.boolean(),
      brands: z.array(z.object({ id: z.string(), name: z.string() })),
      canManage: z.boolean(),
    }),
    value,
  );
export const verifiedInbox = (value: unknown): WaInboxResponse =>
  verified(
    z.object({
      conversations: z.array(conversationSchema),
      nextCursor: z.string().nullable(),
    }),
    value,
  );
export function verifiedCommand(
  value: unknown,
  conversationId: string,
): { conversation: WaConversationSummary } {
  const result = verified(
    z.object({ conversation: conversationSchema }),
    value,
  );
  if (result.conversation.id !== conversationId)
    throw new WhatsAppRequestError("對話識別未能核實，請重新讀取。", 502);
  return result;
}
export const verifiedMessages = (value: unknown): WaMessagesResponse =>
  verified(
    z.object({
      conversation: conversationSchema,
      messages: z.array(messageSchema),
      nextBefore: z.number().int().nonnegative().nullable(),
    }),
    value,
  );
export const verifiedConnectionSave = (
  value: unknown,
): WaSaveConnectionResponse =>
  verified(
    z.object({
      connection: connectionSchema,
      webhookUrl: z.url(),
      verifyToken: z.string().min(1),
    }),
    value,
  );
export function verifiedSend(
  value: unknown,
  intent: { body: string; replyTo?: string },
): WaSendResponse {
  const response = verified(
    z.object({
      message: messageSchema,
      state: messageState,
      dispatch: z.boolean(),
      warning: z.string().optional(),
    }),
    value,
  );
  if (
    response.message.direction !== "outgoing" ||
    response.message.body !== intent.body ||
    response.message.replyTo !== (intent.replyTo ?? null) ||
    response.message.state !== response.state
  )
    throw new WhatsAppRequestError(
      "傳送紀錄同今次回覆未能配對。請用同一個發送識別碼核對結果。",
      502,
    );
  return response;
}
export class WhatsAppRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function whatsappRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new WhatsAppRequestError(
      typeof body?.error === "string"
        ? body.error
        : "暫時未能完成操作，請稍後再試。",
      response.status,
    );
  }
  return body as T;
}

export function isForeground() {
  return document.visibilityState === "visible" && document.hasFocus();
}

export function whatsappTime(value: string | number | null, date = false) {
  if (value === null) return "—";
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    ...(date ? { month: "short", day: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(instant);
}

export function serviceWindowOpen(lastInboundAt: number | null, now: number) {
  return (
    lastInboundAt !== null &&
    lastInboundAt <= now &&
    now - lastInboundAt < 24 * 60 * 60 * 1000
  );
}
