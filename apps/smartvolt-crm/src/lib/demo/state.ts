import { posSchema } from "@/lib/pos/model";
import { applyPosCommand } from "@/lib/pos/engine";
import type { PosCommand } from "@/lib/pos/model";
import { seedPos } from "@/lib/pos/seed";
import { scopeSchema } from "@/lib/saas/identity";
import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import {
  createDemoState,
  demoReducer,
  stateSchema,
  DEMO_CLIENT,
  type Action as InboxAction,
  type Booking,
  type Contact,
} from "@/components/crm/conversations/model";
import {
  createStudioState,
  studioReducer,
  studioSchema,
  type StudioAction,
} from "@/components/crm/studio/model";
import {
  audience,
  broadcastsSchema,
  campaignSchema,
  seedBroadcasts,
  type Campaign,
  type ReceiptKind,
} from "./campaigns";
export const appSchema = z
  .object({
    version: z.literal(1),
    scope: scopeSchema.optional(),
    pos: posSchema.optional(),
    inbox: stateSchema,
    studio: z.union([
      studioSchema,
      z.object({
        version: z.literal(1),
        flows: z.array(studioSchema.shape.flows.element).length(0),
        bots: z.array(studioSchema.shape.bots.element).length(0),
        versions: z.array(studioSchema.shape.versions.element).length(0),
        articles: z.array(studioSchema.shape.articles.element).length(0),
      }),
    ]),
    broadcasts: broadcastsSchema,
  })
  .superRefine((s, ctx) => {
    if (s.scope) {
      const company = s.scope.companyId;
      const brands = new Set(s.scope.brands.map((b) => b.id));
      const team = new Set(s.scope.team.map((t) => t.id));
      const entities = [
        ...s.inbox.contacts,
        ...s.inbox.conversations,
        ...s.studio.flows,
        ...s.studio.articles,
        ...s.studio.versions.map((v) => v.flow),
      ];
      const branded = [
        ...s.inbox.conversations,
        ...s.studio.flows,
        ...s.studio.articles,
        ...s.studio.bots,
        ...s.studio.versions.map((v) => v.flow),
        ...s.broadcasts.templates,
        ...s.broadcasts.campaigns,
        ...s.broadcasts.profiles,
      ];
      if (
        entities.some((row) => row.clientId !== company) ||
        branded.some((row) => !brands.has(row.brandId)) ||
        s.inbox.conversations.some((row) => row.owner && !team.has(row.owner))
      )
        ctx.addIssue({ code: "custom", message: "Invalid company scope" });
    }
    if (s.scope) {
      const team = new Set(s.scope.team.map((t) => t.id));
      if (
        [...s.studio.flows, ...s.studio.versions.map((v) => v.flow)].some((f) =>
          f.nodes.some(
            (n) => n.kind === "handoff" && !team.has(n.config.owner),
          ),
        )
      )
        ctx.addIssue({
          code: "custom",
          message: "Invalid flow assignment scope",
        });
    }
    if (s.pos) {
      const company = s.scope?.companyId ?? DEMO_CLIENT;
      const brands = new Set(
        (s.scope?.brands ?? [{ id: "nova-studio" }, { id: "nova-care" }]).map(
          (b) => b.id,
        ),
      );
      if (
        s.pos.companyId !== company ||
        [
          ...s.pos.catalog,
          ...s.pos.resources,
          ...s.pos.appointments,
          ...s.pos.orders,
          ...s.pos.entitlements,
        ].some((r) => !brands.has(r.brandId)) ||
        [...s.pos.appointments, ...s.pos.orders, ...s.pos.entitlements].some(
          (r) => !s.inbox.contacts.some((c) => c.id === r.contactId),
        )
      )
        ctx.addIssue({
          code: "custom",
          message: "Invalid POS company/customer scope",
        });
    }
    const b = s.broadcasts,
      unique = (ids: string[]) => new Set(ids).size === ids.length;
    const bad =
      !unique(b.campaigns.map((c) => c.id)) ||
      !unique(b.templates.map((t) => t.id)) ||
      !unique(b.profiles.map((p) => `${p.brandId}:${p.contactId}`)) ||
      !unique(b.events.map((e) => e.id)) ||
      !unique(b.recipients.map((r) => r.id)) ||
      b.profiles.some(
        (p) =>
          !s.inbox.conversations.some(
            (c) => c.contactId === p.contactId && c.brandId === p.brandId,
          ),
      ) ||
      b.campaigns.some(
        (c) =>
          !b.templates.some(
            (t) => t.id === c.templateId && t.brandId === c.brandId,
          ),
      ) ||
      b.recipients.some(
        (r) =>
          !b.campaigns.some(
            (c) =>
              c.id === r.campaignId &&
              s.inbox.conversations.some(
                (cv) =>
                  cv.id === r.conversationId &&
                  cv.contactId === r.contactId &&
                  cv.brandId === c.brandId,
              ),
          ) ||
          (r.bookingId &&
            !s.inbox.bookings.some(
              (k) =>
                k.id === r.bookingId && k.conversationId === r.conversationId,
            )),
      ) ||
      b.events.some(
        (e) =>
          !b.recipients.some(
            (r) => r.id === e.recipientId && r.campaignId === e.campaignId,
          ),
      ) ||
      (b.activeRecipientId !== null &&
        !b.recipients.some((r) => r.id === b.activeRecipientId));
    if (bad)
      ctx.addIssue({ code: "custom", message: "Invalid campaign lineage" });
  });
