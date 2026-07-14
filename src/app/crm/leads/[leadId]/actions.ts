"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getLeadRows } from "@/lib/data/businessMetrics";
import {
  bootstrapCrmLeadCaseFromLead,
  createCrmInteraction,
  CrmOperationError,
  getCrmCaseBundleByCaseRecord,
  getCrmRuntimeStatus,
  insertCrmInteraction,
  safeError,
  safeText,
  type CrmLeadCaseRecord,
} from "@/lib/crm/store";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { CrmStatus } from "@/lib/crm/leadOps";

const allowedStatuses: CrmStatus[] = [
  "new",
  "contacting",
  "booked",
  "confirmed",
  "showed",
  "paid",
  "no_show",
  "lost",
  "invalid",
];

const allowedBookingStatuses = [
  "tentative",
  "booked",
  "confirmed",
  "showed",
  "no_show",
  "cancelled",
];

async function getWritableCase(leadId: string) {
  const runtime = await getCrmRuntimeStatus();
  if (!runtime.actionsEnabled) return null;

  const { leads } = await getLeadRows("month", 5000);
  const lead = leads.find((item) => item.id === leadId);
  if (!lead) return null;

  return bootstrapCrmLeadCaseFromLead(lead);
}

async function runCrmAction(
  leadId: string,
  handler: (caseRecord: CrmLeadCaseRecord) => Promise<void>
) {
  try {
    const caseRecord = await getWritableCase(leadId);
    if (!caseRecord) {
      console.warn("crm_action_skipped", {
        leadId,
        reason: "write_actions_not_enabled_or_lead_not_found",
      });
      return;
    }

    await handler(caseRecord);
  } catch (error) {
    console.warn("crm_action_failed", safeError(error));
  } finally {
    revalidatePath("/crm");
    revalidatePath(`/crm/leads/${leadId}`);
  }
}

