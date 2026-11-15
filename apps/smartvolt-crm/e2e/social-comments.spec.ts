import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type {
  SocialCommentsPage,
  SocialRule,
  SocialCommentDelivery,
} from "../src/lib/social-comments/model";
import {
  fixtureBundle,
  mountFixture,
  syntheticCompany as companyId,
  syntheticSource as connectionId,
  syntheticId as ruleId,
} from "./phase456-fixture";
const rule = (patch: Partial<SocialRule> = {}): SocialRule => ({
  id: ruleId,
  revision: 1,
  connectionId,
  brandId: "main",
  name: "療程查詢",
  postId: "17890001",
  keywords: ["價錢", "想了解"],
  match: "any",
  body: "你好，想了解邊方面多啲？",
  enabled: true,
  channel: "instagram",
  permalink: "https://www.instagram.com/p/synthetic/",
  verifiedAt: "2026-11-15T15:00:00Z",
  createdAt: "2026-11-15T15:00:00Z",
  ...patch,
});
const delivery = (
  patch: Partial<SocialCommentDelivery> = {},
): SocialCommentDelivery => ({
  id: "77777777-7777-4777-8777-777777777777",
  brandId: "main",
  seq: "9",
  ruleId,
  ruleName: "療程查詢",
  channel: "instagram",
  comment: "想了解價錢",
  postId: "17890001",
  permalink: "https://www.instagram.com/p/synthetic/",
  state: "uncertain",
  reason: "provider_unreachable",
  body: "Hello",
  providerId: null,
  createdAt: "2026-11-15T15:00:00Z",
  attemptedAt: "2026-11-15T15:00:01Z",
  canRetry: false,
  ...patch,
});
let bundle = "";
test.beforeAll(async () => {
  bundle = await fixtureBundle(
    `import React from'react';import{createRoot}from'react-dom/client';import SocialCommentsWorkspace from './src/components/social-comments/SocialCommentsWorkspace';createRoot(document.getElementById('fixture')).render(<SocialCommentsWorkspace companyId='${companyId}'/>);`,
  );
});
async function mount(
  page: Page,
  options: {
    empty?: boolean;
    viewer?: boolean;
    noConnection?: boolean;
    readStatus?: () => number;
    history?: SocialCommentDelivery[];
    older?: SocialCommentDelivery[];
    pageOverride?: () => Partial<SocialCommentsPage>;
    post?: (route: Route, data: Record<string, unknown>) => Promise<void>;
  } = {},
) {
  let rules = options.empty ? [] : [rule()];
  const pageData = (): SocialCommentsPage => ({
    canManage: !options.viewer,
    automationsPaused: false,
    brands: [
      { id: "main", name: "Synthetic brand" },
      { id: "other", name: "Other brand" },
    ],
    connections: options.noConnection
      ? []
      : [
          {
            id: connectionId,
            brandId: "main",
            channel: "instagram",
            label: "Synthetic Instagram",
            enabled: true,
          },
        ],
    rules,
    deliveries: options.history ?? [],
    nextCursor: options.older?.length ? "8" : null,
  });
  const calls = await mountFixture(page, {
    name: "social_comments",
    bundle,
    styles: ["src/components/social-comments/social-comments.css"],
    handle: async (route, url, body) => {
      if (!url.pathname.endsWith("/social-comments")) {
        await route.fulfill({
          status: 404,
          json: { error: "Unexpected fixture endpoint" },
        });
        return;
      }
      if (!body) {
        const status = options.readStatus?.() ?? 200;
        if (status !== 200) {
          await route.fulfill({
            status,
            json: {
              error: status === 403 ? "你無權操作此品牌。" : "暫時未能刷新。",
            },
          });
          return;
        }
        await route.fulfill({
          json: url.searchParams.has("postsFor")
            ? {
                posts: [
                  {
                    id: "17890001",
                    title: "新療程介紹",
                    permalink: "https://www.instagram.com/p/synthetic/",
                    createdAt: "2026-11-15T10:00:00Z",
                  },
                ],
                nextCursor: null,
              }
            : {
                ...pageData(),
                ...(url.searchParams.has("before")
                  ? { deliveries: options.older ?? [], nextCursor: null }
                  : {}),
                ...(url.searchParams.get("brandId") === "other"
                  ? { rules: [], deliveries: [] }
                  : {}),
                ...options.pageOverride?.(),
              },
        });
        return;
      }
      if (options.post) {
        await options.post(route, body);
        return;
      }
      if (body.action === "save") {
        rules = [rule({ ...(body.definition as SocialRule), revision: 1 })];
      }
      if (body.action === "toggle")
        rules = rules.map((r) => ({
          ...r,
          enabled: Boolean(body.enabled),
          revision: r.revision + 1,
        }));
      await route.fulfill({ json: { saved: true } });
    },
  });
  await expect(
    page.getByRole("heading", { name: "由留言，開始對話。" }),
  ).toBeVisible();
  return calls;
}
async function fill(page: Page) {
  await page.getByRole("button", { name: "新增規則", exact: true }).click();
  await page.getByLabel("規則名稱", { exact: true }).fill("新客價格查詢");
  await page
    .getByLabel("選擇貼文／Reel", { exact: true })
    .selectOption("17890001");
  await page.getByLabel("觸發關鍵字", { exact: true }).fill("價錢\n想了解");
  await page
    .getByLabel("私訊內容", { exact: true })
    .fill("你好，想了解邊款療程？");
}
test("new rule selects a real source post and previews keywords without any sends or POST", async ({
  page,
}) => {
  const calls = await mount(page, { empty: true });
  await fill(page);
  await expect(
    page.getByRole("checkbox", { name: /啟用此規則/ }),
  ).not.toBeChecked();
  await page.getByLabel("試一句留言", { exact: true }).fill("想了解價錢");
  await expect(page.getByText("符合規則", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "打開貼文" })).toHaveAttribute(
    "href",
    "https://www.instagram.com/p/synthetic/",
  );
  expect(calls).toHaveLength(0);
  await page.getByRole("button", { name: "儲存草稿", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "留言私訊規則編輯" }),
  ).not.toBeVisible();
  expect(calls).toHaveLength(1);
  expect(calls[0].body.action).toBe("save");
  expect(calls[0].body.definition).toMatchObject({
    postId: "17890001",
    enabled: false,
    keywords: ["價錢", "想了解"],
  });
  expect(calls.every((c) => c.url.endsWith("/social-comments"))).toBe(true);
});
test("permission failure retains edited draft and never fabricates activation", async ({
  page,
}) => {
  const calls = await mount(page, {
    empty: true,
    post: async (route) => {
      await route.fulfill({
        status: 409,
        json: { error: "未能啟用：缺少留言私訊權限。" },
      });
    },
  });
  await fill(page);
  await page.getByRole("checkbox", { name: /啟用此規則/ }).check();
  await page.getByRole("button", { name: "核實並啟用", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("缺少留言私訊權限");
  await expect(page.getByLabel("私訊內容", { exact: true })).toHaveValue(
    "你好，想了解邊款療程？",
  );
  await expect(page.getByLabel("私訊內容", { exact: true })).toBeEnabled();
  expect(calls).toHaveLength(1);
  await expect(page.getByText("已啟用", { exact: true })).not.toBeVisible();
});
test("lost storage response retries the same immutable command with the draft frozen", async ({
  page,
}) => {
  const calls = await mount(page, {
    empty: true,
    post: async (route) => {
      await route.fulfill({
        status: 503,
        json: { error: "儲存結果未能確認。" },
      });
    },
  });
  await fill(page);
  await page.getByRole("button", { name: "儲存草稿", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "核對同一儲存", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("私訊內容", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "核對同一儲存", exact: true }).click();
  await expect.poll(() => calls.length).toBe(2);
  expect(calls[0].body).toEqual(calls[1].body);
});
test("uncertain delivery has no retry while a definite failed delivery can explicitly recheck", async ({
  page,
}) => {
  const calls = await mount(page, {
    history: [
      delivery(),
      delivery({
        id: "88888888-8888-4888-8888-888888888888",
        seq: "8",
        state: "failed",
        reason: "permission_missing",
        canRetry: true,
        comment: "請問優惠？",
      }),
    ],
  });
  const unknown = page
    .locator(".sc-history-row")
    .filter({ hasText: "想了解價錢" });
  await expect(unknown.getByText("結果待核對", { exact: true })).toBeVisible();
  await expect(unknown.getByRole("button")).toHaveCount(0);
  await page
    .getByRole("button", { name: "重新核對並再試", exact: true })
    .click();
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0].body.action).toBe("retry");
});
test("viewer sees results but has no rule creation, activation or retry controls", async ({
  page,
}) => {
  const calls = await mount(page, { viewer: true, history: [delivery()] });
  await expect(
    page.getByRole("heading", { name: "療程查詢", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "新增規則", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "暫停", exact: true }),
  ).toHaveCount(0);
  expect(calls).toHaveLength(0);
});

test("revoked read permission clears retained history and controls while preserving the local draft for recovery", async ({
  page,
}) => {
  let status = 200;
  const calls = await mount(page, {
    history: [delivery()],
    readStatus: () => status,
  });
  await fill(page);
  status = 403;
  await page
    .getByRole("button", { name: "重新讀取留言規則", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("你無權操作此品牌");
  await expect(
    page.getByRole("region", { name: "留言私訊規則編輯" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "療程查詢", exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByText("想了解價錢", { exact: false }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "新增規則", exact: true }),
  ).toHaveCount(0);
  status = 200;
  await page.getByRole("button", { name: "重新讀取", exact: true }).click();
  await expect(page.getByLabel("私訊內容", { exact: true })).toHaveValue(
    "你好，想了解邊款療程？",
  );
  expect(calls).toHaveLength(0);
});

test("successful narrowed-brand refresh hides retained older history and an inaccessible draft", async ({
  page,
}) => {
  let narrowed = false;
  const calls = await mount(page, {
    history: [delivery()],
    older: [
      delivery({
        id: "99999999-9999-4999-8999-999999999999",
        seq: "7",
        comment: "之前嘅私人留言",
      }),
    ],
    pageOverride: () =>
      narrowed
        ? {
            brands: [{ id: "other", name: "Other brand" }],
            connections: [],
            rules: [],
            deliveries: [],
            nextCursor: null,
          }
        : {},
  });
  await page.getByRole("button", { name: "較早紀錄", exact: true }).click();
  await expect(
    page.getByText("「之前嘅私人留言」", { exact: true }),
  ).toBeVisible();
  await fill(page);
  narrowed = true;
  await page
    .getByRole("button", { name: "重新讀取留言規則", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "留言私訊規則編輯" }),
  ).not.toBeVisible();
  await expect(
    page.getByText("「之前嘅私人留言」", { exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByText("「想了解價錢」", { exact: true }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "放棄本機草稿", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "新增規則", exact: true }),
  ).toBeEnabled();
  expect(calls).toHaveLength(0);
});

test("a changed actor scope cannot inherit another actor's unsent local draft or retained history page", async ({
  page,
}) => {
  let scope = "synthetic-owner-scope";
  const calls = await mount(page, {
    history: [delivery()],
    older: [
      delivery({
        id: "99999999-9999-4999-8999-999999999999",
        seq: "7",
        comment: "上位使用者讀取嘅較早留言",
      }),
    ],
    pageOverride: () => ({ scopeStamp: scope }),
  });
  await page.getByRole("button", { name: "較早紀錄", exact: true }).click();
  await expect(
    page.getByText("「上位使用者讀取嘅較早留言」", { exact: true }),
  ).toBeVisible();
  await fill(page);
  scope = "synthetic-other-actor-scope";
  await page
    .getByRole("button", { name: "重新讀取留言規則", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "留言私訊規則編輯" }),
  ).not.toBeVisible();
  await expect(
    page.getByText("「上位使用者讀取嘅較早留言」", { exact: true }),
  ).not.toBeVisible();
  await expect(page.getByText("「想了解價錢」", { exact: true })).toBeVisible();
  expect(calls).toHaveLength(0);
});
test("missing channels show a real setup handoff and save cannot silently activate", async ({
  page,
}) => {
  const calls = await mount(page, { empty: true, noConnection: true });
  await page.getByRole("button", { name: "新增規則", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "前往渠道設定" }),
  ).toHaveAttribute("href", `/company/${companyId}/crm/meta`);
  await expect(
    page.getByRole("button", { name: "儲存草稿", exact: true }),
  ).toBeDisabled();
  expect(calls).toHaveLength(0);
});
for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
])
  test(`social rules are accessible without overflow at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await mount(page);
    await fill(page);
    await expect(
      page.getByRole("button", { name: "儲存草稿", exact: true }),
    ).toBeEnabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(results.violations).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath(`social-comments-${viewport.width}.png`),
      fullPage: true,
    });
  });
