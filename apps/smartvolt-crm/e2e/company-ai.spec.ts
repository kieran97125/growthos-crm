import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { BRAND_CSS } from "../src/lib/brand";
const companyId = "11111111-1111-4111-8111-111111111111";
const status = {
  companyName: "Synthetic company",
  model: "synthetic/model",
  status: "ready",
  enabled: true,
  canGenerate: true,
  canConfigure: true,
  brands: [{ id: "main", name: "Synthetic brand", knowledgeCount: 1 }],
  usage: { used: 0, limit: 30 },
  knowledge: [
    {
      id: "source-1",
      brandId: "main",
      title: "核准服務介紹",
      status: "approved",
      revision: 2,
      validUntil: "2027-01-01",
      source: "Synthetic approved source",
    },
  ],
  blocker: null,
  checkedAt: "2026-11-12T14:00:00Z",
};
const answer = {
  engine: "ai",
  model: "synthetic/model",
  intent: "faq",
  decision: "draft",
  reply: "可以先了解你哋嘅查詢渠道同團隊安排，再準備適合嘅方案。",
  reason: "已根據核准資料準備建議，由同事確認後傳送。",
  summary: "客戶想集中處理團隊查詢。",
  sources: [
    {
      id: "source-1",
      title: "核准服務介紹",
      revision: 2,
      source: "Synthetic approved source",
    },
  ],
  missing: ["團隊人數"],
  nextStep: "了解現有渠道及使用人數。",
  interest: "medium",
  evidence: [{ sourceId: "source-1", quote: "服務協助團隊集中處理客戶查詢。" }],
};
let bundle = "";
test.beforeAll(async () => {
  const r = await build({
    stdin: {
      contents: `import React from 'react';import{createRoot}from'react-dom/client';import Studio from './src/components/ai/AIStudio';createRoot(document.getElementById('fixture')).render(React.createElement(Studio,{companyId:${JSON.stringify(companyId)},initialStatus:window.__aiStatus}));`,
      loader: "tsx",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    define: {
      "process.env": JSON.stringify({
        NODE_ENV: "test",
        __NEXT_ROUTER_BASEPATH: "",
      }),
    },
  });
  bundle = r.outputFiles[0].text;
});
async function mount(
  page: Page,
  post: (route: Route, body: Record<string, unknown>) => Promise<void>,
  initial = structuredClone(status),
) {
  await page.route(
    "**/__ai_fixture__",
    (r) =>
      r.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html><body></body></html>",
      }),
    { times: 1 },
  );
  await page.route("**/api/assistant", (r) =>
    post(r, r.request().postDataJSON()),
  );
  await page.route("**/api/ai/status**", (r) => r.fulfill({ json: initial }));
  await page.goto("/__ai_fixture__");
  const vars = Object.entries(BRAND_CSS)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
  await page.setContent(
    `<!doctype html><html lang="zh-HK"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated company AI acceptance</title><style>:root{${vars}}body{margin:0}${readFileSync("src/components/translation/translation.css", "utf8")}${readFileSync("src/components/ai/ai.css", "utf8")}</style></head><body><div id="fixture"></div><script>window.__aiStatus=${JSON.stringify(initial)}</script></body></html>`,
  );
  await page.addScriptTag({ content: bundle });
}
for (const [name, width, height] of [
  ["desktop", 1440, 1000],
  ["mobile", 390, 844],
] as const) {
  test(`company AI ${name} renders grounded drafts without sending a customer message`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height });
    const attempts: Record<string, unknown>[] = [];
    await mount(page, async (r, b) => {
      attempts.push(b);
      await r.fulfill({ json: answer });
    });
    await page
      .getByLabel("客戶想問乜？")
      .fill("幾個同事分開覆查詢，想集中管理。");
    await page
      .getByRole("button", { name: "準備 AI 回覆建議", exact: true })
      .click();
    await expect(page.getByText(answer.reply, { exact: true })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("未向客戶發送");
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      companyId,
      brandId: "main",
      source: "playground",
    });
    expect(attempts[0]).not.toHaveProperty("articles");
    expect(attempts[0].requestId).toMatch(/^[a-f0-9-]{36}$/);
    await expect(page.getByText(answer.evidence[0].quote)).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`company-ai-${name}.png`),
      fullPage: true,
    });
  });
}
test("lost AI response preserves the same request and locks its input until reconciliation", async ({
  page,
}) => {
  const attempts: Record<string, unknown>[] = [];
  await mount(page, async (r, b) => {
    attempts.push(b);
    if (attempts.length === 1) return r.abort("failed");
    await r.fulfill({ json: answer });
  });
  await page.getByLabel("客戶想問乜？").fill("想了解集中管理訊息");
  await page
    .getByRole("button", { name: "準備 AI 回覆建議", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "核對 AI 結果" }),
  ).toBeEnabled();
  await expect(page.getByLabel("客戶想問乜？")).toBeDisabled();
  await page.getByRole("button", { name: "核對 AI 結果" }).click();
  expect(attempts[1]).toEqual(attempts[0]);
  await expect(page.getByLabel("客戶想問乜？")).toBeEnabled();
});
test("a provider billing failure is actionable and never presents a simulated answer as live", async ({
  page,
}) => {
  await mount(page, async (r) => {
    await r.fulfill({
      status: 503,
      json: {
        error: "Vercel 需要先驗證帳戶付款方式，先可以使用 AI 模型。",
        code: "verification_required",
      },
    });
  });
  await page.getByLabel("客戶想問乜？").fill("你好");
  await page
    .getByRole("button", { name: "準備 AI 回覆建議", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("驗證帳戶付款方式");
  await expect(page.locator(".ai-generated")).toHaveCount(0);
  await expect(page.getByLabel("客戶想問乜？")).toBeEnabled();
});
test("viewers can inspect AI knowledge and readiness without generating or enabling AI", async ({
  page,
}) => {
  const initial = structuredClone(status);
  initial.canGenerate = false;
  initial.canConfigure = false;
  await mount(
    page,
    async () => {
      throw new Error("Viewer must not generate");
    },
    initial,
  );
  await page.getByLabel("客戶想問乜？").fill("測試");
  await expect(
    page.getByRole("button", { name: "準備 AI 回覆建議", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "暫停公司 AI" })).toHaveCount(
    0,
  );
});
