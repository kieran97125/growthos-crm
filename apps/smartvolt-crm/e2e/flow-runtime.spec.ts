import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  fixtureBundle,
  mountFixture,
  syntheticCompany as companyId,
  syntheticId as connectionId,
  syntheticSource as threadId,
} from "./phase456-fixture";
import { makeNode, type Flow } from "../src/components/crm/studio/model";
import type {
  FlowPublication,
  FlowRun,
  FlowRuntimePage,
} from "../src/lib/flow-runtime/model";
const flow: Flow = {
  id: "synthetic-drawn-flow",
  clientId: companyId,
  brandId: "main",
  name: "查詢後跟進",
  description: "",
  revision: 1,
  updatedAt: 1,
  nodes: [
    makeNode("trigger", "start", 0, 0),
    makeNode("message", "reply", 0, 150),
    makeNode("end", "end", 0, 300),
  ],
  edges: [
    { id: "first", source: "start", target: "reply", sourceHandle: null },
    { id: "last", source: "reply", target: "end", sourceHandle: null },
  ],
};
function publication(): FlowPublication {
  return {
    flow_id: flow.id,
    brand_id: "main",
    name: flow.name,
    revision: 1,
    published_version: 1,
    enabled: true,
    trigger_kind: "manual",
    provider: "meta",
    connection_id: connectionId,
    purpose: "service",
    graph: flow,
    deliveries: {},
    active: 0,
    updated_at: "2026-11-15T16:00:00Z",
  };
}
let bundle = "";
test.beforeAll(async () => {
  bundle = await fixtureBundle(
    `import React from'react';import{createRoot}from'react-dom/client';import FlowExecutionPanel from'./src/components/crm/studio/FlowExecutionPanel';createRoot(document.getElementById('fixture')).render(<main><h1>正式流程驗收</h1><FlowExecutionPanel companyId='${companyId}' flow={${JSON.stringify(flow)}}/></main>);`,
  );
});
async function mount(
  page: Page,
  options: {
    published?: boolean;
    canManage?: boolean;
    runs?: FlowRun[];
    post?: (route: Route, body: Record<string, unknown>) => Promise<void>;
  } = {},
) {
  let current = options.published ? publication() : null;
  const commands = await mountFixture(page, {
    name: "flow_runtime",
    bundle,
    styles: [
      "src/components/crm/studio/studio.css",
      "src/components/engagement/engagement.css",
      "src/components/crm/studio/flow-runtime.css",
    ],
    handle: async (route, url, body) => {
      if (!url.pathname.endsWith("/flows"))
        return route.fulfill({
          status: 404,
          json: { error: "No fixture endpoint" },
        });
      if (body) {
        if (options.post) return options.post(route, body);
        if (body.action === "publish") current = publication();
        if (body.action === "toggle" && current)
          current = {
            ...current,
            enabled: !!body.enabled,
            revision: current.revision + 1,
          };
        return route.fulfill({ json: { saved: true } });
      }
      const data: FlowRuntimePage = {
        canManage: options.canManage ?? true,
        canEdit: options.canManage ?? true,
        hasPos: false,
        publication: current,
        runs: options.runs ?? [],
        nextCursor: null,
        connections: [
          {
            id: connectionId,
            brand_id: "main",
            provider: "meta",
            channel: "messenger",
            label: "Synthetic Messenger",
            ready: true,
            inbound: true,
            accepted: false,
            delivered: false,
          },
        ],
        templates: [],
        threads: [
          {
            id: threadId,
            provider: "meta",
            name: "Synthetic customer",
            channel: "messenger",
            brand_id: "main",
            connection_id: connectionId,
          },
        ],
      };
      return route.fulfill({ json: data });
    },
  });
  await page.locator(".fr-panel > summary").click();
  await expect(page.getByLabel("正式流程開始方式")).toBeVisible();
  return commands;
}
test("publish carries the actual freely drawn graph and scoped connection", async ({
  page,
}) => {
  const commands = await mount(page);
  expect(commands).toEqual([]);
  await page.getByLabel("正式流程渠道").selectOption(connectionId);
  await page.getByRole("button", { name: "發布並啟用", exact: true }).click();
  await expect(page.getByText("已啟用 v1", { exact: true })).toBeVisible();
  expect(commands).toHaveLength(1);
  expect(commands[0].body).toMatchObject({
    action: "publish",
    flow,
    connectionId,
    provider: "meta",
    trigger: "manual",
    purpose: "service",
    revision: 0,
    enabled: true,
  });
  expect(commands[0].body).not.toHaveProperty("customers");
});
test("a lost manual-enrollment response retries the original request unchanged", async ({
  page,
}) => {
  let tries = 0;
  const commands = await mount(page, {
    published: true,
    post: async (route, body) => {
      if (body.action === "enroll" && ++tries === 1)
        return route.abort("failed");
      return route.fulfill({ json: { saved: true } });
    },
  });
  await page.getByLabel("由同事開始一次").selectOption(threadId);
  await page.getByRole("button", { name: "開始流程", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "核對同一請求", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "發布新版本", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "核對同一請求", exact: true }).click();
  await expect(
    page.getByText("流程紀錄已更新。", { exact: true }),
  ).toBeVisible();
  expect(commands).toHaveLength(2);
  expect(commands[1].body).toEqual(commands[0].body);
});
test("viewer can inspect publication and history without command authority", async ({
  page,
}) => {
  const commands = await mount(page, { published: true, canManage: false });
  await expect(
    page.getByRole("button", { name: "發布新版本", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "暫停流程", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "執行紀錄", exact: true }).click();
  await expect(
    page.getByText("未有流程執行紀錄。", { exact: true }),
  ).toBeVisible();
  expect(commands).toEqual([]);
});
test("review never offers confirmation without an actual linked booking", async ({
  page,
}) => {
  const run: FlowRun = {
    id: threadId,
    flow_id: flow.id,
    version: 1,
    customer_name: "Synthetic customer",
    provider: "meta",
    thread_id: threadId,
    state: "review",
    reason: "awaiting_confirmed_booking",
    node_id: "review",
    node_title: "核實預約",
    due_at: "2026-11-15T16:00:00Z",
    created_at: "2026-11-15T16:00:00Z",
    updated_at: "2026-11-15T16:00:00Z",
    steps: [],
    bookings: [],
  };
  const commands = await mount(page, { published: true, runs: [run] });
  await page.getByRole("button", { name: "執行紀錄", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "核對後繼續", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("此對話未有符合嘅核實預約。請先喺客戶紀錄完成核實。", {
      exact: true,
    }),
  ).toBeVisible();
  expect(commands).toEqual([]);
});
test("mobile publication controls remain accessible and fit the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const commands = await mount(page, { published: true });
  const violations = (
    await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
  ).violations;
  expect(violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(commands).toEqual([]);
  await page.screenshot({
    path: "test-results/flow-runtime-mobile.png",
    fullPage: true,
  });
});
