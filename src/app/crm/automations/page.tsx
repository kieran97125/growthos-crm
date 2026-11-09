import { AutomationStudio } from "@/components/crm/AutomationStudio";
import { CrmShell } from "@/components/crm/CrmShell";
import { loadOperations } from "@/lib/crm/loadOperations";
export const dynamic = "force-dynamic";
export default async function AutomationsPage() {
  return (
    <CrmShell active="automations">
      <AutomationStudio {...await loadOperations()} />
    </CrmShell>
  );
}
