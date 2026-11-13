import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { BRAND_CSS, BRAND } from "../src/lib/brand";
const company = "77777777-7777-4777-8777-777777777777";
const base = `/company/${company}`;
let javascript = "";
const css = [
  "src/app/saas.css",
  "src/components/products/products.css",
  "src/components/inquiries/inquiries.css",
  "src/components/ai/ai.css",
  "src/components/meta/meta.css",
  "src/components/whatsapp/whatsapp.css",
  "src/components/crm/conversations/workspace.css",
  "src/components/pos/pos.css",
  "src/components/crm/studio/studio.css",
  "src/components/crm/studio/broadcast.css",
  "src/components/ui/dialog.css",
  "node_modules/@xyflow/react/dist/style.css",
  "src/components/copilot/copilot.css",
  "src/components/workspace/workspace.css",
]
  .map((p) => readFileSync(p, "utf8"))
  .join("\n");
const aiStatus = {
  companyName: "Navigation acceptance · synthetic",
  model: null,
  status: "unconfigured",
  enabled: false,
  canGenerate: false,
  canConfigure: false,
  brands: [{ id: "main", name: "Synthetic brand", knowledgeCount: 0 }],
  usage: { used: 0, limit: 30 },
  knowledge: [],
  blocker: "Isolated browser fixture",
  checkedAt: null,
};
test.beforeAll(async () => {
  javascript = (
    await build({
      stdin: {
        loader: "tsx",
        resolveDir: process.cwd(),
        contents: `
      import React from 'react';import{createRoot}from'react-dom/client';
      import{CompanyWorkspaceChrome}from'./src/components/workspace/CompanyWorkspace';
      import{CompanyProvider}from'./src/lib/saas/CompanyProvider';
      import{ProductWorkspace}from'./src/components/products/ProductWorkspace';
      import{AIProvider}from'./src/lib/demo/AIConnection';
      import{createAppState}from'./src/lib/demo/state';
      import{BRANDS,TEAM}from'./src/components/crm/conversations/model';
      import Inbox from'./src/components/inquiries/UnifiedInbox';
      import Customers from'./src/components/inquiries/CustomerDirectory';
      import AI from'./src/components/ai/AIStudio';
      const id='${company}',name='Navigation acceptance · synthetic',url=new URL(location.href);
      const products=url.searchParams.get('plan')==='pos'?['pos']:['crm','pos'];
      const state=createAppState(Date.now());state.scope={companyId:id,companyName:name,brands:BRANDS.map((b,i)=>({...b,name:'Synthetic brand '+(i+1),short:'S'+(i+1)})),team:TEAM.map((t,i)=>({...t,name:'Synthetic member '+(i+1),initials:'S'}))};
      if(state.pos)state.pos.companyId=id;
      state.inbox.contacts.forEach(c=>c.clientId=id);state.inbox.conversations.forEach(c=>c.clientId=id);
      state.studio.flows.forEach(f=>f.clientId=id);state.studio.articles.forEach(a=>a.clientId=id);
      state.studio.versions.forEach(v=>v.flow.clientId=id);
      const actor={id:'me',name:'Synthetic owner',role:'owner'};
      const provider=child=>React.createElement(CompanyProvider,{state,revision:0,actor,products},React.createElement(AIProvider,null,child));
      const view=url.searchParams.get('view');let child;
      if(url.pathname.endsWith('/pos'))child=provider(React.createElement(ProductWorkspace,{initialProduct:'pos'}));
      else if(view)child=provider(React.createElement(ProductWorkspace,{initialProduct:'crm',initialView:view}));
      else if(url.pathname.endsWith('/customers'))child=React.createElement(Customers,{companyId:id,companyName:name,hasPos:true,canEdit:true});
      else if(url.pathname.endsWith('/ai'))child=React.createElement(AI,{companyId:id,initialStatus:${JSON.stringify(aiStatus)}});
      else if(url.pathname.endsWith('/settings'))child=React.createElement('main',{className:'sv-picker'},React.createElement('h1',null,'Synthetic company settings'));
      else child=React.createElement(Inbox,{companyId:id,companyName:name,hasPos:true});
      createRoot(document.getElementById('fixture')).render(React.createElement(CompanyWorkspaceChrome,{companyId:id,companyName:name,actorName:'Synthetic owner',products,location:{pathname:url.pathname,search:url.search}},child));
    `,
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
async function fixture(page: Page) {
  await page.route("**/api/**", (route) =>
    route.fulfill({
      json: route.request().url().includes("/ai/")
        ? aiStatus
        : route.request().url().includes("/customers")
          ? { customers: [], nextAfter: null }
          : {
              threads: [],
              counts: {
                all: 0,
                mine: 0,
                unassigned: 0,
                overdue: 0,
                priority: 0,
                unread: 0,
                resolved: 0,
              },
              nextCursor: null,
              companyName: "Navigation acceptance · synthetic",
              actorId: "synthetic-owner",
              canEdit: true,
              hasPos: true,
              members: [],
              brands: [{ id: "main", name: "Synthetic brand" }],
              connections: [],
            },
    }),
  );
  const vars = Object.entries(BRAND_CSS)
    .map(([k, v]) => k + ":" + v)
    .join(";");
  const html = `<!doctype html><html lang="zh-HK"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated workspace navigation</title><style>:root{${vars}}*{box-sizing:border-box}body{margin:0;font-family:Arial,'Noto Sans CJK TC',sans-serif}button,input,textarea,select{font:inherit}a{color:inherit}${css}</style></head><body><div id="fixture"></div><script>${javascript.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
  await page.route(`**/company/${company}/**`, (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
}
for (const mobile of [false, true])
  test(`${mobile ? "mobile" : "desktop"}: one company header and stable navigation across native CRM and studios`, async ({
    page,
  }, info) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await fixture(page);
    await page.goto(base + "/crm");
    const expected = [
      "收件匣",
      "客戶",
      "Flow",
      "AI 助理",
      "BOT／知識庫",
      "推播",
      "團隊與設定",
    ];
    for (const [label, section] of [
      ["收件匣", "inbox"],
      ["Flow", "flows"],
      ["AI 助理", "ai"],
      ["BOT／知識庫", "knowledge"],
      ["推播", "broadcasts"],
      ["客戶", "customers"],
      ["團隊與設定", "settings"],
      ["收件匣", "inbox"],
    ]) {
      const rail = page.getByRole("navigation", {
        name: "CRM 功能",
        exact: true,
      });
      await rail.getByRole("link", { name: label, exact: true }).click();
      await expect(page.locator(".cq-header")).toHaveCount(1);
      await expect(page.locator(".cc-launcher")).toHaveCount(1);
      await expect(page.locator(".cq-header .cc-launcher")).toHaveCount(0);
      await expect(page.locator(".cc-launcher")).toHaveCSS("position", "fixed");
      await expect(rail.getByRole("link")).toHaveText(expected);
      await expect(rail.locator('[aria-current="page"]')).toHaveAttribute(
        "data-section",
        section,
      );
      await expect(
        page.locator(
          ".sv-live-channels, .sv-company-toolbar, .fh-rail, .iq-rail, .sv-product-header",
        ),
      ).toHaveCount(0);
      if (section === "flows")
        await expect(
          page.getByRole("heading", { name: /Flow Studio/ }),
        ).toBeVisible();
      if (section === "knowledge")
        await expect(
          page.getByRole("heading", { name: "BOT／知識庫", exact: true }),
        ).toBeVisible();
      if (section === "broadcasts")
        await expect(
          page.getByRole("heading", { name: "推播", exact: true }),
        ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (section === "flows" || section === "inbox") {
        await page.screenshot({
          path: info.outputPath(
            `${mobile ? "mobile" : "desktop"}-${section}.png`,
          ),
          fullPage: true,
        });
      }
    }
    const a11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(a11y.violations).toEqual([]);
  });
test("POS remains an independently purchased product within the same company identity", async ({
  page,
}, info) => {
  await fixture(page);
  await page.goto(base + "/pos?plan=pos");
  await expect(page.locator(".cq-header")).toHaveCount(1);
  await expect(page.locator(".cq-product")).toHaveText("POS");
  await expect(page.locator(".cc-launcher")).toHaveCount(1);
  await expect(page.locator(".cc-launcher")).toHaveAttribute(
    "data-product",
    "pos",
  );
  await expect(page.locator(".cc-launcher")).toHaveCSS("position", "fixed");
  await expect(
    page.getByRole("navigation", { name: "CRM 功能", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "切換至 CRM", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "預約日曆", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".sv-product-header, .sv-company-toolbar"),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("pos-shared-identity.png"),
    fullPage: true,
  });
});
test("browser, Apple and installed-app metadata request fresh blue icons", async ({
  page,
}) => {
  await page.goto("/login");
  const href = await page
    .locator('link[rel="icon"][sizes="32x32"]')
    .getAttribute("href");
  expect(href).toContain("32-" + BRAND.iconVersion);
  const pixel = await page.evaluate(async (path) => {
    const image = await createImageBitmap(await (await fetch(path!)).blob());
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    return {
      width: image.width,
      pixel: [...context.getImageData(8, 8, 1, 1).data],
    };
  }, href);
  expect(pixel.width).toBe(32);
  expect(pixel.pixel).toEqual([36, 87, 231, 255]);
  const manifest = await (
    await page.request.get("/manifest.webmanifest")
  ).json();
  expect(
    manifest.icons.every((i: { src: string }) =>
      i.src.includes(BRAND.iconVersion),
    ),
  ).toBe(true);
  for (const icon of manifest.icons)
    expect((await page.request.get(icon.src)).ok()).toBe(true);
  const apple = await page
    .locator('link[rel="apple-touch-icon"]')
    .getAttribute("href");
  expect((await page.request.get(apple!)).ok()).toBe(true);
});
