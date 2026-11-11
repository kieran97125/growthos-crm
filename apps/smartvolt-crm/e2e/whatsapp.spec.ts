import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import WhatsAppInboxView, {
  type WhatsAppInboxViewProps,
} from "../src/components/whatsapp/WhatsAppInboxView";
import type { WaMessageSummary } from "../src/lib/whatsapp/responses";

// Synthetic presentation fixtures only. No production contacts, credential bypass,
// provider requests or claims about actual hosted WhatsApp connectivity.
const now = Date.parse("2026-11-11T08:30:00Z");
const conversation = {
  id: "fixture-conversation",
  connectionId: "fixture-connection",
  contactId: "fixture-customer",
  brandId: "fixture-brand",
  customerName: "陳小姐 · 測試資料",
  customerPhone: null,
  status: "open" as const,
  unreadCount: 2,
  lastInboundAt: now - 300000,
  lastMessageAt: now - 10000,
  revision: 8,
  lastMessagePreview: "想了解服務詳情，方便介紹一下嗎？",
  hasAdReferral: true,
};
const message = {
  id: "fixture-incoming",
  seq: 1,
  direction: "incoming" as const,
  body: "想了解服務詳情，方便介紹一下嗎？",
  messageType: "text",
  providerAt: now - 300000,
  createdAt: new Date(now - 300000).toISOString(),
  authorName: null,
  state: "delivered" as const,
  errorCode: null,
  replyTo: null,
};
const props: WhatsAppInboxViewProps = {
  companyId: "isolated-presentation",
  companyName: "Aurora Studio · 測試資料",
  canSend: true,
  canManage: true,
  connections: [
    {
      id: "fixture-connection",
      companyId: "isolated-presentation",
      brandId: "fixture-brand",
      appId: "123",
      accountId: "456",
      messagingAccountId: null,
      phoneNumberId: "789",
      displayPhone: "公司測試號碼",
      state: "active",
      webhookVerifiedAt: new Date(now - 600000).toISOString(),
      lastInboundAt: now - 300000,
      createdAt: new Date(now).toISOString(),
      webhookUrl: "https://example.invalid/webhook",
    },
  ],
  conversations: [
    conversation,
    {
      ...conversation,
      id: "fixture-long-name",
      customerName: "非常長嘅客戶名稱及多語言 Name ".repeat(4),
      unreadCount: 0,
      hasAdReferral: false,
    },
  ],
  selected: conversation,
  messages: [
    message,
    {
      ...message,
      id: "fixture-outgoing",
      seq: 2,
      direction: "outgoing",
      body: "你好，多謝你嘅查詢。我哋會按你嘅需要介紹合適服務。",
      state: "accepted",
      authorName: "客戶服務同事",
    },
    { ...message, id: "fixture-media", seq: 3, body: "", messageType: "image" },
    {
      ...message,
      id: "fixture-unknown",
      seq: 4,
      direction: "outgoing",
      state: "unknown",
      body: "呢個訊息結果仍待核實。",
    },
  ],
  loading: false,
  messagesLoading: false,
  error: null,
  messageError: null,
  query: "",
  draft: "你好，想先了解你需要嘅服務。",
  quote: null,
  pending: null,
  nextCursor: "fixture-cursor",
  nextBefore: 10,
  loadingMore: false,
  now,
  atBottom: true,
  actionBusy: false,
};
const css = readFileSync("src/components/whatsapp/whatsapp.css", "utf8");
function html(data: WhatsAppInboxViewProps) {
  return `<!doctype html><html lang="zh-HK"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WhatsApp presentation acceptance</title><style>body{margin:0}*{box-sizing:border-box}${css}</style></head><body>${renderToStaticMarkup(createElement(WhatsAppInboxView, data))}</body></html>`;
}
for (const [name, width, height] of [
  ["desktop", 1440, 1000],
  ["mobile", 390, 844],
] as const) {
  test(`WhatsApp ${name} shows honest receipts, unsupported media and accessible composer`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height });
    await page.setContent(html(props));
    await expect(
      page.getByRole("heading", { name: conversation.customerName }),
    ).toBeVisible();
    await expect(page.getByText("Meta 已接收", { exact: true })).toBeVisible();
    await expect(page.getByText("結果待核實", { exact: true })).toBeVisible();
    await expect(page.getByText("收到 image 訊息")).toBeVisible();
    await expect(page.getByText("目前未提供附件預覽或播放。")).toBeVisible();
    await expect(
      page.locator(".wa-context-strip").getByText("曾由廣告進入"),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "回覆客戶" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "傳送回覆" })).toBeEnabled();
    if (name === "mobile")
      await expect(
        page.getByRole("button", { name: "返回對話列表" }),
      ).toBeVisible();
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
      path: info.outputPath(`smartvolt-whatsapp-${name}.png`),
      fullPage: true,
    });
  });
}
test("expired window disables freeform and describes approved template requirement", async ({
  page,
}) => {
  await page.setContent(
    html({
      ...props,
      selected: { ...conversation, lastInboundAt: now - 25 * 3600000 },
    }),
  );
  await expect(page.getByRole("textbox", { name: "回覆客戶" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "傳送回覆" })).toBeDisabled();
  await expect(
    page.getByText(/需要已核准嘅訊息範本先可以主動聯絡/),
  ).toBeVisible();
});

