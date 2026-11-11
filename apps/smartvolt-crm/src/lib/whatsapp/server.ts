import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { database, requireCompany } from "@/lib/saas/server";
import { AccessError, scopeSchema } from "@/lib/saas/identity";
import { requireProduct } from "@/lib/saas/products";
import {
  decryptCredentials,
  encryptCredentials,
  readMasterKey,
} from "./crypto";
import { inspectPhoneNumber, sendText } from "./graph";
import {
  hashVerifyToken,
  parseWebhook,
  verifyWebhookChallenge,
  verifyWebhookSignature,
} from "./protocol";
import { dispatchClaim } from "./dispatch";
import {
  commandInput,
  connectionInput,
  pageLimit,
  sendInput,
  uuid,
} from "./http";
import type { WaIdentity } from "./types";
import type {
  WaConnectionSummary,
  WaConversationSummary,
  WaMessageSummary,
  WaConnectionsResponse,
  WaInboxResponse,
  WaMessagesResponse,
  WaSendResponse,
  WaSaveConnectionResponse,
} from "./responses";

type Row = Record<string, unknown>;
type Access = Awaited<ReturnType<typeof requireCompany>>;
const object = (value: unknown): Row | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : null;
const first = (value: unknown): Row | null =>
  object(Array.isArray(value) ? value[0] : value);
const text = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;
const nullableText = (value: unknown): string | null =>
  typeof value === "string" ? value : null;
