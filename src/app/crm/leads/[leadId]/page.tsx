import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { CrmShell } from "@/components/crm/CrmShell";
import { CrmStatusBadge } from "@/components/crm/CrmStatusBadge";
import { formatDateTime, getLeadRows } from "@/lib/data/businessMetrics";
import { toCrmLeadCase } from "@/lib/crm/leadOps";
import {
  addNoteAction,
  assignCsAction,
  createFollowUpTaskAction,
  saveBookingAction,
  saveLostReasonAction,
  updateStatusAction,
} from "./actions";
import {
  applyCrmRecordToLeadCase,
  bootstrapCrmLeadCaseFromLead,
  getCrmCaseBundleByCaseRecord,
  getCrmCaseBundleBySourceLeadId,
  getCrmRuntimeStatus,
  type CrmInteractionRecord,
} from "@/lib/crm/store";

export const dynamic = "force-dynamic";

export default async function CrmLeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ leadId: string }>;
  searchParams?: Promise<{
    crm_success?: string | string[];
    crm_error?: string | string[];
    crm_operation?: string | string[];
    crm_code?: string | string[];
    crm_message?: string | string[];
    crm_details?: string | string[];
    crm_hint?: string | string[];
  }>;
}) {
  const { leadId } = await params;
  const query = await searchParams;
  const feedback = getCrmFeedback(query);
  const { leads, error } = await getLeadRows("month", 5000);
  const lead = leads.find((item) => item.id === leadId);

  if (!lead) notFound();

  const baseLeadCase = toCrmLeadCase(lead);
  const runtime = await getCrmRuntimeStatus();
  const bootstrappedCase = runtime.actionsEnabled
    ? await bootstrapCrmLeadCaseFromLead(lead)
    : null;
  const bundle = bootstrappedCase
    ? await getCrmCaseBundleByCaseRecord(bootstrappedCase)
    : await getCrmCaseBundleBySourceLeadId(lead.id);
  const leadCase = applyCrmRecordToLeadCase(
    baseLeadCase,
    bundle.caseRecord ?? bootstrappedCase
  );
  const hasCtwa = Object.values(leadCase.ctwa).some(Boolean);

  return (
    <CrmShell>
      <div className="flex h-screen min-w-0 flex-col">
        <header className="shrink-0 border-b border-[#e5e7eb] bg-white px-4 py-2.5">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <Link
                href="/crm"
                className="text-[11px] font-bold text-[#64748b] transition hover:text-[#111827]"
              >
                Back to Inbox
              </Link>
              <div className="mt-2 flex min-w-0 flex-wrap items-center gap-3">
                <h1 className="truncate text-lg font-bold text-[#111827]">
                  {leadCase.customerName}
                </h1>
                <CrmStatusBadge status={leadCase.status} label={leadCase.statusLabel} />
              </div>
              <p className="mt-1 truncate font-mono text-[10px] font-semibold text-[#64748b]">
                Phone-first identity: {leadCase.canonicalIdentity}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {leadCase.whatsappUrl ? (
                <a
                  href={leadCase.whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 whitespace-nowrap rounded-md border border-[#bbf7d0] bg-[#f0fdf4] px-2.5 text-[10px] font-black text-[#15803d] transition hover:bg-[#dcfce7]"
                >
                  <span className="self-center">WA</span>
                </a>
              ) : (
                <span className="inline-flex h-8 whitespace-nowrap rounded-md border border-[#e5e7eb] bg-[#f8fafc] px-2.5 text-[11px] font-bold text-[#94a3b8]">
                  <span className="self-center">No WhatsApp</span>
                </span>
              )}
              <button
                type="button"
                disabled
                className="h-8 whitespace-nowrap rounded-md bg-[#e5e7eb] px-2.5 text-[11px] font-bold text-[#94a3b8]"
              >
                Update status
              </button>
            </div>
          </div>
          {error && (
            <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">
              CRM detail could not refresh all latest records.
            </p>
          )}
          {!runtime.actionsEnabled && (
            <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800">
              <p>{runtime.disabledReason}</p>
              {runtime.debug && (
                <dl className="mt-2 grid gap-1 rounded-md bg-white/70 p-2 font-mono text-[10px] leading-4 text-[#475569]">
                  <DebugLine label="operation" value={runtime.debug.operation} />
                  <DebugLine label="code" value={runtime.debug.code ?? "-"} />
                  <DebugLine label="message" value={runtime.debug.message} />
                  <DebugLine label="details" value={runtime.debug.details ?? "-"} />
                  <DebugLine label="hint" value={runtime.debug.hint ?? "-"} />
                </dl>
              )}
            </div>
          )}
          {feedback && (
            <div
              className={`mt-2 rounded-md px-3 py-2 text-[12px] font-semibold ${
                feedback.kind === "success"
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-red-50 text-red-700"
              }`}
            >
              <p>{feedback.message}</p>
              {feedback.debug && (
                <dl className="mt-2 grid gap-1 rounded-md bg-white/70 p-2 font-mono text-[10px] leading-4 text-[#475569]">
                  <DebugLine label="operation" value={feedback.debug.operation} />
                  <DebugLine label="code" value={feedback.debug.code} />
                  <DebugLine label="message" value={feedback.debug.message} />
                  <DebugLine label="details" value={feedback.debug.details} />
                  <DebugLine label="hint" value={feedback.debug.hint} />
                </dl>
              )}
            </div>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-3.5">
          <div className="grid gap-3.5 xl:grid-cols-[360px_1fr]">
            <div className="grid gap-3.5">
              <Panel title="Contact">
                <InfoLine label="Name" value={leadCase.customerName} />
                <InfoLine label="Phone" value={leadCase.phone} />
                <InfoLine label="Normalized" value={leadCase.normalizedPhone} />
                <InfoLine label="Brand" value={leadCase.brandName} />
                <InfoLine label="Assigned to" value={leadCase.assignedCsLabel} />
                <InfoLine label="Next follow-up" value={leadCase.nextFollowUpLabel} />
              </Panel>

              <Panel title="Treatment / Booking">
                <InfoLine label="Offer" value={leadCase.treatmentOffer} />
                <InfoLine label="Package" value={leadCase.packagePrice} />
                <InfoLine label="Branch" value={leadCase.branchName} />
                <InfoLine label="Appointment" value={leadCase.appointmentLabel} />
                <InfoLine label="Created" value={leadCase.createdLabel} />
                <InfoLine label="Last activity" value={leadCase.lastActivityLabel} />
              </Panel>
            </div>

            <div className="grid gap-3.5">
              <div className="grid gap-3.5 2xl:grid-cols-2">
                <Panel title="Source">
                  <InfoLine label="CRM source" value={leadCase.sourceLabel} />
                  <InfoLine label="Raw source type" value={leadCase.sourceTypeRaw} />
                  <InfoLine label="Landing page" value={leadCase.landingPageSlug || "-"} />
                  <InfoLine label="Form token" value={bundle.caseRecord?.form_token || "-"} />
                  <InfoLine label="Page URL" value={leadCase.pageUrl || "-"} />
                  <InfoLine label="Campaign" value={leadCase.campaignLabel} />
                  <InfoLine label="Ad / Content" value={leadCase.adLabel} />
                  <InfoLine label="Lost reason" value={bundle.caseRecord?.lost_reason || "-"} />
                </Panel>

                <Panel title="CTWA / WhatsApp Ad">
                  {hasCtwa ? (
                    <>
                      <InfoLine label="CTWA Source ID" value={leadCase.ctwa.ctwa_source_id || "-"} />
                      <InfoLine label="CTWA Source URL" value={leadCase.ctwa.ctwa_source_url || "-"} />
                      <InfoLine
                        label="Headline"
                        value={leadCase.ctwa.ctwa_referral_headline || "-"}
                      />
                      <InfoLine label="Body" value={leadCase.ctwa.ctwa_referral_body || "-"} />
                      <InfoLine label="Campaign ID" value={leadCase.ctwa.campaign_id || "-"} />
                      <InfoLine label="Ad Set ID" value={leadCase.ctwa.adset_id || "-"} />
                      <InfoLine label="Ad ID" value={leadCase.ctwa.ad_id || "-"} />
                      <InfoLine
                        label="Phone Number ID"
                        value={leadCase.ctwa.phone_number_id || "-"}
                      />
                    </>
                  ) : (
                    <p className="text-[12px] leading-5 text-[#64748b]">
                      No CTWA referral data yet. WhatsApp webhook/API can enrich this block later.
                    </p>
                  )}
                </Panel>
              </div>

              <div className="grid gap-3.5 xl:grid-cols-3">
                <ActionPanel
                  title="Assignment"
                  enabled={runtime.actionsEnabled}
                  action={assignCsAction.bind(null, leadId)}
                  submitLabel="Save assignment"
                >
                  <TextInput
                    name="assigned_to"
                    label="Assigned CS"
                    defaultValue={bundle.caseRecord?.assigned_to || ""}
                    placeholder="CS name"
                  />
                </ActionPanel>

                <ActionPanel
                  title="Status Pipeline"
                  enabled={runtime.actionsEnabled}
                  action={updateStatusAction.bind(null, leadId)}
                  submitLabel="Update status"
                >
                  <SelectInput
                    name="status"
                    label="Current status"
                    defaultValue={leadCase.status}
                    options={[
                      ["new", "New"],
                      ["contacting", "Contacting"],
                      ["booked", "Booked"],
                      ["confirmed", "Confirmed"],
                      ["showed", "Showed"],
                      ["paid", "Paid"],
                      ["no_show", "No-show"],
                      ["lost", "Lost"],
                      ["invalid", "Invalid"],
                    ]}
                  />
                  <TextAreaInput
                    name="status_note"
                    label="Status note"
                    placeholder="Optional note"
                  />
                </ActionPanel>

                <ActionPanel
                  title="Notes"
                  enabled={runtime.actionsEnabled}
                  action={addNoteAction.bind(null, leadId)}
                  submitLabel="Add note"
                >
                  <TextAreaInput
                    name="note"
                    label="Internal note"
                    placeholder="Write CS follow-up notes"
                    maxLength={2000}
                  />
                </ActionPanel>

                <ActionPanel
                  title="Booking"
                  enabled={runtime.actionsEnabled}
                  action={saveBookingAction.bind(null, leadId)}
                  submitLabel="Save booking"
                >
                  <TextInput
                    name="branch_label"
                    label="Branch"
                    defaultValue={bundle.booking?.branch_label || leadCase.branchName}
                  />
                  <TextInput
                    name="treatment_label"
                    label="Treatment"
                    defaultValue={bundle.booking?.treatment_label || leadCase.treatmentOffer}
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <TextInput
                      type="date"
                      name="booking_date"
                      label="Date"
                      defaultValue={bundle.booking?.booking_date || ""}
                    />
                    <TextInput
                      type="time"
                      name="booking_time"
                      label="Time"
                      defaultValue={bundle.booking?.booking_time || ""}
                    />
                  </div>
                  <SelectInput
                    name="booking_status"
                    label="Booking status"
                    defaultValue={bundle.booking?.status || "tentative"}
                    options={[
                      ["tentative", "Tentative"],
                      ["booked", "Booked"],
                      ["confirmed", "Confirmed"],
                      ["showed", "Showed"],
                      ["no_show", "No-show"],
                      ["cancelled", "Cancelled"],
                    ]}
                  />
                </ActionPanel>

                <ActionPanel
                  title="Follow-up Task"
                  enabled={runtime.actionsEnabled}
                  action={createFollowUpTaskAction.bind(null, leadId)}
                  submitLabel="Create task"
                >
                  <TextInput
                    name="task_assigned_to"
                    label="CS owner"
                    defaultValue={bundle.caseRecord?.assigned_to || ""}
                  />
                  <TextInput
                    name="due_at"
                    type="datetime-local"
                    label="Due at"
                  />
                  <TextInput
                    name="task_type"
                    label="Task type"
                    defaultValue="follow_up"
                  />
                  <TextAreaInput
                    name="task_note"
                    label="Task note"
                    placeholder="Follow-up reminder"
                  />
                </ActionPanel>

                <ActionPanel
                  title="Lost Reason"
                  enabled={runtime.actionsEnabled}
                  action={saveLostReasonAction.bind(null, leadId)}
                  submitLabel="Save lost reason"
                >
                  <TextAreaInput
                    name="lost_reason"
                    label="Reason"
                    defaultValue={bundle.caseRecord?.lost_reason || ""}
                    placeholder="Why this case was lost"
                  />
                </ActionPanel>

                <TimelinePanel interactions={bundle.interactions} />
                <Placeholder title="Quick Replies" body="Brand-approved replies will be selectable here later." />
                <Placeholder title="AI Reply Suggestions" body="AI suggestions will use brand knowledge and conversation context later." />
                <Placeholder title="Brand Knowledge" body="Treatment FAQ, policies, and brand information will support CS and AI responses." />
                <Placeholder title="Intent / Tagging" body="Inquiry intent, objections, budget, and treatment tags are reserved." />
                <Placeholder title="Next Best Action" body="Future CRM can recommend WhatsApp follow-up, booking confirmation, or payment reminders." />
              </div>
            </div>
          </div>
        </div>
      </div>
    </CrmShell>
  );
}

function getCrmFeedback(
  query:
    | {
        crm_success?: string | string[];
        crm_error?: string | string[];
        crm_operation?: string | string[];
        crm_code?: string | string[];
        crm_message?: string | string[];
        crm_details?: string | string[];
        crm_hint?: string | string[];
      }
    | undefined
) {
  const success = firstQueryValue(query?.crm_success);
  const error = firstQueryValue(query?.crm_error);
  const debug = {
    operation: firstQueryValue(query?.crm_operation) || "-",
    code: firstQueryValue(query?.crm_code) || "-",
    message: firstQueryValue(query?.crm_message) || "-",
    details: firstQueryValue(query?.crm_details) || "-",
    hint: firstQueryValue(query?.crm_hint) || "-",
  };

  if (success === "note_saved") {
    return {
      kind: "success" as const,
      message: "Note saved. Timeline has been refreshed.",
    };
  }

  if (error === "note_required") {
    return {
      kind: "error" as const,
      message: "Please enter a note before saving.",
    };
  }

  if (error === "write_disabled") {
    return {
      kind: "error" as const,
      message:
        debug.message !== "-"
          ? debug.message
          : "CRM write actions are not enabled yet.",
      debug: debug.message !== "-" ? debug : undefined,
    };
  }

  if (error === "note_failed") {
    return {
      kind: "error" as const,
      message: "Note could not be saved. Please check CRM table setup and try again.",
      debug,
    };
  }

  return null;
}

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function DebugLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[88px_1fr]">
      <dt className="font-bold uppercase text-[#64748b]">{label}</dt>
      <dd className="break-words text-[#111827]">{value}</dd>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-[#e5e7eb] bg-white shadow-sm">
      <div className="border-b border-[#eef2f6] px-3.5 py-2.5">
        <h2 className="text-[13px] font-bold text-[#111827]">{title}</h2>
      </div>
      <div className="grid gap-2 p-3.5">{children}</div>
    </section>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-md bg-[#f8fafc] px-2.5 py-2 sm:grid-cols-[118px_1fr]">
      <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#64748b]">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-[12px] font-semibold text-[#111827]">
        {value}
      </dd>
    </div>
  );
}

function ActionPanel({
  title,
  enabled,
  action,
  submitLabel,
  children,
}: {
  title: string;
  enabled: boolean;
  action: (formData: FormData) => Promise<void>;
  submitLabel: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[#e5e7eb] bg-white p-3.5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-bold text-[#111827]">{title}</h2>
        <span
          className={`rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] ${
            enabled
              ? "bg-[#ecfdf5] text-[#047857]"
              : "bg-[#fef3c7] text-[#92400e]"
          }`}
        >
          {enabled ? "Enabled" : "Disabled"}
        </span>
      </div>
      <form action={action} className="mt-3 grid gap-2">
        <fieldset disabled={!enabled} className="grid gap-2 disabled:opacity-70">
          {children}
        </fieldset>
        <button
          type="submit"
          disabled={!enabled}
          className={`h-7 whitespace-nowrap rounded-md px-2.5 text-[10px] font-bold ${
            enabled
              ? "bg-[#111827] text-white transition hover:bg-[#0f172a]"
              : "bg-[#e5e7eb] text-[#94a3b8]"
          }`}
        >
          {submitLabel}
        </button>
      </form>
    </section>
  );
}

function TextInput({
  label,
  name,
  type = "text",
  defaultValue = "",
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#64748b]">
        {label}
      </span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="mt-1.5 h-8 w-full rounded-md border border-[#e5e7eb] bg-[#f8fafc] px-2.5 text-[12px] font-semibold text-[#111827] outline-none focus:border-[#2563eb] focus:bg-white"
      />
    </label>
  );
}

function TextAreaInput({
  label,
  name,
  defaultValue = "",
  placeholder,
  maxLength,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#64748b]">
        {label}
      </span>
      <textarea
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        maxLength={maxLength}
        className="mt-1.5 min-h-16 w-full resize-y rounded-md border border-[#e5e7eb] bg-[#f8fafc] px-2.5 py-2 text-[12px] font-semibold text-[#111827] outline-none focus:border-[#2563eb] focus:bg-white"
      />
    </label>
  );
}

function SelectInput({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: Array<[string, string]>;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#64748b]">
        {label}
      </span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="mt-1.5 h-8 w-full rounded-md border border-[#e5e7eb] bg-[#f8fafc] px-2.5 text-[12px] font-semibold text-[#111827] outline-none focus:border-[#2563eb] focus:bg-white"
      >
        {options.map(([value, labelText]) => (
          <option key={value} value={value}>
            {labelText}
          </option>
        ))}
      </select>
    </label>
  );
}

function TimelinePanel({ interactions }: { interactions: CrmInteractionRecord[] }) {
  return (
    <section className="rounded-lg border border-[#e5e7eb] bg-white p-3.5 xl:col-span-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-bold text-[#111827]">Timeline</h2>
        <span className="rounded-md bg-[#f1f5f9] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[#64748b]">
          crm_interactions
        </span>
      </div>
      {interactions.length > 0 ? (
        <ol className="mt-3 grid gap-2">
          {interactions.map((item) => (
            <li
              key={item.id}
              className="rounded-md border border-[#eef2f6] bg-[#f8fafc] px-3 py-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-[#111827]">
                  {item.interaction_type}
                </span>
                <span className="text-[10px] font-semibold text-[#64748b]">
                  {formatDateTime(item.created_at)}
                </span>
              </div>
              <p className="mt-1 text-[12px] leading-5 text-[#475569]">
                {item.body || "-"}
              </p>
              <p className="mt-1 text-[10px] font-semibold text-[#94a3b8]">
                {item.author || "CS"} · {item.source_type || "crm"}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 rounded-md bg-[#f8fafc] px-3 py-3 text-[12px] font-semibold text-[#64748b]">
          No CRM interactions yet.
        </p>
      )}
    </section>
  );
}

function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-lg border border-dashed border-[#cbd5e1] bg-white p-3.5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-bold text-[#111827]">{title}</h2>
        <span className="rounded-md bg-[#f1f5f9] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[#64748b]">
          Later
        </span>
      </div>
      <p className="mt-2 text-[12px] leading-5 text-[#64748b]">{body}</p>
      <button
        type="button"
        disabled
        className="mt-3 h-7 whitespace-nowrap rounded-md bg-[#e5e7eb] px-2.5 text-[10px] font-bold text-[#94a3b8]"
      >
        Coming soon
      </button>
    </section>
  );
}
