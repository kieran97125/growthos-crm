import "server-only";
import { createHash, hkdfSync } from "node:crypto";
import { z } from "zod";
import { loadCompany } from "@/lib/saas/server";
import { AccessError } from "@/lib/saas/identity";
import { decryptCredentials, readMasterKey } from "@/lib/whatsapp/crypto";
import { DEFAULT_GRAPH_VERSION } from "@/lib/whatsapp/graph";
import {
  MEDIA_BUCKET,
  MEDIA_MAX_BYTES,
  kindNames,
  mediaCommand,
  mediaQuery,
  mediaScope,
  safeFilename,
  supportedMedia,
  type MediaAsset,
  type MediaItem,
  type MediaKind,
  type MediaReceipt,
  type MediaScope,
} from "./model";
import {
  fetchProviderMedia,
  inspectMedia,
  MediaBytesError,
  providerMediaUrl,
  whatsappMediaMetadata,
} from "./bytes";
import {
  dispatchMedia,
  metaMediaPayload,
  whatsappMediaPayload,
} from "./provider";

type Access = Awaited<ReturnType<typeof loadCompany>>;
type Asset = {
  id: string;
  brand_id: string;
  source: MediaScope["source"];
  source_id: string;
  origin: "staff_upload" | "provider";
  message_id: string | null;
  attachment_index: number;
  created_by: string;
  filename: string;
  declared_bytes: number;
  declared_mime: string;
  object_path: string;
  kind: MediaKind | null;
  mime_type: string | null;
  media_bytes: number | null;
  content_hash: string | null;
  state: "uploading" | "ready" | "cancelled" | "rejected";
  expires_at: string;
};
type Native = {
  messageId: string;
  index: number;
  kind: MediaKind;
  filename: string;
  connectionId: string;
  mediaId?: string;
  url?: string;
  enabled: boolean;
};
type Row = Record<string, unknown>;
const record = (v: unknown): Row =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : {};