export type AppState = z.infer<typeof appSchema>;
export const APP_STORAGE = "smartvolt:preview:v1";
export function createAppState(now: number): AppState {
  const inbox = createDemoState(now);
  return {
    version: 1,
    inbox,
    studio: createStudioState(),
    pos: seedPos(
      DEMO_CLIENT,
      [
        { id: "nova-studio", name: "Nova Studio" },
        { id: "nova-care", name: "Nova Care" },
      ],
      inbox.contacts,
      inbox.conversations,
      now,
    ),
    broadcasts: seedBroadcasts(inbox, now),
  };
}
export type AppAction =
  | { type: "pos"; command: PosCommand }
  | {
      type: "customer-create";
      id: string;
      brandId: string;
      name: string;
      phone: string;
      at: number;
    }
  | { type: "inbox"; action: InboxAction }
  | { type: "studio"; action: StudioAction }
  | { type: "campaign-save"; campaign: Campaign }
  | { type: "campaign-launch"; id: string; at: number }
  | { type: "campaign-pause"; id: string }
  | { type: "receipt"; recipientId: string; kind: ReceiptKind; at: number }
  | {
      type: "customer-message";
      conversationId: string;
      body: string;
      id: string;
      at: number;
      recipientId?: string;
    }
  | {
      type: "intake";
      conversationId: string;
      service: string;
      branch: string;
      date: string;
      time: string;
      id: string;
      at: number;
      recipientId?: string;
    }
  | {
      type: "consent";
      contactId: string;
      brandId: string;
      granted: boolean;
      at: number;
    }
  | {
      type: "import";
      brandId: string;
      rows: { name: string; phone: string }[];
      at: number;
    }
  | { type: "active-recipient"; id: string | null }
  | { type: "reset"; at: number };
