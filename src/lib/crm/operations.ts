import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js/min";
import type { CrmLeadCase } from "./leadOps";

export const caseStatuses = [
  "new",
  "contacting",
  "booked",
  "confirmed",
  "showed",
  "paid",
  "no_show",
  "lost",
  "invalid",
] as const;
export const sourceTypes = [
  "landing_form",
  "whatsapp_ad",
  "whatsapp_direct",
  "manual",
  "import",
  "unknown",
] as const;
export const queueKeys = [
  "all",
  "unassigned",
  "follow_up_due",
  "no_follow_up",
  "no_show",
] as const;
export const statusNames: Record<(typeof caseStatuses)[number], string> = {
  new: "新查詢",
  contacting: "跟進中",
  booked: "待確認預約",
  confirmed: "已確認預約",
  showed: "已到店",
  paid: "已付款",
  no_show: "未到店",
  lost: "已流失",
  invalid: "無效",
};
export const sourceNames: Record<(typeof sourceTypes)[number], string> = {
  landing_form: "登記表格",
  whatsapp_ad: "WhatsApp 廣告",
  whatsapp_direct: "WhatsApp 直接查詢",
  manual: "手動建立",
  import: "匯入",
  unknown: "來源未明",
};
export const inboxFilterSchema = z.object({
  query: z.string().trim().max(200).catch(""),
  status: z.enum(["all", ...caseStatuses]).catch("all"),
  source: z.enum(["all", ...sourceTypes]).catch("all"),
  brand: z.string().max(160).catch("all"),
  owner: z.string().max(160).catch("all"),
  queue: z.enum(queueKeys).catch("all"),
});
export type InboxFilter = z.infer<typeof inboxFilterSchema>;
export const defaultInboxFilter: InboxFilter = {
  query: "",
  status: "all",
  source: "all",
  brand: "all",
  owner: "all",
  queue: "all",
};
export const isOpenCase = (item: CrmLeadCase) =>
  !["paid", "showed", "lost", "invalid"].includes(item.status);
