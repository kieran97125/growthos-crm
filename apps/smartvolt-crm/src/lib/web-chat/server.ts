import "server-only";
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
  type WebChatPage,
  type WebChatConversation,
  type WebChatMessage,
  type WebChatThread,
} from "./model";

export function chatFailure(error: { message?: string } | null) {
  if (!error) return;
  const message = error.message ?? "";
  if (/access_denied|brand_scope|product_required/.test(message))
    throw new AccessError("你無權查看或修改呢個網站渠道。", 403);
  if (/revision_conflict|idempotency_conflict/.test(message))
    throw new AccessError(
      "對話或設定已有更新，請重新讀取。你嘅草稿會保留。",
      409,
    );
  if (/rate_limited|limit_reached/.test(message))
    throw new AccessError("操作較頻密，請稍後再試。", 429);
  if (/domain_unverified/.test(message))
    throw new AccessError("請先完成每個網站嘅網域驗證，再啟用聊天窗。", 409);
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
