import "server-only";
import { z } from "zod";
import { requireCompany } from "@/lib/saas/server";
import { requireProduct } from "@/lib/saas/products";
import { AccessError } from "@/lib/saas/identity";
import { segmentActionSchema, type SegmentsPage } from "./model";
const querySchema = z
  .object({
    brandId: z.string().min(1).max(100),
    segmentId: z.uuid().optional(),
    after: z.string().min(1).max(100).optional(),
    before: z
      .string()
      .regex(/^[1-9]\d{0,18}$/)
      .optional(),
  })
  .strict();
function checked(e: { message?: string } | null) {
  if (!e) return;
  if (
    /access_denied|product_required|brand_scope|segment_scope/.test(
      e.message ?? "",
    )
  )
    throw new AccessError("你無權使用呢個品牌或來源嘅分眾。", 403);
  if (/conflict|changed/.test(e.message ?? ""))
    throw new AccessError("分眾已更新，請重新讀取後核對。", 409);
  if (/invalid|required|capacity|missing/.test(e.message ?? ""))
    throw new AccessError("分眾條件未齊或已達上限，請核對後再試。", 400);
  throw new AccessError("暫時未能確認分眾結果，請稍後核對同一操作。", 503);
}
async function access(company: string) {
  z.uuid().parse(company);
  const a = await requireCompany(company);
  requireProduct(a.products, "crm");
  return a;
}
export async function readSegments(
  company: string,
  raw: unknown,
): Promise<SegmentsPage> {
  const a = await access(company),
    q = querySchema.parse(raw);
  const r = await a.db.rpc("sv_segments_read", {
    p_company: company,
    p_actor: a.user.id,
    p_query: q,
  });
  checked(r.error);
  return r.data as SegmentsPage;
}
export async function actSegment(company: string, raw: unknown) {
  const a = await access(company),
    action = segmentActionSchema.parse(raw);
  const { action: kind, ...data } = action;
  const r = await a.db.rpc("sv_segment_action", {
    p_company: company,
    p_actor: a.user.id,
    p_kind: kind,
    p_data: data,
  });
  checked(r.error);
  return r.data;
}