export async function assignCsAction(leadId: string, formData: FormData) {
  await runCrmAction(leadId, async (caseRecord) => {
    const assignedTo = safeText(formData.get("assigned_to"), 120);
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("crm_lead_cases")
      .update({
        assigned_to: assignedTo || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", caseRecord.id);

    if (error) throw error;

    await insertCrmInteraction({
      caseId: caseRecord.id,
      contactId: caseRecord.contact_id,
      interactionType: "system",
      body: assignedTo
        ? `Assigned CS changed to ${assignedTo}.`
        : "Assigned CS cleared.",
    });
  });
}

export async function updateStatusAction(leadId: string, formData: FormData) {
  await runCrmAction(leadId, async (caseRecord) => {
    const nextStatus = safeText(formData.get("status"), 40) as CrmStatus;
    const note = safeText(formData.get("status_note"), 500);

    if (!allowedStatuses.includes(nextStatus)) return;

    const supabase = createSupabaseAdminClient();
    const previousStatus = caseRecord.status;
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("crm_lead_cases")
      .update({
        status: nextStatus,
        updated_at: now,
      })
      .eq("id", caseRecord.id);

    if (updateError) throw updateError;

    const { error: historyError } = await supabase
      .from("crm_status_history")
      .insert({
        case_id: caseRecord.id,
        previous_status: previousStatus,
        new_status: nextStatus,
        changed_by: "CS",
        note: note || null,
      });

    if (historyError) throw historyError;

    await insertCrmInteraction({
      caseId: caseRecord.id,
      contactId: caseRecord.contact_id,
      interactionType: "status_change",
      body: note || `Status changed from ${previousStatus} to ${nextStatus}.`,
    });
  });
}

export async function addNoteAction(leadId: string, formData: FormData) {
  const note = safeText(formData.get("note"), 2000);
  let result: "note_saved" | "note_required" | "note_failed" | "write_disabled" =
    "note_failed";

  if (!note) {
    redirect(crmLeadDetailUrl(leadId, "crm_error", "note_required"));
  }

  try {
    const runtime = await getCrmRuntimeStatus();

    if (!runtime.actionsEnabled) {
      revalidatePath("/crm");
      revalidatePath(`/crm/leads/${leadId}`);
      redirect(
        crmLeadDetailUrl(
          leadId,
          "crm_error",
          "write_disabled",
          runtime.debug ? new CrmOperationError(runtime.debug) : undefined
        )
      );
    } else {
      const { leads, error } = await getLeadRows("month", 5000);
      if (error) throw error;

      const lead = leads.find((item) => item.id === leadId);
      if (!lead) throw new Error("crm_note_lead_not_found");

      const caseRecord = await bootstrapCrmLeadCaseFromLead(lead, {
        throwOnError: true,
      });
      if (!caseRecord) throw new Error("crm_note_bootstrap_failed");

      await createCrmInteraction({
        caseId: caseRecord.id,
        contactId: caseRecord.contact_id,
        interactionType: "note",
        body: note,
        author: "admin",
        sourceType: "crm",
        operation: "note insert failed",
      });

      result = "note_saved";
    }
  } catch (error) {
    if (error instanceof CrmOperationError) {
      console.error("crm_note_action_failed", error.debug);
    } else {
      console.error("crm_note_action_failed", safeError(error));
    }
    result = "note_failed";
    revalidatePath("/crm");
    revalidatePath(`/crm/leads/${leadId}`);
    redirect(crmLeadDetailUrl(leadId, "crm_error", result, error));
  }

  revalidatePath("/crm");
  revalidatePath(`/crm/leads/${leadId}`);
  redirect(
    crmLeadDetailUrl(
      leadId,
      result === "note_saved" ? "crm_success" : "crm_error",
      result
    )
  );
}

function crmLeadDetailUrl(
  leadId: string,
  key: "crm_success" | "crm_error",
  value: string,
  error?: unknown
) {
  const params = new URLSearchParams({ [key]: value });

  if (error instanceof CrmOperationError) {
    params.set("crm_operation", error.debug.operation);
    if (error.debug.code) params.set("crm_code", error.debug.code);
    params.set("crm_message", error.debug.message);
    if (error.debug.details) params.set("crm_details", error.debug.details);
    if (error.debug.hint) params.set("crm_hint", error.debug.hint);
  } else if (error instanceof Error) {
    params.set("crm_operation", "add note");
    params.set("crm_message", error.message.slice(0, 600));
  }

  return `/crm/leads/${encodeURIComponent(leadId)}?${params.toString()}`;
}

export async function saveBookingAction(leadId: string, formData: FormData) {
  await runCrmAction(leadId, async (caseRecord) => {
    const branchLabel = safeText(formData.get("branch_label"), 160);
    const treatmentLabel = safeText(formData.get("treatment_label"), 200);
    const bookingDate = safeText(formData.get("booking_date"), 20);
    const bookingTime = safeText(formData.get("booking_time"), 20);
    const status = safeText(formData.get("booking_status"), 40) || "tentative";

    if (!allowedBookingStatuses.includes(status)) return;

    const supabase = createSupabaseAdminClient();
    const bundle = await getCrmCaseBundleByCaseRecord(caseRecord);
    const now = new Date().toISOString();
    const payload = {
      branch_label: branchLabel || null,
      treatment_label: treatmentLabel || null,
      booking_date: bookingDate || null,
      booking_time: bookingTime || null,
      status,
      created_by: "CS",
      updated_at: now,
    };

    if (bundle.booking) {
      const { error } = await supabase
        .from("crm_bookings")
        .update(payload)
        .eq("id", bundle.booking.id);
      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from("crm_bookings")
        .insert({
          ...payload,
          case_id: caseRecord.id,
          contact_id: caseRecord.contact_id,
          brand_slug: caseRecord.brand_slug,
        })
        .select("id")
        .single();

      if (error || !data) throw error ?? new Error("crm_booking_create_failed");

      const { error: caseUpdateError } = await supabase
        .from("crm_lead_cases")
        .update({
          booking_id: String(data.id),
          updated_at: now,
        })
        .eq("id", caseRecord.id);

      if (caseUpdateError) throw caseUpdateError;
    }

    await insertCrmInteraction({
      caseId: caseRecord.id,
      contactId: caseRecord.contact_id,
      interactionType: "booking",
      body: `Booking saved: ${[bookingDate, bookingTime, status]
        .filter(Boolean)
        .join(" ")}`,
    });
  });
}

export async function createFollowUpTaskAction(leadId: string, formData: FormData) {
  await runCrmAction(leadId, async (caseRecord) => {
    const assignedTo = safeText(formData.get("task_assigned_to"), 120);
    const taskType = safeText(formData.get("task_type"), 80) || "follow_up";
    const note = safeText(formData.get("task_note"), 800);
    const dueAtRaw = safeText(formData.get("due_at"), 80);
    const dueAt = parseDateTimeValue(dueAtRaw);
    const supabase = createSupabaseAdminClient();
    const now = new Date().toISOString();

    const { error } = await supabase.from("crm_follow_up_tasks").insert({
      case_id: caseRecord.id,
      contact_id: caseRecord.contact_id,
      assigned_to: assignedTo || null,
      due_at: dueAt,
      task_type: taskType,
      note: note || null,
      status: "open",
    });

    if (error) throw error;

    const { error: updateError } = await supabase
      .from("crm_lead_cases")
      .update({
        next_follow_up_at: dueAt,
        updated_at: now,
      })
      .eq("id", caseRecord.id);

    if (updateError) throw updateError;

    await insertCrmInteraction({
      caseId: caseRecord.id,
      contactId: caseRecord.contact_id,
      interactionType: "system",
      body: note || `Follow-up task created${dueAt ? ` for ${dueAt}` : ""}.`,
    });
  });
}

export async function saveLostReasonAction(leadId: string, formData: FormData) {
  await runCrmAction(leadId, async (caseRecord) => {
    const lostReason = safeText(formData.get("lost_reason"), 800);
    if (!lostReason) return;

    const supabase = createSupabaseAdminClient();
    const previousStatus = caseRecord.status;
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("crm_lead_cases")
      .update({
        lost_reason: lostReason,
        status: "lost",
        updated_at: now,
      })
      .eq("id", caseRecord.id);

    if (updateError) throw updateError;

    if (previousStatus !== "lost") {
      const { error: historyError } = await supabase
        .from("crm_status_history")
        .insert({
          case_id: caseRecord.id,
          previous_status: previousStatus,
          new_status: "lost",
          changed_by: "CS",
          note: lostReason,
        });

      if (historyError) throw historyError;
    }

    await insertCrmInteraction({
      caseId: caseRecord.id,
      contactId: caseRecord.contact_id,
      interactionType: "status_change",
      body: `Lost reason: ${lostReason}`,
    });
  });
}

function parseDateTimeValue(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