test("composer counts Unicode code points and allows 4096 supplementary characters", async ({
  page,
}) => {
  const unicode = "😀".repeat(4096);
  await page.setContent(html({ ...props, draft: unicode }));
  await expect(page.getByRole("textbox", { name: "回覆客戶" })).toHaveAttribute(
    "maxlength",
    "8192",
  );
  await expect(page.getByText("4096/4096", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "傳送回覆" })).toBeEnabled();
  await page.setContent(html({ ...props, draft: "字".repeat(4097) }));
  await expect(page.getByRole("button", { name: "傳送回覆" })).toBeDisabled();
});
test("uncertain request keeps draft and offers same request reconciliation", async ({
  page,
}) => {
  await page.setContent(
    html({
      ...props,
      pending: {
        clientId: "fixture-send-id",
        revision: 8,
        body: props.draft,
        phase: "uncertain",
      },
      messageError: "網絡連線中斷。",
    }),
  );
  await expect(page.getByRole("textbox", { name: "回覆客戶" })).toHaveValue(
    props.draft,
  );
  await expect(
    page.getByRole("button", { name: "核對傳送結果" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "傳送回覆" })).toBeDisabled();
  await expect(page.getByText(/用同一個發送識別碼核對/)).toBeVisible();
});
test("disconnected company contains no synthetic production conversations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(
    html({
      ...props,
      selected: null,
      connections: [],
      conversations: [],
      messages: [],
      nextCursor: null,
      nextBefore: null,
    }),
  );
  await expect(
    page.getByRole("heading", { name: "接通你嘅公司號碼" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "設定 WhatsApp" }),
  ).toHaveAttribute("href", "/company/isolated-presentation/settings/whatsapp");
  await expect(page.getByRole("textbox", { name: "回覆客戶" })).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

// Bundle the real client components in memory for isolated controller checks.
// This harness is injected only by Playwright; it adds no production route,
// test credentials, Auth exception, fixture dependency or provider request.
let clientBundle = "";
test.beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `import React from "react";
        import {createRoot} from "react-dom/client";
        import Inbox from "./src/components/whatsapp/WhatsAppInbox";
        import Setup from "./src/components/whatsapp/WhatsAppSetup";
        const target=document.getElementById("whatsapp-controller-fixture");
        createRoot(target).render(React.createElement(target.dataset.setup === "true" ? Setup : Inbox, {
          companyId:"isolated-presentation",companyName:"Aurora · isolated fixture",
          owner:true,canSend:true,canManage:true
        }));`,
      loader: "tsx",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": JSON.stringify("test") },
  });
  clientBundle = result.outputFiles[0].text;
});
async function mountController(page: Page, setup = false) {
  // Keep a same-origin base for real relative fetch URLs, then replace only
  // this test page's DOM with the harness. APIs remain intercepted per test.
  await page.route(
    "**/__whatsapp_controller_fixture__",
    (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html><body></body></html>",
      }),
    { times: 1 },
  );
  await page.goto("/__whatsapp_controller_fixture__");
  await page.setContent(
    `<!doctype html><html lang="zh-HK"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated WhatsApp controller</title><style>body{margin:0}${css}</style></head><body><div id="whatsapp-controller-fixture" data-setup="${setup}"></div></body></html>`,
  );
  await page.addScriptTag({ content: clientBundle });
}
function liveFixture() {
  const time = Date.now();
  const first = {
    ...conversation,
    unreadCount: 0,
    lastInboundAt: time - 60000,
    lastMessageAt: time - 30000,
  };
  const second = {
    ...first,
    id: "fixture-second",
    customerName: "第二位客戶 · 測試資料",
    lastMessageAt: time - 40000,
  };
  const incoming: WaMessageSummary = {
    ...message,
    providerAt: time - 60000,
    createdAt: new Date(time - 60000).toISOString(),
  };
  const connection = { ...props.connections[0], lastInboundAt: time - 60000 };
  return { first, second, incoming, connection };
}
const fulfill = (route: Route, data: unknown) => route.fulfill({ json: data });

