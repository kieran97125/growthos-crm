import { notFound } from "next/navigation";
import { AutomationStudio } from "@/components/crm/AutomationStudio";
import { CampaignPlanner } from "@/components/crm/CampaignPlanner";
import { CrmInboxWorkspace } from "@/components/crm/CrmInboxWorkspace";
import { CrmShell } from "@/components/crm/CrmShell";
import { ReplyComposer } from "@/components/crm/ReplyComposer";
import { inboxFilterSchema } from "@/lib/crm/operations";
import { fixtureCases, fixtureTime } from "../../../../tests/fixtures";

// Deterministic, synthetic acceptance surface. Always a 404 in a production build.
export default async function AcceptancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.CRM_ACCEPTANCE_FIXTURES !== "true"
  )
    notFound();
  const query = await searchParams;
  const data = { cases: fixtureCases, now: fixtureTime, readError: false };
  if (query.view === "campaigns")
    return (
      <CrmShell active="campaigns">
        <CampaignPlanner {...data} />
      </CrmShell>
    );
  if (query.view === "automations")
    return (
      <CrmShell active="automations">
        <AutomationStudio {...data} />
      </CrmShell>
    );
  if (query.view === "reply")
    return (
      <CrmShell>
        <div className="ops-page-body">
          <ReplyComposer customerName="Demo Casey" treatment="皮膚護理" />
        </div>
      </CrmShell>
    );
  return (
    <CrmShell>
      <CrmInboxWorkspace
        {...data}
        initialFilter={inboxFilterSchema.parse(query)}
        writesEnabled={false}
      />
    </CrmShell>
  );
}