function validDateTime(date: string, time: string) {
  const parsed = new Date(`${date}T${time}:00+08:00`);
  return (
    Number.isFinite(+parsed) &&
    new Date(+parsed + 8 * 3600000).toISOString().slice(0, 16) ===
      `${date}T${time}`
  );
}
function event(
  s: AppState,
  recipientId: string,
  kind: ReceiptKind,
  at: number,
  detail = "",
) {
  const r = s.broadcasts.recipients.find((r) => r.id === recipientId);
  if (!r) return s;
  const lifecycle = ["booked", "cancelled", "arrived", "missed"].includes(kind);
  const id = `${r.id}:${kind}${lifecycle ? `:${at}` : ""}`;
  if (s.broadcasts.events.some((e) => e.id === id)) return s;
  return {
    ...s,
    broadcasts: {
      ...s.broadcasts,
      events: [
        ...s.broadcasts.events,
        {
          id,
          campaignId: r.campaignId,
          recipientId: r.id,
          kind,
          at,
          source: "demo" as const,
          detail,
        },
      ],
    },
  };
}
export function appReducer(
  s: AppState,
  a: AppAction,
  actor = "同事",
): AppState {
  if (a.type === "pos") {
    const next = {
      ...s,
      pos: applyPosCommand(s.pos, a.command, {
        companyId: s.scope?.companyId ?? DEMO_CLIENT,
        brandIds: (
          s.scope?.brands ?? [{ id: "nova-studio" }, { id: "nova-care" }]
        ).map((b) => b.id),
        staffIds: (
          s.scope?.team ?? [{ id: "me" }, { id: "iris" }, { id: "ken" }]
        ).map((t) => t.id),
        contacts: s.inbox.contacts,
        conversations: s.inbox.conversations,
        actor: { name: actor, role: "owner" },
        now: Date.now(),
      }),
    };
    return synchronizePosBookings(next);
  }
  if (a.type === "customer-create") {
    const phone = parsePhoneNumberFromString(a.phone, "HK");
    if (
      !phone?.isValid() ||
      !a.name.trim() ||
      s.inbox.contacts.some((c) => c.id === a.id) ||
      s.inbox.conversations.some(
        (cv) =>
          cv.brandId === a.brandId &&
          s.inbox.contacts.find((c) => c.id === cv.contactId)?.phone ===
            phone.number,
      )
    )
      return s;
    const contact: Contact = {
      id: a.id,
      clientId: s.scope?.companyId ?? DEMO_CLIENT,
      name: a.name.trim(),
      initials: a.name.slice(0, 2),
      phone: phone.number,
      email: "",
      company: "",
      tags: ["到店登記"],
      source: "POS 到店",
      createdAt: a.at,
      note: "",
    };
    return {
      ...s,
      inbox: {
        ...s.inbox,
        contacts: [...s.inbox.contacts, contact],
        conversations: [
          ...s.inbox.conversations,
          {
            id: `pos-${a.id}`,
            clientId: contact.clientId,
            brandId: a.brandId,
            contactId: a.id,
            channel: "whatsapp",
            status: "open",
            owner: null,
            priority: false,
            pinned: false,
            unread: 0,
            snoozedUntil: null,
            subject: "到店客戶跟進",
            updatedAt: a.at,
          },
        ],
      },
    };
  }
  if (a.type === "reset") return createAppState(a.at);
  if (a.type === "studio")
    return { ...s, studio: studioReducer(s.studio, a.action) };
  if (a.type === "inbox") {
    const inboxAction = a.action;
    if (
      inboxAction.type === "booking" &&
      s.pos?.appointments.some((p) => p.crmBookingId === inboxAction.booking.id)
    )
      return s;
    let n = { ...s, inbox: demoReducer(s.inbox, a.action, actor) };
    if (a.action.type === "booking") {
      const b = a.action.booking,
        r = n.broadcasts.recipients.find((r) => r.bookingId === b.id);
      const previous = s.inbox.bookings.find((k) => k.id === b.id);
      if (r && b.status === "confirmed" && previous?.status !== "confirmed")
        n = event(n, r.id, "booked", a.action.at, "由同事於預約跟進核實");
      if (r && b.status === "cancelled" && previous?.status !== "cancelled")
        n = event(n, r.id, "cancelled", a.action.at, "由同事取消預約");
    }
    return n;
  }
  if (a.type === "campaign-save") {
    const p = campaignSchema.safeParse(a.campaign),
      old = s.broadcasts.campaigns.find((c) => c.id === a.campaign.id);
    if (
      !p.success ||
      old?.launchedAt ||
      (!old && s.broadcasts.campaigns.length >= 30)
    )
      return s;
    return {
      ...s,
      broadcasts: {
        ...s.broadcasts,
        campaigns: [
          ...s.broadcasts.campaigns.filter((c) => c.id !== a.campaign.id),
          p.data,
        ],
      },
    };
  }
  if (a.type === "campaign-pause")
    return {
      ...s,
      broadcasts: {
        ...s.broadcasts,
        campaigns: s.broadcasts.campaigns.map((c) =>
          c.id === a.id ? { ...c, status: "paused" } : c,
        ),
      },
    };
  if (a.type === "campaign-launch") {
    const c = s.broadcasts.campaigns.find((c) => c.id === a.id);
    if (!c || c.status === "completed") return s;
    const eligible = audience(s.inbox, s.broadcasts, c, a.at).filter(
      (r) => !r.reasons.length,
    );
    if (!eligible.length) return s;
    let n = s;
    for (const row of eligible) {
      const id = `${c.id}:${row.contact.id}`;
      if (n.broadcasts.recipients.some((r) => r.id === id)) continue;
      n = {
        ...n,
        inbox: demoReducer(n.inbox, {
          type: "message",
          conversationId: row.conversation.id,
          message: {
            id: `${id}:message`,
            conversationId: row.conversation.id,
            kind: "outgoing",
            body: row.body,
            author: "推播 · 示範",
            at: a.at,
            replyTo: null,
          },
        }),
        broadcasts: {
          ...n.broadcasts,
          recipients: [
            ...n.broadcasts.recipients,
            {
              id,
              campaignId: c.id,
              contactId: row.contact.id,
              conversationId: row.conversation.id,
              sentAt: a.at,
              body: row.body,
              bookingId: null,
            },
          ],
        },
      };
      n = event(n, id, "sent", a.at, "只加入 Demo 收件匣，未呼叫 WhatsApp");
    }
    return {
      ...n,
      broadcasts: {
        ...n.broadcasts,
        campaigns: n.broadcasts.campaigns.map((row) =>
          row.id === a.id
            ? { ...row, status: "completed", launchedAt: a.at }
            : row,
        ),
      },
    };
  }
  if (a.type === "active-recipient")
    return { ...s, broadcasts: { ...s.broadcasts, activeRecipientId: a.id } };
  if (a.type === "receipt") {
    const r = s.broadcasts.recipients.find((r) => r.id === a.recipientId);
    if (!r) return s;
    const has = (k: ReceiptKind) =>
      s.broadcasts.events.some((e) => e.recipientId === r.id && e.kind === k);
    if (
      a.kind === "failed" &&
      (has("delivered") || has("read") || has("replied"))
    )
      return s;
    if (["delivered", "read"].includes(a.kind) && has("failed")) return s;
    if (
      ["arrived", "missed"].includes(a.kind) &&
      (!r.bookingId ||
        s.inbox.bookings.find((b) => b.id === r.bookingId)?.status !==
          "confirmed")
    )
      return s;
    if (!["delivered", "read", "failed", "arrived", "missed"].includes(a.kind))
      return s;
    let n = s;
    if (a.kind === "read") n = event(n, r.id, "delivered", a.at, "測試回執");
    return event(
      n,
      r.id,
      a.kind,
      a.at,
      ["arrived", "missed"].includes(a.kind)
        ? "同事人手示範記錄"
        : "由使用者觸發測試回執",
    );
  }
  if (a.type === "customer-message") {
    const cv = s.inbox.conversations.find((c) => c.id === a.conversationId),
      contact = s.inbox.contacts.find((c) => c.id === cv?.contactId);
    if (!cv || !contact || !a.body.trim() || a.body.length > 2000) return s;
    let n = {
      ...s,
      inbox: demoReducer(s.inbox, {
        type: "message",
        conversationId: cv.id,
        message: {
          id: a.id,
          conversationId: cv.id,
          kind: "incoming",
          body: a.body,
          author: contact.name,
          at: a.at,
          replyTo: null,
        },
      }),
    };
    const r = s.broadcasts.recipients.find(
      (r) => r.id === a.recipientId && r.conversationId === cv.id,
    );
    if (r) {
      n = event(n, r.id, "delivered", a.at);
      n = event(n, r.id, "replied", a.at, a.body.slice(0, 150));
    }
    if (/(^stop$|退訂|取消訂閱|唔好再send|唔想再收)/i.test(a.body.trim())) {
      n = {
        ...n,
        broadcasts: {
          ...n.broadcasts,
          profiles: n.broadcasts.profiles.map((p) =>
            p.contactId === contact.id && p.brandId === cv.brandId
              ? {
                  ...p,
                  consent: "withdrawn",
                  suppressed: true,
                  consentAt: a.at,
                  consentSource: "客戶在體驗對話退訂",
                }
              : p,
          ),
        },
      };
      if (r) n = event(n, r.id, "optout", a.at, "客戶主動退訂");
    }
    return n;
  }
  if (a.type === "intake") {
    const cv = s.inbox.conversations.find((c) => c.id === a.conversationId);
    if (
      !cv ||
      a.service.length > 100 ||
      a.branch.length > 100 ||
      !validDateTime(a.date, a.time) ||
      !a.service.trim() ||
      !a.branch.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(a.date) ||
      !/^\d{2}:\d{2}$/.test(a.time) ||
      s.inbox.bookings.some((b) => b.id === a.id)
    )
      return s;
    const booking: Booking = {
      id: a.id,
      conversationId: cv.id,
      contactId: cv.contactId,
      service: a.service,
      branch: a.branch,
      date: a.date,
      time: a.time,
      guests: 1,
      customerConfirmed: true,
      status: "pending",
    };
    const r = s.broadcasts.recipients.find(
      (r) =>
        r.id === a.recipientId &&
        r.conversationId === cv.id &&
        s.broadcasts.events.some(
          (e) => e.recipientId === r.id && e.kind === "replied",
        ),
    );
    return {
      ...s,
      inbox: demoReducer(s.inbox, {
        type: "booking",
        booking,
        at: a.at,
        eventId: `${a.id}:event`,
      }),
      broadcasts: {
        ...s.broadcasts,
        recipients: s.broadcasts.recipients.map((row) =>
          row.id === r?.id ? { ...row, bookingId: booking.id } : row,
        ),
      },
    };
  }
  if (a.type === "consent")
    return {
      ...s,
      broadcasts: {
        ...s.broadcasts,
        profiles: s.broadcasts.profiles.map((p) =>
          p.contactId === a.contactId && p.brandId === a.brandId
            ? {
                ...p,
                consent: a.granted ? "granted" : "withdrawn",
                suppressed: !a.granted,
                consentAt: a.at,
                consentSource: "使用者設定嘅示範同意",
              }
            : p,
        ),
      },
    };
  if (a.type === "import") {
    let n = s;
    for (const raw of a.rows.slice(0, 50)) {
      const parsed = parsePhoneNumberFromString(raw.phone, "HK");
      if (!parsed?.isValid()) continue;
      const row = { ...raw, phone: parsed.number };
      if (
        n.inbox.contacts.length >= 100 ||
        !row.name.trim() ||
        n.inbox.conversations.some(
          (cv) =>
            cv.brandId === a.brandId &&
            n.inbox.contacts.find((c) => c.id === cv.contactId)?.phone ===
              row.phone,
        )
      )
        continue;
      const id = `import-${a.at}-${n.inbox.contacts.length}`;
      const contact: Contact = {
        id,
        clientId: s.scope?.companyId ?? DEMO_CLIENT,
        name: row.name.trim().slice(0, 80),
        initials: row.name.slice(0, 2),
        phone: row.phone,
        email: "",
        company: "",
        tags: ["CSV 匯入"],
        source: s.scope ? "CSV 匯入" : "Demo CSV 匯入",
        createdAt: a.at,
        note: "",
      };
      n = {
        ...n,
        inbox: {
          ...n.inbox,
          contacts: [...n.inbox.contacts, contact],
          conversations: [
            ...n.inbox.conversations,
            {
              id: `c-${id}`,
              clientId: s.scope?.companyId ?? DEMO_CLIENT,
              brandId: a.brandId,
              contactId: id,
              channel: "whatsapp",
              status: "open",
              owner: null,
              priority: false,
              pinned: false,
              unread: 0,
              snoozedUntil: null,
              subject: "匯入聯絡人",
              updatedAt: a.at,
            },
          ],
        },
        broadcasts: {
          ...n.broadcasts,
          profiles: [
            ...n.broadcasts.profiles,
            {
              contactId: id,
              brandId: a.brandId,
              customerType: "new",
              consent: "unknown",
              consentSource: "",
              consentAt: null,
              suppressed: false,
            },
          ],
        },
      };
    }
    return n;
  }
  return s;
}

export function synchronizePosBookings(s: AppState): AppState {
  if (!s.pos) return s;
  const byId = new Map(s.inbox.bookings.map((b) => [b.id, b]));
  for (const a of s.pos.appointments) {
    const old = byId.get(a.crmBookingId);
    byId.set(a.crmBookingId, {
      id: a.crmBookingId,
      conversationId: a.conversationId,
      contactId: a.contactId,
      service: a.serviceName,
      branch:
        s.pos.resources.find((r) => r.id === a.resourceId)?.name ?? "店內",
      date: new Date(a.startsAt + 8 * 3600000).toISOString().slice(0, 10),
      time: new Date(a.startsAt + 8 * 3600000).toISOString().slice(11, 16),
      fee: `HK$${a.priceCents / 100}`,
      guests: a.guests,
      customerConfirmed: old?.customerConfirmed ?? false,
      status:
        a.status === "cancelled"
          ? "cancelled"
          : a.status === "pending"
            ? "pending"
            : "confirmed",
    });
  }
  return { ...s, inbox: { ...s.inbox, bookings: [...byId.values()] } };
}
