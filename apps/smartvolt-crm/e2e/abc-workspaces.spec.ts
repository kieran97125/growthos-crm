import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { notificationAction } from "../src/lib/notifications/model";
import { rosterAction } from "../src/lib/operations/roster";
import { salesAction } from "../src/lib/sales/model";
import { feedbackAction } from "../src/lib/feedback/model";
const company = "11111111-1111-4111-8111-111111111111",
  uid = "22222222-2222-4222-8222-222222222222",
  eid = "33333333-3333-4333-8333-333333333333",
  now = "2026-11-14T12:00:00.000Z";
const policy = {
    timeZone: "Asia/Hong_Kong",
    hoursEnabled: false,
    responseMinutes: 15,
    weekly: [{ day: 1, start: 540, end: 1080 }],
    holidays: [],
  },
  brands = [{ id: "main", name: "Studio" }];
const modules: Record<string, string> = {
    supervision: "operations/SupervisionWorkspace",
    roster: "operations/RosterWorkspace",
    sales: "sales/SalesWorkspace",
    notifications: "notifications/NotificationWorkspace",
    reports: "reports/ReportsWorkspace",
    feedback: "feedback/FeedbackWorkspace",
  },
  bundles = new Map<string, string>();
const css = [
  "src/app/saas.css",
  "src/components/engagement/engagement.css",
  "src/components/operations/supervision.css",
  "src/components/operations/operations-navigation.css",
  "src/components/reports/reports.css",
]
  .map((p) => readFileSync(p, "utf8"))
  .join("\n");