test("real inbox controller sends once, receives acceptance and clears only confirmed draft", async ({
  page,
}) => {
  const f = liveFixture();
  const stored: WaMessageSummary[] = [f.incoming];
  const attempts: { clientId: string; body: string }[] = [];
  await page.route(
    "**/api/companies/isolated-presentation/whatsapp/**",
    async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/connections"))
        return fulfill(route, {
          connections: [f.connection],
          encryptionReady: true,
          brands: [{ id: "fixture-brand", name: "測試品牌" }],
          canManage: true,
        });
      if (url.pathname.endsWith("/inbox"))
        return fulfill(route, { conversations: [f.first], nextCursor: null });
      if (url.pathname.endsWith("/messages"))
        return fulfill(route, {
          conversation: f.first,
          messages: stored,
          nextBefore: null,
        });
      if (url.pathname.endsWith("/send")) {
        const body = route.request().postDataJSON();
        attempts.push(body);
        const outgoing: WaMessageSummary = {
          ...f.incoming,
          id: "fixture-accepted",
          seq: 2,
          direction: "outgoing",
          state: "accepted",
          body: body.body,
          authorName: "測試同事",
        };
        stored.push(outgoing);
        return fulfill(route, {
          message: outgoing,
          state: "accepted",
          dispatch: true,
        });
      }
      return fulfill(route, { conversation: f.first });
    },
  );
  await mountController(page);
  await page.getByRole("button", { name: /陳小姐 · 測試資料/ }).click();
  await expect(page.getByRole("textbox", { name: "回覆客戶" })).toBeEnabled();
  await page.getByRole("textbox", { name: "回覆客戶" }).fill("😀".repeat(4096));
  await page.getByRole("button", { name: "傳送回覆" }).click();
  await expect(page.getByText("Meta 已接收", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "回覆客戶" })).toHaveValue("");
  expect(attempts).toHaveLength(1);
  expect(attempts[0].clientId).toMatch(/^[0-9a-f-]{36}$/);
  expect(Array.from(attempts[0].body)).toHaveLength(4096);
  expect(attempts[0].body).toHaveLength(8192);
  await expect(page.getByText("已送達", { exact: true })).toHaveCount(0);
});

test("lost send response retains UUID and reconciles without a second provider dispatch", async ({
  page,
}) => {
  const f = liveFixture();
  const stored: WaMessageSummary[] = [f.incoming];
  const attempts: { clientId: string; body: string }[] = [];
  let dispatches = 0;
  let retryStatus = 401;
  await page.route(
    "**/api/companies/isolated-presentation/whatsapp/**",
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/connections"))
        return fulfill(route, {
          connections: [f.connection],
          encryptionReady: true,
          brands: [],
          canManage: true,
        });
      if (path.endsWith("/inbox"))
        return fulfill(route, { conversations: [f.first], nextCursor: null });
      if (path.endsWith("/messages"))
        return fulfill(route, {
          conversation: f.first,
          messages: stored,
          nextBefore: null,
        });
      if (path.endsWith("/send")) {
        const body = route.request().postDataJSON();
        attempts.push(body);
        if (attempts.length === 1) {
          dispatches += 1;
          stored.push({
            ...f.incoming,
            id: "fixture-uncertain-accepted",
            seq: 2,
            direction: "outgoing",
            state: "accepted",
            body: body.body,
          });
          return route.abort("connectionreset");
        }
        if (retryStatus !== 200)
          return route.fulfill({
            status: retryStatus,
            json: { error: "隔離測試：重新核對被拒絕。" },
          });
        return fulfill(route, {
          message: stored[1],
          state: "accepted",
          dispatch: false,
        });
      }
      return fulfill(route, { conversation: f.first });
    },
  );
  await mountController(page);
  await page.getByRole("button", { name: /陳小姐 · 測試資料/ }).click();
  const draft = page.getByRole("textbox", { name: "回覆客戶" });
  await draft.fill("網絡不確定時要保留同一個 UUID");
  await page.getByRole("button", { name: "傳送回覆" }).click();
  await expect(
    page.getByRole("button", { name: "核對傳送結果" }),
  ).toBeVisible();
  await expect(draft).toHaveValue("網絡不確定時要保留同一個 UUID");
  await expect(page.getByRole("button", { name: "傳送回覆" })).toBeDisabled();
  await page.getByRole("button", { name: "核對傳送結果" }).click();
  await expect.poll(() => attempts.length).toBe(2);
  await expect(
    page.getByRole("button", { name: "核對傳送結果" }),
  ).toBeVisible();
  await expect(draft).toHaveValue("網絡不確定時要保留同一個 UUID");
  await expect(page.getByRole("button", { name: "傳送回覆" })).toBeDisabled();
  retryStatus = 409;
  await page.getByRole("button", { name: "核對傳送結果" }).click();
  await expect.poll(() => attempts.length).toBe(3);
  await expect(
    page.getByRole("button", { name: "核對傳送結果" }),
  ).toBeVisible();
  await expect(draft).toHaveValue("網絡不確定時要保留同一個 UUID");
  retryStatus = 200;
  await page.getByRole("button", { name: "核對傳送結果" }).click();
  await expect(draft).toHaveValue("");
  expect(attempts).toHaveLength(4);
  expect(new Set(attempts.map((a) => a.clientId)).size).toBe(1);
  expect(new Set(attempts.map((a) => a.body)).size).toBe(1);
  expect(dispatches).toBe(1);
  await expect(page.getByText("Meta 已接收", { exact: true })).toHaveCount(1);
});

