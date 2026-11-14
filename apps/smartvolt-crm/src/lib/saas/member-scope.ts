import type { AppState } from "@/lib/demo/state";
import type { Product } from "./products";
import { AccessError } from "./identity";
export type MemberScope = { brandIds: string[] | null; productIds: Product[] | null };
export function assertBrand(scope: MemberScope, brand: string) {
  if (scope.brandIds !== null && !scope.brandIds.includes(brand)) throw new AccessError("你無權使用此品牌。", 403);
}
export function projectMemberWorkspace(state: AppState, scope: MemberScope): AppState {
  if (scope.brandIds === null) return state;
  const allowed = new Set(scope.brandIds), brand = (r: { brandId: string }) => allowed.has(r.brandId);
  const conversations = state.inbox.conversations.filter(brand), threadIds = new Set(conversations.map(c => c.id));
  const contacts = state.inbox.contacts.filter(c => c.brandIds?.some(b => allowed.has(b)) || conversations.some(t => t.contactId === c.id)).map(c => ({ ...c, brandIds: c.brandIds?.filter(b => allowed.has(b)) }));
  const flows = state.studio.flows.filter(brand), campaigns = state.broadcasts.campaigns.filter(brand), campaignIds = new Set(campaigns.map(c => c.id));
  const recipients = state.broadcasts.recipients.filter(r => campaignIds.has(r.campaignId)), recipientIds = new Set(recipients.map(r => r.id));
  const pos = state.pos ? { ...state.pos, catalog: state.pos.catalog.filter(brand), resources: state.pos.resources.filter(brand), appointments: state.pos.appointments.filter(brand), orders: state.pos.orders.filter(brand), entitlements: state.pos.entitlements.filter(brand),
    payments: state.pos.payments.filter(p => state.pos!.orders.some(o => o.id === p.orderId && brand(o))), refunds: state.pos.refunds.filter(p => state.pos!.orders.some(o => o.id === p.orderId && brand(o))), redemptions: state.pos.redemptions.filter(p => state.pos!.entitlements.some(o => o.id === p.entitlementId && brand(o))) } : undefined;
  if (pos) { const ids = new Set([...pos.catalog, ...pos.resources, ...pos.appointments, ...pos.orders, ...pos.entitlements, ...pos.payments, ...pos.refunds, ...pos.redemptions].map(x => x.id)); pos.audit = pos.audit.filter(a => ids.has(a.entityId)); }
  return { ...state, scope: state.scope ? { ...state.scope, brands: state.scope.brands.filter(b => allowed.has(b.id)) } : undefined, pos,
    inbox: { ...state.inbox, contacts, conversations, messages: state.inbox.messages.filter(m => threadIds.has(m.conversationId)), bookings: state.inbox.bookings.filter(b => threadIds.has(b.conversationId)) },
    studio: { ...state.studio, flows, versions: state.studio.versions.filter(v => brand(v.flow)), bots: state.studio.bots.filter(brand), articles: state.studio.articles.filter(brand) },
    broadcasts: { ...state.broadcasts, templates: state.broadcasts.templates.filter(brand), profiles: state.broadcasts.profiles.filter(brand), campaigns, recipients, events: state.broadcasts.events.filter(e => recipientIds.has(e.recipientId)), activeRecipientId: state.broadcasts.activeRecipientId && recipientIds.has(state.broadcasts.activeRecipientId) ? state.broadcasts.activeRecipientId : null } };
}
/** Commands carry stable references; check those against server-owned entities before reduction. */
export function assertCommandScope(state: AppState, command: unknown, scope: MemberScope) {
  if (scope.brandIds === null) return;
  const ids = new Map<string, Set<string>>(), add = (id: string, brand: string) => { const set = ids.get(id) ?? new Set<string>(); set.add(brand); ids.set(id, set); };
  for (const row of [...state.inbox.conversations, ...state.studio.flows, ...state.studio.articles, ...state.broadcasts.templates, ...state.broadcasts.campaigns, ...(state.pos?.catalog ?? []), ...(state.pos?.resources ?? []), ...(state.pos?.appointments ?? []), ...(state.pos?.orders ?? []), ...(state.pos?.entitlements ?? [])]) add(row.id, row.brandId);
  for (const v of state.studio.versions) add(v.id, v.flow.brandId);
  for (const r of state.broadcasts.recipients) for (const b of ids.get(r.campaignId) ?? []) add(r.id, b);
  for (const p of [...(state.pos?.payments ?? []), ...(state.pos?.refunds ?? [])]) for (const b of ids.get(p.orderId) ?? []) add(p.id, b);
  for (const r of state.pos?.redemptions ?? []) for (const b of ids.get(r.entitlementId) ?? []) add(r.id, b);
  for (const b of state.inbox.bookings) for (const brand of ids.get(b.conversationId) ?? []) add(b.id, brand);
  const visit = (v: unknown, key = "") => {
    if (typeof v === "string") { if (key === "brandId") assertBrand(scope, v); else if (key === "id" || key.endsWith("Id")) for (const brand of ids.get(v) ?? []) assertBrand(scope, brand); }
    else if (Array.isArray(v)) { if (key === "brandIds") for (const b of v) if (typeof b === "string") assertBrand(scope, b); for (const x of v) visit(x); }
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) visit(x, k);
  };
  visit(command);
}
