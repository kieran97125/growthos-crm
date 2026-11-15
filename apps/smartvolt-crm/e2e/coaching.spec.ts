import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { BRAND_CSS } from "../src/lib/brand";
import type { CoachingAnalysis, CoachingPage } from "../src/lib/coaching/model";

const companyId = "11111111-1111-4111-8111-111111111111";
const firstSource = "22222222-2222-4222-8222-222222222222";
const secondSource = "33333333-3333-4333-8333-333333333333";
const analysisId = "44444444-4444-4444-8444-444444444444";
const reply = "你星期六方便上午定下午？我可以先幫你核對合適時段。";
const firstEvidence = {
  messageId: "message-customer-1",
  quote: "星期六想約試堂，下午有冇位？",
};
const analysis: CoachingAnalysis = {
  id: analysisId,
  brandId: "main",
  source: "meta",
  sourceId: firstSource,
  createdAt: "2026-11-15T09:00:00Z",
  stale: false,
  nextAction: {
    title: "核對客人方便嘅時段",
    reason: "客人提出星期六試堂，仍需核對實際可用時段。",
    missingFields: ["期望時段", "偏好分店"],
    suggestedReply: reply,
    evidence: [firstEvidence],
    knowledgeEvidence: [],
  },
  quality: {
    status: "reviewed",
    findings: [
      {
        code: "no_next_step",
        title: "回覆未有引導下一步",
        detail: "同事回覆服務介紹後，未有跟進客人方便嘅時段。",
        suggestion: "先問期望時段，再由同事核對安排。",
        severity: "suggestion",
        evidence: [
          { messageId: "message-team-1", quote: "我哋有提供試堂服務。" },
        ],
      },
    ],
    lossReason: {
      code: "unknown",
      label: "未能判斷",
      evidence: [],
    },
  },
  learning: [
    {
      kind: "pattern",
      title: "先確認期望時段再核對安排",
      question: "客人提出指定日期，應該點樣跟進？",
      content: "先了解客人方便嘅時段，再核對實際安排，避免未經確認就承諾有位。",
      evidence: [firstEvidence],
      knowledgeEvidence: [],
    },
  ],
  outcome: { verifiedBooking: false, label: "未有可核實預約結果" },
  coverage: { messages: 2, truncated: false, label: "已分析兩則對話" },
  latestReview: null,
};

function resultPage(
  changes: Partial<CoachingPage> = {},
  current: CoachingAnalysis | null = null,
): CoachingPage {
  return {
    analyses: current ? [structuredClone(current)] : [],
    learning: current
      ? current.learning.map((item, index) => ({
          analysisId: current.id,
          index,
          brandId: current.brandId,
          item,
          status: "suggested",
          articleId: null,
          createdAt: current.createdAt,
          stale: current.stale,
          verifiedBooking: current.outcome.verifiedBooking,
        }))
      : [],
    sources: [
      {
        source: "meta",
        sourceId: firstSource,
        brandId: "main",
        label: "Synthetic first conversation",
        preview: firstEvidence.quote,
      },
      {
        source: "whatsapp",
        sourceId: secondSource,
        brandId: "main",
        label: "Synthetic second conversation",
        preview: "想了解會員套票安排",
      },
    ],
    canGenerate: true,
    canManage: true,
    ...changes,
  };
}

