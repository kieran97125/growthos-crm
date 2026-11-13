import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { BRAND_CSS } from "../src/lib/brand";
import type {
  InboxPage,
  InquiryDetail,
  Inquiry,
} from "../src/lib/inquiries/model";
const company = "11111111-1111-4111-8111-111111111111",
  owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  thread = "22222222-2222-4222-8222-222222222222",
  second = "33333333-3333-4333-8333-333333333333",
  message = "44444444-4444-4444-8444-444444444444";
let bundle = "";
const css = [
  "inquiries/inquiries.css",
  "meta/meta.css",
  "ai/ai.css",
  "operations/operations.css",
  "translation/translation.css",
]
  .map((f) => readFileSync("src/components/" + f, "utf8"))
  .join("\n");
test.beforeAll(async () => {
  bundle = (
    await build({
      stdin: {
        contents: `import React from 'react';import{createRoot}from'react-dom/client';import Inbox from './src/components/inquiries/UnifiedInbox';createRoot(document.getElementById('fixture')).render(React.createElement(Inbox,{companyId:'${company}',companyName:'Aurora Studio · synthetic',hasPos:true}));`,
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
    })
  ).outputFiles[0].text;
});
async function mount(page: Page) {
  await page.route(
    "**/__inquiry_fixture__",
    (r) =>
      r.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html><body></body></html>",
      }),
    { times: 1 },
  );
  await page.goto("/__inquiry_fixture__");
  await page.setContent(
    `<!doctype html><html lang="zh-HK"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated inquiry acceptance</title><style>:root{${Object.entries(
      BRAND_CSS,
    )
      .map(([k, v]) => k + ":" + v)
      .join(
        ";",
      )}}*{box-sizing:border-box}body{margin:0;font-family:Arial,'Noto Sans CJK TC',sans-serif}${css}</style></head><body><div id="fixture"></div></body></html>`,
  );
  await page.addScriptTag({ content: bundle });
}
function fixture(canEdit = true) {
  const row: Inquiry = {
    key: "meta:" + thread,
    provider: "meta",
    id: thread,
    channel: "messenger",
    brand_id: "main",
    revision: 1,
    customer_id: "customer-one",
    link_revision: 0,
    name: "Casey Chan",
    updated_at: new Date().toISOString(),
    unread_count: 1,
    preview: "星期六想約試堂",
    last_inbound_at: Date.now(),
    assignee_active: false,
    customer_name: "",
    assignee_id: null,
    priority: "normal",
    follow_up_at: null,
    next_step: "",
    status: "open",
  };
  const other: Inquiry = {
    ...row,
    key: "whatsapp:" + second,
    provider: "whatsapp",
    channel: "whatsapp",
    id: second,
    customer_id: "customer-two",
    name: "Jordan Lee",
    preview: "查詢套票安排",
  };
  const overview: InboxPage = {
    threads: [row, other],
    counts: {
      all: 2,
      mine: 0,
      unassigned: 2,
      overdue: 0,
      priority: 0,
      unread: 2,
      resolved: 0,
    },
    nextCursor: null,
    companyName: "Aurora Studio · synthetic",
    actorId: owner,
    canEdit,
    hasPos: true,
    members: [{ user_id: owner, display_name: "Mia" }],
    brands: [{ id: "main", name: "Aurora Studio" }],
    connections: [
      { channel: "messenger", label: "Aurora Page", state: "inbound-observed" },
      { channel: "whatsapp", label: "Aurora WhatsApp", state: "active" },
    ],
  };
  const detail: InquiryDetail = {
    thread: row,
    customer: {
      id: "customer-one",
      name: "Casey Chan",
      phone: "+85260000000",
      email: "",
      tags: ["試堂查詢"],
      note: "偏好周末",
      source: "messenger",
      brandIds: ["main"],
      revision: 0,
    },
    links: [{ provider: "meta", thread_id: thread, brand_id: "main" }],
    events: [
      {
        seq: 1,
        kind: "channel-linked",
        detail: { provider: "meta" },
        created_at: new Date().toISOString(),
      },
    ],
    nextEvent: null,
    requests: [],
    hasMoreRequests: false,
    messages: [
      {
        id: message,
        seq: 1,
        direction: "incoming",
        body: "Can I book a trial on Saturday?",
        state: "received",
        at: Date.now(),
        author: null,
      },
    ],
    nextBefore: null,
    activity: [],
  };
  return { overview, detail, other };
}

