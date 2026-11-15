import "server-only";
import { z } from "zod";
import { requireCompany } from "@/lib/saas/server";
import { requireProduct } from "@/lib/saas/products";
import { engagementFailure } from "@/lib/engagement/server";
import { salesAction, type SalesPage } from "./model";
async function access(company: string) {
  z.uuid().parse(company);
  const a = await requireCompany(company);
  requireProduct(a.products, "crm");
  return a;
}
export async function readSales(
  company: string,
  raw: unknown,
): Promise<SalesPage> {
  const a = await access(company),
    q = z
      .object({
        before: z.iso.datetime({ offset: true }).optional(),
        id: z.uuid().optional(),
      })
      .strict()
      .refine((x) => !!x.before === !!x.id)
      .parse(raw),
    r = await a.db.rpc("sv_sales_read", {
      p_company: company,
      p_actor: a.user.id,
      p_before: q.before ?? null,
      p_id: q.id ?? null,
    });
  engagementFailure(r.error);
  const d = r.data as SalesPage,
    rows = d.rows.slice(0, 30),
    last = rows.at(-1);
  return {
    ...d,
    canEdit: a.actor.role !== "viewer",
    canManage: ["owner", "manager"].includes(a.actor.role),
    rows,
    next:
      d.rows.length > 30 && last
        ? new URLSearchParams({
            before: last.source_created_at,
            id: last.source_id,
          }).toString()
        : null,
  };
}
export async function actSales(company: string, raw: unknown) {
  const a = await access(company),
    { commandId, action, ...data } = salesAction.parse(raw),
    r = await a.db.rpc("sv_sales_action", {
      p_company: company,
      p_actor: a.user.id,
      p_command: commandId,
      p_kind: action,
      p_data: data,
    });
  engagementFailure(r.error);
  return r.data;
}
