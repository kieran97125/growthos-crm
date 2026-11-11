import {
  emptyPos,
  managerCommands,
  posCommandSchema,
  posSchema,
  type PosState,
  type PosCommand,
  type Order,
  type Appointment,
} from "./model";
import type { Role } from "@/lib/saas/identity";
import { hkDate } from "./money";
export type PosContext = {
  companyId: string;
  brandIds: string[];
  staffIds: string[];
  contacts: { id: string }[];
  conversations: { id: string; contactId: string; brandId: string }[];
  actor: { name: string; role: Role };
  now: number;
};
export class PosError extends Error {}
const fail = (message: string): never => {
  throw new PosError(message);
};
export function orderTotals(s: PosState, o: Order) {
  const subtotal = o.lines.reduce((n, l) => n + l.unitCents * l.quantity, 0),
    total = subtotal - o.discountCents,
    paid = s.payments
      .filter((p) => p.orderId === o.id)
      .reduce((n, p) => n + p.amountCents, 0),
    refunded = s.refunds
      .filter((r) => r.orderId === o.id)
      .reduce((n, r) => n + r.amountCents, 0);
  return {
    subtotal,
    total,
    paid,
    refunded,
    net: paid - refunded,
    due: refunded > 0 ? 0 : Math.max(0, total - paid),
    status: o.voided
      ? "已作廢"
      : refunded === paid && paid > 0
        ? "已全額退款"
        : refunded > 0
          ? "部分退款"
          : paid >= total && total > 0
            ? "已付清"
            : paid > 0
              ? "已收部分款項"
              : "未收款",
  };
}
export const remainingUnits = (s: PosState, id: string) => {
  const p = s.entitlements.find((e) => e.id === id);
  return p
    ? p.units +
        s.redemptions
          .filter((r) => r.entitlementId === id)
          .reduce((n, r) => n + r.delta, 0)
    : 0;
};
export const activeRedemption = (s: PosState, appointmentId: string) =>
  s.redemptions.find(
    (r) =>
      r.appointmentId === appointmentId &&
      r.delta === -1 &&
      !s.redemptions.some((x) => x.reverseOf === r.id),
  );
const occupies = (a: Appointment) =>
  !["cancelled", "no_show"].includes(a.status);
