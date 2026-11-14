import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import {
  engagementAction,
  type EngagementPage,
  type Campaign,
} from "../src/lib/engagement/model";
const company = "11111111-1111-4111-8111-111111111111",
  connection = "22222222-2222-4222-8222-222222222222";
let bundle = "";
const styles = ["src/app/saas.css", "src/components/engagement/engagement.css"]
  .map((p) => readFileSync(p, "utf8"))
  .join("\n");
test.beforeAll(async () => {
  bundle = (
    await build({
      stdin: {
        loader: "tsx",
        resolveDir: process.cwd(),
        contents:
          "import React from'react';import{createRoot}from'react-dom/client';import EngagementWorkspace from'./src/components/engagement/EngagementWorkspace';createRoot(document.getElementById('fixture')).render(<EngagementWorkspace companyId={window.__COMPANY__} initial={window.__ENG__}/>);",
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
async function fixture(
  page: Page,
  { viewer = false, lost = false, existing = false } = {},
) {
  const now = new Date().toISOString(),
    data: EngagementPage = {
      canManage: !viewer,
      canManageCompany: !viewer,
      canEdit: !viewer,
      brands: [
        { id: "main", name: "Studio" },
        { id: "other", name: "Clinic" },
      ],
      connections: [
        {
          id: connection,
          brand_id: "main",
          provider: "whatsapp",
          channel: "whatsapp",
          label: "Studio WhatsApp",
          ready: true,
          inbound: true,
          accepted: false,
          delivered: false,
        },
      ],
      templates: [
        {
          connection_id: connection,
          checked_at: now,
          templates: [
            {
              id: "90001",
              name: "synthetic_offer",
              language: "en",
              status: "APPROVED",
              category: "MARKETING",
              supported: true,
              fingerprint: "a".repeat(64),
              body: "Hello {{1}}",
              slots: [{ component: "body", key: "1" }],
              components: [{ type: "BODY", text: "Hello {{1}}" }],
            },
          ],
        },
      ],
      campaigns: [],
      nextCampaign: null,
      policy: {
        marketing_enabled: true,
        quiet_start: 21,
        quiet_end: 9,
        frequency_hours: 72,
        daily_limit: 200,
        minute_limit: 10,
        revision: 0,
      },
      results: [],
      nextResult: null,
      resultTotal: 0,
      resultCounts: {},
      preferences: [],
      audience: null,
    };
  const seed: Campaign = {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Synthetic scheduled campaign",
    brand_id: "main",
    channel: "whatsapp",
    purpose: "marketing",
    status: "scheduled",
    due_at: now,
    created_at: now,
    total: 73,
    counts: { scheduled: 73 },
  };
  if (existing) data.campaigns.push(seed);
  const commands: ReturnType<typeof engagementAction.parse>[] = [],
    receipts = new Map<string, unknown>();
  let dropped = false;
  await page.route(`**/api/companies/${company}/engagement*`, async (r) => {
    const url = new URL(r.request().url());
    if (r.request().method() === "GET") {
      if (url.searchParams.has("connection")) {
        await r.fulfill({
          json: {
            ...data,
            audience: {
              total: url.searchParams.get("tag") === "empty" ? 0 : 3,
              consented: 2,
              sample: [{ customer_id: "one", customer_name: "Synthetic Leah" }],
            },
          },
        });
        return;
      }
      if (url.searchParams.has("campaign")) {
        const next = url.searchParams.has("after");
        await r.fulfill({
          json: {
            ...data,
            resultTotal: 73,
            resultCounts: { scheduled: 73 },
            results: Array.from({ length: next ? 23 : 50 }, (_, i) => ({
              id: `result-${(next ? 50 : 0) + i}`,
              customer_id: `customer-${i}`,
              customer_name: `Synthetic customer ${(next ? 50 : 0) + i + 1}`,
              state: "scheduled",
              reason: null,
              due_at: now,
              updated_at: now,
            })),
            nextResult: next ? null : "44444444-4444-4444-8444-444444444444",
          },
        });
        return;
      }
      await r.fulfill({ json: data });
      return;
    }
    const c = engagementAction.parse(r.request().postDataJSON());
    commands.push(c);
    if (viewer) {
      await r.fulfill({ status: 403, json: { error: "你只有檢視權限。" } });
      return;
    }
    if (c.action === "templates") {
      await r.fulfill({ json: { templates: data.templates[0].templates } });
      return;
    }
    if (!receipts.has(c.commandId)) {
      if (c.action === "campaign")
        data.campaigns.unshift({
          ...seed,
          id: c.id,
          name: c.name,
          due_at: c.dueAt,
          total: 3,
          counts: { scheduled: 3 },
        });
      if (c.action === "cancel") {
        const item = data.campaigns.find((x) => x.id === c.id);
        if (item) {
          item.status = "cancelled";
          item.counts = { cancelled: item.total };
        }
      }
      receipts.set(c.commandId, { saved: true, id: "id", recipients: 3 });
    }
    if (lost && !dropped && c.action === "campaign") {
      dropped = true;
      await r.abort("failed");
      return;
    }
    await r.fulfill({ json: receipts.get(c.commandId) });
  });
  await page.route("**/__engagement-fixture", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html lang="zh-HK"><head><title>Customer engagement fixture</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#f8faff;font-family:Arial,sans-serif}${styles}</style></head><body><div id="fixture"></div><script>window.__COMPANY__=${JSON.stringify(company)};window.__ENG__=${JSON.stringify(data)};</script><script>${bundle.replace(/<\/script/gi, "<\\/script")}</script></body></html>`,
    }),
  );
  await page.goto("/__engagement-fixture");
  await expect(
    page.getByRole("heading", { name: "客戶訊息", exact: true }),
  ).toBeVisible();
  return { data, commands };
}
async function compose(page: Page) {
  await page.getByRole("button", { name: "新增推播", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("發送渠道", { exact: true }).selectOption(connection);
  await expect(dialog.locator(".eng-audience strong")).toContainText("3");
  await dialog.getByRole("button", { name: "下一步" }).click();
  await dialog.getByLabel("推播名稱").fill("November members");
  await dialog.getByLabel("WhatsApp 官方模板").selectOption("90001");
  await dialog.getByLabel("內容欄位 1").fill("{{name}}");
  await dialog.getByRole("button", { name: "下一步" }).click();
  return dialog;
}
test("three-step campaign preserves template variables and converts the chosen Hong Kong time", async ({
  page,
}) => {
  const f = await fixture(page),
    dialog = await compose(page);
  await dialog.getByLabel("揀個時間").check();
  await dialog.getByLabel("發送時間（香港）").fill("2027-01-15T10:30");
  await dialog.getByRole("button", { name: "安排發送", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "November members" }),
  ).toBeVisible();
  const c = f.commands.find((c) => c.action === "campaign");
  expect(c?.action).toBe("campaign");
  if (c?.action === "campaign") {
    expect(c.dueAt).toBe("2027-01-15T02:30:00.000Z");
    expect(c.definition.values[0].value).toBe("{{name}}");
  }
  await page.screenshot({
    path: "test-results/engagement-campaign-desktop.png",
    fullPage: true,
  });
});
test("lost response retries the same command and retains a single campaign", async ({
  page,
}) => {
  const f = await fixture(page, { lost: true }),
    dialog = await compose(page);
  await dialog.getByRole("button", { name: "安排發送", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "核對同一請求" }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "核對同一請求" }).click();
  await expect(dialog).not.toBeVisible();
  const posts = f.commands.filter((c) => c.action === "campaign");
  expect(posts).toHaveLength(2);
  expect(posts[0]).toEqual(posts[1]);
  expect(f.data.campaigns).toHaveLength(1);
});
test("recipient pagination retains totals and shows provider stages separately", async ({
  page,
}) => {
  await fixture(page, { existing: true });
  await page.getByRole("button", { name: "查看結果" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("共 73 位客人")).toBeVisible();
  await expect(dialog.getByRole("row")).toHaveCount(51);
  await dialog.getByRole("button", { name: "下一頁" }).click();
  await expect(dialog.getByRole("row")).toHaveCount(24);
  await expect(
    dialog.getByText("Synthetic customer 51", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText("共 73 位客人")).toBeVisible();
});
test("viewer has no campaign or policy mutation controls", async ({ page }) => {
  await fixture(page, { viewer: true, existing: true });
  await expect(
    page.getByRole("button", { name: "新增推播", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "取消未發送" })).toHaveCount(0);
  await page.getByText("渠道與發送設定", { exact: false }).click();
  await expect(page.getByRole("button", { name: "儲存發送設定" })).toHaveCount(
    0,
  );
});
test("mobile composer stays within the viewport and supports keyboard dismissal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  const dialog = await compose(page);
  await expect(
    dialog.getByRole("button", { name: "安排發送", exact: true }),
  ).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "test-results/engagement-campaign-mobile.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});
test("campaign overview and dialog pass accessibility checks", async ({
  page,
}) => {
  await fixture(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "新增推播", exact: true }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
