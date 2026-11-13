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
]
  .map((p) => readFileSync(p, "utf8"))
  .join("\n");
test.beforeAll(async () => {
  bundle = (
    await build({
      stdin: {
        loader: "tsx",
        resolveDir: process.cwd(),
        contents: `import React from'react';import{createRoot}from'react-dom/client';import{CompanyProvider}from'./src/lib/saas/CompanyProvider';import{useDemo}from'./src/lib/demo/Provider';import Importer from'./src/components/website/WebsiteKnowledgeImport';function Probe(){const d=useDemo();return <><button onClick={()=>d.dispatch({type:'studio',action:{type:'bot',bot:{...d.state.studio.bots[0],name:'已更新助手'}}})}>修改助手名稱</button><output aria-label='目前助手名稱'>{d.state.studio.bots[0].name}</output><div role='region' aria-label='已保存知識'>{d.state.studio.articles.map(a=><article key={a.id}><h2>{a.title}</h2><p>{a.status}</p></article>)}</div></>}createRoot(document.getElementById('fixture')).render(<CompanyProvider state={${JSON.stringify(seed())}} revision={0} actor={${JSON.stringify(actor)}} products={['crm','pos']}><h1>品牌知識庫</h1><Importer companyId='${company}' brandId='main' connected={true}/><Probe/></CompanyProvider>);`,
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
async function fixture(page: Page, lost = false) {
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
  let job: WebsiteJob | null = null;
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
        if (lost && !aborted) {
          aborted = true;
          await r.abort();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
        await r.fulfill({ json: { state, revision, added: 1, skipped: 0 } });
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
        };
      else {
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
      }
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
      body: `<!doctype html><html lang="zh-HK"><head><title>Brand knowledge import</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{${vars}}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:#f6f8ff;color:#183156}main{max-width:900px;margin:auto;padding:20px}button,input{font:inherit}${css}</style></head><body><main id="fixture" class="fh-app"></main><script src="/__acceptance/website-fixture.js"></script></body></html>`,
    }),
  );
  await page.goto("/__acceptance/website");
  await page.getByRole("button", { name: /讓網站成為品牌知識/ }).click();
  await page
    .getByRole("textbox", { name: "品牌網站網址" })
    .fill("https://brand.com");
  await page.getByRole("button", { name: "掃描網站", exact: true }).click();
  await expect(page.getByText("準備好供你檢視")).toBeVisible();
  return { ids, state: () => state };
}
for (const mobile of [false, true])
  test(`${mobile ? "mobile" : "desktop"}: website preview, exact source, explicit draft import and concurrent edit`, async ({
    page,
  }, info) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const f = await fixture(page);
    await page.locator(".wi-page summary").click();
    await expect(page.getByRole("link", { name: "查看原頁" })).toHaveAttribute(
      "href",
      "https://brand.com/",
    );
    await expect(page.locator(".wi-candidate")).toContainText("HK$388");
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(
        `${mobile ? "mobile" : "desktop"}-website-preview.png`,
      ),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "加入 1 項草稿", exact: true })
      .click();
    await page.getByRole("button", { name: "修改助手名稱" }).click();
    await expect(page.getByLabel("已保存知識")).toContainText("draft");
    await expect(page.getByLabel("目前助手名稱")).toHaveText("已更新助手");
    await expect.poll(() => f.state().studio.bots[0].name).toBe("已更新助手");
    expect(f.state().studio.articles).toHaveLength(1);
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
test("an unknown import response freezes the original command and retry cannot duplicate knowledge", async ({
  page,
}) => {
  const f = await fixture(page, true);
  await page
    .getByRole("button", { name: "加入 1 項草稿", exact: true })
    .click();
  await expect(page.getByText(/尚有未儲存改動/)).toBeVisible();
  await page.getByRole("button", { name: "重試儲存", exact: true }).click();
  await expect(page.getByLabel("已保存知識")).toContainText("draft");
  await expect(
    page.getByRole("button", { name: "已加入知識庫", exact: true }),
  ).toBeDisabled();
  expect(f.ids).toHaveLength(2);
  expect(new Set(f.ids).size).toBe(1);
  expect(f.state().studio.articles).toHaveLength(1);
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
