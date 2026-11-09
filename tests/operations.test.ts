import { test } from "node:test";
import assert from "node:assert/strict";
import {
  automationRuleSchema,
  defaultInboxFilter,
  filterCases,
  inboxFilterSchema,
  internationalPhone,
  isFollowUpDue,
  previewBroadcast,
  recipientExclusions,
  renderReply,
  simulateAutomation,
  type BroadcastContext,
  type RecipientEvidence,
} from "../src/lib/crm/operations";
import { fixtureCase, fixtureCases, fixtureTime as now } from "./fixtures";

const recipient: RecipientEvidence = {
  id: "r1",
  clientId: "client-a",
  brandId: "brand-a",
  phone: "+1 202 555 0101",
  consent: "granted",
  consentEvidenceId: "consent-1",
  suppressed: false,
  lastMarketingAt: null,
};
const context: BroadcastContext = {
  clientId: "client-a",
  brandId: "brand-a",
  connected: true,
  template: {
    status: "approved",
    verifiedAt: new Date(now - 1000).toISOString(),
  },
  frequencyHours: 24,
  templateMaxAgeHours: 24,
  now,
};

test("inbox filters compose, retain one brand and normalize phone search", () => {
  assert.deepEqual(
    filterCases(
      fixtureCases,
      {
        ...defaultInboxFilter,
        brand: "demo-studio",
        status: "no_show",
        source: "landing_form",
        owner: "Demo Agent",
        query: "+1 202 555 0102",
      },
      now,
    ).map((row) => row.id),
    ["case-2"],
  );
  assert.equal(
    filterCases(
      fixtureCases,
      { ...defaultInboxFilter, query: "demo-ctwa-001" },
      now,
    ).length,
    3,
  );
  assert.equal(
    filterCases(fixtureCases, { ...defaultInboxFilter, brand: "missing" }, now)
      .length,
    0,
  );
});
test("query-string input is validated without trusting enum or array values", () => {
  assert.deepEqual(
    inboxFilterSchema.parse({
      status: "invalid-status",
      queue: ["all"],
      query: "x".repeat(201),
    }),
    defaultInboxFilter,
  );
});
test("queues use raw timestamps and owner IDs, never formatted display strings", () => {
  assert.deepEqual(
    filterCases(
      fixtureCases,
      { ...defaultInboxFilter, queue: "follow_up_due" },
      now,
    ).map((row) => row.id),
    ["case-2"],
  );
  assert.equal(
    isFollowUpDue(
      fixtureCase({ status: "paid", nextFollowUpAt: "2026-11-01T00:00:00Z" }),
      now,
    ),
    false,
  );
  assert.equal(
    isFollowUpDue(fixtureCase({ nextFollowUpAt: "bad-date" }), now),
    false,
  );
  assert.equal(
    filterCases(
      fixtureCases,
      { ...defaultInboxFilter, owner: "unassigned" },
      now,
    ).length,
    2,
  );
});
test("overdue records sort first and sorting does not mutate source records", () => {
  const before = JSON.stringify(fixtureCases);
  assert.equal(
    filterCases(fixtureCases, defaultInboxFilter, now)[0].id,
    "case-2",
  );
  assert.equal(JSON.stringify(fixtureCases), before);
});
test("only a verified tenant, channel, consent and fresh template qualify", () => {
  assert.deepEqual(recipientExclusions(recipient, context), []);
  assert.equal(previewBroadcast([recipient], context).eligible, 1);
});
for (const [name, patch, reason] of [
  ["foreign tenant", { clientId: "client-b" }, "outside_scope"],
  ["foreign brand", { brandId: "brand-b" }, "outside_scope"],
  ["unknown tenant", { clientId: null }, "scope_unverified"],
  ["consent without evidence", { consentEvidenceId: null }, "consent_missing"],
  ["withdrawn consent", { consent: "revoked" }, "suppressed"],
  ["suppressed contact", { suppressed: true }, "suppressed"],
  ["local phone", { phone: "51234567" }, "invalid_phone"],
  [
    "invalid frequency date",
    { lastMarketingAt: "not-a-date" },
    "frequency_cap",
  ],
] as const)
  test(`broadcast blocks ${name}`, () => {
    assert.ok(
      recipientExclusions({ ...recipient, ...patch }, context).includes(reason),
    );
  });
