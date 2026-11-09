import "server-only";
import { getLeadRows } from "@/lib/data/businessMetrics";
import { toCrmLeadCase } from "./leadOps";
import { applyCrmRecordToLeadCase, getCrmCasesBySourceLeadIds } from "./store";

export async function loadOperations() {
  const { leads, error } = await getLeadRows("month", 500);
  const records = await getCrmCasesBySourceLeadIds(
    leads.map((lead) => lead.id),
  );
  return {
    cases: leads.map((lead) =>
      applyCrmRecordToLeadCase(
        toCrmLeadCase(lead),
        records.get(lead.id) ?? null,
      ),
    ),
    readError: Boolean(error),
    now: Date.now(),
  };
}
