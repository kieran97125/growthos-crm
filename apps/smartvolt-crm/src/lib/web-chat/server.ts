import "server-only";
import { cache } from "react";
import { randomBytes } from "node:crypto";
import { Resolver } from "node:dns/promises";
import { loadBuffer } from "cheerio";
import { fetchWebsite } from "@/lib/website/transport";
import { z } from "zod";
import { requireCompany } from "@/lib/saas/server";
import { requireProduct } from "@/lib/saas/products";
import { AccessError, canManage } from "@/lib/saas/identity";
import {
  chatSettingsAction,
  chatStaffAction,
  type WebChatSettings,
  type WebChatReadiness,
  type WebChatPage,
  type WebChatConversation,
  type WebChatMessage,
  type WebChatThread,
} from "./model";

export function missingChatSchema(
  error: { code?: string; message?: string } | null,
) {
  return (
    !!error &&
    ["PGRST202", "PGRST205", "42P01", "42883"].includes(error.code ?? "") &&
    /\b(?:sv_web_chat_|smartvolt_private\.web_chat_)/.test(error.message ?? "")
  );
}

export function chatFailure(error: { code?: string; message?: string } | null) {
  if (!error) return;
  const message = error.message ?? "";
  if (
    error.code === "42501" ||
    /access_denied|brand_scope|product_required/.test(message)
  )
    throw new AccessError("你無權查看或修改呢個網站渠道。", 403);
  if (missingChatSchema(error))
    throw new AccessError("網站聊天尚未準備完成，請先使用其他聯絡渠道。", 503);
  if (/revision_conflict|idempotency_conflict/.test(message))
    throw new AccessError(
      "對話或設定已有更新，請重新讀取。你嘅草稿會保留。",
      409,
    );
  if (/rate_limited|limit_reached/.test(message))
    throw new AccessError("操作較頻密，請稍後再試。", 429);
  if (/domain_unverified/.test(message))
    throw new AccessError("請先完成每個網站嘅網域驗證，再啟用聊天窗。", 409);
  if (/chat_public_knowledge_required/.test(message))
    throw new AccessError(
      "品牌暫未有可用公開知識。請先匯入並批核網站 FAQ，或將知識設為可供網站 C 使用。",
      409,
    );
  if (/chat_settings_invalid/.test(message))
    throw new AccessError(
      "設定格式未符合要求，請檢查品牌色碼、網站網址及知識設定後再儲存。",
      400,
    );
  if (/chat_ai_owner_required/.test(message))
    throw new AccessError(
      "只有公司擁有人可以設定 C 嘅公開知識及自動回覆。",
      403,
    );
  if (/chat_ai_unavailable|chat_ai_disabled/.test(message))
    throw new AccessError("請先喺公司 AI 設定啟用 AI，再開啟網站 C。", 409);
  if (/chat_already_claimed/.test(message))
    throw new AccessError("呢段對話已有同事接待，請由管理員調整。", 409);
  if (/chat_expired/.test(message))
    throw new AccessError(
      "網站訪客對話已過期，請用客人其他已授權方式聯絡。",
      409,
    );
  if (/chat_closed/.test(message))
    throw new AccessError("呢段對話已結束，請先重新開啟。", 409);
  if (/session_invalid/.test(message))
    throw new AccessError("對話已失效，請重新開始。", 401);
  if (/unavailable|no rows|P0002/.test(message))
    throw new AccessError("網站聊天暫時未能使用。", 404);
  throw new AccessError("暫時未能完成操作，請保留草稿並稍後再試。", 503);
}
async function access(companyId: string) {
  z.uuid().parse(companyId);
  const a = await requireCompany(companyId);
  requireProduct(a.products, "crm");
  return a;
}
/** Request-scoped only: a later reload observes an installed schema immediately.
 * The existing staff-read RPC only SELECTs tenant/brand-authorized rows; unlike
 * visitor reads it does not write rate counters or mark conversations as read.
 * A successful bounded read is availability, not release/catalog acceptance.
 */
