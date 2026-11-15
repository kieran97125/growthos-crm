import { test } from "node:test";
import assert from "node:assert/strict";
import type { Article } from "../src/components/crm/studio/model";
import {
  commandSchema,
  type CoachingMessage,
  type CoachingOutput,
} from "../src/lib/coaching/model";
import {
  inspectCoachingOutput,
  sanitizeLearningText,
  validateAdoption,
} from "../src/lib/coaching/protocol";

const articles: Article[] = [
  {
    id: "facts",
    clientId: "synthetic-company",
    brandId: "synthetic-brand",
    title: "服務資料",
    content: "護理收費 HK$480。每次護理前由同事了解客人需要。",
    keywords: ["護理"],
    source: "Synthetic approved facts",
    status: "approved",
    validUntil: "2027-01-01",
    revision: 1,
  },
  {
    id: "hours",
    clientId: "synthetic-company",
    brandId: "synthetic-brand",
    title: "營業資料",
    content: "本店星期六休息。",
    keywords: ["時間"],
    source: "Synthetic approved hours",
    status: "approved",
    validUntil: "2027-01-01",
    revision: 1,
  },
];
const messages: CoachingMessage[] = [
  {
    id: "incoming-1",
    direction: "incoming",
    body: "價錢有啲貴，我要諗吓。",
    at: 1,
  },
  {
    id: "outgoing-1",
    direction: "outgoing",
    body: "明白，想了解你最關心邊方面？",
    at: 2,
  },
];
const source = { messageId: messages[0].id, quote: "價錢有啲貴" };
const staff = { messageId: messages[1].id, quote: "想了解你最關心邊方面" };
const fact = { sourceId: articles[0].id, quote: "護理收費 HK$480。" };
function candidate(): CoachingOutput {
  return {
    nextAction: {
      title: "了解客人顧慮",
      reason: "客人有價格顧慮，先了解需要。",
      missingFields: ["主要需要"],
      suggestedReply: "想了解你最關心邊方面？",
      evidence: [source],
      knowledgeEvidence: [],
    },
    quality: {
      status: "reviewed",
      findings: [
        {
          code: "no_next_step",
          title: "可以再了解需要",
          detail: "跟進主要需要。",
          suggestion: "問一條開放式問題。",
          severity: "suggestion",
          evidence: [staff],
        },
      ],
      lossReason: {
        code: "price",
        label: "untrusted model label",
        evidence: [source],
      },
    },
    learning: [
      {
        kind: "pattern",
        title: "先理解需要",
        question: "如何跟進顧慮？",
        content: "先回應客人顧慮，再問一條開放式問題。",
        evidence: [staff],
        knowledgeEvidence: [],
      },
    ],
  };
}
const options = {
  verifiedBooking: false,
  truncated: false,
  privateNames: ["Janet"],
};

test("coaching rejects invented, foreign and paraphrased message evidence", () => {
  for (const evidence of [
    { ...source, messageId: "foreign-thread-message" },
    { ...source, quote: "客人認為便宜" },
    { ...source, quote: "價錢有些貴" },
  ]) {
    const raw = candidate();
    raw.nextAction.evidence = [evidence];
    assert.throws(
      () => inspectCoachingOutput(raw, messages, articles, options),
      /invalid_evidence/,
    );
  }
});

test("loss remains a customer concern and cannot be inferred only from staff opinion", () => {
  const raw = candidate();
  raw.quality.lossReason.evidence = [staff];
  assert.deepEqual(
    inspectCoachingOutput(raw, messages, articles, options).quality.lossReason,
    { code: "unknown", label: "未能判斷", evidence: [] },
  );
  assert.equal(
    inspectCoachingOutput(candidate(), messages, articles, options).quality
      .lossReason.label,
    "價格顧慮",
  );
});

test("a thread with no staff reply cannot be marked as reviewed service quality", () => {
  const raw = candidate();
  raw.quality.findings[0].evidence = [source];
  raw.learning = [];
  const result = inspectCoachingOutput(
    raw,
    messages.slice(0, 1),
    articles,
    options,
  );
  assert.equal(result.quality.status, "insufficient");
  assert.deepEqual(result.quality.findings, []);
});

test("unapproved amounts, URLs and booking claims are withheld from the reply draft", () => {
  for (const text of [
    "只需 HK$1。",
    "已為你預約，保證有位。",
    "詳情 https://unapproved.invalid",
  ]) {
    const raw = candidate();
    raw.nextAction.suggestedReply = text;
    raw.nextAction.knowledgeEvidence = [fact];
    assert.equal(
      inspectCoachingOutput(raw, messages, articles, options).nextAction
        .suggestedReply,
      "",
    );
  }
});

test("personal names are detected case-insensitively after Unicode normalization", () => {
  assert.equal(
    sanitizeLearningText("先了解 JANET 嘅需要。", ["Janet"]),
    "先了解 [客戶] 嘅需要。",
  );
  const raw = candidate();
  raw.learning[0].content = "先了解 ＪＡＮＥＴ 嘅需要。";
  assert.deepEqual(
    inspectCoachingOutput(raw, messages, articles, options).learning,
    [],
  );
});

test("a reusable pattern cannot hide business policy in its title or question", () => {
  for (const patch of [
    { title: "護理只需 HK$9" },
    { title: "保證有效嘅話術" },
    { question: "療效保證係咩？" },
  ]) {
    const raw = candidate();
    Object.assign(raw.learning[0], patch);
    assert.deepEqual(
      inspectCoachingOutput(raw, messages, articles, options).learning,
      [],
    );
  }
});

test("adopted factual excerpts must be supported by their cited source, not an unrelated article", () => {
  const item = {
    ...candidate().learning[0],
    kind: "answer" as const,
    content: articles[1].content,
    knowledgeEvidence: [fact],
  };
  assert.throws(
    () => validateAdoption(item, "營業資料", item.content, articles, []),
    /knowledge|source|answer/,
  );
});

test("knowledge gaps and ungrounded factual edits cannot become approved learned facts", () => {
  const item = candidate().learning[0];
  assert.throws(
    () =>
      validateAdoption(
        { ...item, kind: "gap" },
        item.title,
        item.content,
        articles,
        [],
      ),
    /gap_not_publishable/,
  );
  const answer = {
    ...item,
    kind: "answer" as const,
    content: fact.quote,
    knowledgeEvidence: [fact],
  };
  assert.doesNotThrow(() =>
    validateAdoption(answer, "護理資料", fact.quote, articles, []),
  );
  assert.throws(() =>
    validateAdoption(answer, "護理資料", "護理收費 HK$1。", articles, []),
  );
  assert.doesNotThrow(() =>
    validateAdoption(item, item.title, item.content, articles, []),
  );
});

test("browser commands carry only stored references and cannot supply authoritative evidence", () => {
  const request = {
    type: "analyze",
    requestId: "11111111-1111-4111-8111-111111111111",
    brandId: "synthetic-brand",
    source: "conversation",
    sourceId: "thread-1",
  };
  assert.equal(commandSchema.safeParse(request).success, true);
  for (const extra of [
    { transcript: messages },
    { articles },
    { verifiedBooking: true },
    { actorId: "spoof" },
    { sourceRevision: 0 },
  ]) {
    assert.equal(
      commandSchema.safeParse({ ...request, ...extra }).success,
      false,
    );
  }
});