let bundle = "";
let workroomBundle = "";
test.beforeAll(async () => {
  bundle = (
    await build({
      stdin: {
        contents: `import React,{useState}from'react';import{createRoot}from'react-dom/client';import CoachPanel from './src/components/coaching/CoachPanel';function Fixture(){const[source,setSource]=useState({source:'meta',sourceId:'${firstSource}',revision:1});const[draft,setDraft]=useState(window.__initialDraft||'');return <main><h1>客服教練驗收</h1><nav aria-label="合成對話切換"><button onClick={()=>setSource({source:'meta',sourceId:'${firstSource}',revision:1})}>切換至第一段對話</button><button onClick={()=>setSource({source:'whatsapp',sourceId:'${secondSource}',revision:1})}>切換至第二段對話</button><button onClick={()=>setSource(s=>({...s,revision:s.revision+1}))}>重新載入對話</button></nav><label>回覆草稿<textarea aria-label="回覆草稿" value={draft} onChange={e=>setDraft(e.target.value)}/></label><CoachPanel companyId='${companyId}' brandId='main' source={source.source} sourceId={source.sourceId} sourceRevision={source.revision} currentDraft={draft} onInsert={setDraft}/></main>}createRoot(document.getElementById('fixture')).render(<Fixture/>);`,
        loader: "tsx",
        resolveDir: process.cwd(),
      },
      bundle: true,
      write: false,
      platform: "browser",
      format: "iife",
      loader: { ".css": "empty" },
      jsx: "automatic",
      define: {
        "process.env": JSON.stringify({ NODE_ENV: "test" }),
      },
    })
  ).outputFiles[0].text;
  workroomBundle = (
    await build({
      stdin: {
        contents: `import React from'react';import{createRoot}from'react-dom/client';import CoachingWorkroom from './src/components/coaching/CoachingWorkroom';createRoot(document.getElementById('fixture')).render(<main><h1>對話學習驗收</h1><CoachingWorkroom companyId='${companyId}' brandId='main'/></main>);`,
        loader: "tsx",
        resolveDir: process.cwd(),
      },
      bundle: true,
      write: false,
      platform: "browser",
      format: "iife",
      loader: { ".css": "empty" },
      jsx: "automatic",
      define: {
        "process.env": JSON.stringify({ NODE_ENV: "test" }),
      },
    })
  ).outputFiles[0].text;
});

type Post = (route: Route, body: Record<string, unknown>) => Promise<void>;
async function mount(
  page: Page,
  options: {
    post?: Post;
    get?: (sourceId: string | null) => CoachingPage | Promise<CoachingPage>;
    draft?: string;
    workroom?: boolean;
  } = {},
) {
  const posts: Record<string, unknown>[] = [];
  const outsidePosts: string[] = [];
  let persisted: CoachingAnalysis | null = null;
  await page.route("**/__coaching_fixture__", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><html><body></body></html>",
    }),
  );
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.endsWith("/coaching")) {
      if (route.request().method() !== "GET") outsidePosts.push(url.pathname);
      await route.fulfill({
        status: 404,
        json: { error: "Unexpected fixture endpoint" },
      });
      return;
    }
    if (route.request().method() === "GET") {
      await route.fulfill({
        json: options.get
          ? await options.get(url.searchParams.get("sourceId"))
          : resultPage({}, persisted),
      });
      return;
    }
    const body = route.request().postDataJSON() as Record<string, unknown>;
    posts.push(body);
    if (body.type === "analyze") {
      persisted = { ...structuredClone(analysis), id: String(body.requestId) };
    }
    if (options.post) await options.post(route, body);
    else
      await route.fulfill({
        json: { analysis: { ...analysis, id: body.requestId } },
      });
  });
  await page.goto("/__coaching_fixture__");
  const css = readFileSync("src/components/coaching/coaching.css", "utf8");
  const vars = Object.entries(BRAND_CSS)
    .map(([key, value]) => `${key}:${value}`)
    .join(";");
  await page.setContent(
    `<!doctype html><html lang="zh-HK"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic coaching acceptance</title><style>:root{${vars}}*{box-sizing:border-box}body{margin:0;font-family:Arial,'Noto Sans CJK TC',sans-serif}main{max-width:600px;margin:auto;padding:16px}nav{display:flex;flex-wrap:wrap;gap:8px}label{display:block}textarea{display:block;width:100%;min-height:80px}${css}</style></head><body><div id="fixture"></div><script>window.__initialDraft=${JSON.stringify(options.draft ?? "")}</script></body></html>`,
  );
  await page.addScriptTag({
    content: options.workroom ? workroomBundle : bundle,
  });
  return { posts, outsidePosts };
}