export const readChatReadiness = cache(async function readChatReadiness(
  companyId: string,
): Promise<WebChatReadiness> {
  const a = await access(companyId);
  try {
    const r = await a.db
      .rpc("sv_web_chat_staff_read", {
        p_company: companyId,
        p_actor: a.user.id,
        p_query: {},
      })
      .abortSignal(AbortSignal.timeout(3000));
    if (r.error) return missingChatSchema(r.error) ? "pending" : "unavailable";
    return r.data &&
      Array.isArray(r.data.threads) &&
      typeof r.data.canReply === "boolean" &&
      typeof r.data.scopeStamp === "string"
      ? "ready"
      : "unavailable";
  } catch {
    return "unavailable";
  }
});

export async function readChatSettings(
  companyId: string,
): Promise<WebChatSettings> {
  const a = await access(companyId);
  const r = await a.db.rpc("sv_web_chat_settings", {
    p_company: companyId,
    p_actor: a.user.id,
  });
  chatFailure(r.error);
  return r.data as WebChatSettings;
}
export async function changeChatSettings(companyId: string, raw: unknown) {
  const a = await access(companyId),
    data = chatSettingsAction.parse(raw);
  if (!canManage(a.actor.role))
    throw new AccessError("網站聊天設定只供管理員使用。", 403);
  if (data.action === "activate") {
    const settings = await readChatSettings(companyId);
    const config = settings.configs.find((c) => c.id === data.id);
    if (!config) throw new AccessError("網站設定已有更新，請重新讀取。", 409);
    const receipt = await a.db
      .from("sv_action_receipts")
      .select("actor_id,kind,data,result")
      .eq("company_id", companyId)
      .eq("command_id", data.commandId)
      .maybeSingle();
    chatFailure(receipt.error);
    if (receipt.data) {
      const old = receipt.data;
      if (
        old.actor_id !== a.user.id ||
        old.kind !== "web-chat-activate" ||
        old.data.id !== data.id ||
        old.data.revision !== data.revision
      )
        throw new AccessError("操作識別已使用，請重新讀取設定。", 409);
      return old.result;
    }
    if (config.revision !== data.revision)
      throw new AccessError("網站設定已有更新，請重新讀取。", 409);
    for (const origin of config.origins.filter(
      (o) => !config.verifiedOrigins.includes(o),
    )) {
      try {
        const page = await fetchWebsite(origin, {
          root: origin,
          signal: AbortSignal.timeout(4000),
          maxBytes: 524288,
        });
        if (
          page.status !== 200 ||
          new URL(page.url).origin !== origin ||
          !/text\/html/i.test(page.type)
        )
          throw new Error("proof_missing");
        const $ = loadBuffer(page.body);
        if (
          !$("meta[name='convelta-chat-verification']")
            .toArray()
            .some((node) => $(node).attr("content") === config.verification)
        )
          throw new Error("proof_missing");
      } catch {
        throw new AccessError(
          `未喺 ${origin} 找到安裝標記。請先發布代碼，再檢查並啟用。`,
          409,
        );
      }
    }
    const r = await a.db.rpc("sv_web_chat_activate", {
      p_company: companyId,
      p_actor: a.user.id,
      p_command: data.commandId,
      p_config: data.id,
      p_revision: data.revision,
      p_proof: config.verification,
    });
    chatFailure(r.error);
    return r.data;
  }
  if (data.action === "verify") {
    const settings = await readChatSettings(companyId),
      config = settings.configs.find((c) => c.id === data.id);
    if (!config || !config.origins.includes(data.origin))
      throw new AccessError("網站設定已有更新，請重新讀取。", 409);
    const receipt = await a.db
      .from("sv_action_receipts")
      .select("actor_id,kind,data,result")
      .eq("company_id", companyId)
      .eq("command_id", data.commandId)
      .maybeSingle();
    chatFailure(receipt.error);
    if (receipt.data) {
      const old = receipt.data;
      if (
        old.actor_id !== a.user.id ||
        old.kind !== "web-chat-verify" ||
        old.data.id !== data.id ||
        old.data.revision !== data.revision ||
        old.data.origin !== data.origin
      )
        throw new AccessError("操作識別已使用，請重新讀取設定。", 409);
      return old.result;
    }
    if (config.revision !== data.revision)
      throw new AccessError("網站設定已有更新，請重新讀取。", 409);
    if (data.method === "html") {
      try {
        const page = await fetchWebsite(data.origin, {
          root: data.origin,
          signal: AbortSignal.timeout(8000),
          maxBytes: 524288,
        });
        if (
          page.status !== 200 ||
          new URL(page.url).origin !== data.origin ||
          !/text\/html/i.test(page.type)
        )
          throw new Error("proof_missing");
        const $ = loadBuffer(page.body);
        if (
          !$("meta[name='convelta-chat-verification']")
            .toArray()
            .some((node) => $(node).attr("content") === config.verification)
        )
          throw new Error("proof_missing");
      } catch {
        throw new AccessError(
          "未找到網站驗證標記。請先發布網頁，再核對網站及驗證碼。",
          409,
        );
      }
    } else {
      const resolver = new Resolver({ timeout: 2000, tries: 2 });
      let records: string[][];
      try {
        records = await resolver.resolveTxt(
          `_convelta-chat.${new URL(data.origin).hostname}`,
        );
      } catch {
        throw new AccessError(
          "未找到 DNS 驗證紀錄。新增 TXT 後，請稍後再試。",
          409,
        );
      }
      if (
        !records.some(
          (record) =>
            record.join("") === `convelta-chat=${config.verification}`,
        )
      )
        throw new AccessError("DNS 驗證紀錄未吻合，請核對完整 TXT 值。", 409);
    }
    const r = await a.db.rpc("sv_web_chat_verify", {
      p_company: companyId,
      p_actor: a.user.id,
      p_command: data.commandId,
      p_config: data.id,
      p_revision: data.revision,
      p_origin: data.origin,
      p_proof: config.verification,
    });
    chatFailure(r.error);
    return r.data;
  }
  const { commandId, action: _action, ...payload } = data;
  void _action;
  const r = await a.db.rpc("sv_web_chat_configure", {
    p_company: companyId,
    p_actor: a.user.id,
    p_command: commandId,
    p_data: payload,
    p_verification: randomBytes(24).toString("hex"),
  });
  chatFailure(r.error);
  return r.data;
}
const querySchema = z
  .object({
    threadId: z.uuid().optional(),
    beforeSequence: z.coerce
      .number()
      .int()
      .min(1)
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    before: z.iso.datetime({ offset: true }).optional(),
    beforeId: z.uuid().optional(),
    brand: z.string().min(1).max(100).optional(),
    status: z.enum(["open", "closed"]).optional(),
    search: z.string().max(80).optional(),
  })
  .strict()
  .refine((x) => !!x.before === !!x.beforeId);
