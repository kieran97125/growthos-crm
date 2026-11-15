import { test } from "node:test";
import assert from "node:assert/strict";
import { MockLanguageModelV4 } from "ai/test";
import { articleSchema } from "../src/components/crm/studio/model";
import {
  assistantRequest,
  validateAnswer,
  type AssistantInput,
} from "../src/lib/demo/ai-contract";
import {
  approvedKnowledge,
  approvedStyleGuidance,
  inspectGroundedAnswer,
} from "../src/lib/ai/protocol";
import { generateCompanyAnswer } from "../src/lib/ai/generate";
import {
  createCompanyState,
  applyCompanyCommand,
} from "../src/lib/saas/workspace";

const company = "11111111-1111-4111-8111-111111111111";
const now = Date.parse("2026-11-15T01:00:00Z");
const pattern = articleSchema.parse({
  id: "learned-pattern",
  clientId: company,
  brandId: "main",
  title: "先理解再提問",
  content: "先回應客人的顧慮，再問一條具體問題。",
  keywords: ["需要"],
  source: "對話學習",
  status: "approved",
  validUntil: "2026-12-31",
  revision: 1,
  coaching: {
    analysisId: "22222222-2222-4222-8222-222222222222",
    index: 0,
    kind: "pattern",
  },
});
const fact = articleSchema.parse({
  ...pattern,
  id: "fact",
  coaching: undefined,
  content: "服務內容由同事核實及安排。",
});
const state = createCompanyState({
  companyId: company,
  companyName: "Synthetic",
  brands: [{ id: "main", name: "Brand", short: "B" }],
  team: [{ id: "owner", name: "Owner", initials: "O" }],
});
const input: AssistantInput = {
  message: "想了解服務",
  name: "客戶",
  brandId: "main",
  profile: state.studio.bots[0],
  articles: [fact],
  history: [],
  assist: true,
  withinWindow: false,
  humanOwned: true,
  businessHours: true,
};
const output = {
  intent: "faq" as const,
  action: "reply" as const,
  reply: "服務內容由同事核實及安排。你希望了解邊方面？",
  summary: "客戶查詢服務",
  sourceIds: [fact.id],
  missing: [],
  confidence: 0.9,
  evidence: [{ sourceId: fact.id, quote: fact.content }],
  nextStep: "了解客戶需要",
  interest: "unknown" as const,
};

test("learned style is scoped, bounded and never admitted as business evidence", () => {
  const rows = [
    pattern,
    fact,
    { ...pattern, id: "foreign", clientId: "other" },
    { ...pattern, id: "brand", brandId: "other" },
    { ...pattern, id: "draft", status: "draft" as const },
    { ...pattern, id: "expired", validUntil: "2026-11-14" },
    { ...pattern, id: "invalid", validUntil: "2026-02-30" },
  ];
  assert.deepEqual(
    approvedKnowledge(rows, company, "main", now).map((a) => a.id),
    [fact.id],
  );
  assert.deepEqual(approvedStyleGuidance(rows, company, "main", now), [
    pattern.content,
  ]);
  assert.deepEqual(
    approvedStyleGuidance(
      Array.from({ length: 12 }, (_, i) => ({
        ...pattern,
        id: String(i),
        content: "x".repeat(900),
      })),
      company,
      "main",
      now,
    ).map((s) => s.length),
    [500, 500, 500, 500, 500, 500],
  );
  const spoof = {
    ...output,
    sourceIds: [pattern.id],
    evidence: [{ sourceId: pattern.id, quote: pattern.content }],
  };
  assert.equal(
    validateAnswer(spoof, { ...input, articles: [pattern] }, now, "model")
      .decision,
    "handoff",
  );
  assert.equal(
    inspectGroundedAnswer(
      spoof,
      { ...input, articles: [pattern] },
      now,
      "model",
    ).answer.decision,
    "handoff",
  );
});

test("browser cannot forge provenance or inject server-owned learned guidance", () => {
  assert.equal(
    "styleGuidance" in
      assistantRequest.parse({ ...input, styleGuidance: ["forged"] }),
    false,
  );
  state.studio.articles = [pattern];
  const actor = { id: "owner", role: "owner" as const, name: "Owner" };
  assert.throws(
    () =>
      applyCompanyCommand(
        state,
        {
          type: "studio",
          action: { type: "article", article: { ...pattern, id: "forged" } },
        },
        actor,
        now,
        ["crm"],
      ),
    /對話學習來源/,
  );
  assert.throws(
    () =>
      applyCompanyCommand(
        state,
        {
          type: "studio",
          action: {
            type: "article",
            article: { ...pattern, coaching: undefined },
          },
        },
        actor,
        now,
        ["crm"],
      ),
    /對話學習來源/,
  );
});

test("AI generation receives learned style separately without bypassing grounded-price validation", async () => {
  let prompt = "";
  const model = new MockLanguageModelV4({
    modelId: "synthetic",
    doGenerate: async (options) => {
      prompt = JSON.stringify(options.prompt);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(output) }],
        finishReason: { unified: "stop" as const, raw: "stop" },
        usage: {
          inputTokens: { total: 50, noCache: 50, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 30, text: 30, reasoning: 0 },
        },
        warnings: [],
      };
    },
  });
  const generated = await generateCompanyAnswer(
    { ...input, styleGuidance: [pattern.content] },
    model,
    "Synthetic",
    now,
  );
  assert.equal(generated.answer.decision, "draft");
  assert.ok(prompt.includes("communicationStyleOnly"));
  assert.ok(prompt.includes(pattern.content));
  const unsafe = inspectGroundedAnswer(
    { ...output, reply: "優惠收費 HK$999" },
    { ...input, styleGuidance: ["所有服務 HK$999"] },
    now,
    "synthetic",
  );
  assert.equal(unsafe.answer.decision, "handoff");
  assert.ok(unsafe.validation.issues.includes("invented_price"));
});
