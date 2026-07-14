import {
  createSupabaseAdminClient,
  hasSupabaseAdminEnv,
} from "@/lib/supabase/admin";

export type DateRangeKey = "today" | "yesterday" | "last7" | "month" | "custom";

export type CountItem = {
  label: string;
  count: number;
};

export type PerformanceRow = {
  key: string;
  label: string;
  leads: number;
  bookings: number;
  paid: number;
  amount: number;
  share?: number;
  meta?: string[];
};

type LeadRecord = {
  id: string;
  created_at: string;
  submitted_at: string | null;
  contact_id: string | null;
  form_id: string | null;
  source_snapshot_id: string | null;
  customer_name: string | null;
  phone: string | null;
  normalized_phone: string | null;
  appointment_date: string | null;
  appointment_time: string | null;
  price: number | string | null;
  currency: string | null;
  source_type: string | null;
  payment_status: string | null;
  lead_status: string | null;
  booking_status: string | null;
  brand_id: string | null;
  treatment_id: string | null;
  package_id: string | null;
  branch_id: string | null;
};

type ContactRecord = {
  id: string;
  customer_name: string | null;
  phone: string | null;
  normalized_phone: string | null;
  email: string | null;
};

type SourceSnapshotRecord = {
  id: string;
  lead_id: string | null;
  source_type: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  landing_page_url: string | null;
  current_page_url: string | null;
  page_path: string | null;
  ctwa_id: string | null;
  whatsapp_phone_number_id: string | null;
  meta_ad_id: string | null;
  meta_adset_id: string | null;
  meta_campaign_id: string | null;
  meta_source_url: string | null;
  whatsapp_referral_headline: string | null;
  whatsapp_referral_body: string | null;
  whatsapp_referral_source_id: string | null;
  tracking_status: string | null;
  audit_reason: string | null;
};

type BookingRecord = {
  id: string;
  lead_id: string;
  appointment_date: string | null;
  appointment_time: string | null;
  booking_status: string | null;
};

type NameRecord = {
  id: string;
  name: string | null;
};

type PackageRecord = NameRecord & {
  promo_price: number | string | null;
  currency: string | null;
};

type FormRecord = {
  id: string;
  form_name: string | null;
  public_form_token: string | null;
};

export type LeadRow = LeadRecord & {
  contact: ContactRecord | null;
  sourceSnapshot: SourceSnapshotRecord | null;
  booking: BookingRecord | null;
  form: FormRecord | null;
  brand: NameRecord | null;
  treatment: NameRecord | null;
  package: PackageRecord | null;
  branch: NameRecord | null;
};

export type LeadRowsResult = {
  range: ReturnType<typeof getDateRange>;
  leads: LeadRow[];
  error: Error | null;
  warnings?: string[];
};

export type LeadRowsOptions = {
  brandId?: string;
  source?: string;
  campaign?: string;
  treatmentId?: string;
  branchId?: string;
  query?: string;
  includeTestData?: boolean;
};

export const dateRangeOptions: Array<{ key: DateRangeKey; label: string }> = [
  { key: "today", label: "今日" },
  { key: "yesterday", label: "昨日" },
  { key: "last7", label: "近7日" },
  { key: "month", label: "本月" },
  { key: "custom", label: "自訂日期" },
];

