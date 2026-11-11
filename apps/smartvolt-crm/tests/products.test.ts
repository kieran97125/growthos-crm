import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activeProducts,
  defaultProduct,
  projectWorkspace,
  requireProduct,
  requireCommandProduct,
} from "../src/lib/saas/products";
import { applyCompanyCommand } from "../src/lib/saas/workspace";
import {
  createAppState,
  appSchema,
  synchronizePosBookings,
} from "../src/lib/demo/state";
const now = Date.parse("2026-11-11T12:00:00Z");
const grant = (product: "crm" | "pos") => ({
  product,
  status: "active",
  starts_at: "2026-11-01T00:00:00Z",
  ends_at: null,
});
function document() {
  const s = createAppState(now);
  s.scope = {
    companyId: s.pos!.companyId,
    companyName: "Company",
    brands: [
      { id: "nova-studio", name: "Studio", short: "S" },
      { id: "nova-care", name: "Care", short: "C" },
    ],
    team: [
      { id: "me", name: "Mia", initials: "M" },
      { id: "iris", name: "Iris", initials: "I" },
      { id: "ken", name: "Ken", initials: "K" },
    ],
  };
  return synchronizePosBookings(s);
}
const owner = { id: "me", name: "Mia", role: "owner" as const };
test("missing, malformed, future, expired, cancelled and suspended purchases deny access", () => {
  for (const rows of [
    undefined,
    [],
    [{ ...grant("crm"), status: "suspended" }],
    [{ ...grant("crm"), status: "cancelled" }],
    [{ ...grant("crm"), starts_at: "2026-12-01T00:00:00Z" }],
    [{ ...grant("crm"), ends_at: "2026-11-11T12:00:00Z" }],
    [{ ...grant("crm"), product: "unknown" }],
  ])
    assert.deepEqual(activeProducts(rows, now), []);
  assert.deepEqual(activeProducts([grant("crm"), grant("pos")], now), [
    "crm",
    "pos",
  ]);
  assert.equal(defaultProduct(["pos"]), "pos");
  assert.equal(defaultProduct([]), null);
});
test("company ownership or a payload product claim cannot unlock an unpurchased product", () => {
  const state = document();
  assert.throws(
    () =>
      applyCompanyCommand(
        state,
        {
          type: "pos",
          command: { kind: "order-void", id: "x", orderId: "pos-sale-001" },
        },
        owner,
        now,
      ),
    /方案未包含 POS/,
  );
  assert.throws(
    () =>
      applyCompanyCommand(
        state,
        {
          type: "pos",
          command: { kind: "order-void", id: "x", orderId: "pos-sale-001" },
          products: ["pos"],
        },
        owner,
        now,
        ["crm"],
      ),
    /方案未包含 POS/,
  );
  assert.throws(() => requireProduct(["pos"], "crm"), /方案未包含 CRM/);
});
test("the three purchase combinations license independent command families with shared customer creation", () => {
  for (const type of [
    "inbox",
    "studio",
    "campaign-save",
    "campaign-pause",
    "consent",
    "active-recipient",
    "import",
  ]) {
    assert.doesNotThrow(() => requireCommandProduct(["crm"], { type }));
    assert.throws(() => requireCommandProduct(["pos"], { type }), /CRM/);
  }
  assert.throws(() => requireCommandProduct(["crm"], { type: "pos" }), /POS/);
  assert.doesNotThrow(() => requireCommandProduct(["pos"], { type: "pos" }));
  for (const products of [["crm"], ["pos"], ["crm", "pos"]] as const)
    assert.doesNotThrow(() =>
      requireCommandProduct(products, { type: "customer-create" }),
    );
  assert.throws(() => requireCommandProduct([], { type: "customer-create" }));
});
test("CRM-only reads contain shared contacts and CRM, but no POS financial records or managed bookings", () => {
  const state = document(),
    p = projectWorkspace(state, ["crm"]);
  assert.equal(p.pos, undefined);
  assert.equal(p.inbox.contacts.length, state.inbox.contacts.length);
  assert.equal(p.inbox.messages.length, state.inbox.messages.length);
  assert.ok(p.inbox.bookings.every((b) => !b.id.startsWith("pos-book-")));
  assert.ok(appSchema.safeParse(p).success);
  assert.ok(state.pos!.payments.length > 0);
});
test("POS-only reads keep the independent customer directory but redact CRM conversations, campaigns, knowledge and messages", () => {
  const state = document(),
    p = projectWorkspace(state, ["pos"]);
  assert.equal(p.pos!.payments.length, state.pos!.payments.length);
  assert.equal(p.inbox.contacts.length, state.inbox.contacts.length);
  assert.equal(p.inbox.messages.length, 0);
  assert.equal(p.inbox.bookings.length, 0);
  assert.equal(p.studio.flows.length, 0);
  assert.equal(p.studio.articles.length, 0);
  assert.equal(p.broadcasts.campaigns.length, 0);
  assert.ok(
    p.inbox.conversations.every(
      (c) => c.subject === "客戶服務記錄" && !c.owner && !c.unread,
    ),
  );
  assert.ok(appSchema.safeParse(p).success);
});
test("a product-specific mutation retains the other product's server-side records before projecting the response", () => {
  const state = document();
  const next = applyCompanyCommand(
    state,
    {
      type: "inbox",
      action: {
        type: "priority",
        conversationId: state.inbox.conversations[0].id,
      },
    },
    owner,
    now,
    ["crm"],
  );
  assert.deepEqual(next.pos, state.pos);
  assert.equal(projectWorkspace(next, ["crm"]).pos, undefined);
  const p = applyCompanyCommand(
    state,
    {
      type: "pos",
      command: {
        kind: "catalog-save",
        id: "edit",
        item: { ...state.pos!.catalog[0], priceCents: 99900 },
      },
    },
    owner,
    now,
    ["pos"],
  );
  assert.deepEqual(p.inbox.messages, state.inbox.messages);
  assert.deepEqual(p.studio, state.studio);
  assert.equal(projectWorkspace(p, ["pos"]).inbox.messages.length, 0);
});
