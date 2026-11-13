import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { BRAND_CSS } from "../src/lib/brand";
import {
  defaultSettings,
  operationsAction,
  type OperationsAction,
  type OperationsContext,
} from "../src/lib/operations/model";
import type {
  InboxPage,
  InquiryDetail,
  Inquiry,
  InquiryAction,
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
        body: "星期六想約試堂，下午有冇位？",
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
async function mock(
  page: Page,
  options: { canEdit?: boolean; lostSend?: boolean } = {},
) {
  const f = fixture(options.canEdit),
    commands: InquiryAction[] = [],
    sendIds: string[] = [];
  let lost = !!options.lostSend;
  const operationCommands: OperationsAction[] = [];
  const operationContext: OperationsContext = {
    canEdit: options.canEdit !== false,
    canManage: options.canEdit !== false,
    actorId: owner,
    lifecycle: {
      customer_id: "customer-one",
      brand_id: "main",
      stage_id: "new",
      revision: 0,
      reason: "",
    },
    stages: defaultSettings.stages,
    followups: [],
    handoff: null,
  };
  await page.route("**/api/companies/**", async (r) => {
    const url = new URL(r.request().url());
    if (url.pathname.endsWith("/operations")) {
      if (r.request().method() === "POST") {
        const c = operationsAction.parse(r.request().postDataJSON());
        operationCommands.push(c);
        if (c.action === "handoff")
          operationContext.handoff = {
            summary: "客戶想了解星期六試堂",
            interest: "high",
            next_step: "核對方便時段",
            created_at: new Date().toISOString(),
          };
        if (c.action === "stage") {
          operationContext.lifecycle.stage_id = c.stageId;
          operationContext.lifecycle.revision++;
          operationContext.lifecycle.reason = c.reason;
        }
        if (c.action === "followup-create")
          operationContext.followups.push({
            id: c.commandId,
            customer_id: "customer-one",
            brand_id: "main",
            provider: c.provider,
            thread_id: c.threadId,
            title: c.title,
            due_at: c.dueAt,
            owner_id: c.ownerId,
            owner_name: null,
            status: "open",
            revision: 0,
            name: "Casey Chan",
          });
        await r.fulfill({ json: { saved: true } });
        return;
      }
      await r.fulfill({
        json: {
          ...operationContext,
          lifecycle: {
            ...operationContext.lifecycle,
            customer_id:
              url.searchParams.get("thread") === second
                ? "customer-two"
                : f.detail.thread.customer_id,
          },
        },
      });
      return;
    }
    if (r.request().method() === "POST") {
      const c = r.request().postDataJSON() as InquiryAction;
      commands.push(c);
      if (c.action === "send") {
        sendIds.push(c.commandId);
        if (lost) {
          lost = false;
          await r.abort("failed");
          return;
        }
        if (!f.detail.messages.some((m) => m.id === c.commandId))
          f.detail.messages.push({
            id: c.commandId,
            seq: 2,
            direction: "outgoing",
            body: c.body,
            state: "accepted",
            at: Date.now(),
            author: "Mia",
          });
      }
      if (c.action === "manage") {
        f.detail.thread = {
          ...f.detail.thread,
          ...c.data,
          revision: f.detail.thread.revision + 1,
        };
        f.overview.threads[0] = f.detail.thread;
      }
      if (c.action === "relink") {
        f.detail.customer = {
          ...f.detail.customer,
          id: c.customerId,
          name: "Casey · verified member",
        };
        f.detail.thread = {
          ...f.detail.thread,
          customer_id: c.customerId,
          link_revision: 1,
        };
      }
      if (c.action === "booking-create")
        f.detail.requests.push({
          id: c.requestId,
          customer_id: c.customerId,
          brand_id: "main",
          provider: c.provider,
          thread_id: c.threadId,
          service: c.service,
          desired_at: c.desiredAt,
          guests: c.guests,
          note: c.note,
          status: "requested",
          revision: 0,
          pos_appointment_id: null,
        });
      if (c.action === "booking-convert") {
        const b = f.detail.requests.find((b) => b.id === c.requestId)!;
        b.status = "linked";
        b.revision++;
        b.pos_appointment_id = "request-" + b.id;
        b.appointment = {
          status: "confirmed",
          startsAt: c.startsAt,
          serviceName: "Private Training",
        };
      }
      await r.fulfill({ json: { saved: true, state: "accepted" } });
      return;
    }
    if (url.pathname.endsWith("/customers")) {
      await r.fulfill({
        json: {
          customers: [
            {
              id: "existing-member",
              name: "Casey · verified member",
              phone: "+85260000000",
            },
          ],
          nextAfter: null,
        },
      });
      return;
    }
    if (url.searchParams.has("requestId")) {
      await r.fulfill({
        json: {
          revision: 4,
          requestRevision: 0,
          services: [
            {
              id: "training",
              name: "Private Training",
              durationMinutes: 60,
              priceCents: 50000,
            },
          ],
          choices: url.searchParams.get("serviceId")
            ? [
                {
                  staffId: owner,
                  staffName: "Mia",
                  resourceId: "studio-one",
                  resourceName: "Studio 1",
                  startsAt: Number(url.searchParams.get("at")),
                },
              ]
            : [],
          blocker: null,
        },
      });
      return;
    }
    if (url.searchParams.has("thread")) {
      const d =
        url.searchParams.get("thread") === second
          ? {
              ...f.detail,
              thread: f.other,
              customer: {
                ...f.detail.customer,
                id: "customer-two",
                name: "Jordan Lee",
              },
            }
          : f.detail;
      await r.fulfill({ json: d });
      return;
    }
    const overview = {
      ...f.overview,
      threads: f.overview.threads.filter(
        (t) =>
          url.searchParams.get("channel") === "all" ||
          !url.searchParams.get("channel") ||
          t.channel === url.searchParams.get("channel"),
      ),
    };
    await r.fulfill({ json: overview });
  });
  return { ...f, commands, sendIds, operationCommands };
}
for (const mobile of [false, true])
  test(`${mobile ? "mobile" : "desktop"}: actual inbox controller connects customer, appointment and POS`, async ({
    page,
  }, info) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const f = await mock(page);
    await mount(page);
    await page.getByRole("button", { name: /Casey Chan/ }).click();
    if (mobile) await page.getByRole("button", { name: /客戶資料/ }).click();
    await page.getByRole("tab", { name: "預約", exact: true }).click();
    await page.getByRole("button", { name: "新增預約意向" }).click();
    await page.getByLabel("服務／課程").fill("Private Training");
    await page.getByLabel("心儀時間（香港）").fill("2026-12-01T15:00");
    await page.getByRole("button", { name: "登記意向", exact: true }).click();
    await expect(page.getByText("預約意向", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "核對及確認" }).click();
    await page.getByRole("button", { name: "查可用人員及資源" }).click();
    await page.getByLabel("已核實客戶同意、服務、時間及名額").check();
    await expect(
      page.getByRole("button", { name: "確認預約並同步 POS" }),
    ).toBeDisabled();
    await page.getByLabel("可用安排").selectOption("0");
    await expect(
      page.getByRole("button", { name: "確認預約並同步 POS" }),
    ).toBeDisabled();
    await page.getByLabel("已核實客戶同意、服務、時間及名額").check();
    await page.getByRole("button", { name: "確認預約並同步 POS" }).click();
    await expect(page.getByText("已確認", { exact: true })).toBeVisible();
    expect(
      f.commands.filter((c) => c.action === "booking-convert"),
    ).toHaveLength(1);
    await expect(
      page.getByRole("link", { name: /到 POS 管理/ }),
    ).toHaveAttribute("href", /contact=customer-one&brand=main/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`unified-${mobile ? "mobile" : "desktop"}.png`),
      fullPage: true,
    });
    const a11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(a11y.violations).toEqual([]);
  });