export async function readWebChat(
  companyId: string,
  raw: unknown,
): Promise<WebChatPage | WebChatConversation> {
  const a = await access(companyId),
    query = querySchema.parse(raw);
  const r = await a.db.rpc("sv_web_chat_staff_read", {
    p_company: companyId,
    p_actor: a.user.id,
    p_query: query,
  });
  chatFailure(r.error);
  if (query.threadId) {
    const rows = r.data.messages as WebChatMessage[],
      messages = rows.slice(-50);
    return {
      ...r.data,
      messages,
      nextCursor: rows.length > 50 ? messages[0].sequence : null,
    };
  }
  const rows = r.data.threads as WebChatThread[],
    threads = rows.slice(0, 30),
    last = threads.at(-1);
  return {
    ...r.data,
    threads,
    nextCursor:
      rows.length > 30 && last
        ? new URLSearchParams({
            before: last.lastMessageAt,
            beforeId: last.id,
          }).toString()
        : null,
  };
}
export async function actWebChat(companyId: string, raw: unknown) {
  const a = await access(companyId),
    data = chatStaffAction.parse(raw),
    { commandId, ...payload } = data;
  const r = await a.db.rpc("sv_web_chat_staff_action", {
    p_company: companyId,
    p_actor: a.user.id,
    p_command: commandId,
    p_data: payload,
  });
  chatFailure(r.error);
  return r.data;
}
