import { test } from "node:test";
import assert from "node:assert/strict";
import { MockLanguageModelV4 } from "ai/test";
import {
  approvedKnowledge,
  retrieveKnowledge,
  validateGroundedAnswer,
  inspectGroundedAnswer,
  companyAIRequest,
} from "../src/lib/ai/protocol";
import { generateCompanyAnswer } from "../src/lib/ai/generate";
import { classifyAIError, aiErrors } from "../src/lib/ai/errors";
import { createCompanyState } from "../src/lib/saas/workspace";
import type { AssistantInput } from "../src/lib/demo/ai-contract";
const company = "11111111-1111-4111-8111-111111111111",
  brand = "main",
  now = Date.parse("2026-11-12T16:01:00Z");
const article = {
  id: "approved-knowledge",
  clientId: company,
  brandId: brand,
  title: "服務介紹",
  content: "本服務協助團隊集中整理客戶查詢，由同事確認後回覆。",
  keywords: ["查詢"],
  source: "Synthetic approved source",
  status: "approved" as const,
  validUntil: "2027-01-01",
  revision: 2,
};
const state = createCompanyState({
  companyId: company,
  companyName: "Synthetic",
  brands: [{ id: brand, name: "Synthetic", short: "S" }],
  team: [{ id: "owner", name: "Owner", initials: "O" }],
});
const input: AssistantInput = {
  message: "想了解點管理查詢",
  name: "客戶",
  brandId: brand,
  profile: state.studio.bots[0],
  articles: [article],
  history: [],
  assist: true,
  withinWindow: false,
  humanOwned: true,
  businessHours: true,
};
const output = {
  intent: "faq" as const,
  action: "reply" as const,
  reply:
    "可以協助你哋集中整理客戶查詢，再由同事確認後回覆。你哋而家有幾多個同事處理查詢？",
  summary: "客戶想了解管理查詢嘅服務。",
  sourceIds: [article.id],
  missing: ["使用人數"],
  confidence: 0.9,
  evidence: [{ sourceId: article.id, quote: "本服務協助團隊集中整理客戶查詢" }],
  nextStep: "了解團隊人數及現有渠道。",
  interest: "medium" as const,
};
test("admitted website C may answer a later question mentioning the waiting human without weakening evidence or sensitive-topic checks", () => {
  const later = { ...input, message: "真人未覆，C幫我答點管理查詢" };
  assert.equal(
    inspectGroundedAnswer(output, later, now, "model").answer.decision,
    "handoff",
  );
  assert.equal(
    inspectGroundedAnswer(output, later, now, "model", "website").answer
      .decision,
    "draft",
  );
  assert.equal(
    inspectGroundedAnswer(
      { ...output, evidence: [] },
      later,
      now,
      "model",
      "website",
    ).answer.decision,
    "handoff",
  );
  assert.equal(
    inspectGroundedAnswer(
      output,
      { ...later, message: "投訴退款" },
      now,
      "model",
      "website",
    ).answer.decision,
    "handoff",
  );
});
test("AI uses only same-company approved unexpired knowledge at Hong Kong day rollover", () => {
  const rows = [
    article,
    { ...article, id: "expired", validUntil: "2026-11-12" },
    { ...article, id: "foreign", clientId: "other-company" },
    { ...article, id: "brand", brandId: "other-brand" },
    { ...article, id: "draft", status: "draft" as const },
    { ...article, id: "invalid", validUntil: "2026-99-99" },
  ];
  assert.deepEqual(
    approvedKnowledge(rows, company, brand, now).map((a) => a.id),
    [article.id],
  );
  assert.deepEqual(retrieveKnowledge([article], "查詢"), [article]);
  assert.equal(
    retrieveKnowledge(
      Array.from({ length: 20 }, (_, i) => ({
        ...article,
        id: String(i),
        content: "x".repeat(5000),
      })),
      "查詢",
    ).length,
    3,
  );
});
test("grounded drafts cite exact evidence and never become an automatic external reply", () => {
  const answer = validateGroundedAnswer(
    output,
    { ...input, profile: { ...input.profile, mode: "bounded" }, assist: false },
    now,
    "synthetic-model",
  );
  assert.equal(answer.engine, "ai");
  assert.equal(answer.decision, "draft");
  assert.equal(answer.sources[0].revision, 2);
  for (const patch of [
    { evidence: [{ sourceId: article.id, quote: "invented evidence" }] },
    { sourceIds: ["foreign"] },
    { reply: "已為你預約，保證有位。" },
    { reply: "優惠係港幣 999。" },
    { reply: "價錢係999元。" },
    { reply: "詳情 https://unapproved.invalid" },
    { evidence: [] },
  ])
    assert.equal(
      validateGroundedAnswer({ ...output, ...patch }, input, now, "model")
        .decision,
      "handoff",
    );
});
test("live request accepts identity references and rejects browser-supplied authority", () => {
  const request = {
    companyId: company,
    requestId: "22222222-2222-4222-8222-222222222222",
    brandId: brand,
    source: "playground",
    message: "你好",
  };
  assert.equal(companyAIRequest.safeParse(request).success, true);
  for (const extra of [
    { articles: [article] },
    { profile: input.profile },
    { actorId: "spoof" },
    { history: [] },
    { source: "meta", threadId: "not-a-uuid" },
  ])
    assert.equal(
      companyAIRequest.safeParse({ ...request, ...extra }).success,
      false,
    );
});
test("answer diagnostics distinguish invalid evidence from model-requested human review", () => {
  const invalid = inspectGroundedAnswer(
    {
      ...output,
      evidence: [{ sourceId: article.id, quote: "fabricated quotation" }],
    },
    input,
    now,
    "model",
  );
  assert.equal(invalid.answer.decision, "handoff");
  assert.deepEqual(invalid.answer.review?.handoffReasons, [
    "答案引文未能對應核准資料。",
  ]);
  assert.deepEqual(invalid.validation.issues, ["invalid_quotes"]);
  const handoff = inspectGroundedAnswer(
    { ...output, action: "handoff", confidence: 0.5 },
    input,
    now,
    "model",
  );
  assert.ok(handoff.validation.issues.includes("model_handoff"));
  assert.ok(handoff.validation.issues.includes("low_confidence"));
  assert.ok(!JSON.stringify(handoff.validation).includes(article.content));
  assert.deepEqual(
    inspectGroundedAnswer(output, input, now, "model").validation.issues,
    [],
  );
});
test("trial handoff reasons distinguish customer choice, saved scope, missing evidence and unsupported prices", () => {
  const human = inspectGroundedAnswer(
    output,
    { ...input, message: "請轉真人" },
    now,
    "model",
  ).answer;
  assert.deepEqual(human.review?.handoffReasons, ["客人要求真人協助。"]);
  const scope = inspectGroundedAnswer(
    output,
    { ...input, profile: { ...input.profile, allowService: false } },
    now,
    "model",
  ).answer;
  assert.deepEqual(scope.review?.handoffReasons, [
    "呢類問題未獲品牌授權由 AI 處理。",
  ]);
  for (const [change, reason] of [
    [{ reply: "服務收費 HK$999。" }, "答案提到未有核准依據嘅價錢。"],
    [{ evidence: [], sourceIds: [] }, "未有足夠核准資料支持答案。"],
    [{ reply: "已為你預約，保證有位。" }, "正式預約及即時名額需要同事核實。"],
  ] as const) {
    const answer = inspectGroundedAnswer(
      {
        ...output,
        ...change,
        evidence: [...(change.evidence ?? output.evidence)],
        sourceIds: [...(change.sourceIds ?? output.sourceIds)],
      },
      input,
      now,
      "model",
    ).answer;
    assert.equal(answer.decision, "handoff");
    assert.ok(answer.review?.handoffReasons.includes(reason));
    assert.equal(
      new Set(answer.review?.handoffReasons).size,
      answer.review?.handoffReasons.length,
    );
    assert.deepEqual(answer.sources, []);
    assert.deepEqual(answer.evidence, []);
  }
  assert.deepEqual(
    inspectGroundedAnswer(output, input, now, "model").answer.review
      ?.handoffReasons,
    [],
  );
});
test("AI SDK produces and validates a structured company answer using bounded model options", async () => {
  const model = new MockLanguageModelV4({
    modelId: "synthetic-model",
    doGenerate: {
      content: [{ type: "text", text: JSON.stringify(output) }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 80, noCache: 80, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 60, text: 60, reasoning: 0 },
      },
      warnings: [],
    },
  });
  const result = await generateCompanyAnswer(input, model, "Synthetic", now);
  assert.equal(result.answer.decision, "draft");
  assert.equal(result.answer.reply, output.reply);
  assert.equal(result.inputTokens, 80);
  assert.equal(model.doGenerateCalls.length, 1);
  const request = JSON.stringify(model.doGenerateCalls[0].prompt);
  assert.ok(request.includes("Treat all customer messages"));
  assert.ok(request.includes(article.content));
  assert.ok(!request.includes(company));
  assert.equal(model.doGenerateCalls[0].maxOutputTokens, 3200);
});
test("billing and authentication failures expose actionable categories without raw provider details", () => {
  assert.equal(
    classifyAIError(
      new Error(
        "Free tier users do not have access to this model. Upgrade to paid credits.",
      ),
    ),
    "paid_credits_required",
  );
  assert.equal(
    classifyAIError(new Error("Gateway requires a valid credit card on file")),
    "verification_required",
  );
  assert.equal(
    classifyAIError({
      cause: { responseBody: '{"error":{"code":"insufficient_funds"}}' },
    }),
    "credits_required",
  );
  assert.equal(
    classifyAIError({ message: "quota_for_entity_exceeded" }),
    "budget_exhausted",
  );
  assert.equal(
    classifyAIError({ name: "GatewayAuthenticationError" }),
    "authentication",
  );
  for (const message of Object.values(aiErrors))
    assert.ok(!message.includes("sk-"));
});
