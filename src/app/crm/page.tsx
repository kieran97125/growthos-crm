import { CrmInboxWorkspace } from "@/components/crm/CrmInboxWorkspace";
import { CrmShell } from "@/components/crm/CrmShell";
import { loadOperations } from "@/lib/crm/loadOperations";
import { inboxFilterSchema } from "@/lib/crm/operations";
import { getCrmRuntimeStatus } from "@/lib/crm/store";

export const dynamic = "force-dynamic";
export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [data, runtime, query] = await Promise.all([
    loadOperations(),
    getCrmRuntimeStatus(),
    searchParams,
  ]);
  return (
    <CrmShell>
      <CrmInboxWorkspace
        {...data}
        initialFilter={inboxFilterSchema.parse(query)}
        writesEnabled={runtime.actionsEnabled}
      />
    </CrmShell>
  );
}
