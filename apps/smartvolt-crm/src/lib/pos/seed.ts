import { emptyPos, type PosState, type CatalogItem } from "./model";
import { applyPosCommand, type PosContext } from "./engine";
import { hkDate, localToMillis } from "./money";
export function seedPos(
  companyId: string,
  brands: { id: string; name: string }[],
  contacts: { id: string }[],
  conversations: { id: string; contactId: string; brandId: string }[],
  now: number,
): PosState {
  let s = emptyPos(companyId);
  for (const brand of brands) {
    const base: CatalogItem = {
      id: `${brand.id}-care`,
      brandId: brand.id,
      name: "舒緩護理",
      category: "護理服務",
      kind: "service",
      priceCents: 48000,
      durationMinutes: 60,
      bufferMinutes: 15,
      resourceKind: "bed",
      serviceId: null,
      units: 1,
      validDays: 180,
      active: true,
    };
    s.catalog.push(
      base,
      {
        ...base,
        id: `${brand.id}-body`,
        name: "肩頸放鬆",
        priceCents: 38000,
        durationMinutes: 45,
        category: "身體護理",
      },
      {
        ...base,
        id: `${brand.id}-pt`,
        name: "一對一訓練",
        category: "運動訓練",
        priceCents: 65000,
        resourceKind: "studio",
      },
      {
        ...base,
        id: `${brand.id}-pack`,
        name: "舒緩護理 · 10 次套票",
        kind: "package",
        priceCents: 420000,
        serviceId: base.id,
        units: 10,
        durationMinutes: 0,
        category: "套票方案",
      },
      {
        ...base,
        id: `${brand.id}-product`,
        name: "日常護理組",
        kind: "product",
        priceCents: 28000,
        durationMinutes: 0,
        resourceKind: "none",
        category: "護理用品",
      },
    );
    s.resources.push(
      {
        id: `${brand.id}-bed-a`,
        brandId: brand.id,
        name: "護理床 A",
        kind: "bed",
        capacity: 1,
        active: true,
      },
      {
        id: `${brand.id}-bed-b`,
        brandId: brand.id,
        name: "護理床 B",
        kind: "bed",
        capacity: 1,
        active: true,
      },
      {
        id: `${brand.id}-studio`,
        brandId: brand.id,
        name: "訓練空間",
        kind: "studio",
        capacity: 2,
        active: true,
      },
    );
  }
  const ctx: PosContext = {
    companyId,
    brandIds: brands.map((b) => b.id),
    staffIds: ["me", "iris", "ken"],
    contacts,
    conversations,
    actor: { name: "Mia", role: "owner" },
    now,
  };
  const first = brands[0],
    rows = conversations.filter((c) => c.brandId === first.id).slice(0, 5);
  const slots = ["10:00", "11:30", "14:00", "16:00", "17:30"],
    staff = ["iris", "me", "ken", "iris", "me"];
  for (let i = 0; i < rows.length; i++)
    s = applyPosCommand(
      s,
      {
        kind: "appointment-save",
        id: `seed-book-${i}`,
        appointmentId: `pos-visit-${i}`,
        contactId: rows[i].contactId,
        serviceId: `${first.id}-care`,
        staffId: staff[i],
        resourceId: `${first.id}-${i % 2 ? "bed-b" : "bed-a"}`,
        startsAt: localToMillis(`${hkDate(now)}T${slots[i]}`),
        guests: 1,
        note: i === 1 ? "偏好安靜房間；完成後安排下次時間。" : "",
        status: i === 4 ? "pending" : "confirmed",
      },
      ctx,
    );
  if (rows[0]) {
    s = applyPosCommand(
      s,
      {
        kind: "cart-add",
        id: "seed-cart",
        orderId: "pos-sale-001",
        contactId: rows[0].contactId,
        itemId: `${first.id}-pack`,
        appointmentId: null,
      },
      ctx,
    );
    s = applyPosCommand(
      s,
      {
        kind: "payment-record",
        id: "seed-payment",
        orderId: "pos-sale-001",
        amountCents: 420000,
        method: "fps",
        reference: "DEMO-FPS-001",
      },
      ctx,
    );
  }
  if (rows[1])
    s = applyPosCommand(
      s,
      {
        kind: "appointment-status",
        id: "seed-arrival",
        appointmentId: "pos-visit-1",
        status: "checked_in",
      },
      ctx,
    );
  return s;
}
