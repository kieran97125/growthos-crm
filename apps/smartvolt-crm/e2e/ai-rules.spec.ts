import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { BRAND_CSS } from "../src/lib/brand";
import {
  createCompanyState,
  applyCompanyCommand,
} from "../src/lib/saas/workspace";
import { inspectGroundedAnswer } from "../src/lib/ai/protocol";
import type { Role } from "../src/lib/saas/identity";
const company = "11111111-1111-4111-8111-111111111111";
const actorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let bundle = "";
const css = [
  "src/app/saas.css",
  "src/components/crm/studio/studio.css",
  "src/components/ai/ai.css",
  "src/components/translation/translation.css",
  "src/components/website/website-import.css",
  "src/components/ui/dialog.css",
]
  .map((p) => readFileSync(p, "utf8"))
  .join("\n");
test.beforeAll(async () => {
  bundle = (
    await build({
      stdin: {
        loader: "tsx",
        resolveDir: process.cwd(),
        contents: `import React from'react';import{createRoot}from'react-dom/client';import{CompanyProvider}from'./src/lib/saas/CompanyProvider';import{useStudioStore}from'./src/components/crm/studio/useStudioStore';import{AIProvider}from'./src/lib/demo/AIConnection';import BotStudio from'./src/components/crm/studio/BotStudio';function Workbench(){const studio=useStudioStore(true);return <BotStudio studio={studio} initialTab="settings" initialBrand="main" onInbox={()=>{}}/>}const seed=JSON.parse(document.getElementById('seed').textContent);createRoot(document.getElementById('fixture')).render(<CompanyProvider {...seed} products={['crm']}><AIProvider><div className="fh-app fh-studio-view"><Workbench/></div></AIProvider></CompanyProvider>);`,
      },
      bundle: true,
      write: false,
      platform: "browser",
      format: "iife",
      jsx: "automatic",
      loader: { ".css": "empty" },
      define: {
        "process.env": JSON.stringify({
          NODE_ENV: "test",
          __NEXT_ROUTER_BASEPATH: "",
        }),
      },
    })
  ).outputFiles[0].text;
});
async function mount(
  page: Page,
  { role = "owner", lost = false }: { role?: Role; lost?: boolean } = {},
) {
  const actor = { id: actorId, name: "Synthetic owner", role };
  let state = createCompanyState({
    companyId: company,
    companyName: "Rules · synthetic",
    brands: [
      { id: "main", name: "星藍品牌", short: "S" },
      { id: "other", name: "另一品牌", short: "O" },
    ],
    team: [{ id: actorId, name: actor.name, initials: "S" }],
  });
  state.studio.articles = [
    {
      id: "approved",
      clientId: company,
      brandId: "main",
      title: "已核准服務",
      content: "本品牌提供小組訓練，收費請先由同事確認。",
      keywords: ["服務"],
      source: "Synthetic approved source",
      status: "approved",
      validUntil: "2099-01-01",
      revision: 1,
    },
  ];
  let revision = 0,
    aborted = false;
  const commands: Record<string, unknown>[] = [];
  const requests: Record<string, unknown>[] = [];
  const completed = new Set<string>();
  await page.route("**/api/ai/status**", (r) =>
    r.fulfill({ json: { status: "ready", model: "synthetic/model" } }),
  );
  await page.route(`**/api/companies/${company}/workspace`, async (r) => {
    const body = r.request().postDataJSON();
    commands.push(body);
    if (!completed.has(body.commandId)) {
      expect(body.revision).toBe(revision);
      state = applyCompanyCommand(state, body.command, actor, Date.now(), [
        "crm",
      ]);
      revision++;
      completed.add(body.commandId);
    }
    if (lost && !aborted) {
      aborted = true;
      await r.abort();
      return;
    }
    await r.fulfill({ json: { state, revision } });
  });
  await page.route("**/api/assistant", async (r) => {
    const body = r.request().postDataJSON();
    requests.push(body);
    expect(body).not.toHaveProperty("profile");
    expect(body).not.toHaveProperty("articles");
    const profile = state.studio.bots.find((b) => b.brandId === body.brandId)!;
    const article = state.studio.articles[0];
    const answer = inspectGroundedAnswer(
      {
        intent: "faq",
        action: "reply",
        reply: "本品牌提供小組訓練。",
        summary: "客人查詢服務。",
        sourceIds: [article.id],
        missing: [],
        confidence: 0.9,
        evidence: [{ sourceId: article.id, quote: article.content }],
        nextStep: "了解客人需要。",
        interest: "medium",
      },
      {
        message: body.message,
        name: "Synthetic visitor",
        brandId: body.brandId,
        profile,
        articles: state.studio.articles,
        history: [],
        withinWindow: false,
        humanOwned: true,
        businessHours: true,
        assist: true,
      },
      Date.now(),
      "synthetic/model",
    ).answer;
    await r.fulfill({ json: answer });
  });
  await page.route("**/__acceptance/ai-rules", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html lang="zh-HK"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Brand reply rules acceptance</title><style>:root{${Object.entries(
        BRAND_CSS,
      )
        .map(([k, v]) => `${k}:${v}`)
        .join(
          ";",
        )}}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:#f6f8ff;color:#183156}.fh-app{height:100dvh;display:block}button,input,textarea,select{font:inherit}button{border:0;background:transparent;padding:0;cursor:pointer}${css}</style></head><body><main id="fixture"></main><script id="seed" type="application/json">${JSON.stringify({ state, revision, actor })}</script><script>${bundle.replace(/<\/script/gi, "<\\/script")}</script></body></html>`,
    }),
  );
  await page.goto("/__acceptance/ai-rules");
  return { state: () => state, commands, requests };
}
for (const [name, width, height] of [
  ["desktop", 1440, 1000],
  ["mobile", 390, 844],
] as const) {
  test(`brand rules ${name}: saved tone and scope survive reload, handoff reasons use the saved scope`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const f = await mount(page);
    for (const heading of ["語氣與品牌形象", "可回答範圍", "交接條件"])
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
    await page.getByRole("radio", { name: /簡潔專業/ }).check();
    await expect.poll(() => f.state().studio.bots[0].tone).toBe("professional");
    await page
      .getByRole("checkbox", { name: /服務介紹及已核實收費/ })
      .uncheck();
    await expect.poll(() => f.state().studio.bots[0].allowService).toBe(false);
    await page.reload();
    await expect(page.getByRole("radio", { name: /簡潔專業/ })).toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: /服務介紹及已核實收費/ }),
    ).not.toBeChecked();
    await page.getByRole("button", { name: "服務查詢", exact: true }).click();
    expect(f.requests).toHaveLength(0);
    await page
      .getByRole("button", { name: "準備 AI 回覆建議", exact: true })
      .click();
    const result = page.getByRole("region", { name: "試答檢查結果" });
    await expect(result).toContainText("呢類問題未獲品牌授權由 AI 處理。");
    await expect(result).toContainText("未有通知同事或建立客戶交接");
    await page
      .getByRole("button", { name: "試答：要求真人", exact: true })
      .click();
    await expect(page.getByLabel("BOT 測試訊息")).toHaveValue(
      "我想搵真人同事傾，請幫我轉接。",
    );
    await expect(page.locator(".ai-generated")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "儲存設定", exact: true }),
    ).toHaveCount(0);
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
    await page
      .locator(".st-workspace")
      .screenshot({ path: info.outputPath(`ai-rules-${name}.png`) });
  });
}
test("an uncertain rules save disables trials until its original command is reconciled", async ({
  page,
}) => {
  const f = await mount(page, { lost: true });
  await page.getByRole("radio", { name: /簡潔專業/ }).check();
  await expect(page.getByText(/尚有未儲存改動/).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "準備 AI 回覆建議", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "重試儲存", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "準備 AI 回覆建議", exact: true }),
  ).toBeEnabled();
  expect(f.commands).toHaveLength(2);
  expect(f.commands[1]).toEqual(f.commands[0]);
  expect(f.requests).toHaveLength(0);
});
test("agents inspect reply rules without a configuration mutation", async ({
  page,
}) => {
  const f = await mount(page, { role: "agent" });
  await expect(page.getByRole("radio", { name: /簡潔專業/ })).toBeDisabled();
  await expect(
    page.getByRole("checkbox", { name: /服務介紹及已核實收費/ }),
  ).toBeDisabled();
  await expect(
    page.getByText("修改需要公司管理員權限", { exact: false }),
  ).toBeVisible();
  expect(f.commands).toHaveLength(0);
});
