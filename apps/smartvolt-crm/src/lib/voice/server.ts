import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { loadCompany } from "@/lib/saas/server";
import { AccessError } from "@/lib/saas/identity";
import { aiModel } from "@/lib/ai/server";
import { classifyAIError } from "@/lib/ai/errors";
import { decryptCredentials, readMasterKey } from "@/lib/whatsapp/crypto";
import {
  downloadProviderAudio,
  inspectAudio,
  mediaUrl,
  VoiceMediaError,
  whatsappAudioMetadata,
} from "./audio";
import { transcribeVoice, transcriptionModel } from "./generate";
import {
  extractVoiceNeeds,
  voiceCommand,
  voiceQuery,
  type VoiceItem,
  type VoicePage,
  type VoiceSource,
  type VoiceTranscript,
} from "./model";

type Access = Awaited<ReturnType<typeof loadCompany>>;
type Query = z.infer<typeof voiceQuery>;
type Asset = {
  id: string;
  brand_id: string;
  source: VoiceSource;
  source_id: string;
  message_id: string;
  origin: "provider" | "staff_upload";
  object_path: string;
  content_hash: string;
  mime_type: string;
  audio_bytes: number;
  duration_seconds: number;
  created_at: string;
};
type Native = {
  id: string;
  createdAt: string;
  providerId: string;
  connectionId: string;
  audioId?: string;
  url?: string;
  enabled: boolean;
};
type TranscriptRow = {
  id: string;
  asset_id: string;
  original_text: string;
  language: VoiceTranscript["language"];
  extractions: VoiceTranscript["extractions"];
  created_at: string;
};
type CorrectionRow = {
  revision: number;
  text: string;
  reason: string;
  extractions: VoiceTranscript["extractions"];
  created_at: string;
};
const BUCKET = "convelta-voice";