export function asNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function money(value: number, currency = "HKD") {
  return new Intl.NumberFormat("zh-HK", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function formatDateTime(value: string | null) {
  if (!value) return "未有紀錄";

  return new Intl.DateTimeFormat("zh-HK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  }).format(new Date(value));
}

export function formatAppointment(
  lead: Pick<LeadRow, "appointment_date" | "appointment_time" | "booking">
) {
  const appointmentDate = lead.booking?.appointment_date || lead.appointment_date;
  const appointmentTime = lead.booking?.appointment_time || lead.appointment_time;
  if (!appointmentDate && !appointmentTime) return "未選擇";
  return [appointmentDate, appointmentTime].filter(Boolean).join(" ");
}

function hkDateToUtcIso(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day) - 8 * 60 * 60 * 1000).toISOString();
}

export function getDateRange(range: DateRangeKey) {
  const now = new Date();
  const hkNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const year = hkNow.getUTCFullYear();
  const month = hkNow.getUTCMonth();
  const day = hkNow.getUTCDate();

  if (range === "today") {
    return {
      key: range,
      label: "今日",
      start: hkDateToUtcIso(year, month, day),
      end: hkDateToUtcIso(year, month, day + 1),
    };
  }

  if (range === "yesterday") {
    return {
      key: range,
      label: "昨日",
      start: hkDateToUtcIso(year, month, day - 1),
      end: hkDateToUtcIso(year, month, day),
    };
  }

  if (range === "month") {
    return {
      key: range,
      label: "本月",
      start: hkDateToUtcIso(year, month, 1),
      end: hkDateToUtcIso(year, month + 1, 1),
    };
  }

  return {
    key: range,
    label: range === "custom" ? "自訂日期（暫用近7日）" : "近7日",
    start: hkDateToUtcIso(year, month, day - 6),
    end: hkDateToUtcIso(year, month, day + 1),
  };
}

export function parseRange(value: string | string[] | undefined): DateRangeKey {
  const raw = Array.isArray(value) ? value[0] : value;
  return dateRangeOptions.some((item) => item.key === raw)
    ? (raw as DateRangeKey)
    : "last7";
}

export function sourceLabel(lead: LeadRow) {
  const snapshot = lead.sourceSnapshot;
  const source = snapshot?.utm_source?.trim();
  const medium = snapshot?.utm_medium?.trim();

  if (source) return `${source} / ${medium || "-"}`;

  if (lead.source_type === "whatsapp_ctwa") return "WhatsApp CTWA";
  if (lead.source_type === "organic_unknown") return "直接 / 無追蹤";
  if (lead.source_type === "manual") return "人手建立";
  if (lead.source_type === "imported") return "匯入資料";

  return "直接 / 無追蹤";
}

export function campaignLabel(lead: LeadRow) {
  return lead.sourceSnapshot?.utm_campaign || "未標記廣告系列";
}

export function contentLabel(lead: LeadRow) {
  return lead.sourceSnapshot?.utm_content || "未標記素材";
}

export function businessStatus(lead: LeadRow) {
  const bookingStatus = lead.booking?.booking_status || lead.booking_status;
  if (lead.payment_status === "paid") return "已付款";
  if (lead.lead_status === "lost") return "已流失";
  if (bookingStatus === "confirmed") return "預約已確認";
  if (lead.payment_status === "pending") return "等待付款";
  if (lead.payment_status === "booking_only") return "只預約未付款";
  if (lead.lead_status === "submitted") return "已登記";
  return lead.lead_status || "未標記狀態";
}

export function displayCustomerName(lead: LeadRow) {
  return lead.customer_name || lead.contact?.customer_name || "未填寫";
}

export function displayPhone(lead: LeadRow) {
  return lead.phone || lead.contact?.phone || lead.normalized_phone || "未填寫";
}

const testNamePatterns = [
  "TEST",
  "CODEX",
  "FINAL TEST",
  "COOKIE TEST",
  "SERVER ATTR TEST",
  "LOCKED ATTR TEST",
  "INLINE BOOTSTRAP TEST",
  "LH BACKUP TEST",
  "LH MIXED TEST",
  "ALYSSA WIX TEST",
  "DIRECT TEST",
  "UTM TEST",
];

export function isLikelyTestLead(lead: LeadRow) {
  const name = displayCustomerName(lead).toUpperCase();
  const brandName = (lead.brand?.name || "").toUpperCase();
  const phoneDigits = displayPhone(lead).replace(/\D/g, "");
  const hasTestName = testNamePatterns.some((pattern) => name.includes(pattern));
  const hasTestBrand =
    brandName.includes("CODEX USED BRAND 50969") ||
    brandName.includes("TEST BRAND");
  const hasTestPhone =
    /^912345(6[7-9]|[7-8]\d|9\d)$/.test(phoneDigits) ||
    phoneDigits === "91234599";

  return hasTestName || hasTestBrand || hasTestPhone;
}

export function intakeStatus(lead: LeadRow) {
  if (lead.lead_status === "duplicate") return "重複登記";
  if (lead.lead_status === "invalid") return "無效登記";
  if (lead.lead_status === "submitted") return "已收到";
  return lead.lead_status || "已收到";
}

export function isBooking(lead: LeadRow) {
  const bookingStatus = lead.booking?.booking_status || lead.booking_status;
  return ["requested", "confirmed", "rescheduled", "show", "no_show"].includes(
    bookingStatus ?? ""
  );
}

export function isTrackable(lead: LeadRow) {
  const trackingStatus = lead.sourceSnapshot?.tracking_status;
  return (
    lead.source_type !== "organic_unknown" &&
    trackingStatus !== "organic_unknown" &&
    trackingStatus !== "missing"
  );
}

export function countBy<T extends Record<string, unknown>>(rows: T[], key: keyof T) {
  const counts = new Map<string, number>();

  rows.forEach((row) => {
    const value = typeof row[key] === "string" && row[key] ? row[key] : "未標記";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });

  return Array.from(counts, ([label, count]) => ({ label, count })).sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label)
  );
}

