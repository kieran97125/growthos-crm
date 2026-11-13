import { z } from "zod";
const id = z.string().min(1).max(100);
export const centsSchema = z.number().int().min(0).max(100000000);
export const catalogItemSchema = z
  .object({
    id,
    brandId: id,
    name: z.string().min(1).max(100),
    category: z.string().min(1).max(40),
    kind: z.enum(["service", "package", "product"]),
    priceCents: centsSchema,
    durationMinutes: z.number().int().min(0).max(480),
    bufferMinutes: z.number().int().min(0).max(120),
    resourceKind: z.enum(["bed", "room", "studio", "none"]),
    serviceId: id.nullable(),
    units: z.number().int().min(1).max(200),
    validDays: z.number().int().min(1).max(3650),
    active: z.boolean(),
  })
  .superRefine((item, ctx) => {
    if (
      (item.kind === "service" && item.durationMinutes < 5) ||
      (item.kind === "package" && !item.serviceId)
    )
      ctx.addIssue({
        code: "custom",
        message: "Invalid service/package configuration",
      });
  });
export const resourceSchema = z.object({
  id,
  brandId: id,
  name: z.string().min(1).max(80),
  kind: z.enum(["bed", "room", "studio"]),
  capacity: z.number().int().min(1).max(30),
  active: z.boolean(),
});
export const appointmentStatus = z.enum([
  "pending",
  "confirmed",
  "checked_in",
  "completed",
  "no_show",
  "cancelled",
]);
export const appointmentSchema = z.object({
  id,
  brandId: id,
  contactId: id,
  conversationId: id.nullable(),
  requestId: z.uuid().optional(),
  crmBookingId: id,
  serviceId: id,
  serviceName: z.string().min(1).max(100),
  priceCents: centsSchema,
  staffId: id,
  resourceId: id.nullable(),
  startsAt: z.number().finite(),
  endsAt: z.number().finite(),
  bufferMinutes: z.number().int().min(0).max(120),
  status: appointmentStatus,
  guests: z.number().int().min(1).max(30),
  note: z.string().max(1000),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
});
const orderLineSchema = z.object({
  id,
  itemId: id,
  name: z.string().min(1).max(100),
  kind: z.enum(["service", "package", "product"]),
  unitCents: centsSchema,
  quantity: z.number().int().min(1).max(50),
  serviceId: id.nullable(),
  units: z.number().int().min(1).max(200),
  validDays: z.number().int().min(1).max(3650),
});
export const orderSchema = z.object({
  id,
  number: z.string().min(1).max(50),
  brandId: id,
  contactId: id,
  appointmentId: id.nullable(),
  lines: z.array(orderLineSchema).max(30),
  discountCents: centsSchema,
  voided: z.boolean(),
  createdAt: z.number().finite(),
});
export const paymentSchema = z.object({
  id,
  orderId: id,
  amountCents: centsSchema.refine((v) => v > 0),
  method: z.enum(["cash", "fps", "card"]),
  reference: z.string().max(160),
  at: z.number().finite(),
  actor: z.string().max(80),
  source: z.literal("manual_verified"),
});
export const refundSchema = z.object({
  id,
  orderId: id,
  amountCents: centsSchema.refine((v) => v > 0),
  reason: z.string().min(1).max(300),
  at: z.number().finite(),
  actor: z.string().max(80),
  source: z.literal("manual_verified"),
});
const entitlementSchema = z.object({
  id,
  orderId: id,
  lineId: id,
  contactId: id,
  brandId: id,
  serviceId: id,
  name: z.string().max(100),
  units: z.number().int().positive(),
  expiresAt: z.number().finite(),
  revoked: z.boolean(),
});
const redemptionSchema = z.object({
  id,
  entitlementId: id,
  appointmentId: id,
  delta: z.union([z.literal(-1), z.literal(1)]),
  reverseOf: id.nullable(),
  at: z.number().finite(),
  actor: z.string().max(80),
  reason: z.string().max(300),
});
const auditSchema = z.object({
  id,
  kind: z.string().max(60),
  entityId: id,
  at: z.number().finite(),
  actor: z.string().max(80),
  summary: z.string().max(300),
  fingerprint: z.string().max(5000).optional(),
});
export const posSchema = z
  .object({
    version: z.literal(1),
    companyId: id,
    catalog: z.array(catalogItemSchema).max(200),
    resources: z.array(resourceSchema).max(100),
    appointments: z.array(appointmentSchema).max(500),
    orders: z.array(orderSchema).max(500),
    payments: z.array(paymentSchema).max(2000),
    refunds: z.array(refundSchema).max(1000),
    entitlements: z.array(entitlementSchema).max(1000),
    redemptions: z.array(redemptionSchema).max(2000),
    audit: z.array(auditSchema).max(3000),
  })
  .superRefine((s, ctx) => {
    const bad = (message: string) => ctx.addIssue({ code: "custom", message });
    for (const rows of [
      s.catalog,
      s.resources,
      s.appointments,
      s.orders,
      s.payments,
      s.refunds,
      s.entitlements,
      s.redemptions,
      s.audit,
    ])
      if (new Set(rows.map((r) => r.id)).size !== rows.length)
        bad("Duplicate POS identity");
    const catalog = new Map(s.catalog.map((i) => [i.id, i])),
      orders = new Map(s.orders.map((o) => [o.id, o])),
      appointments = new Map(s.appointments.map((a) => [a.id, a]));
    for (const item of s.catalog)
      if (
        item.kind === "package" &&
        (catalog.get(item.serviceId!)?.kind !== "service" ||
          catalog.get(item.serviceId!)?.brandId !== item.brandId)
      )
        bad("Invalid package service");
    for (const a of s.appointments)
      if (
        a.endsAt <= a.startsAt ||
        catalog.get(a.serviceId)?.brandId !== a.brandId ||
        (a.resourceId &&
          !s.resources.some(
            (r) => r.id === a.resourceId && r.brandId === a.brandId,
          ))
      )
        bad("Invalid appointment reference");
    for (const order of s.orders) {
      const subtotal = order.lines.reduce(
          (n, l) => n + l.unitCents * l.quantity,
          0,
        ),
        gross = s.payments
          .filter((p) => p.orderId === order.id)
          .reduce((n, p) => n + p.amountCents, 0),
        refunds = s.refunds
          .filter((r) => r.orderId === order.id)
          .reduce((n, r) => n + r.amountCents, 0);
      if (
        subtotal > 100000000 ||
        order.discountCents > subtotal ||
        gross > subtotal - order.discountCents ||
        refunds > gross ||
        (order.voided && gross > 0) ||
        new Set(order.lines.map((l) => l.id)).size !== order.lines.length
      )
        bad("Invalid order balance");
      if (
        order.lines.some(
          (l) =>
            catalog.get(l.itemId)?.brandId !== order.brandId ||
            catalog.get(l.itemId)?.kind !== l.kind,
        )
      )
        bad("Invalid order line catalog scope");
      if (
        order.appointmentId &&
        (appointments.get(order.appointmentId)?.contactId !== order.contactId ||
          appointments.get(order.appointmentId)?.brandId !== order.brandId)
      )
        bad("Invalid order appointment");
    }
    for (const payment of [...s.payments, ...s.refunds])
      if (!orders.has(payment.orderId)) bad("Invalid payment reference");
    for (const pack of s.entitlements) {
      const order = orders.get(pack.orderId),
        line = order?.lines.find((l) => l.id === pack.lineId);
      if (
        !order ||
        order.contactId !== pack.contactId ||
        order.brandId !== pack.brandId ||
        line?.kind !== "package" ||
        line.serviceId !== pack.serviceId ||
        line.units !== pack.units ||
        s.entitlements.filter(
          (p) => p.lineId === pack.lineId && p.orderId === pack.orderId,
        ).length > (line?.quantity ?? 0) ||
        s.payments
          .filter((p) => p.orderId === pack.orderId)
          .reduce((n, p) => n + p.amountCents, 0) !==
          order.lines.reduce((n, l) => n + l.unitCents * l.quantity, 0) -
            order.discountCents ||
        (s.refunds.some((r) => r.orderId === pack.orderId) && !pack.revoked)
      )
        bad("Invalid entitlement purchase");
      const remaining =
        pack.units +
        s.redemptions
          .filter((r) => r.entitlementId === pack.id)
          .reduce((n, r) => n + r.delta, 0);
      if (remaining < 0 || remaining > pack.units)
        bad("Invalid package balance");
    }
    for (const r of s.redemptions) {
      const pack = s.entitlements.find((p) => p.id === r.entitlementId),
        a = appointments.get(r.appointmentId),
        original = s.redemptions.find((p) => p.id === r.reverseOf);
      if (
        !pack ||
        !a ||
        pack.contactId !== a.contactId ||
        pack.brandId !== a.brandId ||
        pack.serviceId !== a.serviceId
      )
        bad("Invalid redemption scope");
      if (
        (r.delta === 1 &&
          (!original ||
            original.delta !== -1 ||
            original.appointmentId !== r.appointmentId ||
            original.entitlementId !== r.entitlementId)) ||
        (r.delta === -1 && r.reverseOf)
      )
        bad("Invalid redemption reversal");
    }
    const reversals = s.redemptions
      .filter((r) => r.reverseOf)
      .map((r) => r.reverseOf);
    if (new Set(reversals).size !== reversals.length)
      bad("Repeated redemption reversal");
    const active = s.redemptions.filter(
      (r) => r.delta === -1 && !s.redemptions.some((x) => x.reverseOf === r.id),
    );
    if (new Set(active.map((r) => r.appointmentId)).size !== active.length)
      bad("Appointment redeemed twice");
  });