test("reading a conversation never spends AI usage until the teammate requests analysis", async ({
  page,
}) => {
  const { posts, outsidePosts } = await mount(page);
  await expect(
    page.getByRole("button", { name: "分析呢段對話", exact: true }),
  ).toBeEnabled();
  expect(posts).toEqual([]);
  await page.getByRole("button", { name: "分析呢段對話", exact: true }).click();
  await expect(
    page.getByText(analysis.nextAction.title, { exact: true }),
  ).toBeVisible();
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({
    type: "analyze",
    brandId: "main",
    source: "meta",
    sourceId: firstSource,
  });
  expect(posts[0].requestId).toMatch(/^[a-f0-9-]{36}$/);
  expect(posts[0]).not.toHaveProperty("messages");
  expect(posts[0]).not.toHaveProperty("articles");
  expect(outsidePosts).toEqual([]);
});

test("an ambiguous model response is reconciled with the same immutable request", async ({
  page,
}) => {
  let calls = 0;
  const { posts, outsidePosts } = await mount(page, {
    post: async (route, body) => {
      calls++;
      if (calls === 1) return route.abort("failed");
      await route.fulfill({
        json: { analysis: { ...analysis, id: body.requestId } },
      });
    },
  });
  await page.getByRole("button", { name: "分析呢段對話", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "核對同一分析", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "核對同一分析", exact: true }).click();
  await expect(
    page.getByText(analysis.nextAction.title, { exact: true }),
  ).toBeVisible();
  expect(posts).toHaveLength(2);
  expect(posts[1]).toEqual(posts[0]);
  expect(outsidePosts).toEqual([]);
});