function addPerformance(
  rows: Map<string, PerformanceRow>,
  key: string,
  label: string,
  lead: LeadRow,
  meta: string[] = []
) {
  const current =
    rows.get(key) ??
    ({
      key,
      label,
      leads: 0,
      bookings: 0,
      paid: 0,
      amount: 0,
      meta,
    } satisfies PerformanceRow);

  current.leads += 1;
  current.bookings += isBooking(lead) ? 1 : 0;
  current.paid += lead.payment_status === "paid" ? 1 : 0;
  current.amount += asNumber(lead.price);
  rows.set(key, current);
}

export function buildPerformance(leads: LeadRow[]) {
  const brands = new Map<string, PerformanceRow>();
  const sources = new Map<string, PerformanceRow>();
  const treatments = new Map<string, PerformanceRow>();
  const branches = new Map<string, PerformanceRow>();

  leads.forEach((lead) => {
    const brand = lead.brand?.name || "未標記品牌";
    const treatment = lead.treatment?.name || "未標記療程";
    const packageName = lead.package?.name || "未標記套餐";
    const branch = lead.branch?.name || "未標記分店";
    const source = sourceLabel(lead);
    const campaign = campaignLabel(lead);
    const content = contentLabel(lead);

    addPerformance(brands, brand, brand, lead);
    addPerformance(
      sources,
      [source, campaign, content].join("|"),
      source,
      lead,
      [campaign, content]
    );
    addPerformance(
      treatments,
      [treatment, packageName].join("|"),
      treatment,
      lead,
      [packageName, money(asNumber(lead.price), lead.currency || "HKD")]
    );
    addPerformance(branches, branch, branch, lead);
  });

  return {
    brandPerformance: Array.from(brands.values()).sort((a, b) => b.leads - a.leads),
    sourcePerformance: Array.from(sources.values()).sort((a, b) => b.leads - a.leads),
    treatmentPerformance: Array.from(treatments.values()).sort(
      (a, b) => b.leads - a.leads
    ),
    branchPerformance: Array.from(branches.values())
      .map((row) => ({
        ...row,
        share: leads.length > 0 ? row.leads / leads.length : 0,
      }))
      .sort((a, b) => b.leads - a.leads),
  };
}

export async function countRows(table: string) {
  const supabase = createSupabaseAdminClient();
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) throw error;
  return count ?? 0;
}

function ids(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

async function fetchByIds<T extends { id: string }>(
  table: string,
  columns: string,
  idsToFetch: string[]
) {
  if (idsToFetch.length === 0) return new Map<string, T>();

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .in("id", idsToFetch);

  if (error) {
    console.warn("business_metrics_lookup_failed", {
      table,
      code: error.code,
      message: error.message,
    });
    return new Map<string, T>();
  }
  const rows = (data ?? []) as unknown as T[];
  return new Map(rows.map((item) => [item.id, item]));
}

async function fetchBookingsByLeadIds(leadIds: string[]) {
  if (leadIds.length === 0) return new Map<string, BookingRecord>();

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("id,lead_id,appointment_date,appointment_time,booking_status,created_at")
    .in("lead_id", leadIds)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("business_metrics_bookings_lookup_failed", {
      code: error.code,
      message: error.message,
    });
    return new Map<string, BookingRecord>();
  }

  const bookings = new Map<string, BookingRecord>();
  (data ?? []).forEach((booking) => {
    if (!bookings.has(booking.lead_id)) {
      bookings.set(booking.lead_id, booking as BookingRecord);
    }
  });
  return bookings;
}