const seed: Record<string, unknown> = {
  supervision: {
    brands,
    period: { from: "2026-11-01", to: "2026-11-14" },
    coverageFrom: "2026-11-01T00:00:00Z",
    checkedAt: now,
    policy: { revision: 0, data: policy },
    nextCursor: null,
    metrics: {
      pending: 73,
      overdue: 12,
      unmeasured: 2,
      episodes: 100,
      humanAnswered: 60,
      automatedAnswered: 20,
      averageResponseMinutes: 8.5,
      withinTarget: 55,
      resolved: 40,
      reopened: 3,
    },
    queue: [
      {
        key: "whatsapp:" + uid,
        provider: "whatsapp",
        thread_id: uid,
        customer_id: "customer",
        brand_id: "main",
        channel: "whatsapp",
        customer_name: "Casey · synthetic",
        owner_name: "Alex",
        started_at: "2026-11-14T10:00:00Z",
        response_due_at: "2026-11-14T10:15:00Z",
        first_automation_at: "2026-11-14T10:01:00Z",
        sort_at: "2026-11-14T10:15:00Z",
        measured: true,
        editing: true,
        editor_name: "Alex",
      },
    ],
  },
  roster: {
    canManage: true,
    branches: [{ id: uid, name: "Central", active: true, revision: 0 }],
    members: [
      {
        id: eid,
        name: "Alex",
        profile: {
          branchIds: [uid],
          skills: ["English"],
          timeZone: "Asia/Hong_Kong",
          rosterEnabled: true,
          weekly: [{ day: 1, start: 540, end: 1080 }],
          leavePeriods: [],
          revision: 0,
        },
      },
    ],
    requirement: { branchId: null, skills: [], revision: 0 },
  },
  sales: {
    available: true,
    canConfigure: true,
    canManage: true,
    canEdit: true,
    setting: { brandId: "main", enabled: true, revision: 0 },
    brands,
    total: 1,
    next: null,
    rows: [
      {
        source_id: uid,
        customer_id: "website:" + uid,
        brand_id: "main",
        reference: "CV-SYNTHETIC",
        source_created_at: now,
        status: "new",
        owner_id: null,
        follow_up_at: null,
        note: "Original note",
        revision: 0,
        source_snapshot: {
          name: "Casey · synthetic",
          company_name: "Synthetic Studio",
          phone: "+85260000001",
          email: "synthetic@example.invalid",
          message: "想了解 CRM 預約管理",
          interest: "crm",
          marketing_consent: false,
          consent_version: "synthetic-v1",
        },
      },
    ],
    members: [{ id: eid, name: "Alex" }],
  },
  notifications: {
    preferences: {
      data: {
        assignment: true,
        followup: true,
        sla: true,
        push: false,
        quietStart: 21,
        quietEnd: 9,
      },
      revision: 0,
    },
    pushConfigured: false,
    publicKey: null,
    total: 1,
    next: null,
    rows: [
      {
        id: uid,
        kind: "observation",
        title: "有停滯查詢可以研究 · synthetic",
        href: `/company/${company}/crm/reports`,
        revision: 0,
        created_at: now,
        evidence: {
          detail: "由正式紀錄整理，未等於可推播對象。",
          evidence: ["Synthetic source count: 2"],
          checkedAt: now,
          facts: [
            {
              id: "dormant",
              label: "正式來源",
              value: "2",
              source: "Synthetic scoped records",
            },
          ],
        },
      },
    ],
    devices: [],
  },
  reports: {
    coverageFrom: "2026-11-01T00:00:00Z",
    hasPos: true,
    canManageCosts: true,
    brands,
    query: {
      from: "2026-11-01",
      to: "2026-11-14",
      asOf: now,
      brand: "",
      mode: "period",
    },
    metrics: {
      inquiries: 173,
      customers: 140,
      confirmed: 45,
      attended: 32,
      baselineUnknown: 2,
      receiptsCents: 1200000,
      refundsCents: 100000,
      unassociated: 5,
    },
    trend: [
      { day: "2026-11-13", inquiries: 83, confirmed: 21 },
      { day: "2026-11-14", inquiries: 90, confirmed: 24 },
    ],
    channels: [{ channel: "whatsapp", inquiries: 173 }],
    staff: [{ id: eid, name: "Alex", replies: 60, response_minutes: 8.5 }],
    campaignTotal: 73,
    nextCampaign: "before=2026-11-01T00%3A00%3A00Z&id=" + uid,
    nextEvent: null,
    campaigns: [
      {
        id: uid,
        name: "Members follow-up · synthetic",
        created_at: now,
        recipients: 100,
        delivered: 80,
        replied: 30,
        optouts: 2,
        confirmed: 20,
        attended: 15,
        net_cents: 300000,
        cost_cents: null,
        cost_source: null,
        cost_revision: 0,
      },
    ],
    events: [
      {
        id: eid,
        source_key: "payment:verified-synthetic",
        source_version: "1",
        kind: "payment",
        occurred_at: now,
        observed_at: now,
        amount_cents: 1200000,
        baseline: false,
        product: "pos",
      },
    ],
  },
  feedback: {
    selectedBrand: "main",
    canConfigure: true,
    brands,
    consents: [],
    settings: [
      {
        brandId: "main",
        datasetId: "11111",
        businessId: "22222",
        adAccountId: "33333",
        label: "Synthetic brand dataset",
        enabled: false,
        mode: "test",
        testCode: "TEST_SYNTHETIC",
        verifiedAt: now,
        revision: 0,
      },
    ],
    jobs: [
      {
        id: uid,
        brand_id: "main",
        event_name: "Purchase",
        mode: "test",
        event_id: "a".repeat(64),
        state: "accepted",
        reason: null,
        receipt: { eventsReceived: 1, traceId: "synthetic_trace" },
        created_at: now,
        source_key: "purchase:synthetic-order",
        product: "pos",
      },
    ],
    next: null,
  },
};
test.beforeAll(async () => {
  await Promise.all(
    Object.entries(modules).map(async ([kind, path]) => {
      const r = await build({
        stdin: {
          contents: `import React from'react';import{createRoot}from'react-dom/client';import Workspace from'./src/components/${path}';createRoot(document.getElementById('fixture')).render(<Workspace companyId={window.__COMPANY__} initial={window.__DATA__}/>);`,
          resolveDir: process.cwd(),
          loader: "tsx",
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
      });
      bundles.set(kind, r.outputFiles[0].text);
    }),
  );
});
async function mount(
  page: Page,
  kind: string,
  {
    lost = false,
    mobile = false,
    initialData = undefined as Record<string, unknown> | undefined,
  } = {},
) {
  const data = structuredClone(initialData ?? seed[kind]) as Record<
      string,
      unknown
    >,
    commands: Record<string, unknown>[] = [],
    receipts = new Map<string, unknown>();
  let dropped = false;
  const endpoint = kind === "feedback" ? "meta-feedback" : kind;
  await page.route(`**/api/companies/${company}/${endpoint}*`, async (r) => {
    if (r.request().method() === "GET") {
      await r.fulfill({ json: data });
      return;
    }
    const command = r.request().postDataJSON() as Record<string, unknown>;
    commands.push(command);
    if (kind === "notifications") notificationAction.parse(command);
    if (kind === "roster") rosterAction.parse(command);
    if (kind === "sales") salesAction.parse(command);
    if (kind === "feedback") feedbackAction.parse(command);
    const key = String(command.commandId);
    if (!receipts.has(key)) {
      receipts.set(key, { saved: true });
      if (
        kind === "notifications" &&
        ["done", "snooze"].includes(String(command.action))
      ) {
        data.rows = [];
        data.total = 0;
      }
    }
    if (lost && !dropped) {
      dropped = true;
      await r.abort("failed");
      return;
    }
    await r.fulfill({ json: receipts.get(key) });
  });
  await page.route("**/__abc-fixture", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html lang="zh-HK"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Convelta workspace fixture</title><style>body{margin:0;font-family:Arial,sans-serif;background:#f8faff;color:#233b56}button,input,select,textarea{font:inherit}${css}</style></head><body><div id="fixture"></div><script>window.__COMPANY__=${JSON.stringify(company)};window.__DATA__=${JSON.stringify(data)};</script><script>${bundles.get(kind)!.replace(/<\/script/gi, "<\\/script")}</script></body></html>`,
    }),
  );
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/__abc-fixture");
  await expect(page.locator("main h1")).toBeVisible();
  return { data, commands };
}
test("supervisor queue keeps whole totals and edits office hours with an accessible dialog", async ({
  page,
}) => {
  const f = await mount(page, "supervision");
  await expect(page.getByText("73", { exact: true })).toBeVisible();
  await expect(page.getByText("流程已回覆，待真人處理")).toBeVisible();
  await page
    .getByRole("combobox", { name: "品牌", exact: true })
    .selectOption("main");
  await page.getByRole("button", { name: "辦公時間", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: /儲存/ }).click();
  await expect.poll(() => f.commands.length).toBe(1);
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
test("roster editing preserves stable branch IDs and real shift windows", async ({
  page,
}) => {
  const f = await mount(page, "roster");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.getByLabel("專長（以逗號分開）").fill("English,Beauty");
  await page.getByRole("button", { name: "儲存同事設定" }).click();
  await expect.poll(() => f.commands.length).toBe(1);
  expect(f.commands[0].branchIds).toEqual([uid]);
  expect(f.commands[0].skills).toEqual(["English", "Beauty"]);
  expect(f.commands[0].weekly).toEqual([{ day: 1, start: 540, end: 1080 }]);
});
test("notification lost response retries one command and finishes the reminder", async ({
  page,
}) => {
  const f = await mount(page, "notifications", { lost: true });
  await page.getByText("觀察來源", { exact: true }).click();
  await expect(page.locator(".eng-step-details")).toContainText(
    "Synthetic scoped records",
  );
  await page.getByRole("button", { name: "完成提醒" }).click();
  await expect(
    page.getByRole("button", { name: "核對同一請求" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "核對同一請求" }).click();
  await expect(page.getByText("暫時未有待處理提醒")).toBeVisible();
  expect(f.commands).toHaveLength(2);
  expect(f.commands[0]).toEqual(f.commands[1]);
  await page.getByText("提醒偏好與裝置", { exact: false }).click();
  await expect(
    page.getByRole("button", { name: "啟用目前裝置" }),
  ).toBeDisabled();
});
test("own-site follow-up submits the actual enquiry ID, colleague and Hong Kong date", async ({
  page,
}) => {
  const f = await mount(page, "sales");
  await page.getByText("跟進呢個查詢", { exact: true }).click();
  await page.getByLabel("跟進同事").selectOption(eid);
  await page.getByLabel("下次跟進（香港）").fill("2026-12-02T10:30");
  await page.getByLabel("跟進備註").fill("已核對需求");
  await page.getByRole("button", { name: "儲存跟進" }).click();
  await expect.poll(() => f.commands.length).toBe(1);
  expect(f.commands[0].id).toBe(uid);
  expect(f.commands[0].ownerId).toBe(eid);
  expect(f.commands[0].followUpAt).toBe("2026-12-02T02:30:00.000Z");
});
test("reports show full source totals, real refunds, missing costs and query cohorts", async ({
  page,
}) => {
  await mount(page, "reports");
  await expect(
    page.getByText(/截止 2026-11-14 20:00:00（香港）。/),
  ).toBeVisible();
  await expect(page.getByText("173", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("73 個推播")).toBeVisible();
  await expect(page.getByText("未記錄", { exact: true })).toBeVisible();
  await page.getByLabel("統計方式").selectOption("cohort");
  await page.getByRole("button", { name: "查看", exact: true }).click();
  await expect(page.getByText(/只追蹤所選期間首次查詢嘅客戶/)).toBeVisible();
  await page.getByText("核對來源與口徑", { exact: true }).click();
  await expect(
    page.getByText("payment:verified-synthetic", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/核實退款/).first()).toContainText("1,000.00");
});
test("Meta feedback separates test receipts and verifies explicit brand settings", async ({
  page,
}) => {
  const f = await mount(page, "feedback");
  await expect(page.getByText("Meta 已接收", { exact: true })).toBeVisible();
  await page
    .getByRole("checkbox", { name: /我有權管理以上 Meta 資產/ })
    .check();
  await page.getByRole("button", { name: "核實資產並儲存" }).click();
  await expect.poll(() => f.commands.length).toBe(1);
  expect(f.commands[0].mode).toBe("test");
  expect(f.commands[0].brandId).toBe("main");
  expect(f.commands[0].enabled).toBe(false);
  expect(f.commands[0].testCode).toBe("TEST_SYNTHETIC");
});
for (const kind of Object.keys(modules))
  test(`${kind} mobile view stays within screen and passes accessibility checks`, async ({
    page,
  }, info) => {
    await mount(page, kind, { mobile: true });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`abc-${kind}-mobile.png`),
      fullPage: true,
    });
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  });

for (const state of ["off", "no_device", "ready"] as const)
  test(`notification category cannot be confused with device push: ${state}`, async ({
    page,
  }) => {
    const initial = structuredClone(seed.notifications) as Record<
      string,
      unknown
    >;
    const preferences = initial.preferences as {
      data: Record<string, unknown>;
    };
    initial.pushConfigured = true;
    preferences.data.push = state !== "off";
    initial.devices =
      state === "ready"
        ? [
            {
              id: eid,
              label: "Synthetic device",
              active: true,
              created_at: now,
            },
          ]
        : [];
    const f = await mount(page, "notifications", { initialData: initial });
    const panel = page.getByRole("region", { name: "通知設定狀態" });
    await expect(panel.getByText("已開啟", { exact: true })).toBeVisible();
    await expect(
      panel.getByText(
        state === "off"
          ? "未啟用"
          : state === "no_device"
            ? "未有已登記接收裝置"
            : "設定就緒",
        { exact: true },
      ),
    ).toBeVisible();
    await page.getByText("提醒偏好與裝置", { exact: false }).click();
    await expect(
      page.getByRole("checkbox", {
        name: "網站新查詢及真人接待要求",
        exact: true,
      }),
    ).toBeChecked();
    await page
      .getByRole("checkbox", { name: "網站新查詢及真人接待要求", exact: true })
      .uncheck();
    await page
      .getByRole("button", { name: "儲存提醒偏好", exact: true })
      .click();
    await expect.poll(() => f.commands.length).toBe(1);
    expect((f.commands[0].data as Record<string, unknown>).website).toBe(false);
    if (state === "off")
      await page.screenshot({
        path: test.info().outputPath("website-category-on-device-push-off.png"),
        fullPage: true,
      });
  });
