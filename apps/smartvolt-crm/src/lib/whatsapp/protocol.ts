import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  WaProtocolError,
  type WaIdentity,
  type WaInbound,
  type WaStatus,
  type WaWebhookBatch,
} from "./types";

export const MAX_WEBHOOK_BYTES = 3 * 1024 * 1024;
export const MAX_WEBHOOK_UPDATES = 1000;
const record = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
const bounded = (v: unknown, max = 512): string | null =>
  typeof v === "string" &&
  v.length > 0 &&
  v.length <= max &&
  !/[\u0000-\u001f]/.test(v)
    ? v
    : null;
const digits = (v: unknown, max = 50): string | null =>
  typeof v === "string" && new RegExp(`^[1-9]\\d{0,${max - 1}}$`).test(v)
    ? v
    : null;
const phone = (v: unknown): string | null =>
  typeof v === "string" && /^\+?[1-9]\d{6,14}$/.test(v)
    ? v.replace(/^\+/, "")
    : null;

export function verifyWebhookSignature(
  raw: string | Uint8Array,
  signature: string | null,
  appSecret: string,
): boolean {
  const bytes = Buffer.from(raw);
  if (
    bytes.length > MAX_WEBHOOK_BYTES ||
    !appSecret ||
    !signature ||
    !/^sha256=[a-f0-9]{64}$/i.test(signature)
  )
    return false;
  const expected = createHmac("sha256", appSecret).update(bytes).digest();
  const supplied = Buffer.from(signature.slice(7), "hex");
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

export function hashVerifyToken(token: string): string {
  if (!bounded(token, 512)) throw new WaProtocolError("verify_token_invalid");
  return createHash("sha256").update(token, "utf8").digest("hex");
}
export function verifyChallengeToken(
  candidate: string | null,
  expectedHash: string,
): boolean {
  if (
    !candidate ||
    !bounded(candidate, 512) ||
    !/^[a-f0-9]{64}$/i.test(expectedHash)
  )
    return false;
  return timingSafeEqual(
    Buffer.from(hashVerifyToken(candidate), "hex"),
    Buffer.from(expectedHash, "hex"),
  );
}
export function verifyWebhookChallenge(
  params: URLSearchParams,
  expectedHash: string,
): string | null {
  const challenge = bounded(params.get("hub.challenge"), 1024);
  return params.get("hub.mode") === "subscribe" &&
    challenge &&
    verifyChallengeToken(params.get("hub.verify_token"), expectedHash)
    ? challenge
    : null;
}

function identity(p: unknown, u: unknown, parent: unknown): WaIdentity | null {
  const phoneNumber = phone(p),
    bsuid = bounded(u, 160),
    parentBsuid = bounded(parent, 160);
  const id = bsuid ?? parentBsuid ?? phoneNumber;
  return id
    ? {
        kind: bsuid || parentBsuid ? "bsuid" : "phone",
        id,
        phone: phoneNumber,
        bsuid,
        parentBsuid,
      }
    : null;
}
function timestamp(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{1,12}$/.test(value)) return null;
  const millis = Number(value) * 1000;
  return Number.isSafeInteger(millis) && millis <= 8_640_000_000_000_000
    ? millis
    : null;
}

function messageBody(
  message: Record<string, unknown>,
  messageType: string,
): string {
  const text = record(message.text)?.body;
  if (messageType === "text" && typeof text === "string")
    return text.slice(0, 12000);
  const interactive = record(message.interactive);
  const reply =
    record(interactive?.button_reply) ?? record(interactive?.list_reply);
  if (messageType === "interactive" && typeof reply?.title === "string")
    return reply.title.slice(0, 12000);
  const button = record(message.button);
  if (messageType === "button" && typeof button?.text === "string")
    return button.text.slice(0, 12000);
  const labels: Record<string, string> = {
    image: "［圖片訊息］",
    audio: "［語音／音訊訊息］",
    video: "［影片訊息］",
    document: "［文件訊息］",
    sticker: "［貼圖訊息］",
    location: "［位置訊息］",
    contacts: "［聯絡人訊息］",
    reaction: "［表情回應］",
    order: "［訂單訊息］",
    unsupported: "［未能顯示嘅訊息］",
  };
  const caption = record(message[messageType])?.caption;
  const label = Object.hasOwn(labels, messageType)
    ? labels[messageType]
    : "［其他 WhatsApp 訊息］";
  return `${label}${typeof caption === "string" && caption ? ` ${caption.slice(0, 4096)}` : ""}`;
}