export async function getLeadRows(
  rangeKey: DateRangeKey,
  limit = 5000,
  options: LeadRowsOptions = {}
): Promise<LeadRowsResult> {
  const range = getDateRange(rangeKey);

  if (!hasSupabaseAdminEnv()) {
    return { range, leads: [], error: null };
  }

  try {
    const supabase = createSupabaseAdminClient();
    let query = supabase
      .from("leads")
      .select(
        [
          "id",
          "created_at",
          "submitted_at",
          "contact_id",
          "form_id",
          "source_snapshot_id",
          "customer_name",
          "phone",
          "normalized_phone",
          "appointment_date",
          "appointment_time",
          "price",
          "currency",
          "source_type",
          "payment_status",
          "lead_status",
          "booking_status",
          "brand_id",
          "treatment_id",
          "package_id",
          "branch_id",
        ].join(",")
      )
      .gte("created_at", range.start)
      .lt("created_at", range.end);

    if (options.brandId) query = query.eq("brand_id", options.brandId);
    if (options.treatmentId) query = query.eq("treatment_id", options.treatmentId);
    if (options.branchId) query = query.eq("branch_id", options.branchId);

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    const leadRecords = (data ?? []) as unknown as LeadRecord[];
    const [
      contacts,
      forms,
      brands,
      treatments,
      packages,
      branches,
      snapshotsById,
      bookingsByLeadId,
    ] = await Promise.all([
      fetchByIds<ContactRecord>(
        "contacts",
        "id,customer_name,phone,normalized_phone,email",
        ids(leadRecords.map((lead) => lead.contact_id))
      ),
      fetchByIds<FormRecord>(
        "forms",
        "id,form_name,public_form_token",
        ids(leadRecords.map((lead) => lead.form_id))
      ),
      fetchByIds<NameRecord>("brands", "id,name", ids(leadRecords.map((lead) => lead.brand_id))),
      fetchByIds<NameRecord>(
        "treatments",
        "id,name",
        ids(leadRecords.map((lead) => lead.treatment_id))
      ),
      fetchByIds<PackageRecord>(
        "packages",
        "id,name,promo_price,currency",
        ids(leadRecords.map((lead) => lead.package_id))
      ),
      fetchByIds<NameRecord>(
        "branches",
        "id,name",
        ids(leadRecords.map((lead) => lead.branch_id))
      ),
      fetchByIds<SourceSnapshotRecord>(
        "lead_source_snapshots",
        [
          "id",
          "lead_id",
          "source_type",
          "utm_source",
          "utm_medium",
          "utm_campaign",
          "utm_content",
          "landing_page_url",
          "current_page_url",
          "page_path",
          "ctwa_id",
          "whatsapp_phone_number_id",
          "meta_ad_id",
          "meta_adset_id",
          "meta_campaign_id",
          "meta_source_url",
          "whatsapp_referral_headline",
          "whatsapp_referral_body",
          "whatsapp_referral_source_id",
          "tracking_status",
          "audit_reason",
        ].join(","),
        ids(leadRecords.map((lead) => lead.source_snapshot_id))
      ),
      fetchBookingsByLeadIds(leadRecords.map((lead) => lead.id)),
    ]);

    const leads = leadRecords.map((lead) => {
      const sourceSnapshot =
        (lead.source_snapshot_id && snapshotsById.get(lead.source_snapshot_id)) || null;

      return {
        ...lead,
        contact: (lead.contact_id && contacts.get(lead.contact_id)) || null,
        form: (lead.form_id && forms.get(lead.form_id)) || null,
        sourceSnapshot,
        booking: bookingsByLeadId.get(lead.id) || null,
        brand: (lead.brand_id && brands.get(lead.brand_id)) || null,
        treatment: (lead.treatment_id && treatments.get(lead.treatment_id)) || null,
        package: (lead.package_id && packages.get(lead.package_id)) || null,
        branch: (lead.branch_id && branches.get(lead.branch_id)) || null,
      };
    });

    const search = options.query?.trim().toLowerCase() || "";
    const sourceFilter = options.source?.trim().toLowerCase() || "";
    const campaignFilter = options.campaign?.trim().toLowerCase() || "";
    const filteredLeads = leads.filter((lead) => {
      if (!options.includeTestData && isLikelyTestLead(lead)) return false;

      if (sourceFilter) {
        const source = sourceLabel(lead).toLowerCase();
        const sourceType = (lead.source_type || "").toLowerCase();
        if (!source.includes(sourceFilter) && sourceType !== sourceFilter) {
          return false;
        }
      }

      if (campaignFilter) {
        const campaign = campaignLabel(lead).toLowerCase();
        const content = contentLabel(lead).toLowerCase();
        if (!campaign.includes(campaignFilter) && !content.includes(campaignFilter)) {
          return false;
        }
      }

      if (search) {
        const haystack = [
          displayCustomerName(lead),
          displayPhone(lead),
          lead.normalized_phone || "",
          lead.form?.form_name || "",
          lead.form?.public_form_token || "",
          campaignLabel(lead),
          contentLabel(lead),
        ]
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(search)) return false;
      }

      return true;
    });

    return { range, leads: filteredLeads, error: null };
  } catch (error) {
    console.error("business_metrics_query_failed", error);
    return {
      range,
      leads: [],
      error: error instanceof Error ? error : new Error("query_failed"),
    };
  }
}
