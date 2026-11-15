import "server-only";
import { z } from "zod";
import { requireCompany } from "@/lib/saas/server";
import { requireProduct } from "@/lib/saas/products";
import { AccessError } from "@/lib/saas/identity";
import { bookingNames } from "@/lib/inquiries/model";
import {
  memoryCommandSchema,
  memoryCursorSchema,
  memoryQuerySchema,
  memoryCategorySchema,
  type CustomerMemory,
  type CustomerMemoryPage,
  type MemoryTimelineItem,
} from "./model";

type Access = Awaited<ReturnType<typeof requireCompany>>;
function checked(error: { message?: string; code?: string } | null) {
  if (!error) return;
  const m = error.message ?? "";
  if (
    /access_denied|product_required|brand_scope|memory_customer_scope/.test(m)
  )
    throw new AccessError("你無權開啟此客戶或品牌記憶。", 403);
  if (/revision|idempotency|context_changed/.test(m) || error.code === "23505")
    throw new AccessError("客戶記憶已更新，請重新讀取後核對。", 409);
  if (/capacity/.test(m))
    throw new AccessError(
      "此客戶已有 100 項記憶，請先整理不再適用嘅項目。",
      409,
    );
  if (error.code === "P0002")
    throw new AccessError("找不到此客戶或來源。", 404);
  if (/invalid/.test(m))
    throw new AccessError("資料未通過核對，改動未有儲存。", 400);
  throw new AccessError("暫時未能核對客戶記憶，請稍後重試同一操作。", 503);
}
async function access(companyId: string, customerId: string) {
  z.uuid().parse(companyId);
  z.string().min(1).max(100).parse(customerId);
  const a = await requireCompany(companyId);
  requireProduct(a.products, "crm");
  return a;
}
const storedMemory = z.object({
  id: z.uuid(),
  revision: z.number().int().positive(),
  category: memoryCategorySchema,
  content: z.string(),
  status: z.enum(["active", "archived"]),
  actor_name: z.string(),
  reason: z.string(),
  created_at: z.string(),
});
const storedTimeline = z.object({
  key: z.string(),
  at: z.string(),
  kind: z.string(),
  source: z.string(),
  source_id: z.string(),
  data: z.record(z.string(), z.unknown()),
});
const storedPage = z.object({
  brandId: z.string(),
  customerId: z.string(),
  brands: z.array(z.object({ id: z.string(), name: z.string() })),
  canEdit: z.boolean(),
  memories: z.array(storedMemory),
  history: z.array(storedMemory),
  timeline: z.array(storedTimeline),
  moreHistory: z.boolean(),
});
function memory(row: z.infer<typeof storedMemory>): CustomerMemory {
  return {
    id: row.id,
    revision: row.revision,
    category: row.category,
    content: row.content,
    status: row.status,
    updatedAt: row.created_at,
    actorName: row.actor_name,
    reason: row.reason,
    source: { kind: "staff", label: "同事確認" },
  };
}
function text(v: unknown, max = 600) {
  return typeof v === "string" ? v.slice(0, max) : "";
}
function money(v: unknown) {
  return typeof v === "number" && Number.isSafeInteger(v)
    ? `HK$${(v / 100).toFixed(2)}`
    : "金額詳見收付款記錄";
}
const eventNames: Record<string, string> = {
  "channel-linked": "已連結訊息渠道",
  "identity-linked": "已核實客戶身份連結",
  "identity-unlinked": "已解除身份連結",
  "customer-updated": "已更新客戶資料",
  "lifecycle-changed": "更新客戶階段",
  "routing-assigned": "派發對話負責人",
  "ai-handoff": "採納 AI 交接重點",
  "followup-created": "加入跟進事項",
  "followup-updated": "更新跟進事項",
  "booking-create": "新增預約意向",
  "booking-confirm": "已確認預約意向",
  "booking-cancel": "已取消預約意向",
  "booking-request": "預約意向",
  "legacy-booking": "預約安排（預約時間）",
  "pos-appointment": "POS 預約記錄",
  "pos-payment": "已核實收款",
  "pos-refund": "已核實退款",
  "memory-added": "新增客戶記憶",
  "memory-corrected": "更正客戶記憶",
  "memory-archived": "停止使用此記憶",
  "voice-reviewed": "語音逐字稿已核對",
};
function timeline(
  companyId: string,
  customerId: string,
  brandId: string,
  row: z.infer<typeof storedTimeline>,
): MemoryTimelineItem {
  const d = row.data,
    provider =
      row.source === "meta" || row.source === "whatsapp"
        ? row.source
        : text(d.provider),
    threadId = text(d.threadId),
    isMessage = row.kind.startsWith("message-"),
    isPos = row.kind.startsWith("pos-"),
    isMemory = row.kind.startsWith("memory-"),
    isIncoming = /incoming|inbound/.test(row.kind),
    isNote = row.kind === "message-note";
  const state = text(d.state),
    status = text(d.status),
    requestId = text(d.requestId);
  let title = eventNames[row.kind] ?? "客戶歷程",
    summary = "";
  if (isMessage) {
    title = isNote
      ? "內部備註"
      : isIncoming
        ? "收到客戶訊息"
        : state === "failed"
          ? "訊息發送失敗"
          : state === "unknown" || state === "uncertain"
            ? "訊息送出結果待核對"
            : "同事回覆";
    summary = text(d.body);
  } else if (row.kind === "voice-reviewed") {
    summary = text(d.text);
  } else if (isMemory) {
    summary =
      text(d.content) +
      (text(d.reason) ? `\n原因：${text(d.reason, 300)}` : "");
  } else if (row.kind === "pos-payment" || row.kind === "pos-refund") {
    summary = [
      money(d.amountCents),
      row.kind === "pos-refund" ? text(d.reason, 300) : "同事人工核實",
    ]
      .filter(Boolean)
      .join(" · ");
  } else if (row.kind === "pos-appointment") {
    summary = [text(d.serviceName, 100), bookingNames[status] ?? status]
      .filter(Boolean)
      .join(" · ");
  } else if (row.kind.startsWith("booking-") || row.kind === "legacy-booking") {
    summary = [
      text(d.service, 100),
      bookingNames[status] ?? status,
      text(d.desiredAt, 80),
    ]
      .filter(Boolean)
      .join(" · ");
  } else if (row.kind.startsWith("identity-")) {
    summary = text(d.reason, 300);
  } else if (row.kind === "ai-handoff") {
    summary = [text(d.summary), text(d.nextStep), text(d.reason, 300)]
      .filter(Boolean)
      .join("\n");
  } else if (row.kind.startsWith("followup-")) {
    const followupStatus: Record<string, string> = {
      open: "待跟進",
      done: "已完成",
      cancelled: "已取消",
    };
    summary = [
      text(d.title, 200),
      followupStatus[status] ?? "",
      text(d.reason, 300),
    ]
      .filter(Boolean)
      .join(" · ");
  } else {
    summary = [text(d.reason, 300), text(d.service, 100)]
      .filter(Boolean)
      .join(" · ");
  }
  const sourceId = text(d.id, 100) || requestId || row.source_id;
  const base = `/company/${encodeURIComponent(companyId)}`;
  const href =
    provider && threadId
      ? `${base}/crm?provider=${encodeURIComponent(provider)}&thread=${encodeURIComponent(threadId)}`
      : row.source === "conversation" && threadId
        ? `${base}/crm/ai?mode=replies&brand=${encodeURIComponent(brandId)}&coachSource=conversation&coachId=${encodeURIComponent(threadId)}`
        : isPos
          ? `${base}/pos`
          : `${base}/crm/customers?contact=${encodeURIComponent(customerId)}`;
  return {
    id: row.key,
    at: row.at,
    kind: row.kind,
    title,
    summary,
    source: {
      type: isPos ? "pos" : row.source,
      id: sourceId,
      label:
        row.kind === "voice-reviewed"
          ? "同事核對逐字稿"
          : isMemory
            ? "同事確認"
            : isMessage
              ? row.source === "meta"
                ? "Meta 對話"
                : row.source === "whatsapp"
                  ? "WhatsApp 對話"
                  : "已儲存對話"
              : isPos
                ? "POS 原始記錄"
                : "客戶操作記錄",
      href,
      ...(threadId ? { threadId } : {}),
      ...(provider ? { provider } : {}),
    },
  };
}
export async function readCustomerMemory(
  companyId: string,
  customerId: string,
  raw: unknown,
): Promise<CustomerMemoryPage> {
  const a = await access(companyId, customerId),
    q = memoryQuerySchema.parse(raw);
  let cursor: z.infer<typeof memoryCursorSchema> | undefined;
  if (q.before) {
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(q.before)) throw Error();
      cursor = memoryCursorSchema.parse(
        JSON.parse(Buffer.from(q.before, "base64url").toString()),
      );
    } catch {
      throw new AccessError("分頁位置已失效，請重新查閱。", 400);
    }
  }
  const r = await a.db.rpc("sv_customer_memory_read", {
    p_company: companyId,
    p_actor: a.user.id,
    p_customer: customerId,
    p_brand: q.brandId ?? null,
    p_before: cursor?.at ?? null,
    p_before_key: cursor?.key ?? null,
  });
  checked(r.error);
  const data = storedPage.parse(r.data),
    rows = data.timeline.slice(0, 50),
    last = rows.at(-1);
  return {
    brandId: data.brandId,
    customerId: data.customerId,
    brands: data.brands,
    canEdit: data.canEdit,
    memories: data.memories.map(memory),
    history: data.history.slice(0, 100).map(memory),
    timeline: rows.map((x) => timeline(companyId, customerId, data.brandId, x)),
    nextCursor:
      data.timeline.length > 50 && last
        ? Buffer.from(JSON.stringify({ at: last.at, key: last.key })).toString(
            "base64url",
          )
        : null,
    coverage: {
      timelinePageSize: 50,
      historyLimit: 100,
      moreHistory: data.moreHistory,
    },
  };
}
export async function actCustomerMemory(
  companyId: string,
  customerId: string,
  raw: unknown,
) {
  const a = await access(companyId, customerId),
    command = memoryCommandSchema.parse(raw);
  const { commandId, ...data } = command;
  const r = await a.db.rpc("sv_customer_memory_action", {
    p_company: companyId,
    p_actor: a.user.id,
    p_customer: customerId,
    p_command: commandId,
    p_data: data,
  });
  checked(r.error);
  return z
    .object({
      saved: z.literal(true),
      memoryId: z.uuid(),
      revision: z.number().int().positive(),
    })
    .parse(r.data);
}
export const memorySourceContextSchema = z.object({
  customerId: z.string(),
  stamp: z.string().regex(/^[a-f0-9]{32}$/),
  guidance: z
    .array(
      z.object({
        id: z.uuid(),
        revision: z.number().int().positive(),
        category: memoryCategorySchema,
        content: z.string().max(500),
      }),
    )
    .max(8),
  reviewedVoice: z
    .array(
      z.object({
        id: z.uuid(),
        messageId: z.uuid(),
        revision: z.number().int().positive(),
        text: z.string().min(1).max(1200),
        contentHash: z.string().regex(/^[a-f0-9]{64}$/),
        textHash: z.string().regex(/^[a-f0-9]{32}$/),
        label: z.string(),
      }),
    )
    .max(3),
});
export type MemorySourceContext = z.infer<typeof memorySourceContextSchema>;
/** Call only for an exact persisted source, never a caller-supplied customer. */
export async function readMemoryGuidanceForSource(
  a: Pick<Access, "db" | "company" | "user">,
  brandId: string,
  source: "conversation" | "meta" | "whatsapp",
  sourceId: string,
): Promise<MemorySourceContext> {
  const r = await a.db.rpc("sv_customer_memory_context", {
    p_company: a.company.id,
    p_actor: a.user.id,
    p_brand: brandId,
    p_source: source,
    p_source_id: sourceId,
  });
  checked(r.error);
  return memorySourceContextSchema.parse(r.data);
}
