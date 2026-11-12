import "server-only";
import { createHmac, hkdfSync, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { database, requireCompany } from "@/lib/saas/server";
import { AccessError, scopeSchema } from "@/lib/saas/identity";
import { requireProduct } from "@/lib/saas/products";
import {
  readMasterKey,
  encryptCredentials,
  decryptCredentials,
} from "@/lib/whatsapp/crypto";
import {
  channelSchema,
  graphId,
  parseEvents,
  signatureValid,
} from "./protocol";
import { inspectPage, sendMetaText, MetaGraphError } from "./graph";
const uuid = z.uuid();
const bodySchema = z
  .string()
  .min(1)
  .max(2000)
  .refine((v) => v.trim().length > 0 && v.isWellFormed());
export const metaAction = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("read"),
      threadId: uuid,
      through: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      action: z.literal("connect"),
      id: uuid.optional(),
      brandId: z.string().min(1).max(100),
      channel: channelSchema,
      pageId: graphId,
      token: z.string().min(20).max(8192).regex(/^\S+$/),
    })
    .strict(),
  z
    .object({
      action: z.literal("send"),
      threadId: uuid,
      clientId: uuid,
      revision: z.number().int().min(0),
      body: bodySchema,
    })
    .strict(),
  z.object({ action: z.enum(["resolve", "reopen"]), threadId: uuid }).strict(),
  z
    .object({ action: z.literal("note"), threadId: uuid, body: bodySchema })
    .strict(),
  z.object({ action: z.literal("disable"), connectionId: uuid }).strict(),
]);
function key() {
  return Buffer.from(
    hkdfSync("sha256", readMasterKey(), "convelta-meta", "credentials-v1", 32),
  );
}
function platform() {
  const appId = process.env.SMARTVOLT_META_APP_ID,
    appSecret = process.env.SMARTVOLT_META_APP_SECRET;
  if (
    !appId ||
    !graphId.safeParse(appId).success ||
    !appSecret ||
    appSecret.length < 20 ||
    /\s/.test(appSecret)
  )
    throw new AccessError("Meta 應用程式尚未啟用，請先完成營運方設定。", 503);
  return { appId, appSecret };
}
function verifyToken() {
  return createHmac("sha256", key())
    .update("convelta-meta-webhook-verification-v1")
    .digest("hex");
}
const connectionFields =
  "id,brand_id,channel,page_id,account_id,label,enabled,last_inbound_at,created_at";
const messageFields =
  "id,thread_id,seq,direction,body,provider_id,state,provider_at,created_at,error_code,referral";
