import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { DynamicSegment, SegmentsPage } from "../src/lib/segments/model";
import {
  fixtureBundle,
  mountFixture,
  syntheticCompany as companyId,
  syntheticCustomer as customerId,
  syntheticOtherCustomer as otherCustomerId,
  syntheticId as segmentId,
} from "./phase456-fixture";

const segmentName = "問過未預約";
function segment(changes: Partial<DynamicSegment> = {}): DynamicSegment {
  return {
    id: segmentId,
    brandId: "main",
    name: segmentName,
    mode: "all",
    rules: [{ kind: "booking", value: "none" }],
    includePos: false,
    enabled: true,
    revision: 1,
    count: 1,
    evaluatedAt: "2026-11-15T10:00:00Z",
    sourceStamp: "synthetic-source-1",
    lastError: null,
    ...changes,
  };
}
function resultPage(
  segments: DynamicSegment[] = [segment()],
  options: {
    id?: string | null;
    canManage?: boolean;
    hasPos?: boolean;
    changed?: boolean;
    refreshPending?: boolean;
  } = {},
): SegmentsPage {
  const selected = segments.find((s) => s.id === options.id);
  return {
    brands: [
      { id: "main", name: "Synthetic brand" },
      { id: "other", name: "Other brand" },
    ],
    stages: [{ id: "new", name: "新查詢" }],
    canManage: options.canManage ?? true,
    hasPos: options.hasPos ?? false,
    segments,
    refreshPending: options.refreshPending ?? false,
    ...(selected
      ? {
          selected: {
            ...selected,
            members: [
              {
                customerId: options.changed ? otherCustomerId : customerId,
                name: options.changed ? "Synthetic Noah" : "Synthetic Leah",
                enteredAt: "2026-11-15T10:00:00Z",
              },
            ],
            events: options.changed
              ? [
                  {
                    id: "4",
                    customerId: otherCustomerId,
                    customerName: "Synthetic Noah",
                    kind: "entered" as const,
                    at: "2026-11-15T10:30:00Z",
                    reason: "符合目前分眾條件",
                    segmentRevision: selected.revision,
                  },
                  {
                    id: "3",
                    customerId,
                    customerName: "Synthetic Leah",
                    kind: "exited" as const,
                    at: "2026-11-15T10:20:00Z",
                    reason: "已核實預約，不再符合條件",
                    segmentRevision: selected.revision,
                  },
                ]
              : [
                  {
                    id: "2",
                    customerId,
                    customerName: "Synthetic Leah",
                    kind: "entered" as const,
                    at: "2026-11-15T10:00:00Z",
                    reason: "符合目前分眾條件",
                    segmentRevision: selected.revision,
                  },
                  {
                    id: "1",
                    customerId: otherCustomerId,
                    customerName: "Synthetic Noah",
                    kind: "exited" as const,
                    at: "2026-11-15T09:30:00Z",
                    reason: "已核實預約，不再符合條件",
                    segmentRevision: selected.revision,
                  },
                ],
            nextMember: null,
            nextEvent: null,
          },
        }
      : {}),
  };
}
let bundle = "";
let journeyBundle = "";
test.beforeAll(async () => {
  journeyBundle = await fixtureBundle(
    `import React,{useState}from'react';import{createRoot}from'react-dom/client';import JourneyBuilder from './src/components/engagement/JourneyBuilder';function Fixture(){const[saved,setSaved]=useState(false);const engagement={brands:[{id:'main',name:'Synthetic brand'}],connections:[{id:'${segmentId}',brand_id:'main',provider:'meta',channel:'messenger',label:'Synthetic Messenger',ready:true,inbound:true,accepted:false,delivered:false}],templates:[]};async function submit(body){const r=await fetch('/api/companies/${companyId}/journeys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(r.ok)setSaved(true);}return <main className='eng-work'><h1>分眾旅程驗收</h1><JourneyBuilder companyId='${companyId}' recipe='unanswered' engagement={engagement} busy={false} frozen={false} error='' onSubmit={submit} onRetry={()=>{}}/>{saved&&<p role='status'>流程已保存</p>}</main>}createRoot(document.getElementById('fixture')).render(<Fixture/>);`,
  );
  bundle = await fixtureBundle(
    `import React from'react';import{createRoot}from'react-dom/client';import DynamicSegmentsManager from './src/components/dynamic-segments/DynamicSegmentsManager';createRoot(document.getElementById('fixture')).render(<main><h1>自動分眾驗收</h1><DynamicSegmentsManager companyId='${companyId}' brands={[{id:'main',name:'Synthetic brand'},{id:'other',name:'Other brand'}]} canManage={true}/></main>);`,
  );
});
async function mount(
  page: Page,
  options: {
    canManage?: boolean;
    hasPos?: boolean;
    empty?: boolean;
    refreshPending?: boolean;
    post?: (route: Route, body: Record<string, unknown>) => Promise<void>;
  } = {},
) {
  let segments = options.empty ? [] : [segment()];
  let changed = false;
  const reads: URL[] = [];
  const commands = await mountFixture(page, {
    name: "dynamic_segments",
    bundle,
    styles: ["src/components/dynamic-segments/dynamic-segments.css"],
    handle: async (route, url, body) => {
      if (!url.pathname.endsWith("/segments")) {
        await route.fulfill({
          status: 404,
          json: { error: "Unexpected fixture endpoint" },
        });
        return;
      }
      if (!body) {
        reads.push(url);
        await route.fulfill({
          json: resultPage(
            url.searchParams.get("brandId") === "other" ? [] : segments,
            {
              id: url.searchParams.get("segmentId"),
              canManage: options.canManage,
              hasPos: options.hasPos,
              changed,
              refreshPending: options.refreshPending,
            },
          ),
        });
        return;
      }
      if (options.post) {
        await options.post(route, body);
        return;
      }
      if (body.action === "preview") {
        await route.fulfill({
          json: {
            preview: {
              total: 2,
              sample: [
                { customerId, name: "Synthetic Leah" },
                { customerId: otherCustomerId, name: "Synthetic Noah" },
              ],
            },
          },
        });
        return;
      }
      const saved = segment({
        ...body,
        revision: Number(body.revision) + 1,
        count: 2,
      } as Partial<DynamicSegment>);
      segments = [saved, ...segments.filter((s) => s.id !== saved.id)];
      await route.fulfill({
        json: {
          saved: true,
          id: saved.id,
          revision: saved.revision,
          count: saved.count,
        },
      });
    },
  });
  return {
    commands,
    reads,
    membershipChanged: () => {
      changed = true;
      segments = segments.map((s) => ({
        ...s,
        sourceStamp: "synthetic-source-2",
        evaluatedAt: "2026-11-15T10:30:00Z",
      }));
    },
  };
}
async function newSegment(page: Page) {
  await page.getByRole("button", { name: "新增分眾", exact: true }).click();
  await page.getByLabel("分眾名稱", { exact: true }).fill("最近有查詢嘅客人");
  await page
    .getByLabel("條件 1 類型", { exact: true })
    .selectOption("recent_inbound");
  await page.getByLabel("條件 1 日數", { exact: true }).fill("7");
}