/** Parse only after signature validation; the original envelope must be stored privately once. */
export function parseWebhook(raw: string | Uint8Array): WaWebhookBatch {
  const bytes = Buffer.from(raw);
  if (bytes.length > MAX_WEBHOOK_BYTES)
    throw new WaProtocolError("webhook_too_large");
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
  } catch {
    throw new WaProtocolError("invalid_webhook_json");
  }
  const root = record(parsed);
  if (!root || !Array.isArray(root.entry))
    throw new WaProtocolError("invalid_webhook");
  if (root.object !== "whatsapp_business_account")
    return { events: [], ignored: 1, issues: [] };
  const result: WaWebhookBatch = { events: [], ignored: 0, issues: [] };
  let updates = 0,
    records = 0,
    index = 0;
  const issue = (code: string) => {
    result.ignored++;
    result.issues.push({ code, index });
  };
  if (root.entry.length > MAX_WEBHOOK_UPDATES)
    throw new WaProtocolError("too_many_webhook_updates");
  for (const rawEntry of root.entry) {
    const entry = record(rawEntry),
      accountId = digits(entry?.id);
    if (!entry || !accountId || !Array.isArray(entry.changes)) {
      issue("invalid_webhook_entry");
      continue;
    }
    for (const rawChange of entry.changes) {
      index++;
      if (++updates > MAX_WEBHOOK_UPDATES)
        throw new WaProtocolError("too_many_webhook_updates");
      const change = record(rawChange),
        value = record(change?.value);
      if (change?.field !== "messages") {
        result.ignored++;
        continue;
      }
      const phoneNumberId = digits(record(value?.metadata)?.phone_number_id);
      if (!value || value.messaging_product !== "whatsapp" || !phoneNumberId) {
        issue("invalid_message_scope");
        continue;
      }
      const contacts = Array.isArray(value.contacts)
        ? value.contacts
            .map(record)
            .filter((v): v is Record<string, unknown> => !!v)
        : [];
      const messages = Array.isArray(value.messages) ? value.messages : [];
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      records += messages.length + statuses.length;
      if (records > MAX_WEBHOOK_UPDATES)
        throw new WaProtocolError("too_many_webhook_updates");
      for (const rawMessage of messages) {
        const message = record(rawMessage),
          providerId = bounded(message?.id),
          providerAt = timestamp(message?.timestamp);
        const sender = identity(
          message?.from,
          message?.from_user_id,
          message?.from_parent_user_id,
        );
        if (!message || !providerId || providerAt === null || !sender) {
          issue("invalid_incoming_message");
          continue;
        }
        const person = contacts.find(
          (c) =>
            (sender.bsuid && c.user_id === sender.bsuid) ||
            (sender.parentBsuid && c.parent_user_id === sender.parentBsuid) ||
            (sender.phone && phone(c.wa_id) === sender.phone),
        );
        const profile = record(person?.profile);
        const profileName =
          bounded(profile?.name, 80) ??
          bounded(profile?.username, 80) ??
          "WhatsApp 客戶";
        const messageType = bounded(message.type, 40) ?? "unsupported";
        const event: WaInbound = {
          kind: "message",
          providerId,
          phoneNumberId,
          accountId,
          identity: sender,
          profileName,
          providerAt,
          messageType,
          body: messageBody(message, messageType),
          replyToProviderId: bounded(record(message.context)?.id),
          referral: record(message.referral),
          raw: message,
        };
        result.events.push(event);
      }
      for (const rawStatus of statuses) {
        const status = record(rawStatus),
          providerId = bounded(status?.id),
          providerAt = timestamp(status?.timestamp);
        if (
          !status ||
          !providerId ||
          providerAt === null ||
          !["sent", "delivered", "read", "failed", "played"].includes(
            String(status.status),
          )
        ) {
          issue("invalid_message_status");
          continue;
        }
        const firstError = Array.isArray(status.errors)
          ? record(status.errors[0])
          : null;
        const errorCode =
          typeof firstError?.code === "number" &&
          Number.isSafeInteger(firstError.code) &&
          firstError.code >= 0
            ? firstError.code
            : null;
        const event: WaStatus = {
          kind: "status",
          providerId,
          phoneNumberId,
          accountId,
          providerAt,
          status: status.status as WaStatus["status"],
          recipient: identity(
            status.recipient_id,
            status.recipient_user_id,
            status.recipient_parent_user_id,
          ),
          opaqueCallbackData: bounded(status.biz_opaque_callback_data),
          errorCode,
          raw: status,
        };
        result.events.push(event);
      }
      if (!messages.length && !statuses.length) {
        result.ignored++;
      }
    }
  }
  return result;
}

export function verifyAndParseWebhook(
  raw: string | Uint8Array,
  signature: string | null,
  appSecret: string,
): WaWebhookBatch {
  if (!verifyWebhookSignature(raw, signature, appSecret))
    throw new WaProtocolError("invalid_webhook_signature");
  return parseWebhook(raw);
}