test("a confirmed persisted failure unlocks a fresh analysis without replaying its failed receipt", async ({
  page,
}) => {
  let current: CoachingAnalysis | null = null;
  let attempts = 0;
  const { posts, outsidePosts } = await mount(page, {
    get: () => resultPage({}, current),
    post: async (route, body) => {
      attempts++;
      if (attempts === 1) {
        await route.fulfill({
          status: 503,
          json: {
            error: "已核實呢次分析失敗，可以重新分析。",
            code: "unavailable",
            terminalFailure: true,
          },
        });
        return;
      }
      current = { ...structuredClone(analysis), id: String(body.requestId) };
      await route.fulfill({ json: { analysis: current } });
    },
  });
  await page.getByRole("button", { name: "分析呢段對話", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("已核實呢次分析失敗");
  await expect(
    page.getByRole("button", { name: "核對同一分析", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "分析呢段對話", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "分析呢段對話", exact: true }).click();
  await expect(
    page.getByText(analysis.nextAction.title, { exact: true }),
  ).toBeVisible();
  expect(posts).toHaveLength(2);
  expect(posts[1].requestId).not.toBe(posts[0].requestId);
  expect({ ...posts[1], requestId: posts[0].requestId }).toEqual(posts[0]);
  expect(outsidePosts).toEqual([]);
});

test("a newly saved conversation analysis appears in the brand learning list without a page reload", async ({
  page,
}) => {
  let current: CoachingAnalysis | null = null;
  let brandReads = 0;
  const { posts, outsidePosts } = await mount(page, {
    workroom: true,
    get: (sourceId) => {
      if (!sourceId) brandReads++;
      return resultPage({}, current);
    },
    post: async (route, body) => {
      current = { ...structuredClone(analysis), id: String(body.requestId) };
      await route.fulfill({ json: { analysis: current } });
    },
  });
  await expect(
    page.getByLabel("選擇已儲存對話", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "分析呢段對話", exact: true }),
  ).toBeEnabled();
  expect(brandReads).toBe(1);
  await page.getByRole("button", { name: "分析呢段對話", exact: true }).click();
  await expect(
    page.getByText(analysis.nextAction.title, { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "品牌話術", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: analysis.learning[0].title,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("最近 1 項建議與已採納話術", { exact: true }),
  ).toBeVisible();
  expect(brandReads).toBeGreaterThan(1);
  expect(posts).toHaveLength(1);
  expect(outsidePosts).toEqual([]);
});

test("quality coaching retains quoted evidence and distinguishes a suggested concern from a verified loss", async ({
  page,
}) => {
  await mount(page, { get: () => resultPage({}, analysis) });
  await page.getByRole("button", { name: "回覆質檢", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: analysis.quality.findings[0].title,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(analysis.quality.findings[0].suggestion, { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".coach-loss").getByText("未能判斷", { exact: true }),
  ).toBeVisible();
  await page
    .locator("details")
    .filter({ hasText: "我哋有提供試堂服務。" })
    .locator("summary")
    .click();
  await expect(
    page.getByText("我哋有提供試堂服務。", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("已確認流失", { exact: true })).toHaveCount(0);
});

test("a viewer can read findings but cannot generate, adopt or override them", async ({
  page,
}) => {
  const { posts } = await mount(page, {
    get: () => resultPage({ canGenerate: false, canManage: false }, analysis),
  });
  await expect(
    page.getByRole("button", { name: /更新分析|分析呢段對話/ }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "回覆質檢", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "覆核判斷", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "話術學習", exact: true }).click();
  await expect(
    page.getByText(analysis.learning[0].title, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "編輯並加入知識", exact: true }),
  ).toHaveCount(0);
  expect(posts).toEqual([]);
});

for (const [name, width, height] of [
  ["desktop", 1440, 1000],
  ["mobile", 390, 844],
] as const) {
  test(`coaching ${name} inserts an editable draft, preserves the original until chosen and remains accessible`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height });
    const original = "你好，想先了解你需要。";
    const { posts, outsidePosts } = await mount(page, {
      draft: original,
      get: () => resultPage({}, analysis),
    });
    await expect(page.getByText("期望時段", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "加入回覆草稿", exact: true })
      .click();
    await expect(page.getByLabel("回覆草稿", { exact: true })).toHaveValue(
      original,
    );
    await page.getByRole("button", { name: "追加至草稿", exact: true }).click();
    await expect(page.getByLabel("回覆草稿", { exact: true })).toHaveValue(
      original + "\n\n" + reply,
    );
    await page
      .getByLabel("回覆草稿", { exact: true })
      .fill("同事自行修改嘅回覆");
    await expect(page.getByLabel("回覆草稿", { exact: true })).toHaveValue(
      "同事自行修改嘅回覆",
    );
    expect(posts).toEqual([]);
    expect(outsidePosts).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`coaching-${name}.png`),
      fullPage: true,
    });
  });
}