test("late message response cannot replace newly selected conversation or its draft", async ({
  page,
}) => {
  const f = liveFixture();
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let firstStarted = false;
  await page.route(
    "**/api/companies/isolated-presentation/whatsapp/**",
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/connections"))
        return fulfill(route, {
          connections: [f.connection],
          encryptionReady: true,
          brands: [],
          canManage: true,
        });
      if (path.endsWith("/inbox"))
        return fulfill(route, {
          conversations: [f.first, f.second],
          nextCursor: null,
        });
      if (path.endsWith(`/${f.first.id}/messages`)) {
        firstStarted = true;
        await firstGate;
        return fulfill(route, {
          conversation: f.first,
          messages: [{ ...f.incoming, body: "過期回應內容不可串入第二個對話" }],
          nextBefore: null,
        });
      }
      if (path.endsWith(`/${f.second.id}/messages`))
        return fulfill(route, {
          conversation: f.second,
          messages: [
            {
              ...f.incoming,
              id: "fixture-second-message",
              body: "第二個對話正確內容",
            },
          ],
          nextBefore: null,
        });
      return fulfill(route, { conversation: f.second });
    },
  );
  await mountController(page);
  await page.getByRole("button", { name: /陳小姐 · 測試資料/ }).click();
  await expect.poll(() => firstStarted).toBe(true);
  await page.getByRole("button", { name: /第二位客戶 · 測試資料/ }).click();
  await expect(
    page.getByText("第二個對話正確內容", { exact: true }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "回覆客戶" }).fill("第二個對話草稿");
  const firstDone = page.waitForResponse((response) =>
    response.url().includes(`/${f.first.id}/messages`),
  );
  releaseFirst();
  await firstDone;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(
    page.getByRole("heading", { name: f.second.customerName }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "回覆客戶" })).toHaveValue(
    "第二個對話草稿",
  );
  await expect(
    page.getByText("過期回應內容不可串入第二個對話", { exact: true }),
  ).toHaveCount(0);
});