test("lost send response retains the exact UUID, locks new send and reconciles the original", async ({
  page,
}) => {
  const f = await mock(page, { lostSend: true });
  await mount(page);
  await page.getByRole("button", { name: /Casey Chan/ }).click();
  await page.getByLabel("回覆草稿").fill("你好，幫你核對時間。");
  await page.getByRole("button", { name: "傳送回覆" }).click();
  await expect(
    page.getByRole("button", { name: "核對同一操作" }),
  ).toBeVisible();
  await expect(page.getByLabel("回覆草稿")).toHaveValue("你好，幫你核對時間。");
  await page.getByRole("button", { name: "核對同一操作" }).click();
  await expect(page.getByLabel("回覆草稿")).toHaveValue("");
  expect(f.sendIds).toHaveLength(2);
  expect(f.sendIds[0]).toBe(f.sendIds[1]);
  await expect(page.getByText("平台已接受", { exact: true })).toBeVisible();
  await expect(page.getByText("已送達", { exact: true })).toHaveCount(0);
});
test("channel switching preserves drafts and common ownership uses real operation commands", async ({
  page,
}) => {
  const f = await mock(page);
  await mount(page);
  await page.getByRole("button", { name: /Casey Chan/ }).click();
  await page.getByLabel("回覆草稿").fill("待核實嘅回覆");
  await page.getByRole("button", { name: /Jordan Lee/ }).click();
  await page.getByLabel("回覆草稿").fill("另一位客戶草稿");
  await page.getByRole("button", { name: /Casey Chan/ }).click();
  await expect(page.getByLabel("回覆草稿")).toHaveValue("待核實嘅回覆");
  await page
    .locator(".iq-context")
    .getByRole("button", { name: "AI 及跟進", exact: true })
    .click();
  await page.getByLabel("負責同事").selectOption(owner);
  await page.getByLabel("下一步行動").fill("核對試堂時間");
  await page.getByRole("button", { name: "儲存跟進", exact: true }).click();
  await expect(page.getByText("已儲存並同步公司資料。")).toBeVisible();
  expect(
    f.commands.some((c) => c.action === "manage" && c.provider === "meta"),
  ).toBe(true);
});
test("identity linking requires selecting a verified customer and recording a reason", async ({
  page,
}) => {
  const f = await mock(page);
  await mount(page);
  await page.getByRole("button", { name: /Casey Chan/ }).click();
  await page.getByRole("button", { name: "連結已有客戶", exact: true }).click();
  await page.getByLabel("搜尋同品牌客戶").fill("Casey");
  await page.getByRole("button", { name: "搜尋客戶", exact: true }).click();
  await page.getByLabel("已核實的客戶").selectOption("existing-member");
  await expect(
    page.getByRole("button", { name: "確認連結", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("核實依據").fill("客人已確認會員資料");
  await page.getByRole("button", { name: "確認連結", exact: true }).click();
  await expect(
    page
      .getByRole("heading", { name: "Casey · verified member", exact: true })
      .first(),
  ).toBeVisible();
  expect(
    f.commands.some(
      (c) => c.action === "relink" && c.reason === "客人已確認會員資料",
    ),
  ).toBe(true);
});
test("viewer can read customer context but cannot send, edit, assign or create a booking", async ({
  page,
}) => {
  const f = await mock(page, { canEdit: false });
  await mount(page);
  await page.getByRole("button", { name: /Casey Chan/ }).click();
  await expect(page.getByLabel("回覆草稿")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "編輯客戶資料", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "預約", exact: true }).click();
  await expect(page.getByRole("button", { name: "新增預約意向" })).toHaveCount(
    0,
  );
  await page
    .locator(".iq-context")
    .getByRole("button", { name: "AI 及跟進", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "按在手查詢量分派" }),
  ).toBeDisabled();
  expect(f.commands).toHaveLength(0);
});

test("staff adopts saved AI context, sets an operational stage and schedules a follow-up without sending", async ({
  page,
}, info) => {
  const f = await mock(page);
  let requestId = "";
  await page.route("**/api/assistant", (r) => {
    const input = r.request().postDataJSON();
    requestId = input.requestId;
    return r.fulfill({
      json: {
        requestId,
        decision: "draft",
        reply: "想了解你星期六方便嘅時段，再由同事核對安排。",
        reason: "Synthetic approved knowledge",
        summary: "客戶想了解星期六試堂",
        nextStep: "核對方便時段",
        interest: "high",
        missing: [],
        sources: [],
        evidence: [],
        model: "synthetic/model",
        goal: input.goal,
      },
    });
  });
  await mount(page);
  await page.getByRole("button", { name: /Casey Chan/ }).click();
  await page
    .locator(".iq-context")
    .getByRole("button", { name: "AI 及跟進", exact: true })
    .click();
  await expect(page.getByLabel("對話客戶階段")).toBeEnabled();
  await page.getByRole("button", { name: "準備 AI 回覆建議" }).click();
  await page.getByRole("button", { name: "採納交接重點" }).click();
  await expect(page.getByRole("button", { name: "已保存交接" })).toBeDisabled();
  await expect(page.locator(".co-handoff")).toContainText(
    "客戶想了解星期六試堂",
  );
  const adopted = f.operationCommands.find((c) => c.action === "handoff");
  expect(adopted).toMatchObject({
    requestId,
    threadId: thread,
    customerId: "customer-one",
    stageId: null,
  });
  expect(adopted).not.toHaveProperty("summary");
  await page.getByLabel("對話客戶階段").selectOption("qualified");
  await page.getByLabel("原因", { exact: true }).fill("已核對客戶試堂需要");
  await page.getByRole("button", { name: "儲存階段", exact: true }).click();
  await expect
    .poll(() => f.operationCommands.filter((c) => c.action === "stage").length)
    .toBe(1);
  await page.getByText("新增跟進事項", { exact: true }).click();
  await page.getByLabel("下一步", { exact: true }).fill("核對星期六時段");
  const day = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await page.getByLabel("香港跟進時間").fill(day + "T10:30");
  await page.getByRole("button", { name: "加入跟進", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "完成 核對星期六時段" }),
  ).toBeVisible();
  const task = f.operationCommands.find((c) => c.action === "followup-create");
  expect(task).toMatchObject({
    dueAt: day + "T02:30:00.000Z",
    title: "核對星期六時段",
  });
  expect(f.sendIds).toHaveLength(0);
  await page.screenshot({
    path: info.outputPath("inquiry-ai-handoff-followup.png"),
    fullPage: true,
  });
});
