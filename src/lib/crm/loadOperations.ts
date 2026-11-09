import "server-only";
import { getLeadRows } from "@/lib/data/businessMetrics";
import { toCrmLeadCase } from "./leadOps";
import { applyCrmRecordToLeadCase, readCrmCaseIndex } from "./store";

export async function loadOperations() {
  const { leads, error } = await getLeadRows("month", 500);
  const index = await readCrmCaseIndex(leads.map((lead) => lead.id));
  return {
    cases: leads.map((lead) => {
      const item = applyCrmRecordToLeadCase(
        toCrmLeadCase(lead),
        index.records.get(lead.id) ?? null,
      );
      return index.available
        ? item
        : {
            ...item,
            assignedCsLabel: "未能確認",
            nextFollowUpLabel: "未能確認",
          };
    }),
    readError: Boolean(error),
    operationsReady: index.available,
    now: Date.now(),
  };
}
