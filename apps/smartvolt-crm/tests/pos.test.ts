import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createAppState,
  appReducer,
  appSchema,
  synchronizePosBookings,
} from "../src/lib/demo/state";
import {
  applyPosCommand,
  activeRedemption,
  orderTotals,
  remainingUnits,
  dailyMetrics,
  type PosContext,
} from "../src/lib/pos/engine";
import { posSchema, type PosCommand } from "../src/lib/pos/model";
import { parseMoney, localToMillis, hkDate } from "../src/lib/pos/money";
import {
  applyCompanyCommand as executeCompanyCommand,
  createCompanyState,
} from "../src/lib/saas/workspace";
const applyCompanyCommand = (
  state: Parameters<typeof executeCompanyCommand>[0],
  raw: unknown,
  actor: Parameters<typeof executeCompanyCommand>[2],
  now = Date.now(),
) => executeCompanyCommand(state, raw, actor, now, ["crm", "pos"]);

const now = localToMillis("2026-11-11T09:00");
function fixture() {
  const app = createAppState(now),
    pos = app.pos!;
  const ctx: PosContext = {
    companyId: pos.companyId,
    brandIds: [...new Set(pos.catalog.map((i) => i.brandId))],
    staffIds: ["me", "iris", "ken"],
    contacts: app.inbox.contacts,
    conversations: app.inbox.conversations,
    actor: { name: "Mia", role: "owner" },
    now,
  };
  const brand = ctx.brandIds[0],
    service = pos.catalog.find(
      (i) => i.brandId === brand && i.kind === "service",
    )!,
    pack = pos.catalog.find(
      (i) => i.brandId === brand && i.kind === "package",
    )!,
    contact = pos.appointments[0].contactId;
  const apply = (c: PosCommand) => applyPosCommand(pos, c, ctx);
  return { app, pos, ctx, brand, service, pack, contact, apply };
}
function sale(kind: "service" | "package" = "service") {
  const f = fixture(),
    item = kind === "service" ? f.service : f.pack;
  const pos = applyPosCommand(
    f.pos,
    {
      kind: "cart-add",
      id: "add",
      orderId: "order-new",
      contactId: f.contact,
      itemId: item.id,
      appointmentId: null,
    },
    f.ctx,
  );
  return { ...f, pos, order: pos.orders.find((o) => o.id === "order-new")! };
}
const pay = (orderId: string, amountCents: number, id = "pay"): PosCommand => ({
  kind: "payment-record",
  id,
  orderId,
  amountCents,
  method: "fps",
  reference: "verified-fps-reference",
});
test("money is parsed exactly in cents; exponent, negatives, extra decimals and invalid HK dates fail", () => {
  assert.equal(parseMoney("0.29"), 29);
  assert.equal(parseMoney("1234.5"), 123450);
  for (const v of ["1e3", "-1", "0.001", "9999999"])
    assert.throws(() => parseMoney(v));
  assert.equal(hkDate(localToMillis("2026-11-12T00:30")), "2026-11-12");
  assert.throws(() => localToMillis("2026-02-30T10:00"));
});
test("seed, booking projection and persisted company document pass full integrity validation", () => {
  const { app, pos } = fixture();
  assert.ok(posSchema.safeParse(pos).success);
  const synced = synchronizePosBookings(app);
  assert.ok(appSchema.safeParse(synced).success);
  assert.equal(
    synced.inbox.bookings.filter((b) => b.id.startsWith("pos-book-")).length,
    pos.appointments.length,
  );
});
test("POS denies foreign company, brands, customers, resources and staff", () => {
  const f = fixture();
  assert.throws(
    () =>
      applyPosCommand(
        f.pos,
        { kind: "order-void", id: "x", orderId: "pos-sale-001" },
        { ...f.ctx, companyId: "foreign" },
      ),
    /公司/,
  );
  const c: PosCommand = {
    kind: "appointment-save",
    id: "new",
    appointmentId: "new",
    contactId: f.contact,
    serviceId: f.service.id,
    staffId: "me",
    resourceId: `${f.brand}-bed-a`,
    startsAt: localToMillis("2026-11-12T10:00"),
    guests: 1,
    note: "",
    status: "confirmed",
  };
  for (const patch of [
    { staffId: "foreign" },
    { contactId: "foreign" },
    { resourceId: "foreign" },
  ])
    assert.throws(() => f.apply({ ...c, ...patch }));
  assert.throws(() =>
    f.apply({
      kind: "catalog-save",
      id: "edit",
      item: { ...f.service, brandId: "foreign" },
    }),
  );
});
test("viewers cannot write; agents cannot discount, refund, edit catalog or reverse a redemption", () => {
  const f = sale();
  const agent = { ...f.ctx, actor: { name: "Agent", role: "agent" as const } };
  for (const c of [
    {
      kind: "cart-discount",
      id: "discount",
      orderId: f.order.id,
      amountCents: 100,
    },
    { kind: "catalog-save", id: "edit", item: f.service },
    {
      kind: "refund-record",
      id: "refund",
      orderId: f.order.id,
      amountCents: 1,
      reason: "correction",
    },
    {
      kind: "redemption-reverse",
      id: "reverse",
      redemptionId: "missing",
      reason: "correction",
    },
  ] as PosCommand[])
    assert.throws(() => applyPosCommand(f.pos, c, agent), /管理員/);
  assert.throws(
    () =>
      applyPosCommand(f.pos, pay(f.order.id, 100), {
        ...f.ctx,
        actor: { name: "Viewer", role: "viewer" },
      }),
    /檢視/,
  );
  assert.doesNotThrow(() =>
    applyPosCommand(f.pos, pay(f.order.id, 100), agent),
  );
});
test("availability includes buffer, same customer, staff and bed occupancy; adjacent slot is allowed", () => {
  const f = fixture(),
    a = f.pos.appointments[0];
  const base: PosCommand = {
    kind: "appointment-save",
    id: "collision",
    appointmentId: "collision",
    contactId: f.pos.appointments[2].contactId,
    serviceId: a.serviceId,
    staffId: "ken",
    resourceId: a.resourceId,
    startsAt: a.endsAt + 5 * 60000,
    guests: 1,
    note: "",
    status: "confirmed",
  };
  assert.throws(() => f.apply(base), /容量/);
  assert.throws(
    () =>
      f.apply({ ...base, resourceId: `${f.brand}-bed-b`, staffId: a.staffId }),
    /同事/,
  );
  assert.throws(
    () =>
      f.apply({
        ...base,
        resourceId: `${f.brand}-bed-b`,
        contactId: a.contactId,
      }),
    /客戶/,
  );
  assert.doesNotThrow(() =>
    f.apply({ ...base, startsAt: a.endsAt + a.bufferMinutes * 60000 }),
  );
});
test("a resource cannot shrink, change type or close while future appointments use it", () => {
  const f = fixture(),
    r = f.pos.resources.find((r) => r.id === f.pos.appointments[0].resourceId)!;
  assert.throws(
    () =>
      f.apply({
        kind: "resource-save",
        id: "close",
        resource: { ...r, active: false },
      }),
    /仍有預約/,
  );
});
test("partial payment remains due; retries are idempotent and changed content, excess or unverified reference fail", () => {
  const f = sale(),
    p = pay(f.order.id, 10000);
  const once = applyPosCommand(f.pos, p, f.ctx),
    twice = applyPosCommand(once, p, f.ctx);
  assert.equal(twice, once);
  assert.equal(orderTotals(once, f.order).due, 38000);
  assert.throws(
    () => applyPosCommand(once, { ...p, amountCents: 9999 }, f.ctx),
    /不一致/,
  );
  assert.throws(
    () => applyPosCommand(once, pay(f.order.id, 38001, "extra"), f.ctx),
    /超出/,
  );
  assert.throws(
    () =>
      applyPosCommand(
        once,
        { ...pay(f.order.id, 1, "reference"), reference: "" },
        f.ctx,
      ),
    /參考/,
  );
  const paid = applyPosCommand(once, pay(f.order.id, 38000, "balance"), f.ctx);
  assert.equal(orderTotals(paid, f.order).due, 0);
  assert.equal(paid.payments.filter((p) => p.orderId === f.order.id).length, 2);
  assert.throws(() =>
    applyPosCommand(paid, pay(f.order.id, 1, "duplicate"), f.ctx),
  );
});
test("paid order price and package terms remain immutable after catalog updates", () => {
  const f = sale("package");
  let s = applyPosCommand(
    f.pos,
    {
      kind: "catalog-save",
      id: "price",
      item: { ...f.pack, priceCents: 999999, units: 20 },
    },
    f.ctx,
  );
  s = applyPosCommand(s, pay(f.order.id, 420000), f.ctx);
  const entitlement = s.entitlements.find((p) => p.orderId === f.order.id)!;
  assert.equal(entitlement.units, 10);
  assert.equal(orderTotals(s, f.order).total, 420000);
  assert.throws(
    () =>
      applyPosCommand(
        s,
        {
          kind: "cart-quantity",
          id: "edit-paid",
          orderId: f.order.id,
          lineId: f.order.lines[0].id,
          quantity: 2,
        },
        f.ctx,
      ),
    /不能修改/,
  );
});
test("a package issues once only after full payment and invalid fabricated entitlements fail schema", () => {
  const f = sale("package");
  let s = applyPosCommand(f.pos, pay(f.order.id, 100000), f.ctx);
  assert.equal(
    s.entitlements.filter((p) => p.orderId === f.order.id).length,
    0,
  );
  s = applyPosCommand(s, pay(f.order.id, 320000, "balance"), f.ctx);
  assert.equal(
    s.entitlements.filter((p) => p.orderId === f.order.id).length,
    1,
  );
  const malformed = structuredClone(s);
  malformed.entitlements.at(-1)!.units = 100;
  assert.equal(posSchema.safeParse(malformed).success, false);
  const unpaid = structuredClone(s);
  unpaid.payments = unpaid.payments.filter((p) => p.id !== "balance");
  assert.equal(posSchema.safeParse(unpaid).success, false);
});
test("check-in, one redemption, reversal and full unused-package refund retain an append-only history", () => {
  const f = fixture(),
    a = f.pos.appointments[0],
    pack = f.pos.entitlements.find((p) => p.contactId === a.contactId)!;
  const redeem: PosCommand = {
    kind: "package-redeem",
    id: "redeem",
    entitlementId: pack.id,
    appointmentId: a.id,
  };
  assert.throws(() => f.apply(redeem), /到店/);
  let s = f.apply({
    kind: "appointment-status",
    id: "arrive",
    appointmentId: a.id,
    status: "checked_in",
  });
  s = applyPosCommand(s, redeem, f.ctx);
  assert.equal(remainingUnits(s, pack.id), 9);
  assert.equal(s.appointments.find((x) => x.id === a.id)?.status, "completed");
  assert.equal(applyPosCommand(s, redeem, f.ctx), s);
  assert.throws(() => applyPosCommand(s, { ...redeem, id: "twice" }, f.ctx));
  assert.throws(
    () =>
      applyPosCommand(
        s,
        {
          kind: "cart-add",
          id: "double-charge",
          orderId: "double",
          contactId: a.contactId,
          itemId: a.serviceId,
          appointmentId: a.id,
        },
        f.ctx,
      ),
    /核銷/,
  );
  assert.throws(
    () =>
      applyPosCommand(
        s,
        {
          kind: "refund-record",
          id: "used",
          orderId: pack.orderId,
          amountCents: 420000,
          reason: "refund",
        },
        f.ctx,
      ),
    /已有核銷/,
  );
  s = applyPosCommand(
    s,
    {
      kind: "redemption-reverse",
      id: "reverse",
      redemptionId: "redeem",
      reason: "登記錯誤",
    },
    f.ctx,
  );
  assert.equal(remainingUnits(s, pack.id), 10);
  assert.equal(s.redemptions.length, 2);
  assert.equal(activeRedemption(s, a.id), undefined);
  assert.throws(
    () =>
      applyPosCommand(
        s,
        {
          kind: "redemption-reverse",
          id: "twice-reverse",
          redemptionId: "redeem",
          reason: "again",
        },
        f.ctx,
      ),
    /已撤銷/,
  );
  s = applyPosCommand(
    s,
    {
      kind: "refund-record",
      id: "refund",
      orderId: pack.orderId,
      amountCents: 420000,
      reason: "核對並退回",
    },
    f.ctx,
  );
  assert.equal(s.entitlements.find((p) => p.id === pack.id)?.revoked, true);
  assert.equal(s.payments.length, f.pos.payments.length);
  assert.equal(s.refunds.length, 1);
  assert.equal(s.redemptions.length, 2);
  assert.throws(
    () => applyPosCommand(s, { ...redeem, id: "revoked" }, f.ctx),
    /停用/,
  );
});
test("expired, foreign customer packages, multi-guest redemption and existing checkout are refused", () => {
  const f = fixture(),
    a = f.pos.appointments[0],
    pack = f.pos.entitlements[0];
  let s = f.apply({
    kind: "appointment-status",
    id: "arrive",
    appointmentId: a.id,
    status: "checked_in",
  });
  const redeem: PosCommand = {
    kind: "package-redeem",
    id: "redeem",
    entitlementId: pack.id,
    appointmentId: a.id,
  };
  assert.throws(
    () => applyPosCommand(s, redeem, { ...f.ctx, now: pack.expiresAt }),
    /到期/,
  );
  const other = structuredClone(s);
  other.appointments[0].contactId = "another";
  assert.throws(() => applyPosCommand(other, redeem, f.ctx), /不適用/);
  const group = structuredClone(s);
  group.appointments[0].guests = 2;
  assert.throws(() => applyPosCommand(group, redeem, f.ctx), /單人/);
  s = applyPosCommand(
    s,
    {
      kind: "cart-add",
      id: "add",
      orderId: "draft",
      contactId: a.contactId,
      itemId: a.serviceId,
      appointmentId: a.id,
    },
    f.ctx,
  );
  assert.throws(() => applyPosCommand(s, redeem, f.ctx), /收銀訂單/);
});
test("refunds never reopen a paid invoice, never exceed actual paid amount and close a refunded deposit", () => {
  const f = sale();
  let s = applyPosCommand(f.pos, pay(f.order.id, 10000), f.ctx);
  s = applyPosCommand(
    s,
    {
      kind: "refund-record",
      id: "refund",
      orderId: f.order.id,
      amountCents: 10000,
      reason: "cancelled",
    },
    f.ctx,
  );
  assert.equal(orderTotals(s, f.order).due, 0);
  assert.equal(orderTotals(s, f.order).net, 0);
  assert.throws(() => applyPosCommand(s, pay(f.order.id, 1, "repay"), f.ctx));
  assert.throws(() =>
    applyPosCommand(
      s,
      {
        kind: "refund-record",
        id: "over",
        orderId: f.order.id,
        amountCents: 1,
        reason: "over",
      },
      f.ctx,
    ),
  );
});
test("daily cash uses payment/refund date in HKT, separate from package issuance and service completion", () => {
  const f = sale(),
    s = applyPosCommand(f.pos, pay(f.order.id, 48000), {
      ...f.ctx,
      now: localToMillis("2026-11-12T00:10"),
    });
  assert.equal(dailyMetrics(s, "2026-11-12", f.brand).received, 48000);
  assert.equal(dailyMetrics(s, "2026-11-11", f.brand).received, 420000);
});
test("POS appointments project into CRM but CRM cannot overwrite authoritative POS booking data", () => {
  const f = fixture(),
    s = synchronizePosBookings(f.app),
    b = s.inbox.bookings.find(
      (b) => b.id === f.pos.appointments[0].crmBookingId,
    )!;
  const changed = appReducer(s, {
    type: "inbox",
    action: {
      type: "booking",
      booking: { ...b, time: "00:00" },
      at: now,
      eventId: "edit",
    },
  });
  assert.equal(changed, s);
});
test("real companies initialize with no demo sales and new walk-ins normalize, deduplicate and share CRM identity", () => {
  let s = createCompanyState({
    companyId: "company",
    companyName: "Company",
    brands: [{ id: "main", name: "Main", short: "M" }],
    team: [{ id: "owner", name: "Owner", initials: "O" }],
  });
  assert.equal(s.pos!.orders.length, 0);
  const actor = { id: "owner", name: "Owner", role: "owner" as const };
  s = applyCompanyCommand(
    s,
    {
      type: "customer-create",
      id: "walkin",
      brandId: "main",
      name: "Walk-in",
      phone: "91234567",
      at: 0,
    },
    actor,
    now,
  );
  assert.equal(s.inbox.contacts[0].phone, "+85291234567");
  assert.equal(s.inbox.contacts[0].createdAt, now);
  assert.equal(s.inbox.conversations[0].contactId, "walkin");
  assert.equal(s.broadcasts.recipients.length, 0);
  s = applyCompanyCommand(
    s,
    {
      type: "customer-create",
      id: "duplicate",
      brandId: "main",
      name: "Again",
      phone: "+85291234567",
      at: 0,
    },
    actor,
    now,
  );
  assert.equal(s.inbox.contacts.length, 1);
});
test("rescheduling an appointment with checkout preserves its quoted price and cannot change billed guest count", () => {
  const f = fixture(),
    a = f.pos.appointments[0];
  let s = applyPosCommand(
    f.pos,
    {
      kind: "cart-add",
      id: "checkout",
      orderId: "linked-sale",
      contactId: a.contactId,
      itemId: a.serviceId,
      appointmentId: a.id,
    },
    f.ctx,
  );
  s = applyPosCommand(s, pay("linked-sale", a.priceCents), f.ctx);
  s = applyPosCommand(
    s,
    {
      kind: "catalog-save",
      id: "reprice",
      item: { ...f.service, priceCents: 99000 },
    },
    f.ctx,
  );
  const reschedule: PosCommand = {
    kind: "appointment-save",
    id: "reschedule",
    appointmentId: a.id,
    contactId: a.contactId,
    serviceId: a.serviceId,
    staffId: a.staffId,
    resourceId: a.resourceId,
    startsAt: localToMillis("2026-11-12T10:00"),
    guests: 1,
    note: "改期",
    status: "confirmed",
  };
  const moved = applyPosCommand(s, reschedule, f.ctx);
  assert.equal(
    moved.appointments.find((x) => x.id === a.id)?.priceCents,
    a.priceCents,
  );
  assert.equal(
    orderTotals(
      moved,
      moved.orders.find((o) => o.id === "linked-sale")!,
    ).total,
    a.priceCents,
  );
  assert.throws(
    () => applyPosCommand(s, { ...reschedule, guests: 2 }, f.ctx),
    /已有收銀訂單/,
  );
});
