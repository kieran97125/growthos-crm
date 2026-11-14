import "server-only";
import { z } from "zod";
import { requireCompany } from "@/lib/saas/server";
import { requireProduct } from "@/lib/saas/products";
import { AccessError } from "@/lib/saas/identity";
import { officePolicy, type SupervisionPage } from "./supervision";
import { engagementFailure } from "@/lib/engagement/server";
const cursorSchema = z
  .object({
    at: z.iso.datetime({ offset: true }),
    key: z.string().min(1).max(150),
  })
  .strict();
async function access(company: string) {
  z.uuid().parse(company);
  const a = await requireCompany(company);
  requireProduct(a.products, "crm");
  if (!["owner", "manager"].includes(a.actor.role))
    throw new AccessError("主管工作台只供公司擁有人及管理員使用。", 403);
  return a;
}
export async function readSupervision(
  company: string,
  raw: unknown,
): Promise<SupervisionPage> {
  const a = await access(company),
    q = z
      .object({
        brand: z.string().min(1).max(100).optional(),
        after: z.string().max(700).optional(),
        from: z.iso.date().optional(),
        to: z.iso.date().optional(),
      })
      .strict()
      .parse(raw);
  const day = (n: number) =>
      new Date(n + 8 * 3600000).toISOString().slice(0, 10),
    now = Date.now(),
    from = q.from ?? day(now - 29 * 86400000),
    to = q.to ?? day(now);
  if (from > to || Date.parse(to) - Date.parse(from) > 365 * 86400000)
    throw new AccessError("請選擇一年內嘅有效日期範圍。", 400);
  let cursor: z.infer<typeof cursorSchema> | undefined;
  if (q.after) {
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(q.after)) throw Error();
      cursor = cursorSchema.parse(
        JSON.parse(Buffer.from(q.after, "base64url").toString()),
      );
    } catch {
      throw new AccessError("分頁位置失效，請重新讀取。", 400);
    }
  }
  const r = await a.db.rpc("sv_supervision_read", {
    p_company: company,
    p_actor: a.user.id,
    p_brand: q.brand ?? null,
    p_after: cursor?.at ?? null,
    p_after_key: cursor?.key ?? null,
    p_from: from + "T00:00:00+08:00",
    p_to: new Date(Date.parse(to + "T00:00:00+08:00") + 86400000).toISOString(),
  });
  engagementFailure(r.error);
  const data = r.data as SupervisionPage,
    queue = data.queue.slice(0, 50),
    last = queue.at(-1);
  return {
    ...data,
    queue,
    period: { from, to },
    nextCursor:
      data.queue.length > 50 && last
        ? Buffer.from(
            JSON.stringify({ at: last.sort_at, key: last.key }),
          ).toString("base64url")
        : null,
  };
}
export async function saveOfficePolicy(company: string, raw: unknown) {
  const a = await access(company),
    d = z
      .object({
        commandId: z.uuid(),
        brandId: z.string().min(1).max(100),
        revision: z.number().int().nonnegative(),
        data: officePolicy,
      })
      .strict()
      .parse(raw);
  const r = await a.db.rpc("sv_sla_policy_action", {
    p_company: company,
    p_actor: a.user.id,
    p_command: d.commandId,
    p_brand: d.brandId,
    p_revision: d.revision,
    p_data: d.data,
  });
  engagementFailure(r.error);
  return r.data;
}