test("stale evidence cannot be inserted into a reply or promoted to reusable knowledge", async ({
  page,
}) => {
  const stale = { ...structuredClone(analysis), stale: true };
  const { posts } = await mount(page, { get: () => resultPage({}, stale) });
  await expect(
    page.getByRole("button", { name: "加入回覆草稿", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "話術學習", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "編輯並加入知識", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("回覆草稿", { exact: true })).toHaveValue("");
  expect(posts).toEqual([]);
});

test("a result for the previous conversation cannot replace the newly selected conversation", async ({
  page,
}) => {
  let finishFirst: (() => void) | undefined;
  const second = structuredClone(analysis);
  second.id = "55555555-5555-4555-8555-555555555555";
  second.source = "whatsapp";
  second.sourceId = secondSource;
  second.nextAction.title = "了解會員套票需要";
  second.nextAction.suggestedReply = "想先了解你偏好嘅套票安排。";
  const { posts } = await mount(page, {
    get: (source) => resultPage({}, source === secondSource ? second : null),
    post: async (route, body) => {
      if (body.sourceId === firstSource) {
        await new Promise<void>((resolve) => {
          finishFirst = resolve;
        });
      }
      try {
        await route.fulfill({
          json: { analysis: { ...analysis, id: body.requestId } },
        });
      } catch {
        // Aborting the superseded request is also a valid implementation.
      }
    },
  });
  await page.getByRole("button", { name: "分析呢段對話", exact: true }).click();
  await expect.poll(() => posts.length).toBe(1);
  await page
    .getByRole("button", { name: "切換至第二段對話", exact: true })
    .click();
  await expect(
    page.getByText(second.nextAction.title, { exact: true }),
  ).toBeVisible();
  finishFirst?.();
  await page.getByRole("button", { name: "加入回覆草稿", exact: true }).click();
  await expect(page.getByLabel("回覆草稿", { exact: true })).toHaveValue(
    second.nextAction.suggestedReply,
  );
  await expect(
    page.getByText(analysis.nextAction.title, { exact: true }),
  ).toHaveCount(0);
});

test("a manager can edit learning before adoption without sending private conversation evidence", async ({
  page,
}) => {
  let adopted = false;
  const { posts, outsidePosts } = await mount(page, {
    get: () => {
      const data = resultPage({}, analysis);
      if (adopted) {
        data.learning[0].status = "adopted";
        data.learning[0].articleId = "source-learned-1";
      }
      return data;
    },
    post: async (route, body) => {
      expect(body.type).toBe("adopt");
      adopted = true;
      await route.fulfill({
        json: { saved: true, articleId: "source-learned-1" },
      });
    },
  });
  await page.getByRole("button", { name: "話術學習", exact: true }).click();
  await page
    .getByRole("button", { name: "編輯並加入知識", exact: true })
    .click();
  await page.getByLabel("話術標題", { exact: true }).fill("先核對期望時段");
  await page
    .getByLabel("可重用內容", { exact: true })
    .fill("先詢問客人方便嘅時段，再核對實際安排。");
  await page.getByLabel("有效至", { exact: true }).fill("2027-01-01");
  await page.getByRole("button", { name: "加入品牌知識", exact: true }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({
    type: "adopt",
    analysisId,
    index: 0,
    title: "先核對期望時段",
    content: "先詢問客人方便嘅時段，再核對實際安排。",
    validUntil: "2027-01-01",
  });
  expect(posts[0].commandId).toMatch(/^[a-f0-9-]{36}$/);
  expect(posts[0]).not.toHaveProperty("evidence");
  expect(outsidePosts).toEqual([]);
});

test("a manager correction is an explicit audited command and keeps the original finding available", async ({
  page,
}) => {
  const current = structuredClone(analysis);
  const { posts } = await mount(page, {
    get: () => resultPage({}, current),
    post: async (route, body) => {
      current.latestReview = {
        commandId: String(body.commandId),
        lossCode: "timing",
        reason: String(body.reason),
        dismissedFindingCodes: ["no_next_step"],
        actorName: "Synthetic manager",
        createdAt: "2026-11-15T09:10:00Z",
      };
      await route.fulfill({ json: { saved: true } });
    },
  });
  await page.getByRole("button", { name: "回覆質檢", exact: true }).click();
  await page.getByText("覆核判斷", { exact: true }).click();
  await page.getByLabel("實際顧慮", { exact: true }).selectOption("timing");
  await page
    .getByRole("checkbox", {
      name: analysis.quality.findings[0].title,
      exact: true,
    })
    .check();
  await page
    .getByLabel("覆核原因", { exact: true })
    .fill("客人表示下星期先有時間，已另行跟進。");
  await page.getByRole("button", { name: "儲存覆核", exact: true }).click();
  await expect(page.getByText("主管覆核顧慮", { exact: true })).toBeVisible();
  await expect(
    page.locator(".coach-loss").getByText("時間未配合", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: analysis.quality.findings[0].title,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("主管已標記不適用", { exact: true }),
  ).toBeVisible();
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({
    type: "review",
    analysisId,
    lossCode: "timing",
    dismissedFindingCodes: ["no_next_step"],
  });
});

test("switching away from an ambiguous analysis preserves its request when returning", async ({
  page,
}) => {
  let attempts = 0;
  const { posts } = await mount(page, {
    get: () => resultPage(),
    post: async (route) => {
      attempts++;
      if (attempts === 1) return route.abort("failed");
      await route.fulfill({ json: { state: "running" } });
    },
  });
  await page.getByRole("button", { name: "分析呢段對話", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "核對同一分析", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "切換至第二段對話", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "分析呢段對話", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "切換至第一段對話", exact: true })
    .click();
  await page.getByRole("button", { name: "核對同一分析", exact: true }).click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1]).toEqual(posts[0]);
  await expect(
    page.getByText("分析仍在處理，請稍後核對同一請求。", { exact: true }),
  ).toBeVisible();
});

test("a new source revision locks the previous draft until authoritative freshness is read back", async ({
  page,
}) => {
  let current: CoachingAnalysis | null = null;
  let holdRead = false;
  let releaseRead: (() => void) | undefined;
  const { posts } = await mount(page, {
    get: async () => {
      if (holdRead)
        await new Promise<void>((resolve) => {
          releaseRead = resolve;
        });
      return resultPage({}, current);
    },
    post: async (route, body) => {
      current = { ...structuredClone(analysis), id: String(body.requestId) };
      await route.fulfill({ json: { analysis: current } });
    },
  });
  await page.getByRole("button", { name: "分析呢段對話", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "加入回覆草稿", exact: true }),
  ).toBeEnabled();
  holdRead = true;
  if (current) (current as CoachingAnalysis).stale = true;
  await page.getByRole("button", { name: "重新載入對話", exact: true }).click();
  await expect.poll(() => Boolean(releaseRead)).toBe(true);
  const insert = page.getByRole("button", {
    name: "加入回覆草稿",
    exact: true,
  });
  await expect
    .poll(
      async () => (await insert.count()) === 0 || (await insert.isDisabled()),
    )
    .toBe(true);
  releaseRead?.();
  await expect(insert).toBeDisabled();
  await expect(
    page.getByText("對話或知識已更新，請更新分析後再使用建議。", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("回覆草稿", { exact: true })).toHaveValue("");
  expect(posts).toHaveLength(1);
});

test("a delayed learning adoption from a previous source cannot mark the new source as adopted", async ({
  page,
}) => {
  let completeAdoption: (() => void) | undefined;
  const second = structuredClone(analysis);
  second.id = "55555555-5555-4555-8555-555555555555";
  second.source = "whatsapp";
  second.sourceId = secondSource;
  second.learning[0].title = "會員套票回覆方式";
  const { posts, outsidePosts } = await mount(page, {
    draft: "保留同事原本草稿",
    get: (source) =>
      resultPage({}, source === secondSource ? second : analysis),
    post: async (route) => {
      await new Promise<void>((resolve) => {
        completeAdoption = resolve;
      });
      await route.fulfill({
        json: { saved: true, articleId: "learned-from-first-source" },
      });
    },
  });
  await page.getByRole("button", { name: "話術學習", exact: true }).click();
  await page
    .getByRole("button", { name: "編輯並加入知識", exact: true })
    .click();
  await page.getByRole("button", { name: "加入品牌知識", exact: true }).click();
  await expect.poll(() => posts.length).toBe(1);
  await page
    .getByRole("button", { name: "切換至第二段對話", exact: true })
    .click();
  await expect(
    page.getByText(second.learning[0].title, { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.addEventListener("convelta:data-changed", () => {
      document.body.dataset.fixtureAdoptionFinished = "true";
    });
  });
  expect(completeAdoption).toBeDefined();
  completeAdoption?.();
  await expect(page.locator("body")).toHaveAttribute(
    "data-fixture-adoption-finished",
    "true",
  );
  await expect(
    page.getByRole("button", { name: "編輯並加入知識", exact: true }),
  ).toBeEnabled();
  await expect(page.getByText("已加入知識", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("回覆草稿", { exact: true })).toHaveValue(
    "保留同事原本草稿",
  );
  expect(outsidePosts).toEqual([]);
});
