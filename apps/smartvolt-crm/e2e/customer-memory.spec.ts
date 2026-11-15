import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type {
  CustomerMemoryPage,
  CustomerMemory,
} from "../src/lib/customer-memory/model";
import {
  fixtureBundle,
  mountFixture,
  syntheticCompany as companyId,
  syntheticCustomer as customerId,
  syntheticOtherCustomer as otherCustomerId,
  syntheticId as memoryId,
} from "./phase456-fixture";

const original = "客人偏好星期六下午聯絡。";
const revised = "客人已確認改為星期日下午聯絡。";
function memory(content = original, revision = 1): CustomerMemory {
  return {
    id: memoryId,
    revision,
    category: "preference",
    content,
    status: "active",
    updatedAt: "2026-11-15T09:00:00Z",
    actorName: "Synthetic teammate",
    reason: "客人於電話確認",
    source: { kind: "staff", label: "同事確認" },
  };
}
function resultPage(
  customer = customerId,
  changes: Partial<CustomerMemoryPage> = {},
): CustomerMemoryPage {
  return {
    brandId: "main",
    customerId: customer,
    brands: [{ id: "main", name: "Synthetic brand" }],
    canEdit: true,
    memories: customer === customerId ? [memory()] : [],
    history: [],
    timeline:
      customer === customerId
        ? [
            {
              id: "payment-1",
              at: "2026-11-15T09:00:00Z",
              kind: "payment",
              title: "已核實收款",
              summary: "由訂單核實嘅付款紀錄",
              source: {
                type: "payment",
                id: "payment-1",
                label: "查看付款來源",
                href: `/company/${companyId}/pos`,
              },
            },
            {
              id: "booking-1",
              at: "2026-11-15T08:00:00Z",
              kind: "booking",
              title: "已核實預約",
              summary: "由同事核實嘅預約安排",
              source: {
                type: "booking",
                id: "booking-1",
                label: "查看預約來源",
                href: `/company/${companyId}/crm/operations`,
              },
            },
            {
              id: "message-1",
              at: "2026-11-15T07:00:00Z",
              kind: "message",
              title: "WhatsApp 查詢",
              summary: "想了解星期六試堂安排。",
              source: {
                type: "whatsapp",
                id: "message-1",
                label: "返回來源對話",
                href: `/company/${companyId}/crm?thread=synthetic`,
              },
            },
          ]
        : [],
    nextCursor: null,
    coverage: { timelinePageSize: 30, historyLimit: 100, moreHistory: false },
    ...changes,
  };
}
let bundle = "";
test.beforeAll(async () => {
  bundle = await fixtureBundle(
    `import React,{useState}from'react';import{createRoot}from'react-dom/client';import CustomerMemoryWorkspace from './src/components/customer-memory/CustomerMemoryWorkspace';function Fixture(){const[customer,setCustomer]=useState('${customerId}');const[view,setView]=useState('memory');return <main><h1>客戶記憶驗收</h1><nav className="fixture-nav" aria-label="合成客戶切換"><button onClick={()=>setCustomer('${customerId}')}>第一位客戶</button><button onClick={()=>setCustomer('${otherCustomerId}')}>第二位客戶</button><button onClick={()=>setView('memory')}>顯示客戶記憶</button><button onClick={()=>setView('timeline')}>顯示完整時間線</button></nav><CustomerMemoryWorkspace companyId='${companyId}' customerId={customer} brandId='main' canEdit={true} view={view}/></main>}createRoot(document.getElementById('fixture')).render(<Fixture/>);`,
  );
});
async function mount(
  page: Page,
  options: {
    initial?: CustomerMemoryPage;
    get?: (
      customer: string,
      url: URL,
    ) => CustomerMemoryPage | Promise<CustomerMemoryPage>;
    post?: (
      route: Route,
      body: Record<string, unknown>,
      customer: string,
    ) => Promise<void>;
  } = {},
) {
  let current = options.initial ?? resultPage();
  return mountFixture(page, {
    name: "customer_memory",
    bundle,
    styles: ["src/components/customer-memory/customer-memory.css"],
    handle: async (route, url, body) => {
      const matched = /\/customers\/([^/]+)\/memory$/.exec(url.pathname);
      if (!matched) {
        await route.fulfill({
          status: 404,
          json: { error: "Unexpected fixture endpoint" },
        });
        return;
      }
      const customer = matched[1];
      if (!body) {
        await route.fulfill({
          json: options.get
            ? await options.get(customer, url)
            : customer === customerId
              ? current
              : resultPage(customer),
        });
        return;
      }
      if (options.post) {
        await options.post(route, body, customer);
        return;
      }
      const old = current.memories.find((m) => m.id === body.memoryId);
      const next = {
        ...memory(
          String(body.content ?? old?.content ?? ""),
          Number(body.expectedRevision) + 1,
        ),
        id: String(body.memoryId),
        category: body.category ?? old?.category ?? "context",
        status: body.action === "archive" ? "archived" : "active",
        reason: String(body.reason),
      } as CustomerMemory;
      current = {
        ...current,
        memories:
          next.status === "archived"
            ? current.memories.filter((m) => m.id !== next.id)
            : [next, ...current.memories.filter((m) => m.id !== next.id)],
        history: [next, ...(old ? [old] : []), ...current.history],
      };
      await route.fulfill({
        json: { saved: true, memoryId: next.id, revision: next.revision },
      });
    },
  });
}

