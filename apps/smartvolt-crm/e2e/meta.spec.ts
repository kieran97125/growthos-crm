import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { BRAND_CSS } from "../src/lib/brand";

// A browser-only harness for the real controller, with synthetic tenant data.
// No production route, provider request, test credential or Auth exception.
let bundle = "";
const css = readFileSync("src/components/meta/meta.css", "utf8");
test.beforeAll(async () => {
  const built = await build({
    stdin: {
      contents: `import React from "react";import {createRoot} from "react-dom/client";
        import Inbox from "./src/components/meta/MetaInbox";
        createRoot(document.getElementById("fixture")).render(React.createElement(Inbox,{companyId:"isolated-presentation"}));`,
      loader: "tsx",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    // Next normally replaces these client constants at build time. This harness
    // bundles the real component outside Next, so provide that browser boundary.
    define: {
      "process.env": JSON.stringify({
        NODE_ENV: "test",
        __NEXT_ROUTER_BASEPATH: "",
      }),
    },
  });
  bundle = built.outputFiles[0].text;
});
async function mount(page: Page) {
  await page.route(
    "**/__meta_fixture__",
    (r) =>
      r.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html><body></body></html>",
      }),
    { times: 1 },
  );
  await page.goto("/__meta_fixture__");
  const vars = Object.entries(BRAND_CSS)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
  await page.setContent(
    `<!doctype html><html lang="zh-HK"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated social inbox acceptance</title><style>:root{${vars}}body{margin:0}*{box-sizing:border-box}${css}</style></head><body><div id="fixture"></div></body></html>`,
  );
  await page.addScriptTag({ content: bundle });
}
function fixture(expired = false) {
  const now = Date.now();
  const thread = {
    id: "fixture-thread",
    connection_id: "fixture-connection",
    peer_id: "20000001",
    revision: 1,
    last_inbound_at: now - (expired ? 25 * 3600000 : 60000),
    status: "open",
    unread_count: 1,
  };
  const overview = {
    companyName: "Aurora · synthetic fixture",
    canSend: true,
    canManage: true,
    brands: [{ id: "fixture-brand", name: "Synthetic brand" }],
    connections: [
      {
        id: "fixture-connection",
        brand_id: "fixture-brand",
        channel: "messenger",
        label: "Synthetic Page",
        enabled: true,
        page_id: "10000001",
        account_id: "10000001",
        last_inbound_at: thread.last_inbound_at,
      },
    ],
    threads: [thread],
    nextCursor: null,
    readiness: {
      ready: true,
      blockers: [] as string[],
      webhookUrl: "https://example.invalid/webhook" as string | null,
      verifyToken: null,
    },
  };
  const messages = [
    {
      id: "fixture-message",
      seq: 1,
      direction: "inbound",
      body: "想了解 CRM 同客製化方案",
      state: "received",
      provider_id: "synthetic-mid-in",
      provider_at: thread.last_inbound_at,
      created_at: new Date(now).toISOString(),
      error_code: null,
      referral: { ad_id: "synthetic-ad" } as { ad_id: string } | null,
    },
  ];
  return { thread, overview, messages };
}
type F = ReturnType<typeof fixture>;
async function intercept(
  page: Page,
  f: F,
  post?: (route: Route, body: Record<string, unknown>) => Promise<void>,
) {
  await page.route(
    "**/api/companies/isolated-presentation/meta**",
    async (route) => {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        if (body.action === "read")
          return route.fulfill({ json: { saved: true } });
        if (post) return post(route, body);
        return route.fulfill({
          status: 400,
          json: { error: "Unexpected fixture action" },
        });
      }
      const url = new URL(route.request().url());
      return route.fulfill({
        json: url.searchParams.has("thread")
          ? {
              thread: f.thread,
              messages: f.messages,
              hasMore: false,
              sources: [],
            }
          : f.overview,
      });
    },
  );
}
async function openThread(page: Page) {
  await page.getByRole("button", { name: /客戶 · 20000001/ }).click();
  await expect(
    page.getByRole("textbox", { name: "回覆內容", exact: true }),
  ).toBeVisible();
}
for (const [name, width, height] of [
  ["desktop", 1440, 1000],
  ["mobile", 390, 844],
] as const) {
  test(`social inbox ${name} keeps source evidence, accessible controls and truthful acceptance`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height });
    const f = fixture();
    const attempts: Record<string, unknown>[] = [];
    await intercept(page, f, async (route, body) => {
      attempts.push(body);
      f.messages.push({
        ...f.messages[0],
        id: "fixture-out",
        seq: 2,
        direction: "outbound",
        body: String(body.body),
        state: "accepted",
        provider_id: "synthetic-mid-out",
        referral: null,
      });
      await route.fulfill({ json: { state: "accepted" } });
    });
    await mount(page);
    await openThread(page);
    await expect(page.getByText(/平台來源證據/)).toBeVisible();
    await page
      .getByRole("textbox", { name: "回覆內容", exact: true })
      .fill("可以，我哋先了解你嘅流程。");
    await page.getByRole("button", { name: "發送回覆", exact: true }).click();
    await expect(page.locator(".meta-message.outbound")).toContainText(
      "平台已接受",
    );
    await expect(
      page.getByRole("textbox", { name: "回覆內容", exact: true }),
    ).toHaveValue("");
    expect(attempts).toHaveLength(1);
    expect(attempts[0].clientId).toMatch(/^[a-f0-9-]{36}$/);
    await expect(page.locator(".meta-message.outbound")).not.toContainText(
      "已送達",
    );
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
      path: info.outputPath(`social-inbox-${name}.png`),
      fullPage: true,
    });
  });
}
test("expired reply window blocks external send while internal notes remain available", async ({
  page,
}) => {
  const f = fixture(true);
  const actions: Record<string, unknown>[] = [];
  await intercept(page, f, async (route, body) => {
    actions.push(body);
    await route.fulfill({ json: { saved: true } });
  });
  await mount(page);
  await openThread(page);
  await page
    .getByRole("textbox", { name: "回覆內容", exact: true })
    .fill("草稿");
  await expect(
    page.getByRole("button", { name: "發送回覆", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "內部備註", exact: true }).click();
  await page.getByRole("button", { name: "儲存備註", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("未向客戶發送");
  expect(actions.map((a) => a.action)).toEqual(["note"]);
});
test("lost response retains the draft and reconciles the same UUID", async ({
  page,
}) => {
  const f = fixture();
  const attempts: Record<string, unknown>[] = [];
  await intercept(page, f, async (route, body) => {
    attempts.push(body);
    if (attempts.length === 1) return route.abort("connectionreset");
    await route.fulfill({ json: { state: "accepted", replayed: true } });
  });
  await mount(page);
  await openThread(page);
  const input = page.getByRole("textbox", { name: "回覆內容", exact: true });
  await input.fill("保留待確認回覆");
  await page.getByRole("button", { name: "發送回覆", exact: true }).click();
  await expect(input).toHaveValue("保留待確認回覆");
  await page.getByRole("button", { name: "核對發送結果", exact: true }).click();
  await expect(input).toHaveValue("");
  expect(attempts).toHaveLength(2);
  expect(attempts[0].clientId).toBe(attempts[1].clientId);
});
test("provider rejection preserves the draft", async ({ page }) => {
  const f = fixture();
  await intercept(page, f, (route) =>
    route.fulfill({ json: { state: "failed" } }),
  );
  await mount(page);
  await openThread(page);
  const input = page.getByRole("textbox", { name: "回覆內容", exact: true });
  await input.fill("未成功嘅草稿");
  await page.getByRole("button", { name: "發送回覆", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("草稿已保留");
  await expect(input).toHaveValue("未成功嘅草稿");
});
test("unconfigured company shows the activation blocker without synthetic inquiries", async ({
  page,
}) => {
  const f = fixture();
  f.overview.connections = [];
  f.overview.threads = [];
  f.overview.readiness = {
    ready: false,
    blockers: ["Meta App ID／App Secret 未配置"],
    webhookUrl: null,
    verifyToken: null,
  };
  await intercept(page, f);
  await mount(page);
  await expect(
    page.getByRole("heading", { name: "先連接品牌渠道" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "驗證並儲存接駁" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Meta App ID／App Secret 未配置", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".meta-thread")).toHaveCount(0);
});