export class AttachmentError extends AccessError {
  constructor(
    public code: string,
    message: string,
    status = 503,
  ) {
    super(message, status);
  }
}
function checked(e: { message?: string; code?: string } | null) {
  if (!e) return;
  const m = e.message ?? "";
  if (
    /access_denied|brand_scope|product_required|product_not_purchased|thread_scope|member_scope/.test(
      m,
    )
  )
    throw new AttachmentError(
      "access_denied",
      "你無權使用呢段對話嘅附件。",
      403,
    );
  if (/source_missing|conversation_missing/.test(m) || e.code === "P0002")
    throw new AttachmentError("missing", "找不到呢段對話或附件。", 404);
  if (/window_closed/.test(m))
    throw new AttachmentError(
      "window_closed",
      "客戶服務時限已過，未有傳送附件。",
      409,
    );
  if (/upload_limit/.test(m))
    throw new AttachmentError(
      "upload_limit",
      "短時間上載太多附件，請稍後再試。",
      429,
    );
  if (/expired/.test(m))
    throw new AttachmentError(
      "expired",
      "附件上載已過期，請重新選擇檔案。",
      410,
    );
  if (/editor|takeover/.test(m))
    throw new AttachmentError("editor", "另一位同事正在回覆，請先接手。", 409);
  if (/unresolved/.test(m))
    throw new AttachmentError(
      "unresolved",
      "上一則訊息結果仍待核對，未有重複傳送。",
      409,
    );
  if (
    /revision|idempotency|source_changed|size_changed|already_sent|not_ready/.test(
      m,
    ) ||
    e.code === "23505"
  )
    throw new AttachmentError(
      "conflict",
      "附件或對話已更新，請重新核對。",
      409,
    );
  if (/invalid|check constraint/.test(m))
    throw new AttachmentError("invalid", "附件資料未通過核對。", 422);
  throw new AttachmentError(
    "unavailable",
    "暫時未能核對附件，請保留同一操作再試。",
  );
}
function bytesFailure(error: unknown): never {
  if (error instanceof MediaBytesError) {
    const labels: Record<string, string> = {
      media_url_invalid: "原平台附件位置未能安全核實。",
      media_expired: "原平台附件已過期，請客人重新傳送。",
      media_too_large: "檔案超出此類附件嘅大小限制。",
      media_empty: "檔案內容為空。",
      media_format: "檔案內容未能辨識，或不支援此格式。",
      media_duration: "未能核實錄音長度，或錄音超過 30 分鐘。",
      media_audio_codec: "WhatsApp 語音需要 Opus 格式，請改用 MP3 或 M4A。",
    };
    throw new AttachmentError(
      error.code,
      labels[error.code] ?? "暫時未能取得原平台附件。",
      error.code === "media_unavailable" ? 503 : 422,
    );
  }
  throw error;
}
async function scope(a: Access, s: MediaScope, write = false) {
  if (!a.scope.brands.some((b) => b.id === s.brandId))
    throw new AttachmentError("access_denied", "你無權使用此品牌。", 403);
  checked(
    (
      await a.db.rpc("sv_voice_scope", {
        p_company: a.company.id,
        p_actor: a.user.id,
        p_brand: s.brandId,
        p_source: s.source,
        p_source_id: s.sourceId,
        p_write: write,
      })
    ).error,
  );
}
async function access(companyId: string, s: MediaScope, write = false) {
  z.uuid().parse(companyId);
  const a = await loadCompany(companyId, "crm");
  await scope(a, s, write);
  return a;
}
function matchAsset(asset: Asset, s: MediaScope) {
  if (
    asset.brand_id !== s.brandId ||
    asset.source !== s.source ||
    asset.source_id !== s.sourceId
  )
    throw new AttachmentError("missing", "找不到此對話嘅附件。", 404);
}
async function assetRow(a: Access, s: MediaScope, id: string) {
  const r = await a.db
    .from("sv_media_assets")
    .select("*")
    .eq("company_id", a.company.id)
    .eq("id", id)
    .maybeSingle();
  checked(r.error);
  if (!r.data) throw new AttachmentError("missing", "找不到附件。", 404);
  const asset = r.data as Asset;
  matchAsset(asset, s);
  return asset;
}
async function ownedOrShared(a: Access, asset: Asset) {
  if (asset.origin === "provider" || asset.created_by === a.user.id) return;
  const r = await a.db
    .from("sv_media_commands")
    .select("client_id")
    .eq("company_id", a.company.id)
    .eq("asset_id", asset.id)
    .limit(1);
  checked(r.error);
  if (!r.data?.length)
    throw new AttachmentError("access_denied", "此附件尚未傳送。", 403);
}
function clientAsset(asset: Asset): MediaAsset {
  if (
    asset.state !== "ready" ||
    !asset.kind ||
    !asset.mime_type ||
    !asset.media_bytes
  )
    throw new AttachmentError("not_ready", "附件仍未完成核對。", 409);
  return {
    id: asset.id,
    kind: asset.kind,
    filename: asset.filename,
    mimeType: asset.mime_type,
    bytes: asset.media_bytes,
    state: "ready",
  };
}
async function channelFor(a: Access, s: MediaScope) {
  if (s.source === "whatsapp") return "whatsapp" as const;
  const t = await a.db
    .from("sv_meta_threads")
    .select("connection_id")
    .eq("company_id", a.company.id)
    .eq("id", s.sourceId)
    .single();
  checked(t.error);
  const c = await a.db
    .from("sv_meta_connections")
    .select("channel")
    .eq("company_id", a.company.id)
    .eq("id", t.data?.connection_id)
    .single();
  checked(c.error);
  return z.enum(["messenger", "instagram"]).parse(c.data?.channel);
}
async function nativeRows(
  a: Access,
  s: MediaScope,
  ids: string[],
): Promise<Native[]> {
  if (!ids.length) return [];
  if (s.source === "whatsapp") {
    const messages = await a.db
      .from("sv_wa_messages")
      .select("id,provider_id,connection_id,message_type")
      .eq("company_id", a.company.id)
      .eq("conversation_id", s.sourceId)
      .eq("direction", "incoming")
      .in("id", ids)
      .in("message_type", ["image", "video", "audio", "document", "sticker"]);
    checked(messages.error);
    if (!messages.data?.length) return [];
    const connectionId = messages.data[0].connection_id;
    const [events, connection] = await Promise.all([
      a.db
        .from("sv_wa_events")
        .select("provider_id,payload")
        .eq("company_id", a.company.id)
        .eq("connection_id", connectionId)
        .eq("kind", "message")
        .in(
          "provider_id",
          messages.data.map((m) => m.provider_id).filter(Boolean),
        ),
      a.db
        .from("sv_wa_connections")
        .select("state")
        .eq("company_id", a.company.id)
        .eq("id", connectionId)
        .maybeSingle(),
    ]);
    checked(events.error);
    checked(connection.error);
    return messages.data.flatMap((m) => {
      const raw = record(
          record(
            events.data?.find((e) => e.provider_id === m.provider_id)?.payload,
          ).raw,
        ),
        payload = record(raw[m.message_type]);
      if (typeof payload.id !== "string" || !/^[1-9]\d{0,49}$/.test(payload.id))
        return [];
      const kind = (
        m.message_type === "sticker" ? "image" : m.message_type
      ) as MediaKind;
      return [
        {
          messageId: m.id,
          index: 0,
          kind,
          filename: safeFilename(
            typeof payload.filename === "string"
              ? payload.filename
              : kindNames[kind],
          ),
          connectionId,
          mediaId: payload.id,
          enabled: connection.data?.state !== "disabled",
        },
      ];
    });
  }
  const thread = await a.db
    .from("sv_meta_threads")
    .select("connection_id,peer_id")
    .eq("company_id", a.company.id)
    .eq("id", s.sourceId)
    .maybeSingle();
  checked(thread.error);
  if (!thread.data) return [];
  const [messages, connection] = await Promise.all([
    a.db
      .from("sv_meta_messages")
      .select("id,provider_id")
      .eq("company_id", a.company.id)
      .eq("thread_id", s.sourceId)
      .eq("direction", "inbound")
      .in("id", ids),
    a.db
      .from("sv_meta_connections")
      .select("enabled")
      .eq("company_id", a.company.id)
      .eq("id", thread.data.connection_id)
      .maybeSingle(),
  ]);
  checked(messages.error);
  checked(connection.error);
  if (!messages.data?.length) return [];
  const events = await a.db
    .from("sv_meta_events")
    .select("provider_id,raw")
    .eq("connection_id", thread.data.connection_id)
    .eq("peer_id", thread.data.peer_id)
    .eq("kind", "inbound")
    .in("provider_id", messages.data.map((m) => m.provider_id).filter(Boolean));
  checked(events.error);
  return messages.data.flatMap((m) => {
    const attachments = record(
      record(events.data?.find((e) => e.provider_id === m.provider_id)?.raw)
        .message,
    ).attachments;
    if (!Array.isArray(attachments)) return [];
    return attachments.slice(0, 10).flatMap((v, index) => {
      const raw = record(v),
        p = record(raw.payload);
      if (!["image", "video", "audio", "file"].includes(String(raw.type)))
        return [];
      const kind = (raw.type === "file" ? "document" : raw.type) as MediaKind;
      let url: string | undefined;
      if (typeof p.url === "string")
        try {
          providerMediaUrl(p.url);
          url = p.url;
        } catch {}
      return [
        {
          messageId: m.id,
          index,
          kind,
          filename: safeFilename(
            typeof p.name === "string"
              ? p.name
              : typeof raw.name === "string"
                ? raw.name
                : kindNames[kind],
          ),
          connectionId: thread.data!.connection_id,
          ...(url ? { url } : {}),
          enabled: connection.data?.enabled === true,
        },
      ];
    });
  });
}
/** One bounded, scoped batch for inbox projection; raw webhook URLs never leave this module. */
export async function readMediaMessageFlags(
  companyId: string,
  rawScope: unknown,
  messageIds: string[],
): Promise<string[]> {
  const s = mediaScope.parse(rawScope),
    ids = z.array(z.uuid()).max(100).parse(messageIds),
    a = await access(companyId, s);
  if (!ids.length) return [];
  const [native, commands] = await Promise.all([
    nativeRows(a, s, ids),
    a.db
      .from("sv_media_commands")
      .select("message_id")
      .eq("company_id", companyId)
      .eq("source", s.source)
      .eq("source_id", s.sourceId)
      .in("message_id", ids),
  ]);
  checked(commands.error);
  return [
    ...new Set([
      ...native.map((n) => n.messageId),
      ...(commands.data ?? []).map((c) => c.message_id),
    ]),
  ];
}
export async function readMedia(
  companyId: string,
  raw: unknown,
): Promise<{ items: MediaItem[] }> {
  const q = mediaQuery.parse(raw),
    a = await access(companyId, q);
  if (!q.messageId) return { items: [] };
  const [native, assets, commands] = await Promise.all([
    nativeRows(a, q, [q.messageId]),
    a.db
      .from("sv_media_assets")
      .select("*")
      .eq("company_id", companyId)
      .eq("source", q.source)
      .eq("source_id", q.sourceId)
      .eq("message_id", q.messageId)
      .eq("state", "ready"),
    a.db
      .from("sv_media_commands")
      .select("asset_id")
      .eq("company_id", companyId)
      .eq("source", q.source)
      .eq("source_id", q.sourceId)
      .eq("message_id", q.messageId),
  ]);
  checked(assets.error);
  checked(commands.error);
  const saved = (assets.data ?? []) as Asset[];
  if (commands.data?.length) {
    const outgoing = await a.db
      .from("sv_media_assets")
      .select("*")
      .eq("company_id", companyId)
      .in(
        "id",
        commands.data.map((c) => c.asset_id),
      )
      .eq("state", "ready");
    checked(outgoing.error);
    saved.push(...((outgoing.data ?? []) as Asset[]));
  }
  const items: MediaItem[] = native.map((n) => {
    const asset = saved.find(
      (x) => x.message_id === n.messageId && x.attachment_index === n.index,
    );
    return {
      id: n.messageId + ":" + n.index,
      assetId: asset?.id ?? null,
      messageId: n.messageId,
      index: n.index,
      kind: n.kind,
      filename: asset?.filename ?? n.filename,
      mimeType: asset?.mime_type ?? null,
      bytes: asset?.media_bytes ?? null,
      available: !!asset || (n.enabled && !!(n.mediaId || n.url)),
    };
  });
  for (const asset of saved)
    if (!items.some((i) => i.assetId === asset.id))
      items.push({
        id: asset.id,
        assetId: asset.id,
        messageId: q.messageId,
        index: asset.attachment_index,
        kind: asset.kind!,
        filename: asset.filename,
        mimeType: asset.mime_type,
        bytes: asset.media_bytes,
        available: true,
      });
  return { items };
}
async function verifiedBytes(a: Access, asset: Asset) {
  const r = await a.db.storage.from(MEDIA_BUCKET).download(asset.object_path);
  if (r.error || !r.data)
    throw new AttachmentError(
      "upload_missing",
      "檔案未上載完成，請核對同一操作。",
      409,
    );
  if (r.data.size > MEDIA_MAX_BYTES)
    throw new MediaBytesError("media_too_large");
  const bytes = new Uint8Array(await r.data.arrayBuffer());
  if (
    asset.content_hash &&
    createHash("sha256").update(bytes).digest("hex") !== asset.content_hash
  )
    throw new AttachmentError("changed", "附件未通過完整性核對。", 409);
  return bytes;
}
async function signedRead(a: Access, asset: Asset) {
  await ownedOrShared(a, asset);
  clientAsset(asset);
  const ttl = 300;
  const [r, download] = await Promise.all([
    a.db.storage.from(MEDIA_BUCKET).createSignedUrl(asset.object_path, ttl),
    a.db.storage
      .from(MEDIA_BUCKET)
      .createSignedUrl(asset.object_path, ttl, { download: asset.filename }),
  ]);
  if (r.error || !r.data || download.error || !download.data)
    throw new AttachmentError("unavailable", "暫時未能開啟私人附件。");
  return {
    asset: clientAsset(asset),
    url: r.data.signedUrl,
    downloadUrl: download.data.signedUrl,
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
  };
}
async function credentials(a: Access, s: MediaScope, connectionId: string) {
  if (s.source === "whatsapp") {
    const r = await a.db
      .from("sv_wa_connections")
      .select(
        "id,brand_id,state,encrypted_credentials,phone_number_id,messaging_account_id,webhook_verified_at",
      )
      .eq("company_id", a.company.id)
      .eq("id", connectionId)
      .single();
    checked(r.error);
    if (!r.data || r.data.brand_id !== s.brandId || r.data.state === "disabled")
      throw new AttachmentError("unconfigured", "WhatsApp連接未能使用。", 409);
    const secret = decryptCredentials(
      r.data.encrypted_credentials,
      readMasterKey(),
      a.company.id,
      connectionId,
    );
    return {
      token: z.string().min(16).max(8192).parse(secret.accessToken),
      accountId: r.data.phone_number_id,
      messagingAccountId: r.data.messaging_account_id,
      active: r.data.state === "active" && !!r.data.webhook_verified_at,
    };
  }
  const r = await a.db
    .from("sv_meta_connections")
    .select("id,brand_id,enabled,credentials,account_id,app_id")
    .eq("company_id", a.company.id)
    .eq("id", connectionId)
    .single();
  checked(r.error);
  if (
    !r.data?.enabled ||
    r.data.brand_id !== s.brandId ||
    r.data.app_id !== process.env.SMARTVOLT_META_APP_ID
  )
    throw new AttachmentError("unconfigured", "社交通訊連接未能使用。", 409);
  const key = Buffer.from(
      hkdfSync(
        "sha256",
        readMasterKey(),
        "convelta-meta",
        "credentials-v1",
        32,
      ),
    ),
    secret = decryptCredentials(
      r.data.credentials,
      key,
      `meta:${a.company.id}`,
      connectionId,
    );
  return {
    token: z.string().min(20).max(8192).parse(secret.token),
    accountId: r.data.account_id,
    messagingAccountId: null,
    active: true,
  };
}
function nativeAssetId(
  company: string,
  s: MediaScope,
  message: string,
  index: number,
) {
  const b = createHash("sha256")
    .update([company, s.source, s.sourceId, message, index].join(":"))
    .digest()
    .subarray(0, 16);
  b[6] = (b[6] & 15) | 80;
  b[8] = (b[8] & 63) | 128;
  return [
    ...[
      b.subarray(0, 4),
      b.subarray(4, 6),
      b.subarray(6, 8),
      b.subarray(8, 10),
      b.subarray(10, 16),
    ].map((x) => x.toString("hex")),
  ].join("-");
}
async function prepare(
  a: Access,
  s: MediaScope,
  messageId: string,
  index: number,
) {
  const existing = await a.db
    .from("sv_media_assets")
    .select("*")
    .eq("company_id", a.company.id)
    .eq("source", s.source)
    .eq("source_id", s.sourceId)
    .eq("message_id", messageId)
    .eq("attachment_index", index)
    .eq("state", "ready")
    .maybeSingle();
  checked(existing.error);
  if (existing.data) return signedRead(a, existing.data as Asset);
  const n = (await nativeRows(a, s, [messageId])).find(
    (n) => n.index === index,
  );
  if (!n?.enabled)
    throw new AttachmentError("missing", "未能取得原平台附件。", 404);
  let bytes: Uint8Array;
  if (s.source === "whatsapp" && n.mediaId) {
    const c = await credentials(a, s, n.connectionId),
      m = await whatsappMediaMetadata(
        n.mediaId,
        c.token,
        process.env.SMARTVOLT_WHATSAPP_GRAPH_VERSION || DEFAULT_GRAPH_VERSION,
      );
    bytes = await fetchProviderMedia(m.url, c.token);
    if (m.hash) {
      const d = createHash("sha256").update(bytes).digest();
      if (![d.toString("hex"), d.toString("base64")].includes(m.hash))
        throw new AttachmentError("changed", "原平台附件未通過指紋核對。", 409);
    }
  } else if (n.url) bytes = await fetchProviderMedia(n.url);
  else
    throw new AttachmentError(
      "expired",
      "原平台附件已過期，請客人重新傳送。",
      410,
    );
  const meta = await inspectMedia(bytes);
  if (meta.kind !== n.kind)
    throw new AttachmentError("format", "原平台附件類型不一致。", 422);
  const id = nativeAssetId(a.company.id, s, messageId, index),
    path = a.company.id + "/" + id;
  const uploaded = await a.db.storage.from(MEDIA_BUCKET).upload(path, bytes, {
    contentType: meta.mimeType,
    upsert: false,
    cacheControl: "0",
  });
  if (uploaded.error) {
    const saved = await a.db.storage.from(MEDIA_BUCKET).download(path);
    if (
      saved.error ||
      !saved.data ||
      saved.data.size !== bytes.length ||
      createHash("sha256")
        .update(new Uint8Array(await saved.data.arrayBuffer()))
        .digest("hex") !== meta.contentHash
    )
      throw new AttachmentError("unknown", "私人附件儲存結果待核對。");
  }
  const filename = n.filename.includes(".")
    ? n.filename
    : n.filename + "." + meta.extension;
  const r = await a.db.rpc("sv_media_native", {
    p_company: a.company.id,
    p_actor: a.user.id,
    p_id: id,
    p_data: { ...s, messageId, index, filename, ...meta },
  });
  checked(r.error);
  return signedRead(a, r.data as Asset);
}
async function receipt(
  a: Access,
  s: MediaScope,
  clientId: string,
  replayed = true,
): Promise<MediaReceipt> {
  const command = await a.db
    .from("sv_media_commands")
    .select("actor_id,source,source_id,message_id")
    .eq("company_id", a.company.id)
    .eq("client_id", clientId)
    .maybeSingle();
  checked(command.error);
  if (
    !command.data ||
    command.data.actor_id !== a.user.id ||
    command.data.source !== s.source ||
    command.data.source_id !== s.sourceId
  )
    throw new AttachmentError(
      "missing",
      "未有找到呢次傳送紀錄，請核對同一操作。",
      404,
    );
  const r = await a.db
    .from(s.source === "whatsapp" ? "sv_wa_messages" : "sv_meta_messages")
    .select("id,state,error_code")
    .eq("company_id", a.company.id)
    .eq("id", command.data.message_id)
    .single();
  checked(r.error);
  let state = String(r.data?.state);
  if (state === "dispatching") state = "sending";
  if (state === "uncertain") state = "unknown";
  return {
    clientId,
    messageId: command.data.message_id,
    state: z
      .enum([
        "sending",
        "accepted",
        "sent",
        "delivered",
        "read",
        "failed",
        "unknown",
      ])
      .parse(state),
    replayed,
    errorCode:
      typeof r.data?.error_code === "string" ? r.data.error_code : null,
  };
}
export async function actMedia(companyId: string, raw: unknown) {
  const c = mediaCommand.parse(raw),
    write = !["prepare", "open", "receipt"].includes(c.action),
    a = await access(companyId, c, write);
  try {
    if (c.action === "reserve") {
      const r = await a.db.rpc("sv_media_reserve", {
        p_company: companyId,
        p_actor: a.user.id,
        p_id: c.requestId,
        p_data: { ...c, filename: safeFilename(c.filename) },
      });
      checked(r.error);
      const asset = r.data as Asset;
      if (asset.state === "ready")
        return { asset: clientAsset(asset), uploadUrl: null };
      const signed = await a.db.storage
        .from(MEDIA_BUCKET)
        .createSignedUploadUrl(asset.object_path, { upsert: false });
      if (signed.error || !signed.data)
        throw new AttachmentError(
          "unavailable",
          "暫時未能準備上載，請重試同一操作。",
        );
      return {
        assetId: asset.id,
        uploadUrl: signed.data.signedUrl,
        expiresAt: asset.expires_at,
      };
    }
    if (c.action === "prepare")
      return await prepare(a, c, c.messageId, c.index);
    if (c.action === "receipt")
      return { receipt: await receipt(a, c, c.clientId) };
    const asset = await assetRow(a, c, c.assetId);
    await ownedOrShared(a, asset);
    if (c.action === "open") return await signedRead(a, asset);
    if (c.action === "cancel") {
      const r = await a.db.rpc("sv_media_cancel", {
        p_company: companyId,
        p_actor: a.user.id,
        p_id: asset.id,
      });
      checked(r.error);
      const removed = await a.db.storage
        .from(MEDIA_BUCKET)
        .remove([asset.object_path]);
      return { cancelled: true, cleanupPending: !!removed.error };
    }
    if (c.action === "complete") {
      if (asset.created_by !== a.user.id || asset.origin !== "staff_upload")
        throw new AttachmentError("access_denied", "你無權完成此上載。", 403);
      if (asset.state === "ready") return { asset: clientAsset(asset) };
      const bytes = await verifiedBytes(a, asset),
        meta = await inspectMedia(bytes);
      if (
        !supportedMedia(
          meta.kind,
          meta.mimeType,
          c.source,
          await channelFor(a, c),
        )
      )
        throw new AttachmentError(
          "unsupported",
          "此渠道不支援呢個附件格式，請改用 JPG、PNG、MP4、MP3、M4A 或 PDF。",
          422,
        );
      if (meta.mimeType !== asset.declared_mime)
        throw new AttachmentError(
          "format",
          "檔案內容與格式不一致，請重新匯出原檔。",
          422,
        );
      // Signed upload metadata is untrusted. Retain the verified bytes and set
      // canonical MIME server-side before issuing any private viewing URL.
      const canonical = await a.db.storage
        .from(MEDIA_BUCKET)
        .update(asset.object_path, bytes, {
          contentType: meta.mimeType,
          cacheControl: "0",
          upsert: false,
        });
      if (canonical.error)
        throw new AttachmentError(
          "unavailable",
          "暫時未能確認附件格式，請核對同一上載。",
        );
      const r = await a.db.rpc("sv_media_verify", {
        p_company: companyId,
        p_actor: a.user.id,
        p_id: asset.id,
        p_data: meta,
      });
      checked(r.error);
      return { asset: clientAsset(r.data as Asset) };
    }
    clientAsset(asset);
    const channel = await channelFor(a, c);
    if (!supportedMedia(asset.kind!, asset.mime_type!, c.source, channel))
      throw new AttachmentError(
        "unsupported",
        "此渠道未支援呢個附件格式。",
        422,
      );
    // Captions on Meta and audio are not silently represented as externally sent text.
    if (c.caption && (c.source === "meta" || asset.kind === "audio"))
      throw new AttachmentError("caption", "呢類附件請分開傳送文字回覆。", 422);
    const claim = await a.db.rpc("sv_media_claim", {
      p_company: companyId,
      p_actor: a.user.id,
      p_id: asset.id,
      p_client: c.clientId,
      p_expected: c.revision,
      p_caption: c.caption,
      p_editor: c.editorToken,
    });
    checked(claim.error);
    const data = record(claim.data),
      message = record(data.message);
    if (data.dispatch !== true)
      return { receipt: await receipt(a, c, c.clientId) };
    let outcome: Awaited<ReturnType<typeof dispatchMedia>> = {
      state: "failed",
      providerId: null,
      errorCode: "invalid_request",
    };
    try {
      const secrets = await credentials(a, c, String(data.connectionId));
      if (secrets.active) {
        const signed = await a.db.storage
          .from(MEDIA_BUCKET)
          .createSignedUrl(
            asset.object_path,
            600,
            asset.kind === "document" ? { download: asset.filename } : {},
          );
        if (signed.error || !signed.data) throw Error("media_unavailable");
        const payload =
          c.source === "whatsapp"
            ? whatsappMediaPayload({
                phoneNumberId: secrets.accountId,
                token: secrets.token,
                to:
                  data.remoteKind === "phone"
                    ? {
                        kind: "phone",
                        id: String(data.remoteId),
                        phone: String(data.remoteId),
                        bsuid: null,
                        parentBsuid: null,
                      }
                    : {
                        kind: "bsuid",
                        id: String(data.remoteId),
                        phone: null,
                        bsuid: String(data.remoteId),
                        parentBsuid: null,
                      },
                kind: asset.kind!,
                url: signed.data.signedUrl,
                filename: asset.filename,
                caption: c.caption,
                clientId: String(message.id),
                version:
                  process.env.SMARTVOLT_WHATSAPP_GRAPH_VERSION ||
                  DEFAULT_GRAPH_VERSION,
                ...(secrets.messagingAccountId
                  ? { messagingAccountId: secrets.messagingAccountId }
                  : {}),
              })
            : metaMediaPayload({
                accountId: String(data.accountId),
                peerId: String(data.peerId),
                channel: z.enum(["messenger", "instagram"]).parse(data.channel),
                kind: asset.kind!,
                url: signed.data.signedUrl,
              });
        outcome = await dispatchMedia({
          source: c.source,
          accountId: secrets.accountId,
          token: secrets.token,
          payload,
          version:
            c.source === "whatsapp"
              ? process.env.SMARTVOLT_WHATSAPP_GRAPH_VERSION
              : undefined,
          peerId: typeof data.peerId === "string" ? data.peerId : undefined,
        });
      }
    } catch {
      /* No provider send is retried; local failures retain a definite failure receipt. */
    }
    try {
      if (c.source === "whatsapp") {
        checked(
          (
            await a.db.rpc("sv_wa_finish_send", {
              p_company: companyId,
              p_message: message.id,
              p_disposition:
                outcome.state === "accepted"
                  ? "accepted"
                  : outcome.state === "unknown"
                    ? "ambiguous"
                    : "definitive",
              p_provider_id: outcome.providerId,
              p_error_code: outcome.errorCode,
            })
          ).error,
        );
      } else {
        checked(
          (
            await a.db.rpc("sv_meta_finish", {
              p_company: companyId,
              p_message: message.id,
              p_state:
                outcome.state === "unknown" ? "uncertain" : outcome.state,
              p_provider: outcome.providerId,
              p_code: outcome.errorCode,
            })
          ).error,
        );
      }
      return { receipt: await receipt(a, c, c.clientId, false) };
    } catch {
      throw new AttachmentError(
        "delivery_pending",
        "傳送結果仍待核對，請保留同一操作。",
        503,
      );
    }
  } catch (e) {
    bytesFailure(e);
  }
}

/** Private maintenance only. A cancelled/expired staging object can never be sent. */
export async function cleanupMediaStaging(companyId: string) {
  const { database } = await import("@/lib/saas/database"),
    db = database();
  const r = await db.rpc("sv_media_expire", { p_company: companyId });
  checked(r.error);
  const items = r.data as { id: string; objectPath: string }[];
  if (!items?.length) return;
  const removed = await db.storage
    .from(MEDIA_BUCKET)
    .remove(items.map((x) => x.objectPath));
  if (removed.error)
    throw new AttachmentError("cleanup", "暫時未能清理過期附件。");
  checked(
    (
      await db.rpc("sv_media_cleanup_ack", {
        p_company: companyId,
        p_ids: items.map((x) => x.id),
      })
    ).error,
  );
}