function integer(value: unknown, nullable = false): number | null {
  if ((value === null || value === undefined) && nullable) return null;
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0)
    throw new AccessError("WhatsApp 資料格式未能核實。", 503);
  return parsed;
}
function mandatoryRow(value: unknown): Row {
  const row = object(value);
  if (!row) throw new AccessError("WhatsApp 資料暫時未能讀取。", 503);
  return row;
}
function queryFailure(error: { code?: string; message?: string } | null): void {
  if (!error) return;
  // Inspect stable database codes privately; never serialize SQL/provider text.
  if (
    error.code === "42501" ||
    /membership|product|owner|permission|forbidden|access_denied/i.test(
      error.message ?? "",
    )
  )
    throw new AccessError("你未有執行此 WhatsApp 操作嘅權限。", 403);
  if (
    error.code === "23505" &&
    /sv_wa_connections_app_identity/i.test(error.message ?? "")
  )
    throw new AccessError(
      "此 Meta App 已用於另一個 WhatsApp 連接；每個 App 目前只可接一個電話。",
      409,
    );
  if (
    error.code === "40001" ||
    error.code === "23505" ||
    /revision|stale|conflict|idempotency/i.test(error.message ?? "")
  )
    throw new AccessError("對話或操作紀錄已更新，請重新讀取後再試。", 409);
  if (/connection_identity_in_use/i.test(error.message ?? ""))
    throw new AccessError(
      "此連接已有對話，電話及帳戶身份不能更改；請建立另一個連接。",
      409,
    );
  if (/connection_scope|provider_scope/i.test(error.message ?? ""))
    throw new AccessError("WhatsApp 資料不屬於此公司或連接。", 403);
  if (/conversation_missing|message_missing/i.test(error.message ?? ""))
    throw new AccessError("找不到此 WhatsApp 對話或訊息。", 404);
  if (/connection_not_ready|connection_unavailable/i.test(error.message ?? ""))
    throw new AccessError("WhatsApp 連接尚未完成驗證及真實收訊。", 409);
  if (/window|service_window|24.hour/i.test(error.message ?? ""))
    throw new AccessError("客戶服務時限已過，暫時未能發送自由文字訊息。", 409);
  if (
    error.code === "22023" ||
    /invalid|reply|body|client_id/i.test(error.message ?? "")
  )
    throw new AccessError("WhatsApp 操作資料未通過驗證。", 400);
  throw new AccessError("WhatsApp 資料服務暫時未能完成操作。", 503);
}
async function crmAccess(companyId: string): Promise<Access> {
  uuid.parse(companyId);
  const access = await requireCompany(companyId);
  requireProduct(access.products, "crm");
  return access;
}
function configuredOrigin(): string {
  const source = process.env.SMARTVOLT_APP_URL;
  if (!source) throw new AccessError("WhatsApp 回調網址尚未設定。", 503);
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new AccessError("WhatsApp 回調網址尚未設定。", 503);
  }
  if (
    url.username ||
    url.password ||
    (url.protocol !== "https:" && process.env.NODE_ENV === "production")
  )
    throw new AccessError("WhatsApp 回調網址尚未設定。", 503);
  return url.origin;
}
function webhookUrl(id: string): string {
  return `${configuredOrigin()}/api/webhooks/whatsapp/${encodeURIComponent(id)}`;
}
function encryptionReady(): boolean {
  try {
    readMasterKey();
    return true;
  } catch {
    return false;
  }
}
function masterKey(): Buffer {
  try {
    return readMasterKey();
  } catch {
    throw new AccessError("WhatsApp 伺服器加密密鑰尚未啟用。", 503);
  }
}
function connectionSummary(row: Row): WaConnectionSummary {
  const state = row.state;
  if (state !== "configured" && state !== "active" && state !== "disabled")
    throw new AccessError("WhatsApp 連接狀態未能核實。", 503);
  return {
    id: text(row.id),
    companyId: text(row.company_id),
    brandId: text(row.brand_id),
    appId: text(row.app_id),
    accountId: text(row.account_id),
    messagingAccountId: nullableText(row.messaging_account_id),
    phoneNumberId: text(row.phone_number_id),
    displayPhone: nullableText(row.display_phone),
    state,
    webhookVerifiedAt: nullableText(row.webhook_verified_at),
    lastInboundAt: integer(row.last_inbound_at, true),
    createdAt: text(row.created_at),
    webhookUrl: webhookUrl(text(row.id)),
  };
}
function conversationSummary(row: Row): WaConversationSummary {
  const contact = first(row.sv_wa_contacts);
  const preview = first(row.sv_wa_messages);
  return {
    id: text(row.id),
    connectionId: text(row.connection_id),
    contactId: text(row.contact_id),
    brandId: text(row.brand_id),
    customerName: text(contact?.display_name, "WhatsApp 客戶"),
    customerPhone: nullableText(contact?.phone),
    status: row.status === "resolved" ? "resolved" : "open",
    unreadCount: integer(row.unread_count)!,
    lastInboundAt: integer(row.last_inbound_at, true),
    lastMessageAt: integer(row.last_message_at, true),
    revision: integer(row.revision)!,
    lastMessagePreview: text(preview?.body).slice(0, 180),
    hasAdReferral: row.has_ad_referral === true,
  };
}
function messageSummary(row: Row): WaMessageSummary {
  const direction = row.direction,
    state = row.state;
  if (
    !["incoming", "outgoing", "note"].includes(String(direction)) ||
    ![
      "dispatching",
      "accepted",
      "unknown",
      "sent",
      "delivered",
      "read",
      "failed",
    ].includes(String(state))
  )
    throw new AccessError("WhatsApp 訊息狀態未能核實。", 503);
  return {
    id: text(row.id),
    seq: integer(row.seq)!,
    direction: direction as WaMessageSummary["direction"],
    body: text(row.body),
    messageType: text(row.message_type),
    providerAt: integer(row.provider_at, true),
    createdAt: text(row.created_at),
    authorName: nullableText(row.author_name),
    state: state as WaMessageSummary["state"],
    statusAt: integer(row.status_at, true),
    errorCode:
      typeof row.error_code === "number"
        ? String(row.error_code)
        : nullableText(row.error_code),
    replyTo: nullableText(row.reply_to),
  };
}
const connectionFields =
  "id,company_id,brand_id,app_id,account_id,messaging_account_id,phone_number_id,display_phone,state,webhook_verified_at,last_inbound_at,created_at";
