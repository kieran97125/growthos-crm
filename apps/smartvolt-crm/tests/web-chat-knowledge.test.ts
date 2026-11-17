import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chatSettingsAction } from "../src/lib/web-chat/model";
import { retrieveKnowledge } from "../src/lib/ai/protocol";

test("the reported 35-article settings command is accepted across the API boundary", () => {
  assert.equal(
    chatSettingsAction.safeParse({
      action: "save",
      commandId: randomUUID(),
      id: randomUUID(),
      revision: 1,
      brandId: "main",
      name: "Merchant",
      greeting: "Hello",
      origins: ["https://merchant.example.org"],
      enabled: false,
      aiEnabled: true,
      aiArticleIds: Array.from({ length: 35 }, (_, i) => `public-${i}`),
    }).success,
    true,
  );
});

test("automatic mode needs no article-ID checklist and retrieval reaches article 35 within its prompt budget", () => {
  assert.equal(
    chatSettingsAction.safeParse({
      action: "save",
      commandId: randomUUID(),
      id: randomUUID(),
      revision: 1,
      brandId: "main",
      name: "Merchant",
      greeting: "Hello",
      origins: ["https://merchant.example.org"],
      enabled: false,
      aiEnabled: true,
      aiKnowledgeMode: "brand_public",
    }).success,
    true,
  );
  const pool = Array.from({ length: 35 }, (_, i) => ({
    id: `public-${i}`,
    clientId: "company",
    brandId: "main",
    title: `Answer ${i}`,
    content: "a".repeat(2000),
    keywords: [`topic-${i}-token`],
    source: "Website",
    status: "approved" as const,
    validUntil: "9999-12-31",
    revision: 1,
  }));
  const selected = retrieveKnowledge(pool, "topic-34-token");
  assert.equal(selected[0].id, "public-34");
  assert.ok(selected.length <= 12);
  assert.ok(selected.reduce((n, a) => n + a.content.length, 0) <= 16000);
});