export class VoiceError extends AccessError {
  constructor(
    public code: string,
    message: string,
    status = 503,
    public terminalFailure = false,
  ) {
    super(message, status);
  }
}
function checked(error: { message?: string; code?: string } | null) {
  if (!error) return;
  const msg = error.message ?? "";
  if (
    /access_denied|product_required|brand_scope|member_scope|product_not_purchased/.test(
      msg,
    )
  )
    throw new VoiceError("access_denied", "你無權使用呢段對話嘅語音。", 403);
  if (/source_missing/.test(msg) || error.code === "P0002")
    throw new VoiceError("missing_audio", "找不到呢段對話或語音。", 404);
  if (/daily_limit/.test(msg))
    throw new VoiceError("daily_limit", "今日 AI 用量已達上限。", 429);
  if (/ai_busy/.test(msg))
    throw new VoiceError("busy", "上一個 AI 請求仍在處理，請稍後核對。", 409);
  if (/ai_disabled/.test(msg))
    throw new VoiceError(
      "disabled",
      "公司 AI 已暫停；原音同逐字稿仍然保留。",
      409,
    );
  if (/revision|idempotency/.test(msg) || error.code === "23505")
    throw new VoiceError(
      "conflict",
      "語音或修正記錄已更新，請重新讀取後核對。",
      409,
    );
  if (/invalid/.test(msg))
    throw new VoiceError("invalid", "語音資料未通過核對。", 400);
  throw new VoiceError("unavailable", "暫時未能確認語音記錄，請核對同一操作。");
}
function mediaFailure(e: unknown): never {
  if (e instanceof VoiceMediaError) {
    const labels: Record<string, string> = {
      audio_url_invalid: "原音位置未能安全核實，請由原平台重新取得。",
      audio_too_large: "原音超過 4 MB，請提供較短錄音。",
      audio_too_long: "原音超過 5 分鐘，請分段上載。",
      audio_duration_unknown: "未能核實錄音長度，請轉存為標準音訊格式。",
      audio_format: "未能辨識呢個音訊格式。",
      audio_expired: "原平台語音已過期；可以上載原音副本。",
      audio_missing: "未能取得原音，未有執行轉錄。",
      audio_unavailable: "原平台暫時未能提供語音。",
    };
    throw new VoiceError(
      e.code,
      labels[e.code] ?? "未能取得原音。",
      e.code === "audio_unavailable" ? 503 : 422,
    );
  }
  throw e;
}
async function scope(a: Access, q: Query, write = false) {
  if (!a.scope.brands.some((b) => b.id === q.brandId))
    throw new VoiceError("access_denied", "你無權使用此品牌。", 403);
  const r = await a.db.rpc("sv_voice_scope", {
    p_company: a.company.id,
    p_actor: a.user.id,
    p_brand: q.brandId,
    p_source: q.source,
    p_source_id: q.sourceId,
    p_write: write,
  });
  checked(r.error);
}
function record(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}
function attachments(raw: unknown) {
  const m = record(record(raw).message);
  return Array.isArray(m.attachments) ? m.attachments.map(record) : [];
}
async function nativeSources(a: Access, q: Query): Promise<Native[]> {
  if (q.source === "conversation") return [];
  if (q.source === "whatsapp") {
    let query = a.db
      .from("sv_wa_messages")
      .select("id,provider_id,created_at,connection_id")
      .eq("company_id", a.company.id)
      .eq("conversation_id", q.sourceId)
      .eq("direction", "incoming")
      .eq("message_type", "audio");
    if (q.messageId) query = query.eq("id", q.messageId);
    const m = await query.order("seq", { ascending: false }).limit(20);
    checked(m.error);
    if (!m.data?.length) return [];
    const cn = await a.db
      .from("sv_wa_connections")
      .select("id,state")
      .eq("company_id", a.company.id)
      .eq("id", m.data[0].connection_id)
      .maybeSingle();
    checked(cn.error);
    const e = await a.db
      .from("sv_wa_events")
      .select("provider_id,payload")
      .eq("company_id", a.company.id)
      .eq("connection_id", m.data[0].connection_id)
      .eq("kind", "message")
      .in(
        "provider_id",
        m.data.map((x) => x.provider_id),
      );
    checked(e.error);
    return m.data.map((x) => {
      const raw = record(
        record(e.data?.find((e) => e.provider_id === x.provider_id)?.payload)
          .raw,
      );
      const audioId = record(raw.audio).id;
      return {
        id: x.id,
        createdAt: x.created_at,
        providerId: x.provider_id,
        connectionId: x.connection_id,
        ...(typeof audioId === "string" ? { audioId } : {}),
        enabled: !!cn.data && cn.data.state !== "disabled",
      };
    });
  }
  const t = await a.db
    .from("sv_meta_threads")
    .select("connection_id,peer_id")
    .eq("company_id", a.company.id)
    .eq("id", q.sourceId)
    .maybeSingle();
  checked(t.error);
  if (!t.data) return [];
  const cn = await a.db
    .from("sv_meta_connections")
    .select("id,enabled")
    .eq("company_id", a.company.id)
    .eq("id", t.data.connection_id)
    .maybeSingle();
  checked(cn.error);
  let query = a.db
    .from("sv_meta_messages")
    .select("id,provider_id,created_at")
    .eq("company_id", a.company.id)
    .eq("thread_id", q.sourceId)
    .eq("direction", "inbound");
  if (q.messageId) query = query.eq("id", q.messageId);
  const m = await query
    .order("seq", { ascending: false })
    .limit(q.messageId ? 1 : 40);
  checked(m.error);
  if (!m.data?.length) return [];
  const e = await a.db
    .from("sv_meta_events")
    .select("provider_id,raw")
    .eq("connection_id", t.data.connection_id)
    .eq("kind", "inbound")
    .eq("peer_id", t.data.peer_id)
    .in("provider_id", m.data.map((x) => x.provider_id).filter(Boolean));
  checked(e.error);
  return m.data
    .flatMap((x) => {
      const audio = attachments(
        e.data?.find((e) => e.provider_id === x.provider_id)?.raw,
      ).find((x) => x.type === "audio");
      if (!audio) return [];
      const url = record(audio.payload).url;
      let valid = false;
      if (typeof url === "string") {
        try {
          mediaUrl(url);
          valid = true;
        } catch {}
      }
      return [
        {
          id: x.id,
          createdAt: x.created_at,
          providerId: x.provider_id,
          connectionId: t.data!.connection_id,
          ...(valid ? { url: url as string } : {}),
          enabled: cn.data?.enabled === true,
        },
      ];
    })
    .slice(0, 20);
}
async function assetRows(a: Access, q: Query) {
  let query = a.db
    .from("sv_voice_assets")
    .select("*")
    .eq("company_id", a.company.id)
    .eq("brand_id", q.brandId)
    .eq("source", q.source)
    .eq("source_id", q.sourceId);
  if (q.messageId) query = query.eq("message_id", q.messageId);
  const r = await query.order("created_at", { ascending: false }).limit(20);
  checked(r.error);
  return (r.data ?? []) as Asset[];
}
async function transcriptFor(
  a: Access,
  assetId: string,
): Promise<VoiceTranscript | null> {
  const t = await a.db
    .from("sv_voice_transcripts")
    .select("id,asset_id,original_text,language,extractions,created_at")
    .eq("company_id", a.company.id)
    .eq("asset_id", assetId)
    .maybeSingle();
  checked(t.error);
  if (!t.data) return null;
  const row = t.data as TranscriptRow;
  const c = await a.db
    .from("sv_voice_corrections")
    .select("revision,text,reason,extractions,created_at")
    .eq("company_id", a.company.id)
    .eq("transcript_id", row.id)
    .order("revision", { ascending: false })
    .limit(20);
  checked(c.error);
  const corrections = (c.data ?? []) as CorrectionRow[],
    latest = corrections[0];
  return {
    id: row.id,
    originalText: row.original_text,
    text: latest?.text ?? row.original_text,
    language: row.language,
    revision: latest?.revision ?? 0,
    extractions: latest?.extractions ?? row.extractions,
    corrected: !!latest,
    createdAt: row.created_at,
    history: corrections.map((x) => ({
      revision: x.revision,
      text: x.text,
      reason: x.reason,
      createdAt: x.created_at,
    })),
  };
}
function audioUrl(a: Access, q: Query, messageId: string) {
  return (
    "/api/companies/" +
    a.company.id +
    "/voice/audio?" +
    new URLSearchParams({
      brandId: q.brandId,
      source: q.source,
      sourceId: q.sourceId,
      messageId,
    })
  );
}
async function projectItem(
  a: Access,
  q: Query,
  asset?: Asset,
  native?: Native,
): Promise<VoiceItem> {
  const id = asset?.message_id ?? native?.id ?? q.messageId!;
  const transcript = asset ? await transcriptFor(a, asset.id) : null;
  let requestId: string | undefined,
    running = false,
    failed = false;
  if (asset && !transcript) {
    const pending = await a.db
      .from("sv_ai_requests")
      .select("request_id,actor_id,status,created_at")
      .eq("company_id", a.company.id)
      .eq("feature", "voice")
      .eq("voice_context->>assetId", asset.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    checked(pending.error);
    if (pending.data) {
      running =
        pending.data.status === "running" &&
        Date.parse(pending.data.created_at) > Date.now() - 120000;
      failed = !running && ["running", "failed"].includes(pending.data.status);
      if (running && pending.data.actor_id === a.user.id)
        requestId = pending.data.request_id;
    }
  }
  const available =
    !!asset || !!(native?.enabled && (native.audioId || native.url));
  return {
    id: asset?.id ?? id,
    messageId: id,
    available,
    status: transcript
      ? "completed"
      : running
        ? "running"
        : failed
          ? "failed"
          : available
            ? "available"
            : "missing_audio",
    ...(requestId ? { requestId } : {}),
    origin: asset?.origin ?? "provider",
    audioUrl: available ? audioUrl(a, q, id) : null,
    transcript,
    ...(asset
      ? {
          durationSeconds: asset.duration_seconds,
          mimeType: asset.mime_type,
          createdAt: asset.created_at,
        }
      : { createdAt: native?.createdAt }),
    label: asset?.origin === "staff_upload" ? "同事上載原音" : "客戶語音",
  };
}
export async function readVoice(
  companyId: string,
  raw: unknown,
): Promise<VoicePage> {
  z.uuid().parse(companyId);
  const q = voiceQuery.parse(raw),
    a = await loadCompany(companyId, "crm");
  await scope(a, q);
  const [assets, native, settings] = await Promise.all([
    assetRows(a, q),
    nativeSources(a, q),
    a.db
      .from("sv_ai_settings")
      .select("enabled")
      .eq("company_id", companyId)
      .maybeSingle(),
  ]);
  checked(settings.error);
  const keys = [
    ...new Set([
      ...assets.map((a) => a.message_id),
      ...native.map((n) => n.id),
      ...(q.messageId ? [q.messageId] : []),
    ]),
  ].slice(0, 20);
  const items: VoiceItem[] = [];
  for (let i = 0; i < keys.length; i += 4)
    items.push(
      ...(await Promise.all(
        keys.slice(i, i + 4).map((id) =>
          projectItem(
            a,
            q,
            assets.find((x) => x.message_id === id),
            native.find((x) => x.id === id),
          ),
        ),
      )),
    );
  const configured = !!aiModel() && !!transcriptionModel(),
    enabled = settings.data?.enabled === true;
  return {
    items,
    canTranscribe: a.actor.role !== "viewer" && configured && enabled,
    canCorrect: a.actor.role !== "viewer",
    readiness: !configured
      ? "unconfigured"
      : !enabled
        ? "disabled"
        : "configured",
    blocker: !configured
      ? "語音轉錄服務尚未設定。"
      : !enabled
        ? "公司 AI 已暫停；原音同逐字稿仍可查閱。"
        : null,
  };
}
async function privateBytes(a: Access, asset: Asset) {
  const r = await a.db.storage.from(BUCKET).download(asset.object_path);
  if (r.error || !r.data)
    throw new VoiceError("audio_unavailable", "暫時未能讀取私人原音。");
  if (r.data.size > 4 * 1024 * 1024)
    throw new VoiceError("audio_too_large", "原音超出大小限制。", 422);
  const bytes = new Uint8Array(await r.data.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== asset.content_hash)
    throw new VoiceError("audio_changed", "原音副本未通過完整性核對。", 409);
  return bytes;
}
async function providerBytes(a: Access, q: Query, native: Native) {
  if (!native.enabled)
    throw new VoiceError(
      "missing_audio",
      "原平台連接未啟用，未能取得原音。",
      409,
    );
  try {
    if (q.source === "whatsapp" && native.audioId) {
      const c = await a.db
        .from("sv_wa_connections")
        .select("encrypted_credentials")
        .eq("company_id", a.company.id)
        .eq("id", native.connectionId)
        .maybeSingle();
      checked(c.error);
      const secret = decryptCredentials(
        c.data?.encrypted_credentials,
        readMasterKey(),
        a.company.id,
        native.connectionId,
      );
      const token = z.string().min(16).max(8192).parse(secret.accessToken),
        m = await whatsappAudioMetadata(native.audioId, token),
        bytes = await downloadProviderAudio(m.url, token);
      if (m.sha256) {
        const digest = createHash("sha256").update(bytes).digest();
        if (
          ![digest.toString("base64"), digest.toString("hex")].includes(
            m.sha256,
          )
        )
          throw new VoiceError(
            "audio_changed",
            "原音未通過平台指紋核對。",
            409,
          );
      }
      return bytes;
    }
    if (q.source === "meta" && native.url) {
      // Only the signed provider URL from the authenticated stored webhook is used.
      return await downloadProviderAudio(native.url);
    }
    throw new VoiceMediaError("audio_missing");
  } catch (e) {
    if (e instanceof VoiceError) throw e;
    if (e instanceof VoiceMediaError) mediaFailure(e);
    throw new VoiceError(
      "audio_unavailable",
      "暫時未能從原平台取得語音；請核對連接或上載原音副本。",
    );
  }
}
async function persistAsset(
  a: Access,
  q: Query,
  id: string,
  messageId: string,
  origin: Asset["origin"],
  bytes: Uint8Array,
): Promise<Asset> {
  let meta;
  try {
    meta = await inspectAudio(bytes);
  } catch (e) {
    return mediaFailure(e);
  }
  const path = a.company.id + "/" + id;
  const r = await a.db.storage.from(BUCKET).upload(path, bytes, {
    contentType: meta.mimeType,
    upsert: false,
    cacheControl: "0",
  });
  if (r.error) {
    // An interrupted upload is recovered only if the exact bytes are already present.
    const existing = await a.db.storage.from(BUCKET).download(path);
    if (
      existing.error ||
      !existing.data ||
      existing.data.size !== bytes.length ||
      createHash("sha256")
        .update(new Uint8Array(await existing.data.arrayBuffer()))
        .digest("hex") !== meta.contentHash
    )
      throw new VoiceError(
        "upload_unknown",
        "未能確認原音儲存，請核對同一上載操作。",
      );
  }
  const saved = await a.db.rpc("sv_voice_register", {
    p_company: a.company.id,
    p_actor: a.user.id,
    p_asset: id,
    p_data: {
      brandId: q.brandId,
      source: q.source,
      sourceId: q.sourceId,
      messageId,
      origin,
      ...meta,
    },
  });
  checked(saved.error);
  return saved.data as Asset;
}
export async function uploadVoice(
  companyId: string,
  qRaw: unknown,
  requestId: string,
  file: File,
) {
  z.uuid().parse(companyId);
  z.uuid().parse(requestId);
  const q = voiceQuery.omit({ messageId: true }).parse(qRaw),
    a = await loadCompany(companyId, "crm");
  await scope(a, q, true);
  if (file.size > 4 * 1024 * 1024)
    throw new VoiceError("audio_too_large", "原音超過 4 MB。", 413);
  const asset = await persistAsset(
    a,
    q,
    requestId,
    requestId,
    "staff_upload",
    new Uint8Array(await file.arrayBuffer()),
  );
  return { item: await projectItem(a, q, asset) };
}
function receipt(row: { status?: string; error_code?: string | null }) {
  if (row.status === "running") return { state: "running" as const };
  if (row.status === "completed") return null;
  if (row.status === "failed")
    throw new VoiceError(
      row.error_code ?? "unavailable",
      row.error_code === "disabled"
        ? "公司 AI 已暫停，未有新增逐字稿。"
        : "呢次轉錄未完成，原音仍保留；可以重新轉錄。",
      503,
      true,
    );
  throw new VoiceError("unknown", "未能確認轉錄結果，請核對同一請求。");
}
export async function actVoice(companyId: string, raw: unknown) {
  const cmd = voiceCommand.parse(raw),
    a = await loadCompany(companyId, "crm");
  if (cmd.type === "correct") {
    const r = await a.db.rpc("sv_voice_correct", {
      p_company: companyId,
      p_actor: a.user.id,
      p_transcript: cmd.transcriptId,
      p_command: cmd.commandId,
      p_expected: cmd.expectedRevision,
      p_text: cmd.text,
      p_reason: cmd.reason,
      p_extractions: extractVoiceNeeds(cmd.text),
    });
    checked(r.error);
    const t = await a.db
      .from("sv_voice_transcripts")
      .select("asset_id")
      .eq("company_id", companyId)
      .eq("id", cmd.transcriptId)
      .maybeSingle();
    checked(t.error);
    const asset = await a.db
      .from("sv_voice_assets")
      .select("*")
      .eq("company_id", companyId)
      .eq("id", t.data?.asset_id)
      .maybeSingle();
    checked(asset.error);
    if (!asset.data) throw new VoiceError("missing_audio", "找不到原音。", 404);
    const row = asset.data as Asset,
      q = {
        brandId: row.brand_id,
        source: row.source,
        sourceId: row.source_id,
      };
    await scope(a, q);
    return { saved: true, item: await projectItem(a, q, row) };
  }
  const q = voiceQuery.parse({
    brandId: cmd.brandId,
    source: cmd.source,
    sourceId: cmd.sourceId,
    messageId: cmd.messageId,
  });
  await scope(a, q, true);
  const model = transcriptionModel();
  if (!model || !aiModel())
    throw new VoiceError("unconfigured", "語音轉錄服務尚未設定。", 409);
  let asset = (await assetRows(a, q))[0];
  let bytes: Uint8Array | undefined;
  if (!asset) {
    const native = (await nativeSources(a, q))[0];
    if (!native)
      throw new VoiceError(
        "missing_audio",
        "未能取得呢則訊息嘅原音，未有執行轉錄。",
        404,
      );
    bytes = await providerBytes(a, q, native);
    asset = await persistAsset(a, q, native.id, native.id, "provider", bytes);
  }
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        feature: "voice-v1",
        assetId: asset.id,
        contentHash: asset.content_hash,
      }),
    )
    .digest("hex");
  const claim = await a.db.rpc("sv_voice_claim", {
    p_company: companyId,
    p_actor: a.user.id,
    p_request: cmd.requestId,
    p_asset: asset.id,
    p_model: model,
    p_hash: hash,
  });
  checked(claim.error);
  if (!claim.data.dispatch) {
    const running = receipt(claim.data);
    return running ?? { item: await projectItem(a, q, asset) };
  }
  let result = null,
    error: string | null = null;
  try {
    result = await transcribeVoice(
      bytes ?? (await privateBytes(a, asset)),
      model,
    );
  } catch (e) {
    error =
      e instanceof Error && e.message === "voice_transcript_invalid"
        ? "answer_verification_failed"
        : classifyAIError(e);
  }
  const finished = await a.db.rpc("sv_voice_finish", {
    p_company: companyId,
    p_actor: a.user.id,
    p_request: cmd.requestId,
    p_result: result,
    p_error: error,
  });
  checked(finished.error);
  const running = receipt(finished.data);
  return running ?? { item: await projectItem(a, q, asset) };
}
export async function readVoiceAudio(companyId: string, raw: unknown) {
  const q = voiceQuery.extend({ messageId: z.uuid() }).parse(raw),
    a = await loadCompany(companyId, "crm");
  await scope(a, q);
  const asset = (await assetRows(a, q))[0];
  if (asset)
    return { bytes: await privateBytes(a, asset), mimeType: asset.mime_type };
  const native = (await nativeSources(a, q))[0];
  if (!native)
    throw new VoiceError("missing_audio", "找不到呢則訊息嘅原音。", 404);
  const bytes = await providerBytes(a, q, native);
  let meta;
  try {
    meta = await inspectAudio(bytes);
  } catch (e) {
    return mediaFailure(e);
  }
  return { bytes, mimeType: meta.mimeType };
}
/** Staff-reviewed corrections only; unreviewed ASR is never promoted into reply authority. */
export async function reviewedVoiceContext(
  a: Access,
  brandId: string,
  source: VoiceSource,
  sourceId: string,
) {
  const q = { brandId, source, sourceId };
  await scope(a, q);
  const assets = await assetRows(a, q),
    out: {
      id: string;
      messageId: string;
      revision: number;
      text: string;
      contentHash: string;
      label: string;
    }[] = [];
  for (const asset of assets.slice(0, 8)) {
    const t = await transcriptFor(a, asset.id);
    if (t?.corrected)
      out.push({
        id: t.id,
        messageId: asset.message_id,
        revision: t.revision,
        text: t.text.slice(0, 2000),
        contentHash: asset.content_hash,
        label: "同事已核對語音逐字稿",
      });
  }
  return out;
}
