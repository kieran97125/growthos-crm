import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { BRAND_CSS } from "../src/lib/brand";
import {
  createCompanyState,
  applyCompanyCommand,
} from "../src/lib/saas/workspace";
import {
  extractWebsitePage,
  initialWebsiteState,
  websiteCandidates,
} from "../src/lib/website/crawl";
import type { WebsiteJob } from "../src/lib/website/model";
const company = "11111111-1111-4111-8111-111111111111",
  owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actor = { id: owner, name: "Synthetic Owner", role: "owner" as const };
const seed = () =>
  createCompanyState({
    companyId: company,
    companyName: "Website · synthetic",
    brands: [{ id: "main", name: "星藍工作室", short: "S" }],
    team: [{ id: owner, name: "Owner", initials: "O" }],
  });
let bundle = "";
const css = [
  "src/app/saas.css",
  "src/components/crm/studio/studio.css",
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
        contents: `import React from'react';import{createRoot}from'react-dom/client';import{CompanyProvider}from'./src/lib/saas/CompanyProvider';import{useDemo}from'./src/lib/demo/Provider';import{useStudioStore}from'./src/components/crm/studio/useStudioStore';import{AIProvider}from'./src/lib/demo/AIConnection';import BotStudio from'./src/components/crm/studio/BotStudio';function Workbench(){const studio=useStudioStore(true);return <BotStudio studio={studio} onInbox={()=>{}}/>}function Probe(){const d=useDemo();return <aside aria-label='驗收操作'><button onClick={()=>d.dispatch({type:'studio',action:{type:'bot',bot:{...d.state.studio.bots[0],name:'已更新助手'}}})}>修改助手名稱</button><output aria-label='目前助手名稱'>{d.state.studio.bots[0].name}</output></aside>}const initial=JSON.parse(document.getElementById('seed').textContent);createRoot(document.getElementById('fixture')).render(<CompanyProvider state={initial.state} revision={initial.revision} actor={${JSON.stringify(actor)}} products={['crm','pos']}><AIProvider><div className='fh-app fh-studio-view'><Workbench/></div><Probe/></AIProvider></CompanyProvider>);`,
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
async function fixture(
  page: Page,
  options: { lost?: boolean; ready?: boolean; failed?: boolean } = {},
) {
  let state = seed(),
    revision = 0,
    imported = false,
    aborted = false;
  const ids: string[] = [],
    initial = initialWebsiteState("https://brand.com");
  const parsed = extractWebsitePage(
    Buffer.from(
      "<main><h1>星藍品牌介紹</h1><p>提供小組訓練及場地租用，每堂 HK$388。請先聯絡同事確認時段，再安排正式預約，所有費用及條款由品牌核實。</p></main>",
    ),
    "https://brand.com/",
  ).page;
  const completed = () => {
    job!.state.pages = [parsed];
    job!.state.queue = [];
    job!.state.visited = [parsed.url];
    job!.state.candidates = websiteCandidates(
      job!.state,
      company,
      "main",
      job!.id,
    );
    job!.status = "ready";
  };
  let job: WebsiteJob | null = options.ready
    ? {
        id: randomUUID(),
        brandId: "main",
        status: "queued",
        state: structuredClone(initial),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        added: 0,
        skipped: 0,
        refreshed: 0,
      }
    : null;
  if (options.ready) completed();
  await page.route("**/api/ai/status**", (r) =>
    r.fulfill({ json: { status: "ready", model: "synthetic" } }),
  );
  await page.route(
    `**/api/companies/${company}/knowledge/website**`,
    async (r) => {
      if (r.request().method() === "GET") {
        await r.fulfill({ json: { job } });
        return;
      }
      const body = r.request().postDataJSON();
      if (r.request().url().endsWith("/import")) {
        ids.push(body.commandId);
        if (!imported) {
          expect(body.revision).toBe(revision);
          state.studio.articles.push(...job!.state.candidates);
          revision++;
          imported = true;
          job!.status = "imported";
        }
        if (options.lost && !aborted) {
          aborted = true;
          await r.abort();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
        await r.fulfill({
          json: { state, revision, added: 1, skipped: 0, refreshed: 0 },
        });
        return;
      }
      if (body.kind === "start")
        job = {
          id: body.id,
          brandId: "main",
          status: "queued",
          state: structuredClone(initial),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          added: 0,
          skipped: 0,
          refreshed: 0,
        };
      else if (options.failed) {
        job!.status = "failed";
        job!.state.warnings = [
          { url: "https://brand.com/", reason: "網站限制自動讀取。" },
        ];
      } else completed();
      await r.fulfill({ json: { job } });
    },
  );
  await page.route(`**/api/companies/${company}/workspace`, async (r) => {
    const body = r.request().postDataJSON();
    expect(body.revision).toBe(revision);
    state = applyCompanyCommand(state, body.command, actor, Date.now(), [
      "crm",
      "pos",
    ]);
    revision++;
    await r.fulfill({ json: { state, revision } });
  });
  await page.route("**/__acceptance/website-fixture.js", (r) =>
    r.fulfill({ contentType: "text/javascript", body: bundle }),
  );
  const vars = Object.entries(BRAND_CSS)
    .map(([k, v]) => k + ":" + v)
    .join(";");
  await page.route("**/__acceptance/website", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html lang="zh-HK"><head><title>Brand knowledge import</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{${vars}}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:#f6f8ff;color:#183156}.fh-app{height:900px;display:block}button,input{font:inherit}${css}</style></head><body><main id="fixture"></main><script id="seed" type="application/json">${JSON.stringify({ state, revision })}</script><script src="/__acceptance/website-fixture.js"></script></body></html>`,
    }),
  );
  await page.goto("/__acceptance/website");
  if (!options.ready) {
    await page
      .getByRole("textbox", { name: "品牌網站網址" })
      .fill("https://brand.com");
    await page.getByRole("button", { name: "掃描網站", exact: true }).click();
  }
  return { ids, state: () => state };
}

