import { runBounded } from "./bounded";
import { database } from "@/lib/saas/database";
import { checked } from "./runtime";
import { dispatchFeedback } from "@/lib/feedback/runtime";
import { dispatchNotifications } from "@/lib/notifications/runtime";
import { syncBackgroundObservations } from "@/lib/notifications/observations";
import { wakeDelivery } from "./scheduler";
export async function maintenance() {
  const db = database(),
    r = await db.rpc("sv_execution_tenants");
  checked(r.error);
  const companies = r.data as string[];
  let completed = 0,
    failed = 0;
  const deadline = Date.now() + 220000;
  for (let at = 0; at < companies.length; at += 2) {
    if (Date.now() > deadline - 80000) break;
    const batch = companies.slice(at, at + 2);
    await Promise.all(
      batch.map(async (company) => {
        try {
          checked(
            (await db.rpc("sv_journey_catchup", { p_company: company })).error,
          );
          await wakeDelivery(company);
          checked(
            (await db.rpc("sv_sales_catchup", { p_company: company })).error,
          );
          const members = await db.rpc("sv_notification_members", {
            p_company: company,
          });
          checked(members.error);
          await runBounded(members.data as string[], 5, async (actor) => {
            let observationError: unknown;
            try {
              await syncBackgroundObservations(company, actor);
            } catch (error) {
              observationError = error;
            }
            checked(
              (
                await db.rpc("sv_notification_sync", {
                  p_company: company,
                  p_actor: actor,
                })
              ).error,
            );
            await dispatchNotifications(company, actor);
            if (observationError) throw observationError;
          });
          await dispatchFeedback(company);
          completed++;
        } catch {
          failed++;
          console.warn("company_maintenance_pending", { company });
        }
      }),
    );
    checked(
      (await db.rpc("sv_execution_ack", { p_company: batch.at(-1)! })).error,
    );
  }
  return { checked: companies.length, completed, failed };
}
