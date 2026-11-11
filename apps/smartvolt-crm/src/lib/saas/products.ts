import { z } from "zod";
import { AccessError } from "./identity";
import type { AppState } from "@/lib/demo/state";
export const productSchema = z.enum(["crm", "pos"]);
export type Product = z.infer<typeof productSchema>;
export const productLabels: Record<Product, string> = {
  crm: "CRM",
  pos: "POS",
};
export const productGrantSchema = z.object({
  product: productSchema,
  status: z.enum(["active", "suspended", "cancelled"]),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }).nullable(),
});
export function activeProducts(raw: unknown, now: number): Product[] {
  const parsed = z.array(productGrantSchema).safeParse(raw);
  if (!parsed.success) return [];
  return [
    ...new Set(
      parsed.data
        .filter(
          (r) =>
            r.status === "active" &&
            Date.parse(r.starts_at) <= now &&
            (r.ends_at === null || Date.parse(r.ends_at) > now),
        )
        .map((r) => r.product),
    ),
  ].sort();
}
export function requireProduct(products: readonly Product[], product: Product) {
  if (!products.includes(product))
    throw new AccessError(
      `公司方案未包含 ${productLabels[product]}，你無權進入此產品。`,
    );
}
export function defaultProduct(products: readonly Product[]): Product | null {
  return products.includes("crm")
    ? "crm"
    : products.includes("pos")
      ? "pos"
      : null;
}
export function requireCommandProduct(
  products: readonly Product[],
  command: { type: string },
) {
  if (command.type === "customer-create") {
    if (!defaultProduct(products))
      throw new AccessError("公司未有可使用嘅產品方案。");
    return;
  }
  requireProduct(products, command.type === "pos" ? "pos" : "crm");
}
/** Only shared customer-directory data crosses product boundaries. Never serialize an unlicensed module. */
export function projectWorkspace(
  state: AppState,
  products: readonly Product[],
): AppState {
  if (!defaultProduct(products))
    throw new AccessError("公司未有可使用嘅產品方案。");
  let next = state;
  if (!products.includes("pos")) {
    const managed = new Set(state.pos?.appointments.map((a) => a.crmBookingId));
    next = {
      ...next,
      pos: undefined,
      inbox: {
        ...next.inbox,
        bookings: next.inbox.bookings.filter((b) => !managed.has(b.id)),
      },
    };
  }
  if (!products.includes("crm"))
    next = {
      ...next,
      inbox: {
        ...next.inbox,
        messages: [],
        bookings: [],
        conversations: next.inbox.conversations.map((c) => ({
          ...c,
          subject: "客戶服務記錄",
          owner: null,
          unread: 0,
          priority: false,
          pinned: false,
          status: "open",
          snoozedUntil: null,
        })),
      },
      studio: { version: 1, flows: [], versions: [], bots: [], articles: [] },
      broadcasts: {
        templates: [],
        profiles: [],
        campaigns: [],
        recipients: [],
        events: [],
        activeRecipientId: null,
      },
    };
  return next;
}
