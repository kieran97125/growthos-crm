import { start, getRun } from "workflow/api";
import { deliveryWorkflow } from "@/workflows/delivery";
import { database } from "@/lib/saas/database";
import { checked } from "./runtime";
export async function wakeDelivery(
  company: string,
  recover = true,
): Promise<string | null> {
  const db = database(),
    r = await db.rpc("sv_delivery_scheduler", {
      p_company: company,
      p_mode: "wake",
    });
  checked(r.error);
  if (r.data.start) {
    const run = await start(deliveryWorkflow, [
      company,
      r.data.generation,
      r.data.token,
    ]);
    const bound = await db.rpc("sv_delivery_scheduler", {
      p_company: company,
      p_mode: "bind",
      p_generation: r.data.generation,
      p_token: r.data.token,
      p_run: run.runId,
    });
    checked(bound.error);
    return run.runId;
  }
  if (r.data.runId) {
    try {
      const run = getRun(r.data.runId),
        status = await run.status;
      if (recover && ["failed", "cancelled", "completed"].includes(status)) {
        const released = await db.rpc("sv_delivery_scheduler", {
          p_company: company,
          p_mode: "release",
          p_generation: r.data.generation,
          p_token: r.data.token,
        });
        checked(released.error);
        return wakeDelivery(company, false);
      }
      await run.wakeUp();
    } catch {
      console.warn("delivery_wake_pending", { company });
    }
  }
  return r.data.runId ?? null;
}