test("malformed success response preserves draft and same UUID until persisted result is validated", async ({
  page,
}) => {
  const f = liveFixture();
  const attempts: { clientId: string; body: string }[] = [];
  await page.route(
    "**/api/companies/isolated-presentation/whatsapp/**",
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/connections"))
        return fulfill(route, {
          connections: [f.connection],
          encryptionReady: true,
          brands: [],
          canManage: true,
        });
      if (path.endsWith("/inbox"))
        return fulfill(route, { conversations: [f.first], nextCursor: null });
      if (path.endsWith("/messages"))
        return fulfill(route, {
          conversation: f.first,
          messages: [f.incoming],
          nextBefore: null,
        });
      if (path.endsWith("/send")) {
        const body = route.request().postDataJSON();
        attempts.push(body);
        if (attempts.length === 1)
          return fulfill(route, { state: "accepted", dispatch: true });
        return fulfill(route, {
          message: {
            ...f.incoming,
            id: "fixture-validated-result",
            seq: 2,
            direction: "outgoing",
            body: body.body,
            state: "accepted",
          },
          state: "accepted",
          dispatch: false,
        });
      }
      return fulfill(route, { conversation: f.first });
    },
  );
  await mountController(page);
  await page.getByRole("button", { name: /陳小姐 · 測試資料/ }).click();
  const draft = page.getByRole("textbox", { name: "回覆客戶" });
  await draft.fill("格式錯誤回應唔可以清走草稿");
  await page.getByRole("button", { name: "傳送回覆" }).click();
  await expect(
    page.getByRole("button", { name: "核對傳送結果" }),
  ).toBeVisible();
  await expect(draft).toHaveValue("格式錯誤回應唔可以清走草稿");
  await expect(page.getByRole("button", { name: "傳送回覆" })).toBeDisabled();
  await page.getByRole("button", { name: "核對傳送結果" }).click();
  await expect(draft).toHaveValue("");
  expect(attempts).toHaveLength(2);
  expect(attempts[1].clientId).toBe(attempts[0].clientId);
});

test("late poll snapshots cannot downgrade acknowledged or read receipt evidence", async ({
  page,
}) => {
  const f = liveFixture();
  let reads = 0;
  let releasePoll!: () => void;
  const stalePoll = new Promise<void>((resolve) => {
    releasePoll = resolve;
  });
  let releaseAccepted!: () => void;
  const staleAccepted = new Promise<void>((resolve) => {
    releaseAccepted = resolve;
  });
  let outgoing: WaMessageSummary = {
    ...f.incoming,
    id: "fixture-race-outgoing",
    seq: 2,
    direction: "outgoing",
    body: "回報狀態唔可以倒退",
    state: "dispatching",
  };
  await page.route(
    "**/api/companies/isolated-presentation/whatsapp/**",
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/connections"))
        return fulfill(route, {
          connections: [f.connection],
          encryptionReady: true,
          brands: [],
          canManage: true,
        });
      if (path.endsWith("/inbox"))
        return fulfill(route, { conversations: [f.first], nextCursor: null });
      if (path.endsWith("/messages")) {
        reads += 1;
        if (reads === 2) {
          const snapshot = { ...outgoing, state: "dispatching" };
          await stalePoll;
          return fulfill(route, {
            conversation: f.first,
            messages: [f.incoming, snapshot],
            nextBefore: null,
          });
        }
        return fulfill(route, {
          conversation: f.first,
          messages:
            reads === 1
              ? [f.incoming]
              : [
                  f.incoming,
                  { ...outgoing, state: reads === 4 ? "accepted" : "read" },
                ],
          nextBefore: null,
        });
      }
      if (path.endsWith("/send")) {
        outgoing = { ...outgoing, body: route.request().postDataJSON().body };
        await staleAccepted;
        return fulfill(route, {
          message: { ...outgoing, state: "accepted" },
          state: "accepted",
          dispatch: true,
        });
      }
      return fulfill(route, { conversation: f.first });
    },
  );
  await mountController(page);
  await page.getByRole("button", { name: /陳小姐 · 測試資料/ }).click();
  await expect(
    page.getByText(f.incoming.body, { exact: true }).last(),
  ).toBeVisible();
  await page.getByRole("button", { name: "重新讀取對話", exact: true }).click();
  await expect.poll(() => reads).toBe(2);
  await page.getByRole("textbox", { name: "回覆客戶" }).fill(outgoing.body);
  await page.getByRole("button", { name: "傳送回覆" }).click();
  releaseAccepted();
  await expect(page.getByText("Meta 已接收", { exact: true })).toBeVisible();
  const staleDone = page.waitForResponse((response) =>
    response.url().includes("/messages"),
  );
  releasePoll();
  await staleDone;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.getByText("Meta 已接收", { exact: true })).toBeVisible();
  await expect(page.getByText("傳送處理中", { exact: true })).toHaveCount(0);
  // A fresh manual fetch supplies definitive read evidence after the old poll.
  await page.getByRole("button", { name: "重新讀取對話", exact: true }).click();
  await expect(page.getByText("已讀", { exact: true })).toBeVisible();
  const acceptedDone = page.waitForResponse((response) =>
    response.url().includes("/messages"),
  );
  await page.getByRole("button", { name: "重新讀取對話", exact: true }).click();
  await acceptedDone;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.getByText("已讀", { exact: true })).toBeVisible();
  await expect(page.getByText("Meta 已接收", { exact: true })).toHaveCount(0);
  await expect(page.getByText("傳送處理中", { exact: true })).toHaveCount(0);
});

