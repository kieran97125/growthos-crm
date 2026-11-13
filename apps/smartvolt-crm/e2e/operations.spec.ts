import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { BRAND_CSS } from "../src/lib/brand";
import type { CopilotBundle } from "../src/components/copilot/CopilotProvider";
import {
  defaultSettings,
  operationsAction,
  type OperationsPage,
  type LifecycleRecord,
} from "../src/lib/operations/model";
const company = "11111111-1111-4111-8111-111111111111",
  owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  agent = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  thread = "22222222-2222-4222-8222-222222222222";
let bundle = "";
const styles = [
  "src/app/saas.css",
  "src/components/workspace/workspace.css",
  "src/components/copilot/copilot.css",
  "src/components/operations/operations.css",
]
  .map((p) => readFileSync(p, "utf8"))
  .join("\n");
test.beforeAll(async () => {
  bundle = (
    await build({
      stdin: {
        loader: "tsx",
        resolveDir: process.cwd(),
        contents: `import React from'react';import{createRoot}from'react-dom/client';import{CompanyWorkspaceChrome}from'./src/components/workspace/CompanyWorkspace';import Operations from'./src/components/operations/OperationsWorkspace';createRoot(document.getElementById('fixture')).render(<CompanyWorkspaceChrome companyId='${company}' companyName='Operations · synthetic' actorName='Synthetic owner' actorId='${owner}' products={['crm','pos']} location={{pathname:'/company/${company}/crm/operations',search:''}}><Operations companyId='${company}' actorId='${owner}'/></CompanyWorkspaceChrome>);`,
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
  {
    lost = false,
    viewer = false,
    empty = false,
  }: { lost?: boolean; viewer?: boolean; empty?: boolean } = {},
) {
  const now = new Date().toISOString();
  const records: LifecycleRecord[] = empty
    ? []
    : [
        {
          key: '["casey","main"]',
          customer_id: "casey",
          brand_id: "main",
          name: "Casey Chan",
          stage_id: "new",
          revision: 0,
          reason: "",
          updated_at: now,
          priority: "normal",
          owner_name: "Mia",
          follow_up_at: null,
          provider: "meta",
          thread_id: thread,
          interest: null,
          summary: null,
          next_step: null,
        },
        {
          key: '["jordan","main"]',
          customer_id: "jordan",
          brand_id: "main",
          name: "Jordan Lee",
          stage_id: "qualified",
          revision: 1,
          reason: "想了解週末時段",
          updated_at: now,
          priority: "high",
          owner_name: "Alex",
          follow_up_at: now,
          provider: "whatsapp",
          thread_id: "33333333-3333-4333-8333-333333333333",
          interest: "high",
          summary: "想預約週末課堂",
          next_step: "核對星期六可用時段",
        },
        {
          key: '["taylor","main"]',
          customer_id: "taylor",
          brand_id: "main",
          name: "Taylor Wong",
          stage_id: "booking",
          revision: 2,
          reason: "等候確認日期",
          updated_at: now,
          priority: "normal",
          owner_name: "Mia",
          follow_up_at: null,
          provider: "meta",
          thread_id: "44444444-4444-4444-8444-444444444444",
          interest: "medium",
          summary: "查詢試堂安排",
          next_step: "確認客戶方便日期",
        },
      ];
  const data: OperationsPage = {
    companyId: company,
    actorId: owner,
    canEdit: !viewer,
    canManage: !viewer,
    hasPos: true,
    settings: structuredClone(defaultSettings),
    revision: 4,
    stages: [],
    records,
    nextCursor: null,
    followups: empty
      ? []
      : [
          {
            id: "55555555-5555-4555-8555-555555555555",
            customer_id: "jordan",
            brand_id: "main",
            provider: "whatsapp",
            thread_id: "33333333-3333-4333-8333-333333333333",
            name: "Jordan Lee",
            title: "核對星期六試堂時段",
            due_at: now,
            owner_id: owner,
            status: "open",
            revision: 0,
            owner_name: "Mia",
          },
        ],
    followupCount: empty ? 0 : 1,
    metrics: {
      inquiries: empty ? 0 : 12,
      confirmedBookings: empty ? 0 : 8,
      attended: empty ? 0 : 3,
      overdue: empty ? 0 : 1,
      unassigned: 0,
      receivedCents: empty ? 0 : 238000,
      refundedCents: 0,
    },
    members: [
      {
        user_id: owner,
        display_name: "Mia",
        role: "owner",
        team: "預約組",
        capacity: 20,
        brand_ids: [],
        paused: false,
        revision: 0,
        presence: "online",
        open_count: empty ? 0 : 7,
      },
      {
        user_id: agent,
        display_name: "Alex",
        role: "agent",
        team: "預約組",
        capacity: 20,
        brand_ids: [],
        paused: false,
        revision: 0,
        presence: "away",
        open_count: empty ? 0 : 4,
      },
    ],
    brands: [{ id: "main", name: "Studio" }],
    period: { from: now.slice(0, 10), to: now.slice(0, 10) },
    checkedAt: now,
  };
  const commands: Record<string, unknown>[] = [],
    receipts = new Map<string, unknown>();
  let presence = "offline";
  await page.route(`**/api/companies/${company}/copilot**`, (r) =>
    r.fulfill({
      json: {
        companyName: "Operations · synthetic",
        actorName: "Synthetic owner",
        context: { product: "crm", section: "operations", activity: "viewing" },
        observations: [],
        feedback: [],
        facts: [],
        threads: [],
        tasks: [],
        messages: [],
        threadId: null,
        ai: {
          enabled: true,
          model: "synthetic/model",
          canGenerate: true,
          canConfigure: true,
          used: 0,
          limit: 30,
          verified: true,
        },
        at: now,
        brands: data.brands,
      } satisfies CopilotBundle,
    }),
  );
  await page.route(`**/api/companies/${company}/operations**`, async (r) => {
    const q = new URL(r.request().url()).searchParams;
    if (r.request().method() === "POST") {
      const c = operationsAction.parse(r.request().postDataJSON());
      commands.push(c);
      if (c.action === "presence") {
        presence = c.status;
        await r.fulfill({ json: { status: presence } });
        return;
      }
      if (receipts.has(c.commandId)) {
        await r.fulfill({ json: receipts.get(c.commandId) });
        return;
      }
      if (viewer) {
        await r.fulfill({ status: 403, json: { error: "只有檢視權限。" } });
        return;
      }
      if (c.action === "stage") {
        const row = data.records.find(
          (x) => x.customer_id === c.customerId && x.brand_id === c.brandId,
        )!;
        expect(row.revision).toBe(c.revision);
        row.stage_id = c.stageId;
        row.reason = c.reason;
        row.revision++;
      } else if (c.action === "settings") {
        expect(data.revision).toBe(c.revision);
        data.settings = structuredClone(c.data);
        data.revision++;
      } else if (c.action === "agent") {
        const m = data.members.find((x) => x.user_id === c.userId)!;
        expect(m.revision).toBe(c.revision);
        Object.assign(m, {
          team: c.team,
          capacity: c.capacity,
          brand_ids: c.brandIds,
          paused: c.paused,
          revision: m.revision + 1,
        });
      } else if (c.action === "followup-update") {
        const f = data.followups.find((x) => x.id === c.id)!;
        expect(f.revision).toBe(c.revision);
        f.status = c.status;
        if (c.dueAt) f.due_at = c.dueAt;
        f.revision++;
      }
      const result = { saved: true };
      receipts.set(c.commandId, result);
      if (lost && c.action === "stage") {
        lost = false;
        await r.abort("failed");
        return;
      }
      await r.fulfill({ json: result });
      return;
    }
    if (q.get("mode") === "attention") {
      await r.fulfill({
        json: {
          presence,
          due: data.followups.filter((x) => x.status === "open").length,
          canEdit: !viewer,
        },
      });
      return;
    }
    if (q.get("mode") === "followups") {
      const tasks = data.followups.filter((x) => x.status === "open");
      await r.fulfill({
        json: { tasks, nextCursor: null, total: tasks.length },
      });
      return;
    }
    const scoped = data.records.filter(
      (x) =>
        (!q.get("brand") || x.brand_id === q.get("brand")) &&
        (!q.get("search") ||
          x.name.toLowerCase().includes(q.get("search")!.toLowerCase())),
    );
    await r.fulfill({
      json: {
        ...data,
        stages: data.settings.stages.map((s) => ({
          ...s,
          count: scoped.filter((r) => r.stage_id === s.id).length,
        })),
        records: scoped.filter(
          (x) => !q.get("stage") || x.stage_id === q.get("stage"),
        ),
        followupCount: data.followups.filter((x) => x.status === "open").length,
      },
    });
  });
  const vars = Object.entries(BRAND_CSS)
    .map(([k, v]) => k + ":" + v)
    .join(";");
  // Keep the bundle out of HTML's legacy script/comment tokenizer. Dependencies
  // contain HTML parser expressions that are valid JavaScript in an external file.
  await page.route("**/__acceptance/operations-fixture.js", (r) =>
    r.fulfill({ contentType: "text/javascript", body: bundle }),
  );
  const html = `<!doctype html><html lang="zh-HK"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Convelta operations · synthetic</title><style>:root{${vars}}*{box-sizing:border-box}body{margin:0;font-family:Arial,'Noto Sans CJK TC',sans-serif}button,input,select,textarea{font:inherit}${styles}</style></head><body><div id="fixture"></div><script src="/__acceptance/operations-fixture.js"></script></body></html>`;
  await page.route(`**/company/${company}/crm/operations`, (r) =>
    r.fulfill({ contentType: "text/html", body: html }),
  );
  await page.goto(`/company/${company}/crm/operations`);
  await expect(
    page.getByRole("heading", { name: "跟進與轉化。" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "重新整理營運資料" }),
  ).toBeEnabled();
  return { data, commands, receipts };
}
for (const mobile of [false, true])
  test(`${mobile ? "mobile" : "desktop"}: lifecycle, durable retry, team routing and follow-ups`, async ({
    page,
  }, info) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const f = await fixture(page, { lost: true });
    await expect(
      page.getByRole("link", { name: "跟進", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    const row = page
      .getByRole("row")
      .filter({ has: page.getByText("Casey Chan", { exact: true }) });
    await row.getByRole("button", { name: /新查詢/ }).click();
    const form = page.getByRole("form", { name: "更新客戶階段" });
    await form
      .getByRole("combobox", { name: "階段", exact: true })
      .selectOption("qualified");
    await form
      .getByLabel("原因", { exact: true })
      .fill("客戶確認想了解週末時段");
    await form.getByRole("button", { name: "儲存階段" }).click();
    await expect(
      page.getByRole("button", { name: "核對同一儲存結果" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "核對同一儲存結果" }).click();
    await expect(row.getByRole("button", { name: /有意向/ })).toBeVisible();
    const stageCommands = f.commands.filter((c) => c.action === "stage");
    expect(stageCommands).toHaveLength(2);
    expect(stageCommands[0].commandId).toBe(stageCommands[1].commandId);
    expect(f.receipts.size).toBe(1);
    // The retry can be reconciled outside the editor without losing its fields.
    if (await page.getByRole("button", { name: "取消階段修改" }).isVisible())
      await page.getByRole("button", { name: "取消階段修改" }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(
        `${mobile ? "mobile" : "desktop"}-operations-pipeline.png`,
      ),
      fullPage: true,
    });
    await page.getByRole("button", { name: "跟進事項", exact: false }).click();
    await expect(
      page.getByText("核對星期六試堂時段", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "延後 1 小時" }).click();
    await expect.poll(() => f.data.followups[0].revision).toBe(1);
    await page.getByRole("button", { name: "完成", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "暫時未有跟進事項" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "團隊接客", exact: true }).click();
    await page.getByRole("button", { name: "調整 Alex 接客設定" }).click();
    const team = page.getByRole("form", { name: "同事接客設定" });
    await team.getByLabel("接客上限").fill("12");
    await team.getByLabel("暫停自動派客").check();
    await team.getByRole("button", { name: "儲存接客設定" }).click();
    await expect.poll(() => f.data.members[1].capacity).toBe(12);
    await expect(page.getByText("已暫停接客", { exact: true })).toBeVisible();
    await page.screenshot({
      path: info.outputPath(
        `${mobile ? "mobile" : "desktop"}-operations-team.png`,
      ),
      fullPage: true,
    });
    await page.getByRole("button", { name: "自動流程", exact: true }).click();
    await page.getByLabel("啟用派客").check();
    await page.getByRole("button", { name: "新增分派規則" }).click();
    await page.getByLabel("分派方式").selectOption("round_robin");
    await page.getByLabel("交畀團隊").fill("預約組");
    await page.getByRole("button", { name: "儲存流程" }).click();
    await expect
      .poll(() => f.data.settings.rules[0]?.method)
      .toBe("round_robin");
    await expect(page.getByLabel("啟用派客")).toBeChecked();
    await page.getByText("自訂階段名稱", { exact: true }).click();
    await page.getByRole("button", { name: "新增階段", exact: true }).click();
    await page.getByLabel("階段名稱 6", { exact: true }).fill("等候確認");
    await page.getByRole("button", { name: "儲存流程" }).click();
    await expect.poll(() => f.data.settings.stages.length).toBe(6);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const save = page.getByRole("button", { name: "儲存流程", exact: true });
    await save.scrollIntoViewIfNeeded();
    const saveBounds = await save.boundingBox(),
      launcherBounds = await page.locator(".cc-launcher").boundingBox();
    expect(saveBounds).not.toBeNull();
    expect(launcherBounds).not.toBeNull();
    expect(
      saveBounds!.x + saveBounds!.width <= launcherBounds!.x ||
        launcherBounds!.x + launcherBounds!.width <= saveBounds!.x ||
        saveBounds!.y + saveBounds!.height <= launcherBounds!.y ||
        launcherBounds!.y + launcherBounds!.height <= saveBounds!.y,
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(
        `${mobile ? "mobile" : "desktop"}-operations-rules.png`,
      ),
      fullPage: true,
    });
  });
test("viewer sees truthful empty operations and cannot edit routing", async ({
  page,
}) => {
  const f = await fixture(page, { viewer: true, empty: true });
  await expect(
    page.getByRole("heading", { name: "由第一個查詢開始" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "自動流程", exact: true }).click();
  await expect(page.getByLabel("啟用派客")).toBeDisabled();
  await expect(page.getByRole("button", { name: "儲存流程" })).toBeDisabled();
  expect(f.commands).toHaveLength(0);
});