test("country code validity and international formatting use a phone metadata parser", () => {
  assert.equal(internationalPhone("+1 (202) 555-0101"), "12025550101");
  assert.equal(internationalPhone("+999123456789"), null);
  assert.equal(internationalPhone("852+abc12345678"), null);
});
test("format variants deduplicate within scope but never across brands or tenants", () => {
  const same = { ...recipient, id: "r2", phone: "12025550101" };
  assert.equal(
    previewBroadcast([recipient, same], context).uniqueRecipients,
    1,
  );
  assert.equal(
    previewBroadcast(
      [
        recipient,
        { ...same, brandId: "brand-b" },
        { ...same, id: "r3", clientId: "client-b" },
      ],
      context,
    ).uniqueRecipients,
    3,
  );
});
test("a duplicate cannot erase withdrawal, suppression or missing authorization", () => {
  const preview = previewBroadcast(
    [recipient, { ...recipient, id: "older", suppressed: true }],
    context,
  );
  assert.equal(preview.duplicates, 1);
  assert.equal(preview.eligible, 0);
  assert.deepEqual(preview.decisions[0].reasons, ["suppressed"]);
});
test("unresolved phone identities are not merged together", () => {
  assert.equal(
    previewBroadcast(
      [
        { ...recipient, phone: "" },
        { ...recipient, id: "r2", phone: "" },
      ],
      context,
    ).uniqueRecipients,
    2,
  );
});
test("stale, future and unknown templates fail closed", () => {
  for (const verifiedAt of [
    null,
    "broken",
    new Date(now + 1000).toISOString(),
    new Date(now - 25 * 3_600_000).toISOString(),
  ]) {
    assert.ok(
      recipientExclusions(recipient, {
        ...context,
        template: { status: "approved", verifiedAt },
      }).includes("template_unverified"),
    );
  }
});
test("cooldown boundary and invalid policy values are enforced", () => {
  assert.ok(
    recipientExclusions(
      {
        ...recipient,
        lastMarketingAt: new Date(now - 23 * 3_600_000).toISOString(),
      },
      context,
    ).includes("frequency_cap"),
  );
  assert.deepEqual(
    recipientExclusions(
      {
        ...recipient,
        lastMarketingAt: new Date(now - 24 * 3_600_000).toISOString(),
      },
      context,
    ),
    [],
  );
  assert.ok(
    recipientExclusions(recipient, {
      ...context,
      frequencyHours: NaN,
    }).includes("frequency_cap"),
  );
  assert.equal(
    previewBroadcast([recipient], { ...context, now: NaN }).eligible,
    0,
  );
});
test("legacy enquiry data never becomes marketing consent", () => {
  const preview = previewBroadcast(
    [
      {
        ...recipient,
        clientId: null,
        consent: "unknown",
        consentEvidenceId: null,
      },
    ],
    {
      ...context,
      clientId: null,
      connected: false,
      template: { status: "unknown", verifiedAt: null },
    },
  );
  assert.equal(preview.eligible, 0);
  assert.deepEqual(preview.decisions[0].reasons, [
    "scope_unverified",
    "consent_missing",
    "channel_unavailable",
    "template_unverified",
  ]);
});
test("simulation is brand-scoped and produces proposals without editing appointments or follow-ups", () => {
  const before = JSON.stringify(fixtureCases);
  const rule = {
    name: "Follow-up",
    status: "no_show",
    source: "all",
    queue: "all",
    treatmentContains: "皮膚",
    followUpHours: 24,
  };
  const result = simulateAutomation(fixtureCases, rule, "demo-studio", now);
  assert.equal(result.mode, "simulation");
  assert.equal(result.proposals.length, 1);
  assert.equal(result.proposals[0].leadId, "case-2");
  assert.equal(
    result.proposals[0].proposedFollowUpAt,
    "2026-11-10T02:00:00.000Z",
  );
  assert.equal(result.proposals[0].existingFollowUpAt, "2026-11-09T01:30:00Z");
  assert.equal(JSON.stringify(fixtureCases), before);
  assert.throws(() => simulateAutomation(fixtureCases, rule, "all", now));
});
test("rules reject empty names and unsafe wait durations", () => {
  assert.equal(
    automationRuleSchema.safeParse({
      name: "",
      status: "all",
      source: "all",
      queue: "all",
      treatmentContains: "",
      followUpHours: 0,
    }).success,
    false,
  );
  assert.equal(
    automationRuleSchema.safeParse({
      name: "Rule",
      status: "all",
      source: "all",
      queue: "all",
      treatmentContains: "",
      followUpHours: 721,
    }).success,
    false,
  );
});
test("reply interpolation keeps missing variables visible and does not use prototype values", () => {
  assert.deepEqual(
    renderReply("Hi {{customer_name}}", { customer_name: "Casey" }),
    { body: "Hi Casey", missing: [], complete: true },
  );
  const rendered = renderReply("{{treatment}} / {{toString}}", {
    treatment: "未有資料",
  });
  assert.equal(rendered.complete, false);
  assert.deepEqual(rendered.missing, ["treatment", "toString"]);
});
