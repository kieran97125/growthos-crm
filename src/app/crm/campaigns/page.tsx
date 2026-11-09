import { CampaignPlanner } from "@/components/crm/CampaignPlanner";
import { CrmShell } from "@/components/crm/CrmShell";
import { loadOperations } from "@/lib/crm/loadOperations";
export const dynamic = "force-dynamic";
export default async function CampaignsPage() {
  return (
    <CrmShell active="campaigns">
      <CampaignPlanner {...await loadOperations()} />
    </CrmShell>
  );
}