export const isUnassigned = (item: CrmLeadCase) => !item.assignedTo;
export function isFollowUpDue(item: CrmLeadCase, now: number) {
  const due = item.nextFollowUpAt ? Date.parse(item.nextFollowUpAt) : NaN;
  return isOpenCase(item) && Number.isFinite(due) && due <= now;
}
export function inQueue(
  item: CrmLeadCase,
  queue: InboxFilter["queue"],
  now: number,
) {
  switch (queue) {
    case "unassigned":
      return isOpenCase(item) && isUnassigned(item);
    case "follow_up_due":
      return isFollowUpDue(item, now);
    case "no_follow_up":
      return isOpenCase(item) && !item.nextFollowUpAt;
    case "no_show":
      return item.status === "no_show";
    default:
      return true;
  }
}
export function filterCases(
  cases: readonly CrmLeadCase[],
  raw: unknown,
  now: number,
) {
  const filter = inboxFilterSchema.parse(raw);
  const query = filter.query.toLocaleLowerCase();
  const phoneQuery = query.replace(/[+\s()-]/g, "");
  return cases
    .filter((item) => {
      if (filter.brand !== "all" && item.brandSlug !== filter.brand)
        return false;
      if (filter.status !== "all" && item.status !== filter.status)
        return false;
      if (filter.source !== "all" && item.crmSourceType !== filter.source)
        return false;
      if (
        filter.owner !== "all" &&
        (filter.owner === "unassigned"
          ? !isUnassigned(item)
          : item.assignedTo !== filter.owner)
      )
        return false;
      if (!inQueue(item, filter.queue, now)) return false;
      if (!query) return true;
      const text = [
        item.customerName,
        item.phone,
        item.brandName,
        item.treatmentOffer,
        item.campaignLabel,
        item.adLabel,
        item.ctwa.ctwa_source_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      return (
        text.includes(query) ||
        (/^\d+$/.test(phoneQuery) &&
          item.normalizedPhone.replace(/\D/g, "").includes(phoneQuery))
      );
    })
    .toSorted((a, b) => {
      const dueOrder =
        Number(isFollowUpDue(b, now)) - Number(isFollowUpDue(a, now));
      const aTime = Date.parse(a.lastActivityAt) || 0;
      const bTime = Date.parse(b.lastActivityAt) || 0;
      return dueOrder || bTime - aTime || a.id.localeCompare(b.id);
    });
}

// Domain contract for a future tenant-aware provider adapter. No network or database writes.
export type RecipientEvidence = {
  id: string;
  clientId: string | null;
  brandId: string;
  phone: string;
  consent: "granted" | "revoked" | "unknown";
  consentEvidenceId: string | null;
  suppressed: boolean;
  lastMarketingAt: string | null;
};
export type BroadcastContext = {
  clientId: string | null;
  brandId: string;
  connected: boolean;
  template: { status: "approved" | "unknown"; verifiedAt: string | null };
  frequencyHours: number;
  templateMaxAgeHours: number;
  now: number;
};
export const exclusionNames = {
  scope_unverified: "客戶／品牌權限未驗證",
  outside_scope: "不屬於所選客戶／品牌",
  invalid_phone: "號碼需要完整國際格式",
  suppressed: "已退訂或列入排除名單",
  consent_missing: "未有有效行銷同意紀錄",
  channel_unavailable: "WhatsApp 渠道未接通",
  template_unverified: "訊息範本未驗證",
  frequency_cap: "仍在聯絡冷卻期",
} as const;
export type ExclusionReason = keyof typeof exclusionNames;
export function internationalPhone(phone: string) {
  if (!/^[+\d\s()-]+$/.test(phone)) return null;
  const digits = phone.replace(/\D/g, "");
  // Do not infer a country code from a local eight-digit number.
  if (!/^[1-9]\d{8,14}$/.test(digits)) return null;
  const parsed = parsePhoneNumberFromString(`+${digits}`);
  return parsed?.isValid() ? parsed.number.slice(1) : null;
}
export function recipientExclusions(
  recipient: RecipientEvidence,
  context: BroadcastContext,
): ExclusionReason[] {
  const reasons: ExclusionReason[] = [];
  if (
    !recipient.clientId ||
    !context.clientId ||
    !recipient.brandId ||
    !context.brandId
  )
    reasons.push("scope_unverified");
  else if (
    recipient.clientId !== context.clientId ||
    recipient.brandId !== context.brandId
  )
    reasons.push("outside_scope");
  if (!internationalPhone(recipient.phone)) reasons.push("invalid_phone");
  if (recipient.suppressed || recipient.consent === "revoked")
    reasons.push("suppressed");
  else if (recipient.consent !== "granted" || !recipient.consentEvidenceId)
    reasons.push("consent_missing");
  if (!context.connected) reasons.push("channel_unavailable");
  const verified = context.template.verifiedAt
    ? Date.parse(context.template.verifiedAt)
    : NaN;
  const age = context.now - verified;
  if (
    context.template.status !== "approved" ||
    !Number.isFinite(age) ||
    age < 0 ||
    !Number.isFinite(context.templateMaxAgeHours) ||
    context.templateMaxAgeHours <= 0 ||
    age > context.templateMaxAgeHours * 3_600_000
  )
    reasons.push("template_unverified");
  const lastSent = recipient.lastMarketingAt
    ? Date.parse(recipient.lastMarketingAt)
    : NaN;
  if (
    !Number.isFinite(context.now) ||
    !Number.isFinite(context.frequencyHours) ||
    context.frequencyHours < 0 ||
    (recipient.lastMarketingAt &&
      (!Number.isFinite(lastSent) ||
        context.now - lastSent < context.frequencyHours * 3_600_000))
  )
    reasons.push("frequency_cap");
  return reasons;
}
export function previewBroadcast(
  recipients: readonly RecipientEvidence[],
  context: BroadcastContext,
) {
  const groups = new Map<string, RecipientEvidence[]>();
  for (const recipient of recipients) {
    const phone = internationalPhone(recipient.phone);
    const key = JSON.stringify([
      recipient.clientId,
      recipient.brandId,
      phone ?? ["unresolved", recipient.id],
    ]);
    groups.set(key, [...(groups.get(key) ?? []), recipient]);
  }
  const decisions = [...groups.values()].map((group) => ({
    recipientId: group[0].id,
    sourceIds: group.map((row) => row.id).toSorted(),
    // A duplicate row can never erase an opt-out or missing authorization.
    reasons: [
      ...new Set(group.flatMap((row) => recipientExclusions(row, context))),
    ],
  }));
  return {
    mode: "dry_run" as const,
    totalRows: recipients.length,
    uniqueRecipients: decisions.length,
    duplicates: recipients.length - decisions.length,
    eligible: decisions.filter((row) => row.reasons.length === 0).length,
    decisions,
  };
}

export const automationRuleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  status: z.enum(["all", ...caseStatuses]),
  source: z.enum(["all", ...sourceTypes]),
  queue: z.enum(queueKeys),
  treatmentContains: z.string().trim().max(100),
  followUpHours: z.coerce.number().int().min(1).max(720),
});
export type AutomationRule = z.infer<typeof automationRuleSchema>;
export function simulateAutomation(
  cases: readonly CrmLeadCase[],
  raw: unknown,
  brand: string,
  now: number,
) {
  const rule = automationRuleSchema.parse(raw);
  if (!Number.isFinite(now) || !brand || brand === "all")
    throw new Error("Select a single brand and a valid simulation time.");
  const matches = filterCases(
    cases,
    {
      ...defaultInboxFilter,
      brand,
      source: rule.source,
      status: rule.status,
      queue: rule.queue,
    },
    now,
  ).filter(
    (item) =>
      !rule.treatmentContains ||
      item.treatmentOffer
        .toLocaleLowerCase()
        .includes(rule.treatmentContains.toLocaleLowerCase()),
  );
  return {
    mode: "simulation" as const,
    rule,
    proposals: matches.map((item) => ({
      leadId: item.id,
      customerName: item.customerName,
      brandSlug: item.brandSlug,
      proposedFollowUpAt: new Date(
        now + rule.followUpHours * 3_600_000,
      ).toISOString(),
      existingFollowUpAt: item.nextFollowUpAt,
      action: "suggest_follow_up" as const,
    })),
  };
}