test("a saved segment reads current source counts without mutating or sending messages", async ({
  page,
}) => {
  const f = await mount(page);
  await expect(
    page.getByRole("heading", { name: segmentName, exact: true }),
  ).toBeVisible();
  await expect(page.getByText("自動更新", { exact: true })).toBeVisible();
  expect(f.commands).toEqual([]);
});

test("preview and save carry rules rather than a caller-supplied customer list", async ({
  page,
}) => {
  const f = await mount(page);
  await newSegment(page);
  await page.getByRole("button", { name: "預覽客群", exact: true }).click();
  await expect(
    page.getByRole("status", { name: "分眾預覽", exact: true }),
  ).toContainText("2 位客人符合條件");
  expect(f.commands).toHaveLength(1);
  expect(f.commands[0].body).toEqual({
    action: "preview",
    brandId: "main",
    mode: "all",
    rules: [{ kind: "recent_inbound", days: 7 }],
    includePos: false,
  });
  await page.getByRole("button", { name: "儲存分眾", exact: true }).click();
  await expect(
    page.getByText("已儲存，目前 2 位客人符合條件。", { exact: true }),
  ).toBeVisible();
  expect(f.commands).toHaveLength(2);
  expect(f.commands[1].body).toMatchObject({
    action: "upsert",
    brandId: "main",
    name: "最近有查詢嘅客人",
    revision: 0,
    enabled: true,
    rules: [{ kind: "recent_inbound", days: 7 }],
  });
  expect(f.commands[1].body.commandId).toMatch(/^[a-f0-9-]{36}$/);
  expect(f.commands[1].body).not.toHaveProperty("members");
  expect(f.commands[1].body).not.toHaveProperty("sourceStamp");
});