const conversationFields =
  "id,company_id,connection_id,contact_id,brand_id,status,unread_count,last_inbound_at,last_message_at,revision,has_ad_referral,sv_wa_contacts(display_name,phone),sv_wa_messages(body)";
const messageFields =
  "id,seq,direction,body,message_type,provider_at,created_at,author_name,state,status_at,error_code,reply_to";

async function brandsFor(
  access: Access,
): Promise<{ id: string; name: string }[]> {
  const result = await access.db
    .from("sv_workspaces")
    .select("payload")
    .eq("company_id", access.company.id)
    .single();
  queryFailure(result.error);
  const payload = object(result.data?.payload);
  const scope = scopeSchema.safeParse(payload?.scope);
  if (!scope.success || scope.data.companyId !== access.company.id)
    throw new AccessError("公司品牌設定未完成。", 503);
  return scope.data.brands.map(({ id, name }) => ({ id, name }));
}
export async function listConnections(
  companyId: string,
): Promise<WaConnectionsResponse> {
  const access = await crmAccess(companyId);
  const [brands, result] = await Promise.all([
    brandsFor(access),
    access.db
      .from("sv_wa_connections")
      .select(connectionFields)
      .eq("company_id", companyId)
      .order("created_at"),
  ]);
  queryFailure(result.error);
  return {
    connections: (result.data ?? []).map((row) =>
      connectionSummary(mandatoryRow(row)),
    ),
    encryptionReady: encryptionReady(),
    brands,
    canManage: access.actor.role === "owner",
  };
}
export async function saveConnection(
  companyId: string,
  input: unknown,
): Promise<WaSaveConnectionResponse> {
  const access = await crmAccess(companyId);
  if (access.actor.role !== "owner")
    throw new AccessError("只有公司 Owner 可以設定 WhatsApp 連接。", 403);
  const config = connectionInput.parse(input);
  const brands = await brandsFor(access);
  if (!brands.some((brand) => brand.id === config.brandId))
    throw new AccessError("品牌不屬於此公司。", 400);
  const key = masterKey();
  const id = config.id ?? randomUUID();
  const callback = webhookUrl(id);
  // An external read is useful evidence of phone/token access, never proof of end-to-end readiness.
  const inspection = await inspectPhoneNumber({
    phoneNumberId: config.phoneNumberId,
    accessToken: config.accessToken,
    version: process.env.SMARTVOLT_WHATSAPP_GRAPH_VERSION || undefined,
  });
  if (!inspection.ok)
    throw new AccessError(
      inspection.code === "provider_auth"
        ? "Meta 未授權此 Access Token 讀取該電話，請核對資產權限。"
        : "暫時未能核實 Meta 電話連接，設定未有儲存。",
      inspection.disposition === "ambiguous" ? 503 : 400,
    );
  const token = randomBytes(32).toString("base64url");
  const encrypted = encryptCredentials(
    { appSecret: config.appSecret, accessToken: config.accessToken },
    key,
    companyId,
    id,
  );
  const result = await access.db.rpc("sv_wa_save_connection", {
    p_company: companyId,
    p_actor: access.actor.id,
    p_config: {
      id,
      brandId: config.brandId,
      appId: config.appId,
      accountId: config.accountId,
      messagingAccountId: config.messagingAccountId ?? null,
      phoneNumberId: config.phoneNumberId,
      displayPhone: inspection.displayPhoneNumber,
      encryptedCredentials: encrypted,
      verifyTokenHash: hashVerifyToken(token),
    },
  });
  queryFailure(result.error);
  return {
    connection: connectionSummary(mandatoryRow(result.data)),
    webhookUrl: callback,
    verifyToken: token,
  };
}

const cursorSchema = z
  .object({
    at: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
    id: uuid,
  })
  .strict();
