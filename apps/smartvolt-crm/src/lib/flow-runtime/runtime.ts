import { database } from "@/lib/saas/database";

/** No provider/model calls: durable graph transitions only, in one bounded transaction. */
export async function catchUpFlows(company: string) {
  const r = await database().rpc("sv_flow_catchup", { p_company: company });
  if (r.error) throw new Error("flow_catchup_pending");
  return r.data;
}
