import { CrmInboxTable } from "@/components/crm/CrmInboxTable";
import { CrmShell } from "@/components/crm/CrmShell";
import { getLeadRows } from "@/lib/data/businessMetrics";
import { summarizeCrmCases, toCrmLeadCase } from "@/lib/crm/leadOps";
import {
  applyCrmRecordToLeadCase,
  getCrmCasesBySourceLeadIds,
  getCrmRuntimeStatus,
} from "@/lib/crm/store";

export const dynamic = "force-dynamic";

const tabs = ["Chats", "Orders", "Appointments", "Contacts", "Groups"];

export default async function CrmPage() {
  const { leads, error } = await getLeadRows("month", 500);
  const [runtime, crmCasesByLeadId] = await Promise.all([
    getCrmRuntimeStatus(),
    getCrmCasesBySourceLeadIds(leads.map((lead) => lead.id)),
  ]);
  const cases = leads.map((lead) =>
    applyCrmRecordToLeadCase(toCrmLeadCase(lead), crmCasesByLeadId.get(lead.id) ?? null)
  );
  const summary = summarizeCrmCases(cases);

  return (
    <CrmShell>
      <div className="flex h-screen min-w-0 flex-col">
        <header className="shrink-0 border-b border-[#e5e7eb] bg-white">
          <div className="flex flex-col gap-2.5 px-4 py-2.5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-lg font-bold text-[#111827]">Inbox</h1>
                <span className="rounded-md bg-[#ecfdf5] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#047857]">
                  {runtime.actionsEnabled ? "Actions enabled" : "Read-only"}
                </span>
              </div>
              <p className="mt-1 text-[11px] font-semibold text-[#64748b]">
                LeadOps CRM uses brand + normalized phone as the customer identity.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-[10px] font-bold text-[#475569] sm:flex">
              <Metric label="Open" value={summary.total} />
              <Metric label="WhatsApp Ads" value={summary.whatsappAds} />
              <Metric label="Forms" value={summary.formLeads} />
              <Metric label="No next follow-up" value={summary.missingNextFollowUp} />
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-2 border-t border-[#f1f5f9] px-4 py-2 xl:flex-row xl:items-center xl:justify-between">
            <nav className="flex gap-0.5 overflow-x-auto">
              {tabs.map((tab, index) => (
                <button
                  key={tab}
                  type="button"
                  disabled={index !== 0}
                  className={`h-8 whitespace-nowrap rounded-md px-2.5 text-[13px] font-semibold ${
                    index === 0
                      ? "bg-[#111827] text-white"
                      : "text-[#94a3b8] hover:bg-[#f8fafc]"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </nav>

            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <button className="h-9 whitespace-nowrap rounded-md border border-[#dbe2ea] bg-white px-2.5 text-[12px] font-semibold text-[#334155]">
                Filter
              </button>
              <select className="h-9 rounded-md border border-[#dbe2ea] bg-white px-2.5 text-[12px] font-semibold text-[#334155]">
                <option>All sources</option>
                <option>WhatsApp ads</option>
                <option>Landing forms</option>
              </select>
              <select className="h-9 rounded-md border border-[#dbe2ea] bg-white px-2.5 text-[12px] font-semibold text-[#334155]">
                <option>All statuses</option>
                <option>New</option>
                <option>Contacting</option>
                <option>Booked</option>
              </select>
              <label className="min-w-[240px] flex-1 xl:w-[360px] xl:flex-none">
                <span className="sr-only">Search CRM inbox</span>
                <input
                  type="search"
                  placeholder="Search name, phone, CTWA ID, campaign..."
                  className="h-9 w-full rounded-md border border-[#dbe2ea] bg-[#f8fafc] px-3 text-[12px] font-semibold text-[#111827] outline-none transition placeholder:text-[#94a3b8] focus:border-[#2563eb] focus:bg-white"
                />
              </label>
              <button
                type="button"
                disabled
                title={runtime.disabledReason ?? "CRM write actions are enabled on detail pages."}
                className="h-9 whitespace-nowrap rounded-md bg-[#e5e7eb] px-2.5 text-[12px] font-bold text-[#94a3b8]"
              >
                New task
              </button>
            </div>
          </div>

          {!runtime.actionsEnabled && (
            <p className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-[12px] font-semibold text-amber-800">
              {runtime.disabledReason}
            </p>
          )}

          {error && (
            <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-[12px] font-semibold text-red-700">
              CRM inbox cannot read the latest records right now. Please try again later.
            </p>
          )}
        </header>

        <CrmInboxTable cases={cases} />
      </div>
    </CrmShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[#e5e7eb] bg-[#f8fafc] px-2.5 py-1.5">
      <span className="text-[#64748b]">{label}</span>
      <span className="ml-2 text-[#111827]">{value}</span>
    </div>
  );
}
