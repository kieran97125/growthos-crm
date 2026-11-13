import "server-only";
import { z } from "zod";
import { requireCompany } from "@/lib/saas/server";
import { requireProduct } from "@/lib/saas/products";
import { AccessError } from "@/lib/saas/identity";
import {
  operationsAction,
  operationsQuery,
  settingsSchema,
  type LifecycleRecord,
  type OperationsPage,
} from "./model";

function checked(error: { code?: string; message?: string } | null) {
  if (!error) return;
  const message = error.message ?? "";
  if (/access_denied|product_required|brand_scope/.test(message))
    throw new AccessError("你無權使用呢個公司或品牌嘅營運資料。", 403);
  if (
    /revision_conflict|idempotency_conflict|context_changed/.test(message) ||
    error.code === "23505"
  )
    throw new AccessError(
      "資料有更新，請重新讀取再核對；原有操作紀錄會保留。",
      409,
    );
  if (error.code === "P0002")
    throw new AccessError("找不到呢項工作或客戶資料。", 404);
  if (/invalid|required/.test(message))
    throw new AccessError("資料未齊，請核對後再儲存。", 400);
  throw new AccessError("暫時未能完成營運操作，請稍後核對同一請求。", 503);
}
async function access(companyId: string) {
  z.uuid().parse(companyId);
  const a = await requireCompany(companyId);
  requireProduct(a.products, "crm");
  return a;
}
const cursorSchema = z
  .object({
    at: z.iso.datetime({ offset: true }),
    key: z.string().min(1).max(400),
  })
  .strict();
export async function readOperations(
  companyId: string,
  raw: unknown,
): Promise<OperationsPage> {
  const a = await access(companyId),
    q = operationsQuery.parse(raw);
  const now = Date.now(),
    day = (n: number) => new Date(n + 8 * 3600000).toISOString().slice(0, 10);
  const from = q.from ?? day(now - 29 * 86400000),
    to = q.to ?? day(now);
  if (from > to || Date.parse(to) - Date.parse(from) > 365 * 86400000)
    throw new AccessError("請選擇一年內嘅有效日期範圍。", 400);
  let cursor: z.infer<typeof cursorSchema> | undefined;
  if (q.after) {
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(q.after)) throw new Error();
      cursor = cursorSchema.parse(
        JSON.parse(Buffer.from(q.after, "base64url").toString()),
      );
    } catch {
      throw new AccessError("分頁位置失效，請重新查閱。", 400);
    }
  }
  const r = await a.db.rpc("sv_ops_read", {
    p_company: companyId,
    p_actor: a.user.id,
    p_brand: q.brand ?? null,
    p_stage: q.stage ?? null,
    p_search: q.search,
    p_before: cursor?.at ?? null,
    p_before_key: cursor?.key ?? null,
    p_from: from + "T00:00:00+08:00",
    p_to: new Date(Date.parse(to + "T00:00:00+08:00") + 86400000).toISOString(),
  });
  checked(r.error);
  const data = r.data as Omit<OperationsPage, "nextCursor">;
  settingsSchema.parse(data.settings);
  const records = (data.records ?? []).slice(0, 50) as LifecycleRecord[],
    last = records.at(-1);
  return {
    ...data,
    companyId,
    actorId: a.user.id,
    canEdit: a.actor.role !== "viewer",
    canManage: ["owner", "manager"].includes(a.actor.role),
    hasPos: a.products.includes("pos"),
    records,
    nextCursor:
      data.records.length > 50 && last
        ? Buffer.from(
            JSON.stringify({ at: last.updated_at, key: last.key }),
          ).toString("base64url")
        : null,
    period: { from, to },
  };
}
export async function operationsContext(
  companyId: string,
  provider: unknown,
  thread: unknown,
) {
  const a = await access(companyId),
    p = z.enum(["meta", "whatsapp"]).parse(provider),
    id = z.uuid().parse(thread);
  const r = await a.db.rpc("sv_ops_context", {
    p_company: companyId,
    p_actor: a.user.id,
    p_provider: p,
    p_thread: id,
  });
  checked(r.error);
  return { ...r.data, canEdit: a.actor.role !== "viewer", actorId: a.user.id, canManage: ["owner", "manager"].includes(a.actor.role) };
}
export async function operationsTasks(companyId: string, raw: unknown) {
  const a = await access(companyId), q = z.object({ brand: z.string().min(1).max(100).optional(), after: z.string().max(700).optional() }).strict().parse(raw);
  let cursor: z.infer<typeof cursorSchema> | undefined;
  if (q.after) {
    try { if (!/^[A-Za-z0-9_-]+$/.test(q.after)) throw new Error(); cursor = cursorSchema.parse(JSON.parse(Buffer.from(q.after, "base64url").toString())); z.uuid().parse(cursor.key); }
    catch { throw new AccessError("分頁位置失效，請重新查閱。", 400); }
  }
  const r = await a.db.rpc("sv_ops_tasks", { p_company: companyId, p_actor: a.user.id, p_brand: q.brand ?? null, p_after: cursor?.at ?? null, p_after_id: cursor?.key ?? null });
  checked(r.error);
  const data = r.data as { tasks: import("./model").Followup[]; total: number }, tasks = data.tasks.slice(0, 50), last = tasks.at(-1);
  return { tasks, total: data.total, nextCursor: data.tasks.length > 50 && last ? Buffer.from(JSON.stringify({ at: last.due_at, key: last.id })).toString("base64url") : null };
}
export async function operationsAttention(companyId: string) {
  const a = await access(companyId);
  const r = await a.db.rpc("sv_ops_attention", {
    p_company: companyId,
    p_actor: a.user.id,
  });
  checked(r.error);
  return r.data;
}
export async function actOperations(companyId: string, raw: unknown) {
  const a = await access(companyId),
    action = operationsAction.parse(raw);
  if (a.actor.role === "viewer")
    throw new AccessError("你目前只有檢視權限。", 403);
  if (action.action === "presence") {
    const r = await a.db.rpc("sv_ops_presence", {
      p_company: companyId,
      p_actor: a.user.id,
      p_status: action.status,
    });
    checked(r.error);
    if (action.status === "online") {
      const route = await a.db.rpc("sv_ops_route_waiting", {
        p_company: companyId,
        p_actor: a.user.id,
      });
      if (route.error) console.warn("operations_queue_retry_pending");
    }
    return r.data;
  }
  const { commandId, action: kind, ...data } = action;
  const r = await a.db.rpc("sv_ops_action", {
    p_company: companyId,
    p_actor: a.user.id,
    p_command: commandId,
    p_action: kind,
    p_data: data,
  });
  checked(r.error);
  if (kind === "settings" || kind === "agent") {
    // The primary save is committed before queue work takes thread locks.
    const route = await a.db.rpc("sv_ops_route_waiting", {
      p_company: companyId,
      p_actor: a.user.id,
    });
    if (route.error) console.warn("operations_queue_retry_pending");
  }
  return r.data;
}
