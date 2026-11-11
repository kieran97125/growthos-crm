import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createCompanyState,
  applyCompanyCommand,
} from "../src/lib/saas/workspace";
import { appSchema } from "../src/lib/demo/state";
import { type CompanyScope, type Role } from "../src/lib/saas/identity";
const scope = (id = "company-a"): CompanyScope => ({
  companyId: id,
  companyName: id,
  brands: [{ id: "brand", name: "品牌", short: "BRAND" }],
  team: [{ id: "user-a", name: "同事A", initials: "A" }],
});
const actor = (role: Role = "owner") => ({ id: "user-a", name: "同事A", role });
const imported = () =>
  applyCompanyCommand(
    createCompanyState(scope()),
    {
      type: "import",
      brandId: "brand",
      rows: [{ name: "測試", phone: "91234567" }],
      at: 123,
    },
    actor(),
    1000,
  );
test("a real company begins without fictional contacts, offers, consent or approved knowledge", () => {
  const s = createCompanyState(scope());
  assert.equal(s.inbox.contacts.length, 0);
  assert.equal(s.broadcasts.templates.length, 0);
  assert.equal(s.studio.articles.length, 0);
  assert.equal(s.scope?.companyId, "company-a");
  assert.equal(s.studio.bots[0].brandId, "brand");
});
test("imports receive server-owned company and timestamp, phone normalization and unknown consent", () => {
  const s = imported();
  assert.equal(s.inbox.contacts[0].clientId, "company-a");
  assert.equal(s.inbox.contacts[0].phone, "+85291234567");
  assert.equal(s.inbox.contacts[0].createdAt, 1000);
  assert.equal(s.broadcasts.profiles[0].consent, "unknown");
});
test("two companies may use equal local IDs without sharing records", () => {
  const a = imported();
  const b = createCompanyState(scope("company-b"));
  assert.equal(b.inbox.contacts.length, 0);
  assert.equal(a.inbox.contacts.length, 1);
  assert.equal(appSchema.safeParse({ ...a, scope: b.scope }).success, false);
});
test("foreign brand and user IDs never enter a company document", () => {
  const s = imported();
  assert.throws(() =>
    applyCompanyCommand(
      s,
      {
        type: "import",
        brandId: "foreign",
        rows: [{ name: "X", phone: "92345678" }],
        at: 1,
      },
      actor(),
    ),
  );
  assert.throws(() =>
    applyCompanyCommand(
      s,
      {
        type: "inbox",
        action: {
          type: "assign",
          conversationId: s.inbox.conversations[0].id,
          owner: "foreign-user",
          at: 1,
          eventId: "x",
        },
      },
      actor(),
    ),
  );
});
test("viewer cannot mutate; agent can annotate but cannot change knowledge or import", () => {
  const s = imported(),
    cv = s.inbox.conversations[0].id;
  assert.throws(() =>
    applyCompanyCommand(
      s,
      { type: "inbox", action: { type: "read", conversationId: cv } },
      actor("viewer"),
    ),
  );
  assert.throws(() =>
    applyCompanyCommand(
      s,
      {
        type: "import",
        brandId: "brand",
        rows: [{ name: "X", phone: "92345678" }],
        at: 1,
      },
      actor("agent"),
    ),
  );
  assert.throws(() =>
    applyCompanyCommand(
      s,
      { type: "studio", action: { type: "bot", bot: s.studio.bots[0] } },
      actor("agent"),
    ),
  );
  const n = applyCompanyCommand(
    s,
    {
      type: "inbox",
      action: {
        type: "message",
        conversationId: cv,
        message: {
          id: "note",
          conversationId: cv,
          kind: "note",
          body: "下一步",
          author: "Spoof",
          at: 1,
          replyTo: null,
        },
      },
    },
    actor("agent"),
    2000,
  );
  assert.equal(n.inbox.messages.at(-1)?.author, "同事A");
  assert.equal(n.inbox.messages.at(-1)?.at, 2000);
});
test("production does not fabricate a send, incoming receipt, booking conversion or consent grant", () => {
  const s = imported(),
    cv = s.inbox.conversations[0].id;
  for (const type of [
    "reset",
    "receipt",
    "campaign-launch",
    "customer-message",
    "intake",
  ])
    assert.throws(() => applyCompanyCommand(s, { type }, actor()));
  for (const kind of ["incoming", "outgoing"])
    assert.throws(() =>
      applyCompanyCommand(
        s,
        {
          type: "inbox",
          action: {
            type: "message",
            conversationId: cv,
            message: {
              id: "fake",
              conversationId: cv,
              kind,
              body: "Hi",
              author: "x",
              at: 1,
              replyTo: null,
            },
          },
        },
        actor(),
      ),
    );
  assert.throws(() =>
    applyCompanyCommand(
      s,
      {
        type: "consent",
        brandId: "brand",
        contactId: s.inbox.contacts[0].id,
        granted: true,
        at: 1,
      },
      actor(),
    ),
  );
});