test("newer signed sent correction replaces old failure and stale failure cannot reverse it", async ({
  page,
}) => {
  const f = liveFixture();
  const failedAt = Date.now() - 15000;
  const outgoing: WaMessageSummary = {
    ...f.incoming,
    id: "fixture-corrected-receipt",
    seq: 2,
    direction: "outgoing",
    body: "供應商回報更正測試",
    state: "failed",
    statusAt: failedAt,
    errorCode: "131000",
  };
  let corrected = false;
  let stale = false;
  await page.route(
    "**/api/companies/isolated-presentation/whatsapp/**",
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/connections"))
        return fulfill(route, {
          connections: [f.connection],
          encryptionReady: true,
          brands: [],
          canManage: true,
        });
      if (path.endsWith("/inbox"))
        return fulfill(route, { conversations: [f.first], nextCursor: null });
      if (path.endsWith("/messages"))
        return fulfill(route, {
          conversation: f.first,
          messages: [
            f.incoming,
            corrected && !stale
              ? {
                  ...outgoing,
                  state: "sent",
                  statusAt: failedAt + 5000,
                  errorCode: null,
                }
              : outgoing,
          ],
          nextBefore: null,
        });
      return fulfill(route, { conversation: f.first });
    },
  );
  await mountController(page);
  await page.getByRole("button", { name: /陳小姐 · 測試資料/ }).click();
  await expect(page.getByText("傳送失敗", { exact: true })).toBeVisible();
  corrected = true;
  await page.getByRole("button", { name: "重新讀取對話", exact: true }).click();
  await expect(page.getByText("已傳送", { exact: true })).toBeVisible();
  await expect(page.getByText("傳送失敗", { exact: true })).toHaveCount(0);
  stale = true;
  const done = page.waitForResponse((response) =>
    response.url().includes("/messages"),
  );
  await page.getByRole("button", { name: "重新讀取對話", exact: true }).click();
  await done;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.getByText("已傳送", { exact: true })).toBeVisible();
  await expect(page.getByText("傳送失敗", { exact: true })).toHaveCount(0);
});

test("real setup controller leaves stored secrets blank and displays one-time token only after save", async ({
  page,
}) => {
  const f = liveFixture();
  const posted: Record<string, string>[] = [];
  await page.route(
    "**/api/companies/isolated-presentation/whatsapp/**",
    async (route) => {
      if (route.request().method() === "POST") {
        posted.push(route.request().postDataJSON());
        return fulfill(route, {
          connection: {
            ...f.connection,
            state: "configured",
            webhookVerifiedAt: null,
          },
          webhookUrl: "https://example.invalid/isolated-callback",
          verifyToken: "isolated-one-time-fixture-token",
        });
      }
      return fulfill(route, {
        connections: [f.connection],
        encryptionReady: true,
        brands: [{ id: "fixture-brand", name: "隔離品牌" }],
        canManage: true,
      });
    },
  );
  await mountController(page, true);
  await expect(page.getByLabel("App Secret", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("系統使用者 Access Token")).toHaveValue("");
  // The nested select's options contribute to its label text in getByLabel;
  // use the exact accessible combobox name confirmed by the CI snapshot.
  const connectionPicker = page.getByRole("combobox", {
    name: "連接",
    exact: true,
  });
  await connectionPicker.selectOption(f.connection.id);
  await expect(connectionPicker).toHaveValue(f.connection.id);
  await page
    .getByLabel("App Secret", { exact: true })
    .fill("isolated-app-secret-fixture");
  await page
    .getByLabel("系統使用者 Access Token")
    .fill("isolated-access-token-fixture");
  await page.getByRole("button", { name: "核實並加密儲存" }).click();
  await expect(
    page.getByRole("heading", { name: "已儲存，下一步驗證 webhook" }),
  ).toBeVisible();
  await expect(page.getByLabel("App Secret", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("系統使用者 Access Token")).toHaveValue("");
  await expect(
    page.getByLabel("一次性 Verify Token", { exact: true }),
  ).toHaveAttribute("type", "password");
  expect(posted).toHaveLength(1);
  expect(posted[0].id).toBe(f.connection.id);
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 });
});
