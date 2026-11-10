import { z } from "zod";
import type { DemoState, Contact } from "@/components/crm/conversations/model";
const id = z.string().min(1).max(100),
  brand = z.enum(["nova-studio", "nova-care"]);
export const templateSchema = z.object({
  id,
  brandId: brand,
  name: z.string().min(1).max(80),
  body: z.string().min(1).max(2000),
  purpose: z.enum(["marketing", "utility"]),
  approved: z.boolean(),
  revision: z.number().int().positive(),
});
export const profileSchema = z.object({
  contactId: id,
  brandId: brand,
  customerType: z.enum(["new", "existing"]),
  consent: z.enum(["granted", "unknown", "withdrawn"]),
  consentSource: z.string().max(120),
  consentAt: z.number().nullable(),
  suppressed: z.boolean(),
});
export const campaignSchema = z.object({
  id,
  brandId: brand,
  name: z.string().min(1).max(100),
  templateId: id,
  templateRevision: z.number().int().positive(),
  templateBody: z.string().max(2000),
  segment: z.enum(["all", "new", "existing"]),
  tag: z.string().max(30),
  fields: z.object({
    service: z.string().max(100),
    fee: z.string().max(100),
    branch: z.string().max(100),
    date: z.string().max(30),
    time: z.string().max(30),
  }),
  status: z.enum(["draft", "paused", "completed"]),
  createdAt: z.number(),
  launchedAt: z.number().nullable(),
});
export const recipientSchema = z.object({
  id,
  campaignId: id,
  contactId: id,
  conversationId: id,
  sentAt: z.number(),
  body: z.string(),
  bookingId: id.nullable(),
});
export const receiptKinds = [
  "sent",
  "delivered",
  "read",
  "replied",
  "failed",
  "optout",
  "booked",
  "cancelled",
  "arrived",
  "missed",
] as const;
export const eventSchema = z.object({
  id,
  campaignId: id,
  recipientId: id,
  kind: z.enum(receiptKinds),
  at: z.number(),
  source: z.literal("demo"),
  detail: z.string().max(300),
});
export const broadcastsSchema = z.object({
  templates: z.array(templateSchema).max(30),
  profiles: z.array(profileSchema).max(100),
  campaigns: z.array(campaignSchema).max(30),
  recipients: z.array(recipientSchema).max(300),
  events: z.array(eventSchema).max(2400),
  activeRecipientId: id.nullable(),
});
export type Campaign = z.infer<typeof campaignSchema>;
export type Broadcasts = z.infer<typeof broadcastsSchema>;
export type CampaignProfile = z.infer<typeof profileSchema>;
export type Recipient = z.infer<typeof recipientSchema>;
export type ReceiptKind = z.infer<typeof eventSchema>["kind"];
export function seedBroadcasts(inbox: DemoState, now: number): Broadcasts {
  return {
    templates: [
      {
        id: "studio-care",
        brandId: "nova-studio",
        name: "服務介紹 · 示範核准",
        purpose: "marketing",
        body: "你好 {{name}}，Nova Studio 嘅 {{service}} 示範收費為 {{fee}}。如果想了解詳情或預約意向，可以直接回覆我哋。回覆 STOP 可停止接收示範推廣。",
        approved: true,
        revision: 1,
      },
      {
        id: "studio-visit",
        brandId: "nova-studio",
        name: "到店提醒 · 示範核准",
        purpose: "utility",
        body: "你好 {{name}}，提醒你已核實嘅 {{service}} 安排：{{date}} {{time}}，地點 {{branch}}。如需改期，請回覆我哋。",
        approved: true,
        revision: 1,
      },
      {
        id: "care-intro",
        brandId: "nova-care",
        name: "肩頸服務介紹 · 示範核准",
        purpose: "marketing",
        body: "你好 {{name}}，Nova Care {{service}} 示範收費 {{fee}}，想了解可以回覆我哋。回覆 STOP 可停止接收示範推廣。",
        approved: true,
        revision: 1,
      },
    ],
    profiles: inbox.conversations.map((c, i) => ({
      contactId: c.contactId,
      brandId: c.brandId as CampaignProfile["brandId"],
      customerType: i % 3 === 0 ? "existing" : "new",
      consent: i === 3 ? "withdrawn" : i === 5 ? "unknown" : "granted",
      consentAt: i === 5 ? null : now - 86400000,
      consentSource: i === 5 ? "" : "虛構示範同意記錄",
      suppressed: i === 3,
    })),
    campaigns: [],
    recipients: [],
    events: [],
    activeRecipientId: null,
  };
}
export function fillCampaign(c: Campaign, contact: Contact) {
  const v: Record<string, string> = { name: contact.name, ...c.fields };
  return c.templateBody.replace(/\{\{(\w+)\}\}/g, (token, key: string) =>
    Object.hasOwn(v, key) && v[key].trim() ? v[key] : token,
  );
}
export function audience(
  inbox: DemoState,
  b: Broadcasts,
  c: Campaign,
  now: number,
) {
  return inbox.conversations
    .filter((cv) => cv.brandId === c.brandId)
    .map((cv) => {
      const contact = inbox.contacts.find((p) => p.id === cv.contactId)!,
        profile = b.profiles.find(
          (p) => p.contactId === contact.id && p.brandId === c.brandId,
        );
      const reasons: string[] = [];
      if (c.segment !== "all" && profile?.customerType !== c.segment)
        reasons.push("不符合客戶分組");
      if (c.tag && !contact.tags.includes(c.tag)) reasons.push("不符合標籤");
      if (cv.channel !== "whatsapp") reasons.push("不是 WhatsApp 對話");
      if (profile?.suppressed) reasons.push("已加入停止聯絡名單");
      if (
        profile?.consent !== "granted" ||
        !profile.consentAt ||
        !profile.consentSource
      )
        reasons.push("未有有效示範同意");
      const t = b.templates.find(
        (t) => t.id === c.templateId && t.brandId === c.brandId,
      );
      if (
        !t?.approved ||
        t.revision !== c.templateRevision ||
        t.body !== c.templateBody
      )
        reasons.push("範本未核准或版本已改");
      const booking = inbox.bookings.find(
        (b) =>
          b.contactId === contact.id &&
          b.conversationId === cv.id &&
          b.status === "confirmed",
      );
      if (t?.purpose === "utility" && !booking)
        reasons.push("預約尚未由同事核實");
      if (
        b.recipients.some(
          (r) => r.campaignId === c.id && r.contactId === contact.id,
        )
      )
        reasons.push("本次推播已處理");
      if (
        b.recipients.some(
          (r) =>
            r.contactId === contact.id &&
            r.campaignId !== c.id &&
            r.sentAt > now - 86400000 &&
            b.campaigns.find((k) => k.id === r.campaignId)?.brandId ===
              c.brandId,
        )
      )
        reasons.push("24 小時內已收到示範推播");
      const body = fillCampaign(
        t?.purpose === "utility" && booking
          ? {
              ...c,
              fields: {
                ...c.fields,
                service: booking.service,
                branch: booking.branch,
                date: booking.date,
                time: booking.time,
              },
            }
          : c,
        contact,
      );
      if (/\{\{[^}]+\}\}/.test(body)) reasons.push("範本參數未填妥");
      return { contact, conversation: cv, profile, body, reasons };
    });
}
export function recipientEvents(b: Broadcasts, r: Recipient) {
  return b.events
    .filter((e) => e.recipientId === r.id)
    .sort((a, z) => a.at - z.at);
}
export function recipientStatus(b: Broadcasts, r: Recipient): ReceiptKind {
  return recipientEvents(b, r).at(-1)?.kind ?? "sent";
}
export function metrics(b: Broadcasts, campaignId: string) {
  const rows = b.recipients.filter((r) => r.campaignId === campaignId),
    has = (r: Recipient, k: ReceiptKind) =>
      b.events.some((e) => e.recipientId === r.id && e.kind === k),
    latest = (r: Recipient) =>
      b.events
        .filter(
          (e) =>
            e.recipientId === r.id &&
            ["booked", "cancelled", "arrived", "missed"].includes(e.kind),
        )
        .sort((a, z) => a.at - z.at)
        .at(-1)?.kind;
  const m = {
    sent: rows.length,
    delivered: rows.filter(
      (r) => has(r, "delivered") || has(r, "read") || has(r, "replied"),
    ).length,
    read: rows.filter((r) => has(r, "read")).length,
    replied: rows.filter((r) => has(r, "replied")).length,
    failed: rows.filter((r) => has(r, "failed")).length,
    optout: rows.filter((r) => has(r, "optout")).length,
    booked: rows.filter((r) =>
      ["booked", "arrived", "missed"].includes(latest(r) ?? ""),
    ).length,
    arrived: rows.filter((r) => latest(r) === "arrived").length,
  };
  return {
    ...m,
    replyRate: m.sent ? m.replied / m.sent : null,
    bookRate: m.replied ? m.booked / m.replied : null,
  };
}
export const statusLabels: Record<ReceiptKind, string> = {
  sent: "已模擬發送",
  delivered: "示範送達",
  read: "示範已讀",
  replied: "客戶已回覆",
  failed: "示範失敗",
  optout: "已退訂",
  booked: "同事已核實預約",
  cancelled: "預約已取消",
  arrived: "人手記錄到店",
  missed: "人手記錄未到店",
};
