import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { chatFrameHtml, chatEmbedScript } from "../src/lib/web-chat/embed";
import { chatFramePolicy } from "../src/lib/web-chat/model";
const merchant = "https://merchant.example.org",
  app = "https://chat.example.org";
async function install(
  page: import("@playwright/test").Page,
  {
    lost = false,
    disabled = false,
  }: { lost?: boolean; disabled?: boolean } = {},
) {
  const id = randomUUID(),
    requests: {
      action: string;
      commandId?: string;
      body?: string;
      name?: string;
    }[] = [],
    messages: {
      id: string;
      sequence: number;
      direction: string;
      body: string;
      createdAt: string;
      actorName: null | string;
    }[] = [],
    sent = new Set<string>();
  let reads = 0,
    failed = false;
  await page.route(merchant + "/**", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<html lang="zh-HK"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Merchant</title><body><h1>品牌網站</h1><script src="${app}/embed/chat.js" data-convelta-chat="${id}" defer></script></body></html>`,
    }),
  );
  await page.route(app + "/embed/chat.js", (r) =>
    r.fulfill({
      contentType: "application/javascript",
      body: chatEmbedScript(app),
    }),
  );
  await page.route(app + "/chat/**", (r) =>
    r.fulfill({
      status: disabled ? 404 : 200,
      contentType: "text/html",
      headers: {
        "Content-Security-Policy": disabled
          ? "default-src 'none'; frame-ancestors 'none'"
          : chatFramePolicy([merchant], "test-nonce"),
      },
      body: disabled
        ? "網站聊天暫時未能使用"
        : chatFrameHtml(
            {
              id,
              name: "Example Studio",
              greeting: "你好，有咩可以幫到你？",
              origin: merchant,
            },
            "test-nonce",
          ),
    }),
  );
  await page.route(app + "/api/chat/**", async (route) => {
    const req = route.request();
    expect(new URL(req.url()).searchParams.has("token")).toBe(false);
    expect(req.headers().authorization).toMatch(/^Bearer [A-Za-z0-9_-]{43}$/);
    if (req.method() === "GET") {
      reads++;
      const after = Number(new URL(req.url()).searchParams.get("after") || 0);
      return route.fulfill({
        json: {
          messages: messages.filter((m) => m.sequence > after),
          status: "open",
          revision: messages.length,
        },
      });
    }
    const data = req.postDataJSON();
    requests.push(data);
    if (data.action === "send") {
      if (!sent.has(data.commandId)) {
        sent.add(data.commandId);
        messages.push({
          id: data.commandId,
          sequence: messages.length + 1,
          direction: "incoming",
          body: data.body,
          createdAt: "2026-11-16T00:00:00Z",
          actorName: null,
        });
      }
      if (lost && !failed) {
        failed = true;
        return route.abort("failed");
      }
    }
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto(merchant + "/");
  await page.getByRole("button", { name: "開啟網站查詢", exact: true }).click();
  const frame = page.frameLocator('iframe[title="網站查詢"]');
  return { id, frame, requests, messages, reads: () => reads };
}
test("branded widget retains actual source name and exchanges a human reply using private headers", async ({
  page,
}) => {
  const state = await install(page),
    frame = state.frame;
  await expect(
    frame.getByRole("heading", { name: "Example Studio" }),
  ).toBeVisible();
  await expect(frame.getByText("你好，有咩可以幫到你？")).toBeVisible();
  expect(state.requests).toHaveLength(0);
  await frame.getByLabel("點稱呼你？（選填）").fill("新訪客");
  await frame.getByRole("textbox", { name: "你嘅訊息" }).fill("我想了解服務");
  await frame.getByRole("button", { name: "發送", exact: true }).click();
  await expect(frame.getByText("我想了解服務", { exact: true })).toBeVisible();
  expect(state.requests[0].name).toBe("新訪客");
  state.messages.push({
    id: randomUUID(),
    sequence: 2,
    direction: "outgoing",
    body: "你好，我係店內同事，可以幫你了解。",
    actorName: "同事",
    createdAt: "2026-11-16T00:01:00Z",
  });
  await expect(
    frame.getByText("你好，我係店內同事，可以幫你了解。", { exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await frame.getByRole("button", { name: "收起網站查詢" }).click();
  await expect(
    page.getByRole("button", { name: "開啟網站查詢", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
});
test("lost-response retry retains command identity and produces one visible stored message", async ({
  page,
}) => {
  const state = await install(page, { lost: true }),
    frame = state.frame;
  await frame.getByRole("textbox", { name: "你嘅訊息" }).fill("只發送一次");
  await frame.getByRole("button", { name: "發送", exact: true }).click();
  await expect(
    frame.getByRole("button", { name: "重試同一則訊息" }),
  ).toBeVisible();
  await expect(frame.getByRole("textbox", { name: "你嘅訊息" })).toHaveValue(
    "只發送一次",
  );
  await frame.getByRole("button", { name: "重試同一則訊息" }).click();
  await expect(frame.getByText("只發送一次", { exact: true })).toHaveCount(1);
  const sends = state.requests.filter((r) => r.action === "send");
  expect(sends).toHaveLength(2);
  expect(sends[0].commandId).toBe(sends[1].commandId);
  expect(state.messages).toHaveLength(1);
});
test("mobile widget fits the viewport and keeps the composer reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { frame } = await install(page);
  await expect(frame.getByRole("textbox", { name: "你嘅訊息" })).toBeVisible();
  await expect(
    frame.getByRole("button", { name: "發送", exact: true }),
  ).toBeVisible();
  const width = await page
    .locator('iframe[title="網站查詢"]')
    .evaluate((e) => e.getBoundingClientRect().right);
  expect(width).toBeLessThanOrEqual(390);
  await expect(frame.locator("body")).not.toHaveAttribute("data-error", /.+/);
});
