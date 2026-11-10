import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createStudioState } from "../src/components/crm/studio/model";
import {
  validateAnswer,
  type AssistantInput,
} from "../src/lib/demo/ai-contract";
import {
  validCode,
  sameOrigin,
  issueSession,
  readSession,
  acceptRequest,
} from "../src/lib/demo/access";
const now = Date.UTC(2026, 10, 10, 5),
  s = createStudioState();
const input: AssistantInput = {
  message: "舒緩護理幾錢？",
  name: "測試客",
  brandId: "nova-studio",
  profile: s.bots[0],
  articles: s.articles,
  history: [],
  withinWindow: true,
  humanOwned: false,
  businessHours: true,
  assist: true,
};
const a = s.articles.find(
  (a) =>
    a.brandId === "nova-studio" &&
    a.status === "approved" &&
    a.content.includes("480"),
)!;
const output = {
  intent: "faq" as const,
  action: "reply" as const,
  reply: "舒緩護理示範收費 HK$480。",
  summary: "查詢收費",
  sourceIds: [a.id],
  missing: [],
  confidence: 0.9,
};
test("grounded live answer is a staff draft with source revision", () => {
  const r = validateAnswer(output, input, now, "model");
  assert.equal(r.engine, "ai");
  assert.equal(r.decision, "draft");
  assert.equal(r.sources[0].revision, a.revision);
});
test("AI refuses invented price, confirmation, low confidence, unknown or foreign sources", () => {
  for (const patch of [
    { reply: "只需 HK$1。" },
    { reply: "預約已確認。" },
    { confidence: 0.2 },
    { sourceIds: ["not-found"] },
    { sourceIds: [] },
    { sourceIds: [s.articles.find((a) => a.brandId === "nova-care")!.id] },
  ])
    assert.equal(
      validateAnswer({ ...output, ...patch }, input, now, "model").decision,
      "handoff",
    );
});
test("expired knowledge is unavailable to live answer validation", () => {
  assert.equal(
    validateAnswer(
      output,
      {
        ...input,
        articles: input.articles.map((a) => ({
          ...a,
          validUntil: "2025-01-01",
        })),
      },
      now,
      "model",
    ).decision,
    "handoff",
  );
});
test("a cited FAQ in bounded mode can reply only inside the demo", () => {
  assert.equal(
    validateAnswer(
      output,
      {
        ...input,
        assist: false,
        profile: { ...input.profile, mode: "bounded" },
      },
      now,
      "model",
    ).decision,
    "auto-demo",
  );
});
test("AI session signature, expiry and code checking", () => {
  process.env.DEMO_ACCESS_CODE = randomUUID();
  assert.equal(validCode("wrong"), false);
  assert.equal(validCode(process.env.DEMO_ACCESS_CODE), true);
  const t = issueSession(now);
  assert.ok(readSession(t, now));
  assert.equal(readSession(t + "x", now), null);
  assert.equal(readSession(t, now + 3600001), null);
  delete process.env.DEMO_ACCESS_CODE;
  assert.equal(readSession(t, now), null);
});
test("per-instance request limiter bounds repeated calls", () => {
  const id = randomUUID();
  for (let i = 0; i < 12; i++) assert.equal(acceptRequest(id, now), true);
  assert.equal(acceptRequest(id, now), false);
  assert.equal(acceptRequest(id, now + 60001), true);
});

test("origin validation uses request host and rejects foreign/missing origins", () => {
  const req = (origin: string | null) =>
    new Request("http://localhost:3038/api/assistant", {
      headers: { host: "127.0.0.1:3038", ...(origin ? { origin } : {}) },
    });
  assert.equal(sameOrigin(req("http://127.0.0.1:3038")), true);
  assert.equal(sameOrigin(req("https://evil.example")), false);
  assert.equal(sameOrigin(req(null)), false);
});
