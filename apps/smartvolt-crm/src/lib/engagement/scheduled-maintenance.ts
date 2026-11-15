import { handleSchedule } from "@vercel/schedules";
/** This handler is deployed ONLY as a private schedule/v1beta function target. */
export function scheduledMaintenance(
  work: () => Promise<{ checked: number; completed: number; failed: number }>,
) {
  return handleSchedule(async (metadata) => {
    if (
      metadata.name !== "convelta-maintenance" ||
      metadata.namespace !== "default" ||
      metadata.source !== "static"
    )
      throw Error("Unexpected maintenance schedule.");
    const result = await work();
    console.info("execution_maintenance_complete", result);
    if (result.failed)
      throw Error("Some company background work requires reconciliation.");
  });
}
