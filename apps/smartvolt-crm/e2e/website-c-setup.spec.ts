import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import type { WebChatSettings } from "../src/lib/web-chat/model";
const company = "91111111-1111-4111-8111-111111111111",
  id = "92222222-2222-4222-8222-222222222222";
let bundle: string;
test.beforeAll(async () => {
  bundle = (
    await build({
      stdin: {
        loader: "tsx",
        resolveDir: process.cwd(),
        contents: `import React from 'react';import {createRoot} from 'react-dom/client';import WebChatSettings from './src/components/web-chat/WebChatSettings';createRoot(document.getElementById('fixture')).render(<WebChatSettings initial={window.fixtureSettings}/>);`,
      },
      bundle: true,
      write: false,
      format: "iife",
      platform: "browser",
      loader: { ".css": "empty" },
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"test"' },
    })
  ).outputFiles[0].text;
});
async function mount(page: import("@playwright/test").Page) {
  const data: WebChatSettings = {
    companyId: company,
    canManage: true,
    canManageAI: true,
    brands: [{ id: "brand", name: "Terra Studio" }],
    publicArticles: [
      { id: "public-faq", brandId: "brand", title: "品牌及服務介紹" },
    ],
    configs: [
      {
        id,
        brandId: "brand",
        name: "Terra Studio",
        greeting: "你好，我係 C，可以幫你介紹服務。",
        origins: ["https://terra.example.org"],
        verifiedOrigins: [],
        enabled: false,
        revision: 1,
        verification: "a".repeat(48),
        aiEnabled: false,
        aiArticleIds: [],
        accentColor: "#2457E7",
      },
    ],
  };
  const calls: Record<string, unknown>[] = [];
  await page.route("**/api/companies/**/web-chat", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      calls.push(body);
      if (body.action === "save")
        data.configs[0] = {
          ...data.configs[0],
          ...body,
          revision: data.configs[0].revision + 1,
        };
      if (body.action === "activate") {
        data.configs[0].enabled = true;
        data.configs[0].verifiedOrigins = data.configs[0].origins;
        data.configs[0].revision++;
      }
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.fulfill({ json: data });
  });
  await page.route("**/__website_c_setup__", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html lang="zh-HK"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>C 網站設定</title><style>body{margin:0;background:#f8fafc;font-family:system-ui,sans-serif}${readFileSync("src/components/web-chat/web-chat.css", "utf8")}</style><main id="fixture"></main><script>window.fixtureSettings=${JSON.stringify(data)};${bundle}</script></html>`,
    }),
  );
  await page.goto("/__website_c_setup__");
  return { data, calls };
}
test("customers select a palette or exact brand color, preview it and save only their widget", async ({
  page,
}) => {
  const f = await mount(page);
  await expect(page.getByRole("button", { name: /^配色：/ })).toHaveCount(12);
  await page.getByRole("button", { name: "配色：琥珀", exact: true }).click();
  await expect(page.locator(".wc-preview header")).toHaveCSS(
    "background-color",
    "rgb(217, 119, 6)",
  );
  await expect(page.locator(".wc-preview header")).toHaveCSS(
    "color",
    "rgb(0, 0, 0)",
  );
  await page.getByLabel("品牌色碼", { exact: true }).fill("#166534");
  await page.getByLabel("C 自動介紹及回答問題", { exact: false }).check();
  await page.getByLabel("品牌及服務介紹", { exact: true }).check();
  await page.getByRole("button", { name: "儲存接待設定", exact: true }).click();
  await expect.poll(() => f.calls.length).toBe(1);
  expect(f.calls[0]).toMatchObject({
    action: "save",
    id,
    accentColor: "#166534",
    aiEnabled: true,
    aiArticleIds: ["public-faq"],
  });
  await expect(page.locator(".wc-preview header")).toHaveCSS(
    "background-color",
    "rgb(22, 101, 52)",
  );
});
test("installation is one combined snippet and one verified activation command", async ({
  page,
}) => {
  const f = await mount(page);
  await expect(page.locator(".wc-install").first()).toContainText(
    '<meta name="convelta-chat-verification"',
  );
  await expect(page.locator(".wc-install").first()).toContainText(
    `/embed/chat.js?widget=${id}`,
  );
  await page
    .getByRole("button", { name: "檢查安裝並啟用", exact: true })
    .click();
  await expect.poll(() => f.calls.length).toBe(1);
  expect(f.calls[0]).toMatchObject({ action: "activate", id, revision: 1 });
  await expect(
    page.getByText("網站聊天已啟用，C 會按你嘅接待設定運作。"),
  ).toBeVisible();
});
test("mobile setup retains accessible controls, readable preview and no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(page);
  await page.getByRole("button", { name: "配色：暖金", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const overflowing = await page
    .locator(".wc-card input, .wc-card textarea, .wc-card select")
    .evaluateAll(
      (controls) =>
        controls.filter((control) => {
          const box = control.getBoundingClientRect(),
            card = control.closest(".wc-card")!.getBoundingClientRect();
          return (
            box.width > 0 && (box.left < card.left || box.right > card.right)
          );
        }).length,
    );
  expect(overflowing).toBe(0);
  const violations = (
    await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
  ).violations;
  expect(violations).toEqual([]);
  await page.screenshot({
    path: test.info().outputPath("website-c-mobile-setup.png"),
    fullPage: true,
  });
});