function check(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (/meta_(access|product|brand|connection)/.test(error.message ?? ""))
    throw new AccessError("你無權操作此公司或通訊連接。", 403);
  if (/meta_window/.test(error.message ?? ""))
    throw new AccessError(
      "客戶服務時限已過，請於原生平台核對可用聯絡方式。",
      409,
    );
  if (/meta_send_unresolved/.test(error.message ?? ""))
    throw new AccessError(
      "上一則訊息嘅發送結果待核對，請先確認，避免重複發送。",
      409,
    );
  if (
    error.code === "23505" ||
    /meta_(revision|idempotency)/.test(error.message ?? "")
  )
    throw new AccessError("資料或連接已更新，請重新讀取後再試。", 409);
  if (error.code === "P0002")
    throw new AccessError("找不到可用對話或連接。", 404);
  throw new AccessError("社交收件匣暫時未能完成操作，請稍後再試。", 503);
}
async function access(companyId: string) {
  uuid.parse(companyId);
  const a = await requireCompany(companyId);
  requireProduct(a.products, "crm");
  return a;
}
export async function readMeta(
  companyId: string,
  threadId?: string,
  before?: string,
) {
  const a = await access(companyId);
  if (threadId) {
    uuid.parse(threadId);
    const thread = await a.db
      .from("sv_meta_threads")
      .select(
        "id,revision,last_inbound_at,status,read_seq,connection_id,peer_id",
      )
      .eq("company_id", companyId)
      .eq("id", threadId)
      .maybeSingle();
    check(thread.error);
    if (!thread.data) throw new AccessError("找不到此對話。", 404);
    let q = a.db
      .from("sv_meta_messages")
      .select(messageFields)
      .eq("company_id", companyId)
      .eq("thread_id", threadId)
      .order("seq", { ascending: false })
      .limit(61);
    if (before) {
      if (!/^\d{1,16}$/.test(before))
        throw new AccessError("分頁資料不正確。", 400);
      q = q.lt("seq", before);
    }
    const m = await q;
    check(m.error);
    const rows = m.data ?? [];
    const sources = await a.db
      .from("sv_meta_events")
      .select("provider_at,raw")
      .eq("connection_id", thread.data.connection_id)
      .eq("peer_id", thread.data.peer_id)
      .eq("kind", "referral")
      .order("provider_at", { ascending: false })
      .limit(20);
    check(sources.error);
    return {
      thread: thread.data,
      sources: (sources.data ?? []).map((e) => ({
        at: e.provider_at,
        adId:
          typeof e.raw?.referral?.ad_id === "string"
            ? e.raw.referral.ad_id.slice(0, 100)
            : null,
      })),
      messages: rows.slice(0, 60).reverse(),
      hasMore: rows.length > 60,
    };
  }
  const connections = await a.db
    .from("sv_meta_connections")
    .select(connectionFields)
    .eq("company_id", companyId)
    .order("created_at");
  check(connections.error);
  let q = a.db
    .from("sv_meta_thread_summaries")
    .select(
      "id,connection_id,peer_id,revision,last_inbound_at,updated_at,status,read_seq,unread_count",
    )
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(101);
  // Stable keyset by last-updated time plus UUID; refresh restarts from the newest page.
  if (before) {
    if (!/^[A-Za-z0-9_-]{1,512}$/.test(before))
      throw new AccessError("分頁資料不正確。", 400);
    let decoded: unknown;
    try {
      decoded = JSON.parse(Buffer.from(before, "base64url").toString());
    } catch {
      throw new AccessError("分頁資料不正確。", 400);
    }
    const cursor = z
      .object({ at: z.iso.datetime({ offset: true }), id: uuid })
      .safeParse(decoded);
    if (!cursor.success) throw new AccessError("分頁資料不正確。", 400);
    q = q.or(
      `updated_at.lt.${cursor.data.at},and(updated_at.eq.${cursor.data.at},id.lt.${cursor.data.id})`,
    );
  }
  const threads = await q;
  check(threads.error);
  const rows = (threads.data ?? []).slice(0, 100),
    last = rows.at(-1);
  const blockers: string[] = [];
  try {
    platform();
  } catch {
    blockers.push("Meta App ID／App Secret 未配置");
  }
  try {
    key();
  } catch {
    blockers.push("伺服器加密儲存未配置");
  }
  const scope = await a.db
    .from("sv_workspaces")
    .select("payload")
    .eq("company_id", companyId)
    .single();
  check(scope.error);
  const brands = scopeSchema.parse(scope.data?.payload?.scope).brands;
  const origin = process.env.SMARTVOLT_APP_URL
    ? new URL(process.env.SMARTVOLT_APP_URL).origin
    : null;
  const owner = a.actor.role === "owner";
  return {
    companyName: a.company.name,
    canSend: a.actor.role !== "viewer",
    canManage: owner,
    brands,
    connections: connections.data ?? [],
    threads: rows,
    nextCursor:
      (threads.data?.length ?? 0) > 100 && last
        ? Buffer.from(
            JSON.stringify({ at: last.updated_at, id: last.id }),
          ).toString("base64url")
        : null,
    readiness: {
      ready: blockers.length === 0,
      blockers,
      webhookUrl: owner && origin ? `${origin}/api/webhooks/meta` : null,
      verifyToken: owner && blockers.length === 0 ? verifyToken() : null,
    },
  };
}
export async function actMeta(companyId: string, input: unknown) {
  const a = await access(companyId);
  const data = metaAction.parse(input);
  if (a.actor.role === "viewer")
    throw new AccessError("你目前只有檢視權限。", 403);
  if (data.action === "connect") {
    if (a.actor.role !== "owner")
      throw new AccessError("接駁需要公司擁有人權限。", 403);
    const config = platform(),
      master = key();
    let inspected;
    try {
      inspected = await inspectPage(
        config,
        data.pageId,
        data.channel,
        data.token,
      );
    } catch (e) {
      throw new AccessError(
        e instanceof MetaGraphError
          ? `Meta 憑證或權限未通過驗證（${e.code}）。`
          : "未能核實 Meta 帳戶，連接未有儲存。",
        409,
      );
    }
    const id = data.id ?? randomUUID();
    const saved = await a.db.rpc("sv_meta_save", {
      p_company: companyId,
      p_actor: a.user.id,
      p_config: {
        id,
        brandId: data.brandId,
        channel: data.channel,
        appId: config.appId,
        pageId: data.pageId,
        accountId: inspected.accountId,
        label: inspected.label,
        credentials: encryptCredentials(
          { token: data.token },
          master,
          `meta:${companyId}`,
          id,
        ),
      },
    });
    check(saved.error);
    return {
      id,
      state: "configured",
      notice:
        "憑證已驗證及加密儲存。完成 Meta Webhook 訂閱並收到真實訊息後，才可驗證回覆。",
    };
  }
  if (data.action === "disable") {
    if (a.actor.role !== "owner")
      throw new AccessError("停用接駁需要公司擁有人權限。", 403);
    const changed = await a.db.rpc("sv_meta_disable", {
      p_company: companyId,
      p_actor: a.user.id,
      p_connection: data.connectionId,
    });
    check(changed.error);
    return { disabled: true };
  }
  if (data.action !== "send") {
    const result = await a.db.rpc("sv_meta_command", {
      p_company: companyId,
      p_actor: a.user.id,
      p_thread: data.threadId,
      p_kind: data.action,
      p_body: data.action === "note" ? data.body : null,
      p_through: data.action === "read" ? data.through : null,
    });
    check(result.error);
    return { saved: true };
  }
  const thread = await a.db
    .from("sv_meta_threads")
    .select("connection_id")
    .eq("company_id", companyId)
    .eq("id", data.threadId)
    .single();
  check(thread.error);
  const connection = await a.db
    .from("sv_meta_connections")
    .select("id,credentials,app_id,enabled")
    .eq("company_id", companyId)
    .eq("id", thread.data?.connection_id)
    .single();
  check(connection.error);
  const config = platform();
  if (connection.data?.app_id !== config.appId || !connection.data?.enabled)
    throw new AccessError("此通訊連接尚未啟用。", 409);
  let token: string;
  try {
    token = z
      .string()
      .min(20)
      .parse(
        decryptCredentials(
          connection.data.credentials,
          key(),
          `meta:${companyId}`,
          connection.data.id,
        ).token,
      );
  } catch {
    throw new AccessError("通訊憑證需要由擁有人重新接駁。", 503);
  }
  const claimed = await a.db.rpc("sv_meta_claim", {
    p_company: companyId,
    p_actor: a.user.id,
    p_thread: data.threadId,
    p_client: data.clientId,
    p_expected: data.revision,
    p_body: data.body,
  });
  check(claimed.error);
  if (!claimed.data.dispatch)
    return {
      messageId: claimed.data.message.id,
      state: claimed.data.message.state,
      replayed: true,
    };
  const outcome = await sendMetaText(
    claimed.data.accountId,
    channelSchema.parse(claimed.data.channel),
    claimed.data.peerId,
    data.body,
    token,
  );
  const finished = await a.db.rpc("sv_meta_finish", {
    p_company: companyId,
    p_message: claimed.data.message.id,
    p_state: outcome.state,
    p_provider: outcome.mid,
    p_code: outcome.code,
  });
  check(finished.error);
  return {
    messageId: claimed.data.message.id,
    state: outcome.state,
    code: outcome.code,
  };
}
export function metaChallenge(params: URLSearchParams) {
  platform();
  const token = params.get("hub.verify_token") ?? "",
    expected = verifyToken();
  if (
    params.getAll("hub.mode").length !== 1 ||
    params.getAll("hub.verify_token").length !== 1 ||
    params.getAll("hub.challenge").length !== 1 ||
    params.get("hub.mode") !== "subscribe" ||
    token.length !== expected.length ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  )
    throw new AccessError("Webhook 驗證失敗。", 403);
  const challenge = params.get("hub.challenge");
  if (!challenge || challenge.length > 512)
    throw new AccessError("Webhook 驗證失敗。", 400);
  return challenge;
}
export async function receiveMeta(raw: Buffer, signature: string | null) {
  const config = platform();
  if (!signatureValid(raw, signature, config.appSecret))
    throw new AccessError("Webhook 簽署無效。", 403);
  let events;
  try {
    events = parseEvents(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)),
    );
  } catch {
    throw new AccessError("Webhook 資料未通過驗證。", 400);
  }
  const db = database();
  const groups = new Map<string, typeof events>();
  for (const e of events) {
    const k = `${e.channel}:${e.accountId}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  for (const group of groups.values()) {
    const first = group[0];
    const c = await db
      .from("sv_meta_connections")
      .select("id")
      .eq("app_id", config.appId)
      .eq("channel", first.channel)
      .eq("account_id", first.accountId)
      .eq("enabled", true)
      .maybeSingle();
    check(c.error);
    if (!c.data) continue;
    const ingested = await db.rpc("sv_meta_ingest", {
      p_connection: c.data.id,
      p_events: group,
    });
    check(ingested.error);
  }
  return { received: true };
}
