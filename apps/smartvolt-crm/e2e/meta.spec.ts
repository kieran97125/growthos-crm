import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { BRAND_CSS } from "../src/lib/brand";
import type { ThreadActivity } from "../src/lib/meta/operations";

// A browser-only harness for the real controller, with synthetic tenant data.
// No production route, provider request, test credential or Auth exception.
let bundle = "";
const css =
  readFileSync("src/components/meta/meta.css", "utf8") +
  readFileSync("src/components/translation/translation.css", "utf8");
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
    status: "open" as "open" | "resolved",
    customer_name: "",
    assignee_id: null as string | null,
    priority: "normal" as "normal" | "high" | "urgent",
    follow_up_at: null as string | null,
    next_step: "",
    unread_count: 1,
  };
  const overview = {
    companyName: "Aurora · synthetic fixture",
    actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    members: [
      {
        user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        display_name: "Synthetic owner",
      },
    ],
    counts: {
      all: 1,
      mine: 0,
      unassigned: 1,
      overdue: 0,
      priority: 0,
      unread: 1,
      resolved: 0,
    },
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
  return { thread, overview, messages, activity: [] as ThreadActivity[] };
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
              activity: f.activity,
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

test("team handover persists Hong Kong follow-up, ownership and audit history together", async ({
  page,
}, info) => {
  const f = fixture();
  const attempts: Record<string, unknown>[] = [];
  await intercept(page, f, async (route, body) => {
    attempts.push(body);
    const previous = {
      customer_name: f.thread.customer_name,
      assignee_id: f.thread.assignee_id,
      priority: f.thread.priority,
      follow_up_at: f.thread.follow_up_at,
      next_step: f.thread.next_step,
      status: f.thread.status,
    };
    Object.assign(f.thread, body.data, { revision: f.thread.revision + 1 });
    f.activity.push({
      command_id: String(body.commandId),
      actor_name: "Synthetic owner",
      created_at: new Date().toISOString(),
      previous,
      next: body.data as ThreadActivity["next"],
    });
    await route.fulfill({ json: { saved: true } });
  });
  await mount(page);
  await openThread(page);
  const panel = page.getByRole("complementary", { name: "查詢跟進" });
  await panel.getByLabel("客戶名稱").fill("Harbour Studio");
  await panel.getByRole("button", { name: "由我跟進" }).click();
  await panel.getByLabel("優先次序").selectOption("urgent");
  await panel.getByLabel("下次跟進（香港時間）").fill("2026-11-13T09:30");
  await panel.getByLabel("下一步行動").fill("了解查詢渠道，再安排示範");
  await panel.getByRole("button", { name: "儲存跟進", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("跟進資料已儲存");
  expect(attempts).toHaveLength(1);
  expect(attempts[0]).toMatchObject({
    action: "manage",
    revision: 1,
    data: {
      customer_name: "Harbour Studio",
      assignee_id: f.overview.actorId,
      priority: "urgent",
      follow_up_at: "2026-11-13T01:30:00.000Z",
      next_step: "了解查詢渠道，再安排示範",
    },
  });
  await expect(panel.getByText("優先次序：緊急")).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "儲存跟進", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: info.outputPath("inbox-team-handover.png"),
    fullPage: true,
  });
});

test("lost handover response reconciles with the original command and preserves customer reply draft", async ({
  page,
}) => {
  const f = fixture(),
    attempts: Record<string, unknown>[] = [];
  await intercept(page, f, async (route, body) => {
    attempts.push(body);
    if (attempts.length === 1) {
      Object.assign(f.thread, body.data, { revision: 2 });
      return route.abort("failed");
    }
    await route.fulfill({ json: { saved: true, replayed: true } });
  });
  await mount(page);
  await openThread(page);
  const reply = page.getByRole("textbox", { name: "回覆內容", exact: true });
  await reply.fill("未發出嘅回覆草稿");
  const panel = page.getByRole("complementary", { name: "查詢跟進" });
  await panel.getByLabel("下一步行動").fill("確認方案");
  await panel.getByRole("button", { name: "儲存跟進", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "核對儲存結果" }),
  ).toBeEnabled();
  await panel.getByRole("button", { name: "核對儲存結果" }).click();
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
  await expect(reply).toHaveValue("未發出嘅回覆草稿");
});

test("queue, channel and literal customer search reach the server together", async ({
  page,
}) => {
  const f = fixture(),
    requests: URL[] = [];
  await page.route(
    "**/api/companies/isolated-presentation/meta**",
    async (route) => {
      const url = new URL(route.request().url());
      requests.push(url);
      const visible =
        url.searchParams.get("queue") === "mine" ||
        url.searchParams.get("search")
          ? []
          : [f.thread];
      await route.fulfill({ json: { ...f.overview, threads: visible } });
    },
  );
  await mount(page);
  await page.getByRole("button", { name: /我負責/ }).click();
  await expect(page.getByText("呢個清單暫時冇查詢")).toBeVisible();
  await page
    .getByRole("combobox", { name: "篩選渠道" })
    .selectOption("instagram");
  await page
    .getByRole("searchbox", { name: "搜尋客戶名稱或平台帳戶 ID" })
    .fill("Harbour %");
  await page.getByRole("button", { name: "搜尋", exact: true }).click();
  await expect
    .poll(() => requests.at(-1)?.searchParams.get("search"))
    .toBe("Harbour %");
  expect(requests.at(-1)?.searchParams.get("channel")).toBe("instagram");
  expect(requests.at(-1)?.searchParams.get("queue")).toBe("mine");
});

test("viewer can inspect handover but cannot alter assignment or follow-up", async ({
  page,
}) => {
  const f = fixture();
  f.overview.canSend = false;
  f.overview.canManage = false;
  await intercept(page, f);
  await mount(page);
  await openThread(page);
  const panel = page.getByRole("complementary", { name: "查詢跟進" });
  await expect(panel.getByLabel("負責同事")).toBeDisabled();
  await expect(panel.getByLabel("下次跟進（香港時間）")).toBeDisabled();
  await expect(
    panel.getByRole("button", { name: "儲存跟進", exact: true }),
  ).toHaveCount(0);
});
