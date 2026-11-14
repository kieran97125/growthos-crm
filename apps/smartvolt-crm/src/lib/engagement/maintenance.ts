import { timingSafeEqual } from "node:crypto";
import { database } from "@/lib/saas/database";
import { checked } from "./runtime";
import { wakeDelivery } from "./scheduler";
export function validCronAuthorization(value: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32 || !value) return false;
  const a = Buffer.from(value),
    b = Buffer.from("Bearer " + secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function maintenance() {
  const db = database(),
    r = await db.rpc("sv_execution_tenants");
  checked(r.error);
  const companies = r.data as string[];
  let completed = 0,
    failed = 0;
  for (const company of companies) {
    try {
      const caught = await db.rpc("sv_journey_catchup", { p_company: company });
      checked(caught.error);
      await wakeDelivery(company);
      completed++;
    } catch {
      failed++;
      console.warn("company_maintenance_pending", { company });
    }
  }
  return { checked: companies.length, completed, failed };
}