test("a delayed preview cannot label newly edited rules with an old audience count", async ({
  page,
}) => {
  let release: (() => void) | undefined;
  let requests = 0;
  await mount(page, {
    post: async (route) => {
      if (++requests === 1)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      await route.fulfill({
        json: { preview: { total: requests === 1 ? 99 : 2, sample: [] } },
      });
    },
  });
  await newSegment(page);
  await page.getByRole("button", { name: "預覽客群", exact: true }).click();
  await expect.poll(() => !!release).toBe(true);
  await page.getByLabel("條件 1 日數", { exact: true }).fill("30");
  release!();
  await expect(
    page.getByRole("button", { name: "預覽客群", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText("99 位客人符合條件", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "預覽客群", exact: true }).click();
  await expect(
    page.getByRole("status", { name: "分眾預覽", exact: true }),
  ).toContainText("2 位客人符合條件");
});

test("uncertain saving replays the exact same definition command", async ({
  page,
}) => {
  let attempts = 0;
  const f = await mount(page, {
    post: async (route, body) => {
      if (++attempts === 1) {
        await route.abort("failed");
        return;
      }
      await route.fulfill({
        json: { saved: true, id: body.id, revision: 1, count: 2 },
      });
    },
  });
  await newSegment(page);
  await page.getByRole("button", { name: "儲存分眾", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "核對同一儲存", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("分眾名稱", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "核對同一儲存", exact: true }).click();
  await expect(
    page.getByText("已儲存，目前 2 位客人符合條件。", { exact: true }),
  ).toBeVisible();
  expect(f.commands).toHaveLength(2);
  expect(f.commands[1].body).toEqual(f.commands[0].body);
});

test("membership refresh shows automatic entry and exit without a browser write", async ({
  page,
}) => {
  await page.clock.install();
  const f = await mount(page);
  await page.getByRole("button", { name: "查看客群", exact: true }).click();
  const details = page.getByRole("region", {
    name: "分眾客群與變動",
    exact: true,
  });
  await expect(details).toContainText("Synthetic Leah · 加入");
  const detailReads = () =>
    f.reads.filter((url) => url.searchParams.get("segmentId") === segmentId)
      .length;
  const initialReads = detailReads();
  f.membershipChanged();
  // Exercise elapsed foreground polling, including SWR's earlier dedupe
  // cleanup. A fastForward jump models sleep and may coalesce those timers.
  await page.clock.runFor(31000);
  await expect.poll(detailReads).toBeGreaterThan(initialReads);
  await expect(details).toContainText("Synthetic Noah · 加入");
  await expect(details).toContainText("Synthetic Leah · 退出");
  await expect(details).toContainText("已核實預約，不再符合條件");
  expect(f.commands).toEqual([]);
});

test("a viewer can inspect memberships while POS-only rules are not offered", async ({
  page,
}) => {
  const f = await mount(page, { canManage: false, hasPos: false });
  await expect(
    page.getByRole("heading", { name: segmentName, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "新增分眾", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "編輯", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("包括 POS 到店及付款資料", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "查看客群", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "分眾客群與變動", exact: true }),
  ).toContainText("Synthetic Leah");
  expect(f.commands).toEqual([]);
});

for (const [name, viewport] of [
  ["desktop", { width: 1440, height: 1000 }],
  ["mobile", { width: 390, height: 844 }],
] as const) {
  test(`dynamic segments ${name} keep editable rules and membership sources readable and accessible`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const f = await mount(page);
    await newSegment(page);
    await page.getByRole("button", { name: "預覽客群", exact: true }).click();
    await expect(
      page.getByRole("status", { name: "分眾預覽", exact: true }),
    ).toContainText("2 位客人符合條件");
    const violations = (
      await new AxeBuilder({ page }).analyze()
    ).violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`dynamic-segments-${name}.png`),
      fullPage: true,
    });
    expect(f.commands.every((c) => c.body.action === "preview")).toBe(true);
  });
}

