import assert from "node:assert/strict";
import test from "node:test";
import {
  appReducer,
  appSchema,
  createAppState,
  type AppState,
} from "../src/lib/demo/state";
import { audience, metrics, type Campaign } from "../src/lib/demo/campaigns";
const at = Date.UTC(2026, 10, 10, 5);
function setup() {
  const s = createAppState(at),
    t = s.broadcasts.templates[0];
  const c: Campaign = {
    id: "test-campaign",
    brandId: t.brandId,
    name: "Synthetic campaign",
    templateId: t.id,
    templateRevision: t.revision,
    templateBody: t.body,
    segment: "all",
    tag: "",
    fields: {
      service: "舒緩護理",
      fee: "HK$480",
      date: "",
      time: "",
      branch: "中環示範店",
    },
    status: "draft",
    createdAt: at,
    launchedAt: null,
  };
  return { s: appReducer(s, { type: "campaign-save", campaign: c }), c };
}
function launched() {
  const { s, c } = setup();
  return { s: appReducer(s, { type: "campaign-launch", id: c.id, at }), c };
}
function replied() {
  const { s: initial, c } = launched();
  let s = initial;
  const r = s.broadcasts.recipients[0];
  s = appReducer(s, {
    type: "customer-message",
    conversationId: r.conversationId,
    recipientId: r.id,
    body: "我有興趣",
    id: "reply-1",
    at: at + 1,
  });
  return { s, c, r };
}
function intake() {
  const { s: initial, c, r } = replied();
  let s = initial;
  s = appReducer(s, {
    type: "intake",
    conversationId: r.conversationId,
    recipientId: r.id,
    service: "舒緩護理",
    branch: "中環示範店",
    date: "2026-11-15",
    time: "15:00",
    id: "intake-1",
    at: at + 2,
  });
  return { s, c, r };
}
function booking(s: AppState, status: "confirmed" | "cancelled", time: number) {
  return appReducer(s, {
    type: "inbox",
    action: {
      type: "booking",
      booking: {
        ...s.inbox.bookings.find((b) => b.id === "intake-1")!,
        status,
      },
      at: time,
      eventId: `booking-${time}`,
    },
  });
}
test("complete standalone seed has scoped valid identities and no fabricated receipts", () => {
  const s = createAppState(at);
  assert.equal(appSchema.safeParse(s).success, true);
  assert.equal(s.broadcasts.events.length, 0);
  assert.equal(s.broadcasts.recipients.length, 0);
});
test("audience isolates brand, WhatsApp, consent and suppression", () => {
  const { s, c } = setup();
  const rows = audience(s.inbox, s.broadcasts, c, at);
  assert.ok(rows.length);
  assert.ok(rows.every((r) => r.conversation.brandId === c.brandId));
  assert.ok(
    rows.some((r) =>
      r.reasons.some((x) => x.includes("同意") || x.includes("停止")),
    ),
  );
  assert.ok(
    rows
      .filter((r) => !r.reasons.length)
      .every(
        (r) =>
          r.conversation.channel === "whatsapp" &&
          r.profile?.consent === "granted" &&
          !r.body.includes("{{"),
      ),
  );
});
test("new and existing customer segments use the same consent boundary", () => {
  const { s, c } = setup();
  for (const segment of ["new", "existing"] as const) {
    const rows = audience(s.inbox, s.broadcasts, { ...c, segment }, at).filter(
      (r) => !r.reasons.length,
    );
    assert.ok(rows.every((r) => r.profile?.customerType === segment));
  }
});
test("template body, revision and approval checked again at launch", () => {
  for (const change of [
    { approved: false },
    { revision: 2 },
    { body: "altered" },
  ]) {
    const { s, c } = setup();
    s.broadcasts.templates[0] = { ...s.broadcasts.templates[0], ...change };
    assert.equal(
      appReducer(s, { type: "campaign-launch", id: c.id, at }).broadcasts
        .recipients.length,
      0,
    );
    assert.equal(
      appReducer(s, { type: "campaign-launch", id: c.id, at }).broadcasts
        .campaigns[0].status,
      "draft",
    );
  }
});
test("withdrawal after preview prevents send", () => {
  const { s: initial, c } = setup();
  let s = initial;
  for (const p of s.broadcasts.profiles)
    s = appReducer(s, {
      type: "consent",
      contactId: p.contactId,
      brandId: p.brandId,
      granted: false,
      at,
    });
  assert.equal(
    appReducer(s, { type: "campaign-launch", id: c.id, at }).broadcasts
      .recipients.length,
    0,
  );
});
test("launch atomically writes messages and event lineage, retry is idempotent", () => {
  const { s, c } = launched();
  assert.ok(s.broadcasts.recipients.length);
  for (const r of s.broadcasts.recipients)
    assert.ok(
      s.inbox.messages.some(
        (m) => m.id === `${r.id}:message` && m.body === r.body,
      ),
    );
  assert.equal(
    appReducer(s, { type: "campaign-launch", id: c.id, at: at + 1 }),
    s,
  );
  assert.equal(appSchema.safeParse(s).success, true);
});
test("launched campaign snapshots cannot be edited", () => {
  const { s, c } = launched();
  assert.equal(
    appReducer(s, {
      type: "campaign-save",
      campaign: { ...c, name: "tampered" },
    }),
    s,
  );
});
test("frequency cap is brand scoped and stops a second campaign within 24h", () => {
  const { s: initial, c } = launched();
  let s = initial;
  const next = { ...c, id: "second" };
  s = appReducer(s, { type: "campaign-save", campaign: next });
  assert.equal(
    audience(s.inbox, s.broadcasts, next, at + 10).filter(
      (r) => !r.reasons.length,
    ).length,
    0,
  );
  assert.ok(
    audience(s.inbox, s.broadcasts, next, at + 86400001).some(
      (r) => !r.reasons.length,
    ),
  );
});
test("read implies delivery; failure cannot overwrite a delivered receipt", () => {
  const { s: initial, c } = launched();
  let s = initial;
  const r = s.broadcasts.recipients[0];
  s = appReducer(s, {
    type: "receipt",
    recipientId: r.id,
    kind: "read",
    at: at + 1,
  });
  assert.equal(metrics(s.broadcasts, c.id).read, 1);
  assert.equal(metrics(s.broadcasts, c.id).delivered, 1);
  assert.equal(
    appReducer(s, {
      type: "receipt",
      recipientId: r.id,
      kind: "failed",
      at: at + 2,
    }),
    s,
  );
});
test("a normal inbox message does not implicitly attribute a campaign reply", () => {
  const { s: initial, c } = launched();
  let s = initial;
  const r = s.broadcasts.recipients[0];
  s = appReducer(s, {
    type: "customer-message",
    conversationId: r.conversationId,
    body: "你好",
    id: "normal",
    at,
  });
  assert.equal(metrics(s.broadcasts, c.id).replied, 0);
});
test("reply updates campaign and inbox, without counting an unverified booking", () => {
  const { s, c } = replied();
  assert.equal(metrics(s.broadcasts, c.id).replied, 1);
  assert.equal(metrics(s.broadcasts, c.id).booked, 0);
  assert.equal(s.inbox.messages.at(-1)?.body, "我有興趣");
});
test("pending intake is not a conversion, verified booking is", () => {
  const { s: initial, c } = intake();
  let s = initial;
  assert.equal(metrics(s.broadcasts, c.id).booked, 0);
  s = booking(s, "confirmed", at + 3);
  assert.equal(metrics(s.broadcasts, c.id).booked, 1);
  assert.equal(appSchema.safeParse(s).success, true);
});
test("booking cancellation, reconfirmation and attendance retain outcome history", () => {
  const { s: initial, c, r } = intake();
  let s = initial;
  s = booking(s, "confirmed", at + 3);
  s = booking(s, "cancelled", at + 4);
  assert.equal(metrics(s.broadcasts, c.id).booked, 0);
  s = booking(s, "confirmed", at + 5);
  assert.equal(metrics(s.broadcasts, c.id).booked, 1);
  s = appReducer(s, {
    type: "receipt",
    recipientId: r.id,
    kind: "arrived",
    at: at + 6,
  });
  assert.equal(metrics(s.broadcasts, c.id).arrived, 1);
  s = appReducer(s, {
    type: "receipt",
    recipientId: r.id,
    kind: "missed",
    at: at + 7,
  });
  assert.equal(metrics(s.broadcasts, c.id).arrived, 0);
  assert.equal(
    s.broadcasts.events.filter((e) => e.kind === "booked").length,
    2,
  );
});
test("unconfirmed booking cannot acquire attendance receipt", () => {
  const { s, r } = intake();
  assert.equal(
    appReducer(s, {
      type: "receipt",
      recipientId: r.id,
      kind: "arrived",
      at: at + 3,
    }),
    s,
  );
});
test("STOP is a durable suppression for subsequent audiences", () => {
  const { s: initial, c, r } = replied();
  let s = initial;
  s = appReducer(s, {
    type: "customer-message",
    conversationId: r.conversationId,
    recipientId: r.id,
    body: "STOP",
    id: "stop",
    at: at + 3,
  });
  const p = s.broadcasts.profiles.find(
    (p) => p.contactId === r.contactId && p.brandId === c.brandId,
  )!;
  assert.equal(p.consent, "withdrawn");
  assert.equal(p.suppressed, true);
  assert.equal(metrics(s.broadcasts, c.id).optout, 1);
  assert.ok(
    audience(s.inbox, s.broadcasts, { ...c, id: "new" }, at + 86400000)
      .find((x) => x.contact.id === r.contactId)
      ?.reasons.includes("已加入停止聯絡名單"),
  );
});
test("import validates and normalizes phones, deduplicates, never grants consent", () => {
  let { s } = setup();
  const count = s.inbox.contacts.length;
  s = appReducer(s, {
    type: "import",
    brandId: "nova-studio",
    at,
    rows: [
      { name: "新客", phone: "91234567" },
      { name: "重複", phone: "+85291234567" },
      { name: "錯誤", phone: "123" },
    ],
  });
  assert.equal(s.inbox.contacts.length, count + 1);
  assert.equal(s.inbox.contacts.at(-1)?.phone, "+85291234567");
  assert.equal(s.broadcasts.profiles.at(-1)?.consent, "unknown");
  assert.equal(appSchema.safeParse(s).success, true);
});
test("invalid dates and cross-conversation attribution are rejected", () => {
  const { s, r } = replied();
  const n = appReducer(s, {
    type: "intake",
    conversationId: r.conversationId,
    recipientId: r.id,
    service: "服務",
    branch: "店",
    date: "2026-02-30",
    time: "15:00",
    id: "invalid",
    at,
  });
  assert.equal(n, s);
  const alien = structuredClone(s);
  alien.broadcasts.recipients[0].conversationId = "missing";
  assert.equal(appSchema.safeParse(alien).success, false);
});
test("utility audience requires staff verified booking, binds actual booking fields", () => {
  const { s, c } = setup();
  const t = s.broadcasts.templates.find((t) => t.purpose === "utility")!;
  const campaign = {
    ...c,
    templateId: t.id,
    templateBody: t.body,
    templateRevision: t.revision,
  };
  for (const row of audience(s.inbox, s.broadcasts, campaign, at).filter(
    (r) => !r.reasons.length,
  )) {
    assert.ok(
      s.inbox.bookings.some(
        (b) =>
          b.conversationId === row.conversation.id && b.status === "confirmed",
      ),
    );
    assert.ok(!row.body.includes("{{"));
  }
});
test("zero denominator metrics remain unknown and reset clears all modules together", () => {
  const { s, c } = setup();
  assert.equal(metrics(s.broadcasts, c.id).replyRate, null);
  const reset = appReducer(s, { type: "reset", at });
  assert.equal(reset.broadcasts.campaigns.length, 0);
  assert.equal(reset.broadcasts.events.length, 0);
  assert.equal(appSchema.safeParse(reset).success, true);
});
