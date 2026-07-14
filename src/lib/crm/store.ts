import {
  type LeadRow,
  formatDateTime,
} from "@/lib/data/businessMetrics";
import {
  createSupabaseAdminClient,
  getSupabaseAdminEnvStatus,
  hasSupabaseAdminEnv,
} from "@/lib/supabase/admin";
import {
  crmStatusLabel,
  deriveInitialCrmStatusFromLead,
  type CrmLeadCase,
  type CrmSourceType,
  type CrmStatus,
  toCrmLeadCase,
} from "@/lib/crm/leadOps";

export type CrmRuntimeStatus = {
  writeFlagEnabled: boolean;
  tablesAvailable: boolean;
  actionsEnabled: boolean;
  disabledReason: string | null;
  debug: CrmOperationDebug | null;
};

export type CrmLeadCaseRecord = {
  id: string;
  contact_id: string;
  source_lead_id: string | null;
  brand_slug: string;
  status: CrmStatus;
  assigned_to: string | null;
  treatment_label: string | null;
  offer_label: string | null;
  source_type: CrmSourceType;
  source_label: string | null;
  landing_page_slug: string | null;
  page_url: string | null;
  form_token: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  ctwa_source_id: string | null;
  ctwa_source_url: string | null;
  ctwa_referral_headline: string | null;
  ctwa_referral_body: string | null;
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
  phone_number_id: string | null;
  whatsapp_business_account_id: string | null;
  next_follow_up_at: string | null;
  booking_id: string | null;
  lost_reason: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type CrmInteractionRecord = {
  id: string;
  case_id: string;
  contact_id: string;
  interaction_type: string;
  direction: string | null;
  body: string | null;
  author: string | null;
  source_type: string | null;
  created_at: string;
};

export type CrmBookingRecord = {
  id: string;
  case_id: string;
  contact_id: string;
  brand_slug: string;
  branch_label: string | null;
  treatment_label: string | null;
  booking_date: string | null;
  booking_time: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmFollowUpTaskRecord = {
  id: string;
  case_id: string;
  contact_id: string;
  assigned_to: string | null;
  due_at: string | null;
  task_type: string | null;
  note: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type CrmCaseBundle = {
  caseRecord: CrmLeadCaseRecord | null;
  interactions: CrmInteractionRecord[];
  booking: CrmBookingRecord | null;
  tasks: CrmFollowUpTaskRecord[];
};

export type CrmOperationDebug = {
  operation: string;
  code: string | null;
  message: string;
  details: string | null;
  hint: string | null;
};

export class CrmOperationError extends Error {
  debug: CrmOperationDebug;

  constructor(debug: CrmOperationDebug) {
    super(debug.message);
    this.name = "CrmOperationError";
    this.debug = debug;
  }
}

type SupabaseLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

const requiredTables = [
  "crm_contacts",
  "crm_lead_cases",
  "crm_interactions",
  "crm_status_history",
  "crm_bookings",
  "crm_follow_up_tasks",
];

export const crmWriteDisabledMessage = "CRM write actions are not enabled yet.";
export const crmAdminClientNotConfiguredMessage =
  "CRM admin database client is not configured.";

function cleanDebugValue(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, 600);
}

export function crmOperationError(
  operation: string,
  error: SupabaseLikeError | Error | null | undefined,
  fallbackMessage: string
) {
  const maybeSupabaseError = error as SupabaseLikeError | undefined;
  return new CrmOperationError({
    operation,
    code: cleanDebugValue(maybeSupabaseError?.code, "") || null,
    message:
      cleanDebugValue(maybeSupabaseError?.message, "") ||
      cleanDebugValue(error instanceof Error ? error.message : null, fallbackMessage),
    details: cleanDebugValue(maybeSupabaseError?.details, "") || null,
    hint: cleanDebugValue(maybeSupabaseError?.hint, "") || null,
  });
}

function logCrmOperationError(label: string, error: unknown) {
  if (error instanceof CrmOperationError) {
    console.error(label, error.debug);
    return;
  }

  console.error(label, safeError(error));
}

export function isCrmWriteFlagEnabled() {
  return process.env.CRM_WRITE_ENABLED?.trim().toLowerCase() === "true";
}

export async function getCrmRuntimeStatus(): Promise<CrmRuntimeStatus> {
  const writeFlagEnabled = isCrmWriteFlagEnabled();

  if (!writeFlagEnabled) {
    return {
      writeFlagEnabled,
      tablesAvailable: false,
      actionsEnabled: false,
      disabledReason: crmWriteDisabledMessage,
      debug: null,
    };
  }

  const adminEnvStatus = getSupabaseAdminEnvStatus();

  if (!adminEnvStatus.ready) {
    return {
      writeFlagEnabled,
      tablesAvailable: false,
      actionsEnabled: false,
      disabledReason: crmAdminClientNotConfiguredMessage,
      debug: {
        operation: "service-role admin client check",
        code: adminEnvStatus.serviceRoleKeyLooksLikeAnon
          ? "service_role_key_looks_like_anon"
          : "service_role_env_missing",
        message: crmAdminClientNotConfiguredMessage,
        details: `reason=${adminEnvStatus.reason ?? "unknown"}; urlPresent=${adminEnvStatus.urlPresent}; serviceRoleKeyPresent=${adminEnvStatus.serviceRoleKeyPresent}; serviceRoleKeyRole=${adminEnvStatus.serviceRoleKeyRole ?? "unknown"}`,
        hint: "Set SUPABASE_SERVICE_ROLE_KEY to the server-only service_role key in Vercel. Do not use NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      },
    };
  }

  try {
    const supabase = createSupabaseAdminClient();

    for (const table of requiredTables) {
      const { error } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .limit(1);

      if (error) {
        console.warn("crm_write_table_check_failed", {
          table,
          code: error.code,
          message: error.message,
        });

        return {
          writeFlagEnabled,
          tablesAvailable: false,
          actionsEnabled: false,
          disabledReason: crmWriteDisabledMessage,
          debug: {
            operation: `CRM table availability check: ${table}`,
            code: error.code ?? null,
            message: error.message,
            details: error.details ?? null,
            hint: error.hint ?? null,
          },
        };
      }
    }

    return {
      writeFlagEnabled,
      tablesAvailable: true,
      actionsEnabled: true,
      disabledReason: null,
      debug: null,
    };
  } catch (error) {
    console.warn("crm_write_runtime_check_failed", safeError(error));
    return {
      writeFlagEnabled,
      tablesAvailable: false,
      actionsEnabled: false,
      disabledReason: crmWriteDisabledMessage,
      debug: {
        operation: "CRM runtime check",
        code: null,
        message: error instanceof Error ? error.message : "CRM runtime check failed.",
        details: null,
        hint: null,
      },
    };
  }
}

export async function getCrmCasesBySourceLeadIds(leadIds: string[]) {
  const uniqueIds = Array.from(new Set(leadIds.filter(Boolean)));
  const casesByLeadId = new Map<string, CrmLeadCaseRecord>();

  if (uniqueIds.length === 0 || !hasSupabaseAdminEnv()) {
    return casesByLeadId;
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("crm_lead_cases")
      .select("*")
      .in("source_lead_id", uniqueIds);

    if (error) {
      console.warn("crm_cases_read_failed", {
        code: error.code,
        message: error.message,
      });
      return casesByLeadId;
    }

    ((data ?? []) as CrmLeadCaseRecord[]).forEach((item) => {
      if (item.source_lead_id) casesByLeadId.set(item.source_lead_id, item);
    });
  } catch (error) {
    console.warn("crm_cases_read_failed", safeError(error));
  }

  return casesByLeadId;
}

export async function getCrmCaseBundleBySourceLeadId(
  sourceLeadId: string
): Promise<CrmCaseBundle> {
  const empty: CrmCaseBundle = {
    caseRecord: null,
    interactions: [],
    booking: null,
    tasks: [],
  };

  if (!hasSupabaseAdminEnv()) return empty;

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("crm_lead_cases")
      .select("*")
      .eq("source_lead_id", sourceLeadId)
      .maybeSingle();

    if (error) {
      console.warn("crm_case_read_failed", {
        code: error.code,
        message: error.message,
      });
      return empty;
    }

    if (!data) return empty;
    return getCrmCaseBundleByCaseRecord(data as CrmLeadCaseRecord);
  } catch (error) {
    console.warn("crm_case_bundle_read_failed", safeError(error));
    return empty;
  }
}

export async function getCrmCaseBundleByCaseRecord(
  caseRecord: CrmLeadCaseRecord
): Promise<CrmCaseBundle> {
  if (!hasSupabaseAdminEnv()) {
    return {
      caseRecord,
      interactions: [],
      booking: null,
      tasks: [],
    };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const [interactionsResult, bookingsResult, tasksResult] = await Promise.all([
      supabase
        .from("crm_interactions")
        .select("*")
        .eq("case_id", caseRecord.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("crm_bookings")
        .select("*")
        .eq("case_id", caseRecord.id)
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("crm_follow_up_tasks")
        .select("*")
        .eq("case_id", caseRecord.id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    if (interactionsResult.error) {
      console.warn("crm_interactions_read_failed", {
        code: interactionsResult.error.code,
        message: interactionsResult.error.message,
      });
    }

    if (bookingsResult.error) {
      console.warn("crm_bookings_read_failed", {
        code: bookingsResult.error.code,
        message: bookingsResult.error.message,
      });
    }

    if (tasksResult.error) {
      console.warn("crm_tasks_read_failed", {
        code: tasksResult.error.code,
        message: tasksResult.error.message,
      });
    }

    return {
      caseRecord,
      interactions: (interactionsResult.data ?? []) as CrmInteractionRecord[],
      booking: ((bookingsResult.data ?? [])[0] as CrmBookingRecord | undefined) ?? null,
      tasks: (tasksResult.data ?? []) as CrmFollowUpTaskRecord[],
    };
  } catch (error) {
    console.warn("crm_case_bundle_read_failed", safeError(error));
    return {
      caseRecord,
      interactions: [],
      booking: null,
      tasks: [],
    };
  }
}

export function applyCrmRecordToLeadCase(
  leadCase: CrmLeadCase,
  record: CrmLeadCaseRecord | null
): CrmLeadCase {
  if (!record) return leadCase;

  return {
    ...leadCase,
    status: record.status,
    statusLabel: crmStatusLabel(record.status),
    assignedCsLabel: record.assigned_to || leadCase.assignedCsLabel,
    nextFollowUpLabel: record.next_follow_up_at
      ? formatDateTime(record.next_follow_up_at)
      : leadCase.nextFollowUpLabel,
    landingPageSlug: record.landing_page_slug || leadCase.landingPageSlug,
    pageUrl: record.page_url || leadCase.pageUrl,
    sourceLabel: record.source_label || leadCase.sourceLabel,
    sourceTypeRaw: record.source_type || leadCase.sourceTypeRaw,
    ctwa: {
      ctwa_source_id: record.ctwa_source_id || leadCase.ctwa.ctwa_source_id,
      ctwa_source_url: record.ctwa_source_url || leadCase.ctwa.ctwa_source_url,
      ctwa_referral_headline:
        record.ctwa_referral_headline || leadCase.ctwa.ctwa_referral_headline,
      ctwa_referral_body:
        record.ctwa_referral_body || leadCase.ctwa.ctwa_referral_body,
      campaign_id: record.campaign_id || leadCase.ctwa.campaign_id,
      adset_id: record.adset_id || leadCase.ctwa.adset_id,
      ad_id: record.ad_id || leadCase.ctwa.ad_id,
      phone_number_id: record.phone_number_id || leadCase.ctwa.phone_number_id,
      whatsapp_business_account_id:
        record.whatsapp_business_account_id ||
        leadCase.ctwa.whatsapp_business_account_id,
    },
  };
}

export async function bootstrapCrmLeadCaseFromLead(
  lead: LeadRow,
  options: { throwOnError?: boolean } = {}
) {
  const runtime = await getCrmRuntimeStatus();
  if (!runtime.actionsEnabled || !hasSupabaseAdminEnv()) {
    if (options.throwOnError) {
      throw new CrmOperationError(
        runtime.debug ?? {
          operation: "runtime check",
          code: null,
          message: crmWriteDisabledMessage,
          details: null,
          hint: null,
        }
      );
    }
    return null;
  }

  const existingBundle = await getCrmCaseBundleBySourceLeadId(lead.id);
  if (existingBundle.caseRecord) return existingBundle.caseRecord;

  const supabase = createSupabaseAdminClient();
  const leadCase = toCrmLeadCase(lead);
  const now = new Date().toISOString();
  const contactPayload = {
    brand_slug: leadCase.brandSlug,
    normalized_phone: leadCase.normalizedPhone || leadCase.phone,
    display_name: leadCase.customerName,
    email: lead.contact?.email ?? null,
    first_seen_at: lead.created_at,
    last_activity_at: lead.submitted_at || lead.created_at,
    metadata_json: {
      source: "launchhub_bootstrap",
      source_lead_id: lead.id,
    },
    updated_at: now,
  };

  const { data: contact, error: contactError } = await supabase
    .from("crm_contacts")
    .upsert(contactPayload, { onConflict: "brand_slug,normalized_phone" })
    .select("id")
    .single();

  if (contactError || !contact) {
    const operationError = crmOperationError(
      "contact bootstrap failed",
      contactError,
      "CRM contact could not be created."
    );
    logCrmOperationError("crm_contact_bootstrap_failed", operationError);
    if (options.throwOnError) throw operationError;
    return null;
  }

  const { data: existingCase, error: existingCaseError } = await supabase
    .from("crm_lead_cases")
    .select("*")
    .eq("source_lead_id", lead.id)
    .maybeSingle();

  if (existingCaseError) {
    const operationError = crmOperationError(
      "case bootstrap lookup failed",
      existingCaseError,
      "CRM case lookup failed."
    );
    logCrmOperationError("crm_case_existing_check_failed", operationError);
    if (options.throwOnError) throw operationError;
    return null;
  }

  if (existingCase) return existingCase as CrmLeadCaseRecord;

  const snapshot = lead.sourceSnapshot;
  const initialStatus = deriveInitialCrmStatusFromLead(lead);
  const casePayload = {
    contact_id: String(contact.id),
    source_lead_id: lead.id,
    brand_slug: leadCase.brandSlug,
    status: initialStatus,
    assigned_to: null,
    treatment_label: lead.treatment?.name ?? leadCase.treatmentOffer,
    offer_label: lead.package?.name ?? leadCase.packagePrice,
    source_type: leadCase.crmSourceType,
    source_label: leadCase.sourceLabel,
    landing_page_slug: leadCase.landingPageSlug,
    page_url: leadCase.pageUrl,
    form_token: lead.form?.public_form_token ?? null,
    utm_source: snapshot?.utm_source ?? null,
    utm_campaign: snapshot?.utm_campaign ?? null,
    ctwa_source_id: leadCase.ctwa.ctwa_source_id,
    ctwa_source_url: leadCase.ctwa.ctwa_source_url,
    ctwa_referral_headline: leadCase.ctwa.ctwa_referral_headline,
    ctwa_referral_body: leadCase.ctwa.ctwa_referral_body,
    campaign_id: leadCase.ctwa.campaign_id,
    adset_id: leadCase.ctwa.adset_id,
    ad_id: leadCase.ctwa.ad_id,
    phone_number_id: leadCase.ctwa.phone_number_id,
    whatsapp_business_account_id: leadCase.ctwa.whatsapp_business_account_id,
    next_follow_up_at: null,
    booking_id: null,
    lost_reason: null,
    metadata_json: {
      source: "launchhub_bootstrap",
      source_lead_id: lead.id,
      form_id: lead.form_id,
      form_name: lead.form?.form_name ?? null,
      utm_medium: snapshot?.utm_medium ?? null,
      utm_content: snapshot?.utm_content ?? null,
      created_from: "crm_detail_view",
    },
    updated_at: now,
  };

  const { data: createdCase, error: caseError } = await supabase
    .from("crm_lead_cases")
    .insert(casePayload)
    .select("*")
    .single();

  if (caseError || !createdCase) {
    const operationError = crmOperationError(
      "case bootstrap failed",
      caseError,
      "CRM case could not be created."
    );
    logCrmOperationError("crm_case_bootstrap_failed", operationError);
    if (options.throwOnError) throw operationError;
    return null;
  }

  await insertCrmInteraction({
    caseId: String(createdCase.id),
    contactId: String(contact.id),
    interactionType: "system",
    body: "CRM case bootstrapped from LaunchHub lead.",
    author: "system",
    sourceType: "launchhub",
  });

  return createdCase as CrmLeadCaseRecord;
}

export async function insertCrmInteraction(input: {
  caseId: string;
  contactId: string;
  interactionType: string;
  body: string;
  author?: string | null;
  sourceType?: string | null;
}) {
  if (!hasSupabaseAdminEnv()) return;

  try {
    await createCrmInteraction(input);
  } catch (error) {
    console.warn("crm_interaction_insert_failed", safeError(error));
  }
}

export async function createCrmInteraction(input: {
  caseId: string;
  contactId: string;
  interactionType: string;
  body: string;
  author?: string | null;
  sourceType?: string | null;
  operation?: string;
}) {
  if (!hasSupabaseAdminEnv()) {
    const adminEnvStatus = getSupabaseAdminEnvStatus();
    throw new CrmOperationError({
      operation: input.operation ?? "interaction insert failed",
      code: adminEnvStatus.serviceRoleKeyLooksLikeAnon
        ? "service_role_key_looks_like_anon"
        : "service_role_env_missing",
      message: crmAdminClientNotConfiguredMessage,
      details: `reason=${adminEnvStatus.reason ?? "unknown"}; urlPresent=${adminEnvStatus.urlPresent}; serviceRoleKeyPresent=${adminEnvStatus.serviceRoleKeyPresent}; serviceRoleKeyRole=${adminEnvStatus.serviceRoleKeyRole ?? "unknown"}`,
      hint: "Set SUPABASE_SERVICE_ROLE_KEY to the server-only service_role key. Do not use the public anon key.",
    });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("crm_interactions")
    .insert({
      case_id: input.caseId,
      contact_id: input.contactId,
      interaction_type: input.interactionType,
      direction: "internal",
      body: input.body,
      author: input.author ?? "admin",
      source_type: input.sourceType ?? "crm",
      metadata_json: {},
    })
    .select("*")
    .single();

  if (error || !data) {
    throw crmOperationError(
      input.operation ?? "interaction insert failed",
      error,
      "CRM interaction could not be created."
    );
  }

  return data as CrmInteractionRecord;
}

export function safeText(value: FormDataEntryValue | null, maxLength = 500) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

export function safeError(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { message: "unknown_error" };
}