async function mountJourney(page: Page) {
  let enabled = true;
  const segmentReads: boolean[] = [];
  const commands = await mountFixture(page, {
    name: "segment_journey",
    bundle: journeyBundle,
    styles: ["src/components/engagement/engagement.css"],
    handle: async (route, url, body) => {
      if (url.pathname.endsWith("/segments") && !body) {
        segmentReads.push(enabled);
        await route.fulfill({ json: resultPage([segment({ enabled })]) });
        return;
      }
      if (url.pathname.endsWith("/journeys") && body) {
        await route.fulfill({ json: { saved: true, id: body.id } });
        return;
      }
      await route.fulfill({
        status: 404,
        json: { error: "Unexpected fixture endpoint" },
      });
    },
  });
  await page.getByLabel("發送渠道", { exact: true }).selectOption(segmentId);
  await page
    .getByLabel("流程自動分眾", { exact: true })
    .selectOption(segmentId);
  await page
    .getByLabel("訊息內容", { exact: true })
    .fill("你好 {{name}}，想問你仲需唔需要同事協助？");
  return {
    commands,
    segmentReads,
    disableSegment: () => {
      enabled = false;
    },
  };
}

test("a standard journey publishes a saved segment reference without a caller-supplied member list", async ({
  page,
}) => {
  const f = await mountJourney(page);
  await expect(page.getByLabel("流程名稱", { exact: true })).toHaveCSS(
    "border-radius",
    "8px",
  );
  await page.getByRole("button", { name: "啟用流程", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("流程已保存");
  expect(f.commands).toHaveLength(1);
  expect(f.commands[0].body).toMatchObject({
    action: "publish",
    brandId: "main",
    segmentId,
    recipe: "unanswered",
    provider: "meta",
    connectionId: segmentId,
  });
  expect(f.commands[0].body).not.toHaveProperty("members");
  expect(f.commands[0].body).not.toHaveProperty("audience");
});

test("a paused segment cannot be published through a standard journey after refresh", async ({
  page,
}) => {
  await page.clock.install();
  const f = await mountJourney(page);
  await expect(
    page.getByRole("button", { name: "啟用流程", exact: true }),
  ).toBeEnabled();
  f.disableSegment();
  await page.clock.runFor(16000);
  await expect.poll(() => f.segmentReads.includes(false)).toBe(true);
  await expect(
    page.getByText("所選分眾目前不可用，請重新選擇。", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "啟用流程", exact: true }),
  ).toBeDisabled();
  expect(f.commands).toEqual([]);
});

test("deferred refresh labels the previous count and membership until catch-up", async ({
  page,
}) => {
  await mount(page, { refreshPending: true });
  await expect(page.getByRole("status")).toContainText("名單更新中");
  await expect(page.getByText("位 · 上次結果")).toBeVisible();
  await page.getByRole("button", { name: "查看客群" }).click();
  await expect(page.getByRole("heading", { name: /上次客群/ })).toBeVisible();
});
