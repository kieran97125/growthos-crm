import "server-only";
import { after } from "next/server";
import { wakeDelivery } from "./scheduler";
import { advanceInboxAutomations } from "./expansion-maintenance";
/** Called only after a verified provider ingest or an authorized committed mutation. */
export function scheduleDeliveryWake(company: string) {
  after(async () => {
    try {
      const complete = await advanceInboxAutomations(company);
      await wakeDelivery(company);
      if (!complete)
        console.warn("inbox_expansion_wakeup_pending", { company });
    } catch {
      console.warn("delivery_wakeup_pending", { company });
    }
  });
}