function assertAvailability(s: PosState, a: Appointment) {
  const end = a.endsAt + a.bufferMinutes * 60000,
    other = s.appointments.filter(
      (x) =>
        x.id !== a.id &&
        occupies(x) &&
        x.startsAt < end &&
        x.endsAt + x.bufferMinutes * 60000 > a.startsAt,
    );
  if (other.some((x) => x.staffId === a.staffId))
    fail("此同事喺呢個時段已有預約，請揀另一個時段或同事。");
  if (other.some((x) => x.contactId === a.contactId))
    fail("此客戶喺呢個時段已有預約。");
  if (a.resourceId) {
    const resource = s.resources.find((r) => r.id === a.resourceId)!;
    const points = other
      .filter((x) => x.resourceId === a.resourceId)
      .flatMap((x) => [
        { at: Math.max(a.startsAt, x.startsAt), delta: x.guests },
        {
          at: Math.min(end, x.endsAt + x.bufferMinutes * 60000),
          delta: -x.guests,
        },
      ])
      .sort((x, y) => x.at - y.at || x.delta - y.delta);
    let used = a.guests;
    if (used > resource.capacity) fail("預約人數超出場地容量。");
    for (const p of points) {
      used += p.delta;
      if (used > resource.capacity)
        fail("此房間／床位容量不足，請揀另一個時段或資源。");
    }
  }
}
export function applyPosCommand(
  input: PosState | undefined,
  raw: unknown,
  ctx: PosContext,
): PosState {
  const parsed = posCommandSchema.safeParse(raw);
  if (!parsed.success) fail("POS 資料未通過驗證，請檢查必填欄位。");
  const c = parsed.data as PosCommand,
    s = input ?? emptyPos(ctx.companyId);
  if (s.companyId !== ctx.companyId) fail("公司工作空間不一致。");
  if (ctx.actor.role === "viewer") fail("你目前只有檢視權限。");
  if (
    managerCommands.has(c.kind) &&
    !["owner", "manager"].includes(ctx.actor.role)
  )
    fail("此操作需要公司管理員權限。");
  const previous = s.audit.find((a) => a.id === c.id);
  if (previous) {
    if (previous.fingerprint && previous.fingerprint !== JSON.stringify(c))
      fail("此操作編號嘅內容與原有記錄不一致。");
    if (previous.kind !== c.kind) fail("此操作編號已被另一項操作使用。");
    if (c.kind === "payment-record") {
      const p = s.payments.find((p) => p.id === c.id);
      if (
        !p ||
        p.orderId !== c.orderId ||
        p.amountCents !== c.amountCents ||
        p.method !== c.method
      )
        fail("收款操作編號與原有記錄不符。");
    }
    return s;
  }
  const n: PosState = structuredClone(s);
  let entityId = c.id,
    summary = "";
  const brand = (brandId: string) => {
    if (!ctx.brandIds.includes(brandId)) fail("此品牌不屬於公司工作空間。");
  };
  const contact = (contactId: string, brandId: string) => {
    if (
      !ctx.contacts.some((p) => p.id === contactId) ||
      !ctx.conversations.some(
        (cv) => cv.contactId === contactId && cv.brandId === brandId,
      )
    )
      fail("客戶不屬於此品牌。");
  };
  const getOrder = (id: string) =>
    n.orders.find((o) => o.id === id) ?? fail("找不到此訂單。");
  const editable = (o: Order) => {
    if (o.voided || n.payments.some((p) => p.orderId === o.id))
      fail("已有收款或已作廢嘅訂單不能修改，請另開訂單或登記退款。");
  };
  if (c.kind === "catalog-save") {
    brand(c.item.brandId);
    const old = s.catalog.find((i) => i.id === c.item.id);
    if (old && (old.brandId !== c.item.brandId || old.kind !== c.item.kind))
      fail("既有項目不能更改品牌或類型。");
    if (c.item.priceCents < 1) fail("服務／套票價錢必須大於零。");
    if (
      c.item.kind === "package" &&
      !s.catalog.some(
        (i) =>
          i.id === c.item.serviceId &&
          i.kind === "service" &&
          i.brandId === c.item.brandId,
      )
    )
      fail("請為套票選擇同品牌嘅服務。");
    n.catalog = [...n.catalog.filter((i) => i.id !== c.item.id), c.item];
    entityId = c.item.id;
    summary = `更新服務／商品：${c.item.name}`;
  } else if (c.kind === "resource-save") {
    brand(c.resource.brandId);
    const old = s.resources.find((r) => r.id === c.resource.id);
    if (old && old.brandId !== c.resource.brandId)
      fail("資源不能移到另一品牌。");
    if (
      old &&
      s.appointments.some(
        (a) => a.resourceId === old.id && occupies(a) && a.endsAt > ctx.now,
      ) &&
      (!c.resource.active ||
        old.kind !== c.resource.kind ||
        c.resource.capacity < old.capacity)
    )
      fail("此資源仍有預約，請先調整預約再縮減容量或更改類型。");
    n.resources = [
      ...n.resources.filter((r) => r.id !== c.resource.id),
      c.resource,
    ];
    entityId = c.resource.id;
    summary = `更新預約資源：${c.resource.name}`;
  } else if (c.kind === "appointment-save") {
    const item =
      s.catalog.find(
        (i) => i.id === c.serviceId && i.kind === "service" && i.active,
      ) ?? fail("請選擇啟用中嘅服務。");
    brand(item.brandId);
    contact(c.contactId, item.brandId);
    if (!ctx.staffIds.includes(c.staffId)) fail("請選擇公司團隊內嘅同事。");
    if (
      item.resourceKind !== "none" &&
      !s.resources.some(
        (r) =>
          r.id === c.resourceId &&
          r.kind === item.resourceKind &&
          r.brandId === item.brandId &&
          r.active,
      )
    )
      fail("請選擇此服務適用嘅房間／床位。");
    if (item.resourceKind === "none" && c.resourceId)
      fail("此服務毋須場地資源。");
    const old = s.appointments.find((a) => a.id === c.appointmentId);
    if (
      old &&
      (!["pending", "confirmed"].includes(old.status) ||
        old.contactId !== c.contactId ||
        old.brandId !== item.brandId)
    )
      fail("已到店／完成嘅預約不能直接改期或轉移客戶。");
    if (
      old &&
      s.orders.some(
        (o) =>
          o.appointmentId === old.id &&
          s.payments.some((p) => p.orderId === o.id),
      ) &&
      old.serviceId !== item.id
    )
      fail("此預約已有收款，請保留原服務並另建安排。");
    const cv = ctx.conversations.find(
      (cv) => cv.contactId === c.contactId && cv.brandId === item.brandId,
    )!;
    const a: Appointment = {
      id: c.appointmentId,
      brandId: item.brandId,
      contactId: c.contactId,
      conversationId: cv.id,
      crmBookingId: old?.crmBookingId ?? `pos-book-${c.appointmentId}`,
      serviceId: item.id,
      serviceName: item.name,
      priceCents: item.priceCents * c.guests,
      staffId: c.staffId,
      resourceId: c.resourceId,
      startsAt: c.startsAt,
      endsAt: c.startsAt + item.durationMinutes * 60000,
      bufferMinutes: item.bufferMinutes,
      status: c.status,
      guests: c.guests,
      note: c.note,
      createdAt: old?.createdAt ?? ctx.now,
      updatedAt: ctx.now,
    };
    if (!Number.isFinite(a.endsAt) || a.startsAt < 0) fail("預約日期不正確。");
    assertAvailability(s, a);
    n.appointments = [...n.appointments.filter((x) => x.id !== a.id), a];
    entityId = a.id;
    summary = old ? "更新預約安排" : "建立預約";
  } else if (c.kind === "appointment-status") {
    const a =
      n.appointments.find((a) => a.id === c.appointmentId) ??
      fail("找不到此預約。");
    const allowed: Record<Appointment["status"], string[]> = {
      pending: ["confirmed", "cancelled"],
      confirmed: ["checked_in", "no_show", "cancelled"],
      checked_in: ["completed", "cancelled"],
      completed: [],
      no_show: [],
      cancelled: [],
    };
    if (a.status !== c.status && !allowed[a.status].includes(c.status))
      fail("此預約狀態不能直接轉換；如需更正已核銷服務，請先撤銷核銷。");
    if (c.status === "confirmed" || c.status === "checked_in")
      assertAvailability(n, a);
    if (c.status === "cancelled" && activeRedemption(n, a.id))
      fail("請先撤銷套票核銷，再取消預約。");
    a.status = c.status;
    a.updatedAt = ctx.now;
    entityId = a.id;
    summary = `預約狀態：${c.status}`;
  } else if (c.kind === "cart-add") {
    const item =
      s.catalog.find((i) => i.id === c.itemId && i.active) ??
      fail("請選擇啟用中嘅服務／套票。");
    brand(item.brandId);
    contact(c.contactId, item.brandId);
    let order = n.orders.find((o) => o.id === c.orderId);
    const appointment = c.appointmentId
      ? s.appointments.find((a) => a.id === c.appointmentId)
      : null;
    if (
      c.appointmentId &&
      (!appointment ||
        appointment.contactId !== c.contactId ||
        appointment.brandId !== item.brandId ||
        ["cancelled", "no_show"].includes(appointment.status))
    )
      fail("此預約不能加入收銀台。");
    if (appointment && activeRedemption(s, appointment.id))
      fail("此預約已核銷套票，不能另外收費。");
    if (!order) {
      order = {
        id: c.orderId,
        number: `SV-${hkDate(ctx.now).replaceAll("-", "")}-${String(n.orders.length + 1).padStart(4, "0")}`,
        brandId: item.brandId,
        contactId: c.contactId,
        appointmentId: c.appointmentId,
        lines: [],
        discountCents: 0,
        voided: false,
        createdAt: ctx.now,
      };
      n.orders.push(order);
    }
    editable(order);
    if (
      order.contactId !== c.contactId ||
      order.brandId !== item.brandId ||
      order.appointmentId !== c.appointmentId
    )
      fail("訂單客戶、品牌或預約不一致，請另開訂單。");
    const line = order.lines.find((l) => l.itemId === item.id);
    const quantity =
      appointment && appointment.serviceId === item.id ? appointment.guests : 1;
    if (line) line.quantity += quantity;
    else
      order.lines.push({
        id: `${order.id}:${item.id}`,
        itemId: item.id,
        name: item.name,
        kind: item.kind,
        unitCents:
          appointment && appointment.serviceId === item.id
            ? Math.round(appointment.priceCents / appointment.guests)
            : item.priceCents,
        quantity,
        serviceId: item.kind === "service" ? item.id : item.serviceId,
        units: item.units,
        validDays: item.validDays,
      });
    entityId = order.id;
    summary = "加入收銀項目";
  } else if (c.kind === "cart-quantity") {
    const o = getOrder(c.orderId);
    editable(o);
    const line =
      o.lines.find((l) => l.id === c.lineId) ?? fail("找不到此收銀項目。");
    if (c.quantity === 0) o.lines = o.lines.filter((l) => l.id !== line.id);
    else line.quantity = c.quantity;
    const subtotal = o.lines.reduce((n, l) => n + l.unitCents * l.quantity, 0);
    if (o.discountCents >= subtotal) o.discountCents = 0;
    entityId = o.id;
    summary = "更新收銀數量";
  } else if (c.kind === "cart-discount") {
    const o = getOrder(c.orderId);
    editable(o);
    if (c.amountCents >= orderTotals(n, o).subtotal)
      fail("折扣必須少於訂單小計。");
    o.discountCents = c.amountCents;
    entityId = o.id;
    summary = "更新訂單折扣";
  } else if (c.kind === "order-void") {
    const o = getOrder(c.orderId);
    editable(o);
    o.voided = true;
    entityId = o.id;
    summary = "作廢未付款訂單";
  } else if (c.kind === "payment-record") {
    const o = getOrder(c.orderId),
      t = orderTotals(n, o);
    if (o.voided || !o.lines.length || t.refunded > 0 || c.amountCents > t.due)
      fail("收款金額超出未收款項，或此訂單不可再收款。");
    if (c.method !== "cash" && !c.reference.trim())
      fail("轉數快／信用卡請填入已核實嘅交易參考編號。");
    n.payments.push({
      id: c.id,
      orderId: o.id,
      amountCents: c.amountCents,
      method: c.method,
      reference: c.reference,
      at: ctx.now,
      actor: ctx.actor.name,
      source: "manual_verified",
    });
    if (orderTotals(n, o).due === 0) {
      for (const line of o.lines.filter((l) => l.kind === "package"))
        for (let i = 0; i < line.quantity; i++) {
          const id = `${line.id}:pack:${i}`;
          if (!n.entitlements.some((p) => p.id === id))
            n.entitlements.push({
              id,
              orderId: o.id,
              lineId: line.id,
              contactId: o.contactId,
              brandId: o.brandId,
              serviceId: line.serviceId!,
              name: line.name,
              units: line.units,
              expiresAt: ctx.now + line.validDays * 86400000,
              revoked: false,
            });
        }
    }
    entityId = o.id;
    summary = "登記已核實收款";
  } else if (c.kind === "refund-record") {
    const o = getOrder(c.orderId),
      t = orderTotals(n, o);
    if (c.amountCents > t.net) fail("退款超出尚可退回金額。");
    const packs = n.entitlements.filter((p) => p.orderId === o.id);
    if (o.lines.some((l) => l.kind === "package") && c.amountCents !== t.net)
      fail("含套票嘅訂單目前須全額退款。");
    if (packs.some((p) => remainingUnits(n, p.id) !== p.units))
      fail("套票已有核銷，請先核對並撤銷適用核銷，再處理整張訂單退款。");
    n.refunds.push({
      id: c.id,
      orderId: o.id,
      amountCents: c.amountCents,
      reason: c.reason,
      at: ctx.now,
      actor: ctx.actor.name,
      source: "manual_verified",
    });
    packs.forEach((p) => {
      p.revoked = true;
    });
    entityId = o.id;
    summary = "登記已核實退款";
  } else if (c.kind === "package-redeem") {
    const p =
        n.entitlements.find((p) => p.id === c.entitlementId) ??
        fail("找不到此套票。"),
      a =
        n.appointments.find((a) => a.id === c.appointmentId) ??
        fail("找不到此預約。");
    if (
      a.contactId !== p.contactId ||
      a.brandId !== p.brandId ||
      a.serviceId !== p.serviceId
    )
      fail("此套票不適用於呢位客戶或預約服務。");
    if (a.status !== "checked_in" || a.guests !== 1)
      fail("請先為單人預約登記到店，再核銷套票。");
    if (p.revoked || p.expiresAt <= ctx.now || remainingUnits(n, p.id) < 1)
      fail("套票已到期、停用或沒有剩餘次數。");
    if (activeRedemption(n, a.id)) fail("此預約已完成套票核銷。");
    if (n.orders.some((o) => o.appointmentId === a.id && !o.voided))
      fail("此預約已有收銀訂單，請先處理該訂單，避免重複收費。");
    n.redemptions.push({
      id: c.id,
      entitlementId: p.id,
      appointmentId: a.id,
      delta: -1,
      reverseOf: null,
      at: ctx.now,
      actor: ctx.actor.name,
      reason: "完成服務",
    });
    a.status = "completed";
    a.updatedAt = ctx.now;
    entityId = a.id;
    summary = "套票核銷一次並完成服務";
  } else if (c.kind === "redemption-reverse") {
    const r =
      n.redemptions.find((r) => r.id === c.redemptionId && r.delta === -1) ??
      fail("找不到原有核銷記錄。");
    if (n.redemptions.some((x) => x.reverseOf === r.id)) fail("此核銷已撤銷。");
    n.redemptions.push({
      id: c.id,
      entitlementId: r.entitlementId,
      appointmentId: r.appointmentId,
      delta: 1,
      reverseOf: r.id,
      at: ctx.now,
      actor: ctx.actor.name,
      reason: c.reason,
    });
    const a = n.appointments.find((a) => a.id === r.appointmentId)!;
    a.status = "checked_in";
    a.updatedAt = ctx.now;
    entityId = a.id;
    summary = "撤銷核銷並保留原有記錄";
  }
  n.audit.push({
    id: c.id,
    kind: c.kind,
    entityId,
    at: ctx.now,
    actor: ctx.actor.name,
    summary,
    fingerprint: JSON.stringify(c),
  });
  const checked = posSchema.safeParse(n);
  if (!checked.success) fail("POS 記錄未通過完整性檢查，改動未有儲存。");
  return checked.data!;
}
export function dailyMetrics(s: PosState, date: string, brandId: string) {
  const orders = s.orders.filter((o) => o.brandId === brandId),
    orderIds = new Set(orders.map((o) => o.id));
  const received = s.payments
      .filter((p) => orderIds.has(p.orderId) && hkDate(p.at) === date)
      .reduce((n, p) => n + p.amountCents, 0),
    refunds = s.refunds
      .filter((r) => orderIds.has(r.orderId) && hkDate(r.at) === date)
      .reduce((n, r) => n + r.amountCents, 0);
  const appointments = s.appointments.filter(
      (a) => a.brandId === brandId && hkDate(a.startsAt) === date,
    ),
    arrived = appointments.filter((a) =>
      ["checked_in", "completed"].includes(a.status),
    ).length;
  return {
    received,
    refunds,
    net: received - refunds,
    appointments,
    arrived,
    due: orders
      .filter((o) => !o.voided && o.lines.length > 0)
      .reduce((n, o) => n + orderTotals(s, o).due, 0),
    redemptions: s.redemptions
      .filter(
        (r) =>
          hkDate(r.at) === date &&
          s.entitlements.find((p) => p.id === r.entitlementId)?.brandId ===
            brandId,
      )
      .reduce((n, r) => n - r.delta, 0),
  };
}