export type PosState = z.infer<typeof posSchema>;
export type CatalogItem = z.infer<typeof catalogItemSchema>;
export type Resource = z.infer<typeof resourceSchema>;
export type Appointment = z.infer<typeof appointmentSchema>;
export type Order = z.infer<typeof orderSchema>;
export type Entitlement = PosState["entitlements"][number];
export const posCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("catalog-save"), id, item: catalogItemSchema }),
  z.object({ kind: z.literal("resource-save"), id, resource: resourceSchema }),
  z.object({
    kind: z.literal("appointment-save"),
    id,
    appointmentId: id,
    contactId: id,
    serviceId: id,
    staffId: id,
    resourceId: id.nullable(),
    startsAt: z.number().finite(),
    guests: z.number().int().min(1).max(30),
    note: z.string().max(1000),
    status: z.enum(["pending", "confirmed"]),
  }),
  z.object({
    kind: z.literal("appointment-status"),
    id,
    appointmentId: id,
    status: appointmentStatus,
  }),
  z.object({
    kind: z.literal("cart-add"),
    id,
    orderId: id,
    contactId: id,
    itemId: id,
    appointmentId: id.nullable(),
  }),
  z.object({
    kind: z.literal("cart-quantity"),
    id,
    orderId: id,
    lineId: id,
    quantity: z.number().int().min(0).max(50),
  }),
  z.object({
    kind: z.literal("cart-discount"),
    id,
    orderId: id,
    amountCents: centsSchema,
  }),
  z.object({ kind: z.literal("order-void"), id, orderId: id }),
  z.object({
    kind: z.literal("payment-record"),
    id,
    orderId: id,
    amountCents: centsSchema.refine((v) => v > 0),
    method: z.enum(["cash", "fps", "card"]),
    reference: z.string().max(160),
  }),
  z.object({
    kind: z.literal("refund-record"),
    id,
    orderId: id,
    amountCents: centsSchema.refine((v) => v > 0),
    reason: z.string().min(1).max(300),
  }),
  z.object({
    kind: z.literal("package-redeem"),
    id,
    entitlementId: id,
    appointmentId: id,
  }),
  z.object({
    kind: z.literal("redemption-reverse"),
    id,
    redemptionId: id,
    reason: z.string().min(1).max(300),
  }),
]);
export type PosCommand = z.infer<typeof posCommandSchema>;
export const managerCommands = new Set([
  "catalog-save",
  "resource-save",
  "cart-discount",
  "refund-record",
  "redemption-reverse",
]);
export function emptyPos(companyId: string): PosState {
  return {
    version: 1,
    companyId,
    catalog: [],
    resources: [],
    appointments: [],
    orders: [],
    payments: [],
    refunds: [],
    entitlements: [],
    redemptions: [],
    audit: [],
  };
}