async function inbox(
  page: Page,
  translate: (r: Route, b: Record<string, unknown>) => Promise<void>,
  canEdit = true,
) {
  const f = fixture(canEdit);
  const sends: unknown[] = [];
  await page.route("**/api/translate", (r) =>
    translate(r, r.request().postDataJSON()),
  );
  await page.route("**/api/companies/**", async (r) => {
    const url = new URL(r.request().url());
    if (r.request().method() === "POST") {
      sends.push(r.request().postDataJSON());
      await r.fulfill({ json: { saved: true } });
      return;
    }
    if (url.pathname.endsWith("/inbox") && url.searchParams.has("thread")) {
      const secondThread = url.searchParams.get("thread") === second;
      await r.fulfill({
        json: secondThread
          ? {
              ...f.detail,
              thread: f.other,
              messages: [
                { ...f.detail.messages[0], id: second, body: "查詢套票安排" },
              ],
            }
          : f.detail,
      });
    } else if (url.pathname.endsWith("/inbox"))
      await r.fulfill({ json: f.overview });
    else await r.fulfill({ json: {} });
  });
  await mount(page);
  await page.getByRole("button", { name: /Casey Chan/ }).click();
  await expect(page.getByLabel("回覆草稿", { exact: true })).toBeVisible();
  return sends;
}
const reply = "星期六可能有位，請先話我知方便嘅時間。";
for (const [name, width, height] of [
  ["desktop", 1440, 1000],
  ["mobile", 390, 844],
] as const) {
  test(`translation ${name}: original remains visible, both directions work, draft can undo and no message is sent`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height });
    const requests: Record<string, unknown>[] = [];
    const sends = await inbox(page, async (r, b) => {
      requests.push(b);
      await r.fulfill({
        json: {
          requestId: b.requestId,
          target: b.target,
          text:
            b.mode === "message"
              ? "我可以預約星期六試堂嗎？"
              : "Saturday may be available. Please let me know your preferred time first.",
        },
      });
    });
    await expect(page.locator(".cv-tr-language").first()).toHaveText("English");
    await page
      .getByRole("button", { name: "將客戶訊息翻譯成繁中", exact: true })
      .click();
    await expect(page.getByLabel("客戶訊息譯文")).toContainText(
      "我可以預約星期六試堂嗎？",
    );
    await expect(
      page.getByText("Can I book a trial on Saturday?", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "收起譯文" }).click();
    await expect(page.getByLabel("客戶訊息譯文")).toHaveCount(0);
    await page.getByRole("button", { name: "顯示譯文" }).click();
    const draft = page.getByLabel("回覆草稿", { exact: true });
    await draft.fill(reply);
    await page
      .getByRole("button", { name: "將草稿翻譯成英文", exact: true })
      .click();
    await expect(draft).toHaveValue(
      "Saturday may be available. Please let me know your preferred time first.",
    );
    await page.getByRole("button", { name: "還原原文" }).click();
    await expect(draft).toHaveValue(reply);
    expect(requests).toHaveLength(2);
    expect(requests[0]).not.toHaveProperty("text");
    expect(sends).toHaveLength(0);
    expect(
      (await new AxeBuilder({ page }).analyze()).violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      ),
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`${name}-translation.png`),
      fullPage: true,
    });
  });
}
test("late translation never overwrites continued typing; explicit apply and undo preserve the latest draft", async ({
  page,
}) => {
  let held: Route | undefined;
  let body: Record<string, unknown> = {};
  const sends = await inbox(page, async (r, b) => {
    held = r;
    body = b;
  });
  const draft = page.getByLabel("回覆草稿", { exact: true });
  await draft.fill(reply);
  await page
    .getByRole("button", { name: "將草稿翻譯成英文", exact: true })
    .click();
  await expect(page.getByText("翻譯中…", { exact: true })).toBeVisible();
  await draft.fill("我加咗新內容，唔好覆蓋。");
  await held!.fulfill({
    json: {
      requestId: body.requestId,
      target: "en",
      text: "Saturday may be available.",
    },
  });
  await expect(page.getByLabel("待套用草稿譯文")).toBeVisible();
  await expect(draft).toHaveValue("我加咗新內容，唔好覆蓋。");
  await page.getByRole("button", { name: "以譯文取代草稿" }).click();
  await expect(draft).toHaveValue("Saturday may be available.");
  await page.getByRole("button", { name: "還原原文" }).click();
  await expect(draft).toHaveValue("我加咗新內容，唔好覆蓋。");
  expect(sends).toHaveLength(0);
});
test("switching conversations during translation keeps each draft separate and reuses a completed result", async ({
  page,
}) => {
  let held: Route | undefined;
  let body: Record<string, unknown> = {};
  let calls = 0;
  await inbox(page, async (r, b) => {
    calls++;
    held = r;
    body = b;
  });
  const draft = page.getByLabel("回覆草稿", { exact: true });
  await draft.fill(reply);
  await page
    .getByRole("button", { name: "將草稿翻譯成英文", exact: true })
    .click();
  await expect(page.getByText("翻譯中…", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Jordan Lee/ }).click();
  await draft.fill("另一位客戶草稿");
  await held!.fulfill({
    json: {
      requestId: body.requestId,
      target: "en",
      text: "Saturday may be available.",
    },
  });
  await expect(draft).toHaveValue("另一位客戶草稿");
  await page.getByRole("button", { name: /Casey Chan/ }).click();
  await expect(draft).toHaveValue(reply);
  await page
    .getByRole("button", { name: "將草稿翻譯成英文", exact: true })
    .click();
  await expect(draft).toHaveValue("Saturday may be available.");
  expect(calls).toBe(1);
});
test("lost response retry keeps the same UUID; quota errors leave the original draft available", async ({
  page,
}) => {
  const bodies: Record<string, unknown>[] = [];
  await inbox(page, async (r, b) => {
    bodies.push(b);
    if (bodies.length === 1) await r.abort("failed");
    else if (bodies.length === 2)
      await r.fulfill({
        json: {
          requestId: b.requestId,
          target: "en",
          text: "Saturday may be available.",
        },
      });
    else
      await r.fulfill({
        status: 429,
        json: { code: "daily_limit", error: "今日 AI 用量已達上限" },
      });
  });
  const draft = page.getByLabel("回覆草稿", { exact: true });
  await draft.fill(reply);
  await page
    .getByRole("button", { name: "將草稿翻譯成英文", exact: true })
    .click();
  await expect(page.locator(".cv-tr-error")).toBeVisible();
  await expect(draft).toHaveValue(reply);
  await page
    .getByRole("button", { name: "將草稿翻譯成英文", exact: true })
    .click();
  await expect(draft).toHaveValue("Saturday may be available.");
  expect(bodies[0].requestId).toBe(bodies[1].requestId);
  await page
    .getByRole("button", { name: "將草稿翻譯成繁中", exact: true })
    .click();
  await expect(page.locator(".cv-tr-error")).toContainText(
    "今日 AI 用量已達上限",
  );
  await expect(draft).toHaveValue("Saturday may be available.");
});
test("long translations cannot enter an undersized channel composer", async ({
  page,
}) => {
  await inbox(page, async (r, b) =>
    r.fulfill({
      json: { requestId: b.requestId, target: "en", text: "a".repeat(2001) },
    }),
  );
  const draft = page.getByLabel("回覆草稿", { exact: true });
  await draft.fill(reply);
  await page
    .getByRole("button", { name: "將草稿翻譯成英文", exact: true })
    .click();
  await expect(page.getByLabel("待套用草稿譯文")).toContainText(
    "譯文超出此渠道字數",
  );
  await expect(
    page.getByRole("button", { name: "以譯文取代草稿" }),
  ).toBeDisabled();
  await expect(draft).toHaveValue(reply);
});
test("view-only inbox cannot request a translation", async ({ page }) => {
  let calls = 0;
  await inbox(
    page,
    async (r) => {
      calls++;
      await r.fulfill({ json: {} });
    },
    false,
  );
  await expect(
    page.getByRole("button", { name: "將客戶訊息翻譯成繁中", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "將草稿翻譯成英文", exact: true }),
  ).toBeDisabled();
  expect(calls).toBe(0);
});
