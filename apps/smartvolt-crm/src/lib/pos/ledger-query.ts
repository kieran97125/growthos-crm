import { z } from "zod";
import { AccessError } from "../saas/identity";

const day = z.iso.date();
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const cursorSchema = z
  .object({ at: integer, id: z.string().min(1).max(100) })
  .strict();
export type LedgerQuery = {
  from: string;
  to: string;
  fromAt: number;
  toAt: number;
  brand: string | null;
  limit: number;
  before: z.infer<typeof cursorSchema> | null;
};

export function parseLedgerQuery(
  params: URLSearchParams,
  now = Date.now(),
): LedgerQuery {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const from = params.get("from") ?? `${today.slice(0, 7)}-01`;
  const to = params.get("to") ?? today;
  if (!day.safeParse(from).success || !day.safeParse(to).success)
    throw new AccessError("請選擇有效日期。", 400);
  const fromAt = Date.parse(`${from}T00:00:00+08:00`);
  const toAt = Date.parse(`${to}T00:00:00+08:00`) + 86_400_000;
  if (fromAt < 0 || toAt <= fromAt || toAt - fromAt > 366 * 86_400_000)
    throw new AccessError(
      "每次可查閱最多 366 日，結束日期須在開始日期之後。",
      400,
    );
  const rawLimit = params.get("limit") ?? "50";
  if (!/^[1-9]\d?$|^100$/.test(rawLimit))
    throw new AccessError("每頁數量須為 1 至 100。", 400);
  const brand = params.get("brand") || null;
  if (brand && (brand.length > 100 || /[\u0000-\u001f]/.test(brand)))
    throw new AccessError("品牌格式不正確。", 400);
  let before: LedgerQuery["before"] = null;
  const cursor = params.get("cursor");
  if (cursor) {
    try {
      if (cursor.length > 600 || !/^[A-Za-z0-9_-]+$/.test(cursor))
        throw new Error();
      before = cursorSchema.parse(
        JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
      );
    } catch {
      throw new AccessError("分頁位置已失效，請重新查閱。", 400);
    }
  }
  return { from, to, fromAt, toAt, brand, limit: Number(rawLimit), before };
}

export const ledgerPageSchema = z.object({
  revision: integer,
  totals: z.object({
    orders: integer,
    orderedCents: integer,
    paidCents: integer,
    refundedCents: integer,
    netCents: integer,
  }),
  rows: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        number: z.string().min(1).max(50),
        brandId: z.string(),
        createdAt: integer,
        totalCents: integer,
        paidCents: integer,
        refundedCents: integer,
        netCents: integer,
        voided: z.boolean(),
        revision: integer,
      }),
    )
    .max(100),
  hasMore: z.boolean(),
});
export type LedgerPage = z.infer<typeof ledgerPageSchema>;
export function ledgerCursor(page: LedgerPage): string | null {
  const last = page.rows.at(-1);
  return page.hasMore && last
    ? Buffer.from(JSON.stringify({ at: last.createdAt, id: last.id })).toString(
        "base64url",
      )
    : null;
}

export function ledgerRpcArgs(
  companyId: string,
  actorId: string,
  query: LedgerQuery,
) {
  return {
    p_company: companyId,
    p_actor: actorId,
    p_brand: query.brand,
    p_from: query.fromAt,
    p_to: query.toAt,
    p_limit: query.limit,
    p_before_at: query.before?.at ?? null,
    p_before_id: query.before?.id ?? null,
  };
}