test("customer context reads do not manufacture saved facts or spend AI usage", async ({
  page,
}) => {
  const commands = await mount(page);
  await expect(
    page.getByText(original, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "新增記憶", exact: true }),
  ).toBeEnabled();
  expect(commands).toEqual([]);
});

test("a teammate corrects a fact with a reason while retaining the previous revision", async ({
  page,
}) => {
  const commands = await mount(page);
  await page.getByRole("button", { name: "修改", exact: true }).click();
  await page.getByLabel("記憶內容", { exact: true }).fill(revised);
  await page
    .getByLabel("修改原因", { exact: true })
    .fill("客人今日重新確認方便時間");
  await page.getByRole("button", { name: "儲存記憶", exact: true }).click();
  await expect(
    page.getByText(revised, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  expect(commands).toHaveLength(1);
  expect(commands[0].body).toMatchObject({
    action: "save",
    brandId: "main",
    memoryId,
    expectedRevision: 1,
    content: revised,
    reason: "客人今日重新確認方便時間",
  });
  expect(commands[0].body.commandId).toMatch(/^[a-f0-9-]{36}$/);
  expect(commands[0].body).not.toHaveProperty("actorName");
  await page.getByText("依據與修改記錄", { exact: true }).click();
  await expect(
    page.getByText(original, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
});

test("an ambiguous memory save is recovered with the identical immutable command", async ({
  page,
}) => {
  let attempts = 0;
  let current = resultPage();
  const commands = await mount(page, {
    get: () => current,
    post: async (route, body) => {
      current = resultPage(customerId, {
        memories: [memory(String(body.content), 2)],
        history: [memory()],
      });
      if (++attempts === 1) {
        await route.abort("failed");
        return;
      }
      await route.fulfill({ json: { saved: true, memoryId, revision: 2 } });
    },
  });
  await page.getByRole("button", { name: "修改", exact: true }).click();
  await page.getByLabel("記憶內容", { exact: true }).fill(revised);
  await page.getByLabel("修改原因", { exact: true }).fill("客人已重新核實時間");
  await page.getByRole("button", { name: "儲存記憶", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "核對同一操作", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "核對同一操作", exact: true }).click();
  await expect(
    page.getByText(revised, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  expect(commands).toHaveLength(2);
  expect(commands[1].body).toEqual(commands[0].body);
});

test("a viewer sees retained context without editing or archiving customer facts", async ({
  page,
}) => {
  const commands = await mount(page, {
    initial: resultPage(customerId, { canEdit: false }),
  });
  await expect(
    page.getByText(original, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "新增記憶", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "修改", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "封存", exact: true }),
  ).toHaveCount(0);
  expect(commands).toEqual([]);
});

test("the same customer's linked conversations, booking and payment retain chronological sources", async ({
  page,
}) => {
  const commands = await mount(page);
  await page
    .getByRole("button", { name: "顯示完整時間線", exact: true })
    .click();
  const timeline = page.getByRole("list", {
    name: "客戶完整時間線",
    exact: true,
  });
  await expect(timeline.getByRole("listitem")).toHaveCount(3);
  expect(await timeline.getByRole("listitem").allTextContents()).toEqual(
    expect.arrayContaining([
      expect.stringContaining("已核實收款"),
      expect.stringContaining("已核實預約"),
      expect.stringContaining("WhatsApp 查詢"),
    ]),
  );
  await expect(timeline.getByRole("listitem").nth(0)).toContainText(
    "已核實收款",
  );
  await expect(timeline.getByRole("listitem").nth(1)).toContainText(
    "已核實預約",
  );
  await expect(timeline.getByRole("listitem").nth(2)).toContainText(
    "WhatsApp 查詢",
  );
  await expect(
    page.getByRole("link", { name: "返回來源對話", exact: true }),
  ).toHaveAttribute("href", `/company/${companyId}/crm?thread=synthetic`);
  expect(commands).toEqual([]);
});

for (const [name, viewport] of [
  ["desktop", { width: 1440, height: 1000 }],
  ["mobile", { width: 390, height: 844 }],
] as const) {
  test(`customer memory ${name} stays readable, source-linked and accessible`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const commands = await mount(page);
    await expect(
      page.getByText(original, { exact: true }).filter({ visible: true }),
    ).toBeVisible();
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
      path: test.info().outputPath(`customer-memory-${name}.png`),
      fullPage: true,
    });
    expect(commands).toEqual([]);
  });
}

test("an unfinished customer edit is retained only for its original customer", async ({
  page,
}) => {
  const commands = await mount(page);
  await page.getByRole("button", { name: "修改", exact: true }).click();
  await page.getByLabel("記憶內容", { exact: true }).fill(revised);
  await page.getByLabel("修改原因", { exact: true }).fill("尚未儲存嘅核實內容");
  await page.getByRole("button", { name: "第二位客戶", exact: true }).click();
  await expect(
    page.getByText("記低客人想你記住嘅事", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("記憶內容", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "第一位客戶", exact: true }).click();
  await expect(page.getByLabel("記憶內容", { exact: true })).toHaveValue(
    revised,
  );
  await expect(page.getByLabel("修改原因", { exact: true })).toHaveValue(
    "尚未儲存嘅核實內容",
  );
  expect(commands).toEqual([]);
});

test("a late save from a prior customer cannot populate the currently selected customer", async ({
  page,
}) => {
  let release: (() => void) | undefined;
  let current = resultPage();
  const commands = await mount(page, {
    get: (customer) =>
      customer === customerId ? current : resultPage(customer),
    post: async (route, body) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      current = resultPage(customerId, {
        memories: [memory(String(body.content), 2)],
        history: [memory()],
      });
      await route.fulfill({ json: { saved: true, memoryId, revision: 2 } });
    },
  });
  await page.getByRole("button", { name: "修改", exact: true }).click();
  await page.getByLabel("記憶內容", { exact: true }).fill(revised);
  await page.getByLabel("修改原因", { exact: true }).fill("客人重新核實嘅內容");
  const saved = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().endsWith("/memory"),
  );
  await page.getByRole("button", { name: "儲存記憶", exact: true }).click();
  await expect.poll(() => !!release).toBe(true);
  await page.getByRole("button", { name: "第二位客戶", exact: true }).click();
  await expect(
    page.getByText("記低客人想你記住嘅事", { exact: true }),
  ).toBeVisible();
  release!();
  await saved;
  await expect(
    page.getByText(revised, { exact: true }).filter({ visible: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(original, { exact: true }).filter({ visible: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "第一位客戶", exact: true }).click();
  await expect(
    page.getByText(revised, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  expect(commands).toHaveLength(1);
});

test("archiving removes the active memory while preserving its reason and historical text", async ({
  page,
}) => {
  const commands = await mount(page);
  await page.getByRole("button", { name: "封存", exact: true }).click();
  await page.getByLabel("封存原因", { exact: true }).fill("客人已表示唔再適用");
  await page.getByRole("button", { name: "確認封存", exact: true }).click();
  await expect(page.getByText("0 項有效記憶", { exact: true })).toBeVisible();
  await page.getByText("封存記錄 · 1", { exact: true }).click();
  await expect(
    page.getByText(original, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByText("客人已表示唔再適用", { exact: true }),
  ).toBeVisible();
  expect(commands).toHaveLength(1);
  expect(commands[0].body).toMatchObject({
    action: "archive",
    memoryId,
    expectedRevision: 1,
    reason: "客人已表示唔再適用",
  });
});

test("a mismatched customer read cannot display or mutate another customer's memory", async ({
  page,
}) => {
  const commands = await mount(page, { get: () => resultPage(customerId) });
  await expect(
    page.getByText(original, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "第二位客戶", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("未能核對客戶記憶");
  await expect(
    page.getByText(original, { exact: true }).filter({ visible: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "新增記憶", exact: true }),
  ).toHaveCount(0);
  expect(commands).toEqual([]);
});