export const quickReplies = [
  {
    id: "welcome",
    title: "了解需要",
    category: "初次查詢",
    body: "{{customer_name}}，你好！多謝你查詢{{treatment}}。想了解你希望改善嘅情況，同埋方便到店嘅日子，我哋可以幫你安排。",
  },
  {
    id: "availability",
    title: "詢問時間",
    category: "預約跟進",
    body: "{{customer_name}}，想跟進你嘅{{treatment}}查詢。請問你平日定週末比較方便？收到你嘅意向後，我哋會再確認實際可預約時段。",
  },
  {
    id: "return",
    title: "重新安排",
    category: "未到店跟進",
    body: "{{customer_name}}，你好，想了解你係咪需要重新安排到店時間？你可以話我哋知方便嘅日子，我哋會再協助確認。",
  },
] as const;
export function renderReply(
  body: string,
  variables: Record<string, string | null | undefined>,
) {
  const missing = new Set<string>();
  const result = body.replace(/{{\s*([^{}]+?)\s*}}/g, (token, key: string) => {
    const value = Object.hasOwn(variables, key) ? variables[key]?.trim() : null;
    if (!value || ["未有資料", "未設定"].includes(value)) {
      missing.add(key);
      return token;
    }
    return value;
  });
  return { body: result, missing: [...missing], complete: missing.size === 0 };
}
