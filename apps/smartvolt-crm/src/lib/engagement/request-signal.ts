import "server-only";
import { after } from "next/server";
import { wakeDelivery } from "./scheduler";
/** Called only after a verified provider ingest or an authorized committed mutation. */
export function scheduleDeliveryWake(company: string) {
  after(async () => {
    try {
      await wakeDelivery(company);
    } catch {
      console.warn("delivery_wakeup_pending", { company });
    }
  });
}
