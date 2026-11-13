import { z } from "zod";
import { threadOperationsSchema } from "@/lib/meta/operations";
export const providerSchema = z.enum(["meta", "whatsapp"]);
export const channelSchema = z.enum(["messenger", "instagram", "whatsapp"]);
const id = z.string().min(1).max(100),
  rev = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const inquirySchema = threadOperationsSchema.extend({
  key: z.string(),
  provider: providerSchema,
  id: z.uuid(),
  channel: channelSchema,
  brand_id: id,
  revision: rev,
  customer_id: id,
  link_revision: rev,
  name: z.string(),
  updated_at: z.string(),
  unread_count: rev,
  preview: z.string(),
  last_inbound_at: z.number().nullable(),
  assignee_active: z.boolean(),
});
export type Inquiry = z.infer<typeof inquirySchema>;
export const inboxQuery = z.object({
  queue: z
    .enum([
      "all",
      "mine",
      "unassigned",
      "overdue",
      "priority",
      "unread",
      "resolved",
    ])
    .default("all"),
  channel: z.enum(["all", "messenger", "instagram", "whatsapp"]).default("all"),
  search: z.string().trim().max(100).default(""),
  cursor: z.string().max(700).optional(),
});
const base = {
  provider: providerSchema,
  threadId: z.uuid(),
  commandId: z.uuid(),
};
const text = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine((v) => v.isWellFormed());
export const actionSchema = z.discriminatedUnion("action", [
  z
    .object({
      ...base,
      action: z.literal("manage"),
      revision: rev,
      data: threadOperationsSchema,
    })
    .strict(),
  z
    .object({ ...base, action: z.literal("auto-assign"), revision: rev })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("send"),
      revision: rev,
      body: text,
      replyTo: z.uuid().optional(),
    })
    .strict(),
  z
    .object({ ...base, action: z.literal("note"), revision: rev, body: text })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("read"),
      revision: rev,
      messageId: z.uuid(),
      through: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("relink"),
      customerId: id,
      revision: rev,
      reason: z.string().trim().min(3).max(300),
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("booking-create"),
      requestId: z.uuid(),
      customerId: id,
      linkRevision: rev,
      service: z.string().trim().min(1).max(100),
      desiredAt: z.iso.datetime({ offset: true }),
      guests: z.number().int().min(1).max(10),
      note: z.string().max(1000),
    })
    .strict(),
  z
    .object({
      action: z.enum(["booking-confirm", "booking-cancel"]),
      commandId: z.uuid(),
      requestId: z.uuid(),
      revision: rev,
    })
    .strict(),
  z
    .object({
      action: z.literal("booking-convert"),
      commandId: z.uuid(),
      requestId: z.uuid(),
      requestRevision: rev,
      revision: rev,
      serviceId: id,
      staffId: id,
      resourceId: id.nullable(),
      startsAt: z.number().int().nonnegative(),
      confirmed: z.literal(true),
    })
    .strict(),
]);
export type InquiryAction = z.infer<typeof actionSchema>;
export type InquiryMessage = {
  id: string;
  seq: number;
  direction: "incoming" | "outgoing" | "note";
  body: string;
  state: string;
  at: number;
  author: string | null;
};
export type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  tags: string[];
  note: string;
  source: string;
  brandIds: string[];
  revision: number;
};
export type CustomerEvent = {
  seq: number;
  kind: string;
  detail: Record<string, unknown>;
  created_at: string;
};
export type BookingRequest = {
  id: string;
  customer_id: string;
  brand_id: string;
  provider: "meta" | "whatsapp";
  thread_id: string;
  service: string;
  desired_at: string;
  guests: number;
  note: string;
  status: "requested" | "confirmed" | "cancelled" | "linked";
  pos_appointment_id: string | null;
  revision: number;
  appointment?: {
    status: string;
    startsAt: number;
    serviceName: string;
  } | null;
};
export type CustomerDetail = {
  customer: Customer;
  links: { provider: string; thread_id: string; brand_id: string }[];
  events: CustomerEvent[];
  nextEvent: number | null;
  requests: BookingRequest[];
  hasMoreRequests: boolean;
};
export type InboxPage = {
  threads: Inquiry[];
  counts: Record<string, number>;
  nextCursor: string | null;
  companyName: string;
  actorId: string;
  canEdit: boolean;
  hasPos: boolean;
  members: { user_id: string; display_name: string }[];
  brands: { id: string; name: string }[];
  connections: { channel: string; label: string; state: string }[];
};
export type InquiryDetail = CustomerDetail & {
  thread: Inquiry;
  messages: InquiryMessage[];
  nextBefore: number | null;
  activity: import("@/lib/meta/operations").ThreadActivity[];
};
export type Availability = {
  revision: number;
  requestRevision: number;
  services: {
    id: string;
    name: string;
    durationMinutes: number;
    priceCents: number;
  }[];
  choices: {
    staffId: string;
    staffName: string;
    resourceId: string | null;
    resourceName: string;
    startsAt: number;
  }[];
  blocker: string | null;
};
export const channelNames = {
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram",
};
export const bookingNames: Record<string, string> = {
  requested: "預約意向",
  confirmed: "已確認",
  cancelled: "已取消",
  linked: "已交接 POS",
  pending: "待確認",
  checked_in: "已到店",
  completed: "已完成",
  no_show: "未到店",
};
