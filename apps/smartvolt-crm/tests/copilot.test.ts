import { test } from "node:test";
import { MockLanguageModelV4 } from "ai/test";
import { zodSchema } from "ai";
import assert from "node:assert/strict";
import { observations, factsFor } from "../src/lib/copilot/observations";
import {
  snapshotSchema,
  outputSchema,
  type Snapshot,
  type CopilotContext,
} from "../src/lib/copilot/model";
import {
  validateCopilotOutput,
  generateCopilot,
} from "../src/lib/copilot/generate";
import { companyAIRequest } from "../src/lib/ai/protocol";
const now = Date.UTC(2026, 10, 13, 8),
  context: CopilotContext = {
    product: "crm",
    section: "inbox",
    customerId: "c1",
    brandId: "main",
    activity: "tagging",
  };
const snapshot: Snapshot = snapshotSchema.parse({
  at: new Date(now).toISOString(),
  from: new Date(now - 90 * 86400000).toISOString(),
  product: "crm",
  brandId: "main",
  revision: 4,
  brands: [{ id: "main", name: "Synthetic" }],
  customers: 100,
  inquiries: 100,
  confirmed: 30,
  overdue: 4,
  dormant: 20,
  untagged: 3,
  segments: [
    { key: "tag:interested", label: "Interested", leads: 25, booked: 24 },
  ],
  pos: null,
  customer: {
    id: "c1",
    tags: [],
    revision: 2,
    lastMessage: "我想預約星期六，幾時有位？",
    lastMessageAt: now,
    booked: false,
  },
  knowledge: [],
  channels: { connected: 0 },
  lastBroadcastAt: null,
  broadcastCoverage: "unavailable",
});
test("C's provider-facing structured output requires every declared field", async () => {
  const schema = await zodSchema(outputSchema).jsonSchema;
  function check(value: unknown, path: string) {
    if (Array.isArray(value)) {
      value.forEach((item, i) => check(item, `${path}[${i}]`));
      return;
    }
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    if (node.type === "object" && node.properties) {
      assert.deepEqual(
        [...((node.required as string[] | undefined) ?? [])].sort(),
        Object.keys(node.properties).sort(),
        `${path}: strict provider schemas require all fields, including empty evidence`,
      );
      assert.equal(node.additionalProperties, false, path);
    }
    for (const [key, child] of Object.entries(node))
      check(child, `${path}.${key}`);
  }
  check(schema, "C output");
});
test("C proposes a grounded tag at the point of work, without asserting a booking", () => {
  const list = observations(snapshot, context, [], now);
  assert.equal(list[0].kind, "tag");
  assert.equal(list[0].action.kind, "tag");
  assert(
    list[0].evidence.some((e) => e.includes(snapshot.customer!.lastMessage)),
  );
  assert(!list[0].detail.includes("已預約"));
  assert.equal(
    observations(
      { ...snapshot, customer: { ...snapshot.customer!, tags: ["預約意向"] } },
      context,
      [],
      now,
    ).some((o) => o.kind === "tag"),
    false,
  );
});
test("dismissal, acceptance, snooze and quiet memory survive changed metric fingerprints", () => {
  const signal = observations(snapshot, context, [], now)[0];
  for (const status of ["dismissed", "accepted", "snoozed"] as const) {
    const feedback = {
      signal_key: signal.key,
      family: signal.family,
      subject: signal.subject,
      status,
      until: new Date(now + 86400000).toISOString(),
    };
    assert(
      !observations(
        { ...snapshot, customer: { ...snapshot.customer!, revision: 3 } },
        context,
        [feedback],
        now,
      ).some((o) => o.family === signal.family),
    );
  }
  assert.equal(
    observations(
      snapshot,
      context,
      [
        {
          signal_key: "quiet",
          family: "quiet",
          subject: "all",
          status: "snoozed",
          until: new Date(now + 1000).toISOString(),
        },
      ],
      now,
    ).length,
    0,
  );
});
test("a high conversion observation needs comparable denominators, enough people and separated uncertainty intervals", () => {
  assert(
    observations(snapshot, context, [], now).some(
      (o) => o.kind === "conversion",
    ),
  );
  for (const seg of [
    { key: "tiny", label: "Tiny", leads: 3, booked: 3 },
    { key: "similar", label: "Similar", leads: 30, booked: 11 },
  ])
    assert(
      !observations({ ...snapshot, segments: [seg] }, context, [], now).some(
        (o) => o.kind === "conversion",
      ),
    );
  assert(
    observations(snapshot, context, [], now)
      .find((o) => o.kind === "conversion")!
      .evidence.some((e) => e.includes("24/25")),
  );
});
test("missing broadcast history is never a claim of inactivity or consent", () => {
  const campaign = observations(snapshot, context, [], now).find(
    (o) => o.kind === "campaign",
  )!;
  assert(campaign.detail.includes("未有完整"));
  assert(campaign.evidence.some((e) => e.includes("同意")));
  assert(!campaign.detail.includes("太耐冇"));
});
test("an empty company gets truthful preparation, and POS facts do not expose unavailable CRM zeros", () => {
  const empty = {
    ...snapshot,
    customers: 0,
    inquiries: 0,
    confirmed: 0,
    overdue: 0,
    dormant: 0,
    segments: [],
    customer: null,
  };
  const list = observations(
    empty,
    { ...context, customerId: undefined },
    [],
    now,
  );
  assert.equal(list.length, 1);
  assert.equal(list[0].kind, "setup");
  assert(list[0].detail.includes("未足夠"));
  const facts = factsFor({
    ...snapshot,
    product: "pos",
    segments: [],
    customer: null,
    pos: { appointments: 4, completed: 2, noShow: 1, revenueCents: 123456 },
  });
  assert(!facts.some((f) => f.id === "conversion"));
  assert(facts.find((f) => f.id === "pos")!.value.includes("HK$1234.56"));
});
test("agent outputs reject invented sources, external URLs, unexecuted claims and substring price matches", () => {
  const facts = [
      {
        id: "k",
        label: "Approved",
        value: "服務收費 HK$1,000",
        source: "approved",
      },
    ],
    output = {
      answer: "我可以先準備 [k]",
      factIds: ["k"],
      evidence: [],
      nextQuestions: [],
      campaign: null,
    };
  assert.equal(validateCopilotOutput(output, facts).answer, output.answer);
  for (const bad of [
    { ...output, factIds: ["unknown"] },
    { ...output, answer: "已為你發送訊息" },
    { ...output, answer: "可用 https://fake.invalid" },
    { ...output, answer: "收費 HK$100" },
  ])
    assert.throws(() => validateCopilotOutput(bad, facts));
});
test("all reply purposes are strict, source-scoped and backwards-compatible with existing requests", () => {
  const input = {
    companyId: "11111111-1111-4111-8111-111111111111",
    requestId: "22222222-2222-4222-8222-222222222222",
    brandId: "main",
    source: "playground",
    message: "幫我了解服務",
  };
  assert.equal(companyAIRequest.parse(input).goal, "answer");
  for (const goal of [
    "answer",
    "book",
    "objection",
    "follow_up",
    "empathy",
    "concise",
  ])
    assert(companyAIRequest.safeParse({ ...input, goal }).success);
  assert(
    !companyAIRequest.safeParse({ ...input, goal: "send_automatically" })
      .success,
  );
});
test("C calls real SDK read tools before producing a bounded structured answer, without write tools", async () => {
  const usage = {
    inputTokens: { total: 80, noCache: 80, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 50, text: 50, reasoning: 0 },
  };
  const model = new MockLanguageModelV4({
    modelId: "synthetic-model",
    doGenerate: [
      {
        content: [
          {
            type: "tool-call",
            toolCallId: "read-1",
            toolName: "readBusinessFacts",
            input: "{}",
          },
        ],
        finishReason: { unified: "tool-calls", raw: "tool_calls" },
        usage,
        warnings: [],
      },
      {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              answer: "可以先由到期查詢開始。[overdue]",
              factIds: ["overdue"],
              evidence: [],
              nextQuestions: ["想先整理跟進次序嗎？"],
              campaign: null,
            }),
          },
        ],
        finishReason: { unified: "stop", raw: "stop" },
        usage,
        warnings: [],
      },
    ],
  });
  const result = await generateCopilot({
    model,
    companyName: "Synthetic",
    context,
    facts: factsFor(snapshot),
    history: [],
    message: "幫我安排下一步",
    searchMemory: async () => ({ messages: [], tasks: [] }),
    readConfiguration: async () => ({
      id: "workspace:team",
      label: "Team",
      value: "No verified shifts",
      source: "synthetic",
    }),
  });
  assert.equal(model.doGenerateCalls.length, 2);
  assert(result.output.answer.includes("到期查詢"));
  assert.equal(result.input, 160);
  const tools = model.doGenerateCalls[0].tools ?? [];
  assert(!tools.some((t) => /send|write|pay|bookSlot/i.test(t.name)));
  assert.equal(model.doGenerateCalls[0].maxOutputTokens, 3600);
});
test("C business citations preserve exact approved quotes and reject invented Chinese prices", () => {
  const facts = [
      {
        id: "knowledge:k",
        label: "Approved",
        value: "服務收費為100港元。詳情 https://example.test",
        source: "approved",
      },
    ],
    output = {
      answer: "服務收費100港元。[knowledge:k]",
      factIds: ["knowledge:k"],
      evidence: [{ factId: "knowledge:k", quote: "服務收費為100港元。" }],
      campaign: null,
      nextQuestions: [],
    };
  assert(validateCopilotOutput(output, facts));
  assert.throws(() =>
    validateCopilotOutput({ ...output, evidence: [] }, facts),
  );
  assert.throws(() =>
    validateCopilotOutput(
      { ...output, answer: "收費10港元。[knowledge:k]" },
      facts,
    ),
  );
  assert.throws(() =>
    validateCopilotOutput(
      { ...output, evidence: [{ factId: "knowledge:k", quote: "另一句話" }] },
      facts,
    ),
  );
  assert(
    validateCopilotOutput(
      { ...output, answer: "詳情 https://example.test。[knowledge:k]" },
      facts,
    ),
  );
});