function decodeCursor(value: string): z.infer<typeof cursorSchema> {
  if (value.length > 256 || !/^[A-Za-z0-9_-]+$/.test(value))
    throw new AccessError("對話分頁位置不正確。", 400);
  try {
    return cursorSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
  } catch {
    throw new AccessError("對話分頁位置不正確。", 400);
  }
}
export async function listInbox(
  companyId: string,
  params: URLSearchParams,
): Promise<WaInboxResponse> {
  const access = await crmAccess(companyId),
    limit = pageLimit(params.get("limit"), 30, 50);
  let query = access.db
    .from("sv_wa_conversations")
    .select(conversationFields)
    .eq("company_id", companyId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .order("seq", { referencedTable: "sv_wa_messages", ascending: false })
    .limit(1, { referencedTable: "sv_wa_messages" })
    .limit(limit + 1);
  const rawCursor = params.get("cursor");
  if (rawCursor) {
    const cursor = decodeCursor(rawCursor);
    query =
      cursor.at === null
        ? query.is("last_message_at", null).lt("id", cursor.id)
        : query.or(
            `last_message_at.lt.${cursor.at},and(last_message_at.eq.${cursor.at},id.lt.${cursor.id}),last_message_at.is.null`,
          );
  }
  const result = await query;
  queryFailure(result.error);
  const rows = (result.data ?? []).map(mandatoryRow),
    selected = rows.slice(0, limit);
  const conversations = selected.map(conversationSummary),
    last = conversations.at(-1);
  return {
    conversations,
    nextCursor:
      rows.length > limit && last
        ? Buffer.from(
            JSON.stringify({ at: last.lastMessageAt, id: last.id }),
          ).toString("base64url")
        : null,
  };
}
async function readConversation(
  access: Access,
  conversationId: string,
): Promise<WaConversationSummary> {
  uuid.parse(conversationId);
  const result = await access.db
    .from("sv_wa_conversations")
    .select(conversationFields)
    .eq("company_id", access.company.id)
    .eq("id", conversationId)
    .order("seq", { referencedTable: "sv_wa_messages", ascending: false })
    .limit(1, { referencedTable: "sv_wa_messages" })
    .maybeSingle();
  queryFailure(result.error);
  if (!result.data) throw new AccessError("找不到此 WhatsApp 對話。", 404);
  return conversationSummary(mandatoryRow(result.data));
}
export async function listMessages(
  companyId: string,
  conversationId: string,
  params: URLSearchParams,
): Promise<WaMessagesResponse> {
  const access = await crmAccess(companyId),
    conversation = await readConversation(access, conversationId);
  const limit = pageLimit(params.get("limit"), 50, 100);
  let query = access.db
    .from("sv_wa_messages")
    .select(messageFields)
    .eq("company_id", companyId)
    .eq("conversation_id", conversationId)
    .order("seq", { ascending: false })
    .limit(limit + 1);
  const before = params.get("before");
  if (before !== null) {
    if (
      !/^[1-9]\d{0,15}$/.test(before) ||
      !Number.isSafeInteger(Number(before))
    )
      throw new AccessError("訊息分頁位置不正確。", 400);
    query = query.lt("seq", Number(before));
  }
  const result = await query;
  queryFailure(result.error);
  const rows = (result.data ?? []).map(mandatoryRow),
    messages = rows.slice(0, limit).map(messageSummary).reverse();
  return {
    conversation,
    messages,
    nextBefore: rows.length > limit ? (messages[0]?.seq ?? null) : null,
  };
}

const credentialSchema = z
  .object({
    appSecret: z.string().min(16).max(256),
    accessToken: z.string().min(16).max(8192),
  })
  .strict();
function credentials(row: Row) {
  try {
    return credentialSchema.parse(
      decryptCredentials(
        row.encrypted_credentials,
        masterKey(),
        text(row.company_id),
        text(row.id),
      ),
    );
  } catch {
    throw new AccessError(
      "WhatsApp 連接密鑰未能解密，請由 Owner 重新設定。",
      503,
    );
  }
}
async function privateConnection(id: string, companyId?: string): Promise<Row> {
  uuid.parse(id);
  let query = database().from("sv_wa_connections").select("*").eq("id", id);
  if (companyId) query = query.eq("company_id", companyId);
  const result = await query.maybeSingle();
  queryFailure(result.error);
  if (!result.data || result.data.state === "disabled")
    throw new AccessError("WhatsApp 連接未啟用。", 404);
  return mandatoryRow(result.data);
}
function recipient(remoteId: string, remoteKind: unknown): WaIdentity {
  // DB records the provider identity, never a caller-supplied destination or a phone inferred from a name.
  if (remoteKind !== "phone" && remoteKind !== "bsuid")
    throw new AccessError("WhatsApp 收件人類型未能核實。", 503);
  return remoteKind === "phone"
    ? {
        kind: "phone",
        id: remoteId,
        phone: remoteId,
        bsuid: null,
        parentBsuid: null,
      }
    : {
        kind: "bsuid",
        id: remoteId,
        phone: null,
        bsuid: remoteId,
        parentBsuid: null,
      };
}
export async function sendMessage(
  companyId: string,
  conversationId: string,
  input: unknown,
): Promise<WaSendResponse> {
  const access = await crmAccess(companyId);
  uuid.parse(conversationId);
  const command = sendInput.parse(input);
  const claimResult = await access.db.rpc("sv_wa_claim_send", {
    p_company: companyId,
    p_actor: access.actor.id,
    p_conversation: conversationId,
    p_expected: command.revision,
    p_client_id: command.clientId,
    p_body: command.body,
    p_reply_to: command.replyTo ?? null,
  });
  queryFailure(claimResult.error);
  const claim = mandatoryRow(claimResult.data);
  if (typeof claim.dispatch !== "boolean")
    throw new AccessError("WhatsApp 發送紀錄未能核實。", 503);
  const outcome = await dispatchClaim<Row>({
    claim: { dispatch: claim.dispatch, message: mandatoryRow(claim.message) },
    send: async () => {
      let connection: Row,
        secrets: z.infer<typeof credentialSchema>,
        destination: WaIdentity,
        replyToProviderId: string | undefined;
      try {
        connection = await privateConnection(
          text(claim.connectionId),
          companyId,
        );
        if (connection.state !== "active" || !connection.webhook_verified_at)
          return {
            ok: false,
            disposition: "definitive",
            code: "invalid_request",
          };
        secrets = credentials(connection);
        destination = recipient(text(claim.remoteId), claim.remoteKind);
        if (command.replyTo) {
          const reply = await access.db
            .from("sv_wa_messages")
            .select("provider_id")
            .eq("company_id", companyId)
            .eq("conversation_id", conversationId)
            .eq("id", command.replyTo)
            .maybeSingle();
          queryFailure(reply.error);
          if (!reply.data?.provider_id)
            return {
              ok: false,
              disposition: "definitive",
              code: "invalid_request",
            };
          replyToProviderId = text(reply.data.provider_id);
        }
      } catch {
        // No network request occurred: this is a definite local configuration failure.
        return {
          ok: false,
          disposition: "definitive",
          code: "invalid_request",
        };
      }
      return sendText({
        phoneNumberId: text(connection.phone_number_id),
        accessToken: secrets.accessToken,
        version: process.env.SMARTVOLT_WHATSAPP_GRAPH_VERSION || undefined,
        to: destination,
        text: command.body,
        replyToProviderId,
        opaqueCallbackData: text(mandatoryRow(claim.message).id),
        ...(typeof connection.messaging_account_id === "string"
          ? { messagingAccountId: connection.messaging_account_id }
          : {}),
      });
    },
    finish: async (result) => {
      const finished = await access.db.rpc("sv_wa_finish_send", {
        p_company: companyId,
        p_message: text(mandatoryRow(claim.message).id),
        p_disposition: result.ok ? "accepted" : result.disposition,
        p_provider_id: result.ok ? result.providerId : null,
        p_error_code: result.ok ? null : result.code,
      });
      queryFailure(finished.error);
      return mandatoryRow(finished.data);
    },
  });
  const message = messageSummary(outcome.message);
  return {
    message,
    state: message.state,
    dispatch: outcome.dispatched,
    ...(["unknown", "dispatching"].includes(message.state)
      ? {
          warning: "發送結果仍未確認；請等候 Meta 狀態回報，系統不會自動重發。",
        }
      : {}),
  };
}
export async function conversationCommand(
  companyId: string,
  conversationId: string,
  input: unknown,
): Promise<{ conversation: WaConversationSummary }> {
  const access = await crmAccess(companyId);
  uuid.parse(conversationId);
  const command = commandInput.parse(input);
  const result = await access.db.rpc("sv_wa_conversation_command", {
    p_company: companyId,
    p_actor: access.actor.id,
    p_conversation: conversationId,
    p_expected: command.revision,
    p_client_id: command.clientId,
    p_kind: command.kind,
    p_body: command.body ?? null,
    p_through_message: command.throughMessageId ?? null,
  });
  queryFailure(result.error);
  return { conversation: await readConversation(access, conversationId) };
}

export async function webhookChallenge(
  connectionId: string,
  params: URLSearchParams,
): Promise<string> {
  const connection = await privateConnection(connectionId);
  const challenge = verifyWebhookChallenge(
    params,
    text(connection.verify_token_hash),
  );
  if (challenge === null) throw new AccessError("WhatsApp 驗證未通過。", 403);
  const result = await database().rpc("sv_wa_verify_webhook", {
    p_connection: connectionId,
    p_verify_hash: text(connection.verify_token_hash),
  });
  queryFailure(result.error);
  return challenge;
}
function enforceWebhookScope(envelope: Row, connection: Row): void {
  const accounts = new Set(
    [text(connection.account_id), text(connection.messaging_account_id)].filter(
      Boolean,
    ),
  );
  if (
    envelope.object !== "whatsapp_business_account" ||
    !Array.isArray(envelope.entry)
  )
    throw new AccessError("WhatsApp 回調格式不正確。", 422);
  for (const item of envelope.entry) {
    const entry = object(item);
    if (
      !entry ||
      !accounts.has(text(entry.id)) ||
      !Array.isArray(entry.changes)
    )
      throw new AccessError("WhatsApp 回調不屬於此連接。", 403);
    for (const item of entry.changes) {
      const change = object(item);
      if (
        change?.field === "messages" &&
        text(object(object(change.value)?.metadata)?.phone_number_id) !==
          connection.phone_number_id
      )
        throw new AccessError("WhatsApp 回調電話不屬於此連接。", 403);
    }
  }
}
export async function webhookIngest(
  connectionId: string,
  raw: Uint8Array,
  signature: string | null,
): Promise<{
  received: true;
  inserted: number;
  duplicates: number;
  statuses: number;
}> {
  const connection = await privateConnection(connectionId),
    secrets = credentials(connection);
  if (!verifyWebhookSignature(raw, signature, secrets.appSecret))
    throw new AccessError("WhatsApp 回調簽署未通過。", 401);
  let batch: ReturnType<typeof parseWebhook>, envelope: Row;
  try {
    batch = parseWebhook(raw);
    envelope = mandatoryRow(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)),
    );
  } catch {
    throw new AccessError("WhatsApp 回調資料未通過驗證。", 422);
  }
  enforceWebhookScope(envelope, connection);
  if (batch.issues.length)
    throw new AccessError("WhatsApp 回調包含未能核實嘅訊息。", 422);
  const result = await database().rpc("sv_wa_ingest", {
    p_connection: connectionId,
    p_events: batch.events,
    p_envelope: envelope,
  });
  queryFailure(result.error);
  const summary = mandatoryRow(result.data);
  return {
    received: true,
    inserted: integer(summary.inserted)!,
    duplicates: integer(summary.duplicates)!,
    statuses: integer(summary.statuses)!,
  };
}
