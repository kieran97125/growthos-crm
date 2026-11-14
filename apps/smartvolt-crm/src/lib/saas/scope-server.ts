import "server-only";
import { AccessError } from "./identity";
import type { requireCompany } from "./server";
type Access = Awaited<ReturnType<typeof requireCompany>>;
/** Attach the stored grant to a PostgREST query before its order/limit/aggregate. */
export function scopeBrands<Q extends { in: unknown }>(a: Access, query: Q, column = "brand_id"): Q {
  if(a.memberScope.brandIds === null) return query;
  // PostgREST's conditional column types must not recursively instantiate Q.
  const filter = query as Q & {in(column: string, values: readonly string[]): Q};
  return filter.in(column, a.memberScope.brandIds);
}
export async function requireThreadScope(a: Access, provider: "whatsapp" | "meta", thread: string) {
  const r = await a.db.rpc("sv_thread_scope", { p_company: a.company.id, p_actor: a.user.id, p_provider: provider, p_thread: thread });
  if (r.error) throw new AccessError("你無權開啟此品牌嘅對話。", 403);
}
export async function requireCustomerScope(a: Access, id: string) {
  const r = await a.db.rpc("sv_customer_scope", { p_company: a.company.id, p_actor: a.user.id, p_customer: id });
  if (r.error) throw new AccessError("你無權開啟此客戶。", 403);
}