for (const mobile of [false, true])
  test(`${mobile ? "mobile" : "desktop"}: one-click FAQ publication, direct edit, source details and concurrent work`, async ({
    page,
  }, info) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const f = await fixture(page);
    await page.getByRole("button", { name: "修改助手名稱" }).click();
    await expect(page.getByText("已整理 1 條 FAQ，C 可以使用。")).toBeVisible();
    await expect(
      page.locator(".st-bot-sidebar, .st-bot-lab, .st-editor-footer"),
    ).toHaveCount(0);
    await expect(page.getByText("待審核", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /加入.*草稿/ })).toHaveCount(
      0,
    );
    const row = page.locator(".kb-item");
    await row.locator(":scope > summary").focus();
    await page.keyboard.press("Enter");
    await expect(row).toContainText("HK$388");
    await row.getByText("來源", { exact: true }).click();
    await expect(row.getByRole("link", { name: "brand.com" })).toHaveAttribute(
      "href",
      "https://brand.com/",
    );
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page
      .locator(".st-workspace")
      .screenshot({
        path: info.outputPath(
          `${mobile ? "mobile" : "desktop"}-website-faq.png`,
        ),
      });
    await row.getByRole("button", { name: /修改 FAQ/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("combobox")).toHaveCount(0);
    await expect(dialog.getByRole("textbox")).toHaveCount(2);
    await dialog
      .getByLabel("答案", { exact: true })
      .fill("小組訓練每堂 HK$388，預約時段請先聯絡同事核實。");
    await dialog.getByRole("button", { name: "儲存", exact: true }).click();
    await expect
      .poll(() => f.state().studio.articles[0]?.content)
      .toBe("小組訓練每堂 HK$388，預約時段請先聯絡同事核實。");
    await expect(page.getByLabel("目前助手名稱")).toHaveText("已更新助手");
    expect(f.state().studio.articles[0].status).toBe("approved");
    expect(f.state().studio.articles).toHaveLength(1);
    await page.reload();
    await page.locator(".kb-item > summary").click();
    await expect(page.locator(".kb-answer")).toContainText(
      "預約時段請先聯絡同事核實",
    );
    expect(f.ids).toHaveLength(1);
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
test("lost publication response reconciles the same scan once without another import button", async ({
  page,
}) => {
  const f = await fixture(page, { lost: true });
  await expect(page.getByText(/尚有未儲存改動/)).toBeVisible();
  await page.getByRole("button", { name: "重試儲存", exact: true }).click();
  await expect(page.getByText("已整理 1 條 FAQ，C 可以使用。")).toBeVisible();
  expect(f.ids).toHaveLength(2);
  expect(new Set(f.ids).size).toBe(1);
  expect(f.state().studio.articles).toHaveLength(1);
});
test("a completed FAQ scan resumes publication on return without approval", async ({
  page,
}) => {
  const f = await fixture(page, { ready: true });
  await expect(page.getByText("已整理 1 條 FAQ，C 可以使用。")).toBeVisible();
  expect(f.ids).toHaveLength(1);
  expect(f.state().studio.articles[0].status).toBe("approved");
});
test("unreadable websites report failure without publishing invented FAQ", async ({
  page,
}) => {
  const f = await fixture(page, { failed: true });
  await expect(page.getByRole("alert")).toContainText("網站限制自動讀取。");
  await expect(page.locator(".kb-item")).toHaveCount(0);
  expect(f.ids).toHaveLength(0);
});
test("website mutations reject foreign origins before scanning", async ({
  request,
}) => {
  const r = await request.post(`/api/companies/${company}/knowledge/website`, {
    headers: { Origin: "https://foreign.example" },
    data: {
      kind: "start",
      id: randomUUID(),
      brandId: "main",
      url: "https://brand.com",
    },
  });
  expect(r.status()).toBe(403);
});
