import { test, expect, type Route } from "@playwright/test";
import {
  fixtureBundle,
  mountFixture,
  syntheticCompany,
  syntheticSource,
} from "./phase456-fixture";

let bundle = "";
const reply = "可以先核對星期六方便嘅時段。";
test.beforeAll(async () => {
  bundle = await fixtureBundle(
    `import React,{useState}from'react';import{createRoot}from'react-dom/client';import AIDraft from './src/components/ai/AIDraft';function Fixture(){const[draft,setDraft]=useState('同事已寫好嘅內容');const[handoff,setHandoff]=useState(0);return <main><h1>客服建議驗收</h1><label>同事回覆草稿<textarea aria-label='同事回覆草稿' value={draft} onChange={e=>setDraft(e.target.value)}/></label><AIDraft context={{companyId:'${syntheticCompany}',brandId:'main',source:'meta',threadId:'${syntheticSource}'}} onInsert={text=>setDraft(current=>current+'\\n'+text)} onHandoff={async()=>{setHandoff(x=>x+1);return true}}/><p aria-label='已採納交接次數'>{handoff}</p></main>}createRoot(document.getElementById('fixture')).render(<Fixture/>);`,
  );
});
function answer(body: Record<string, unknown>) {
  return {
    requestId: body.requestId,
    reply,
    model: "synthetic/model",
    engine: "ai",
    decision: "draft",
    intent: "faq",
    summary: "客戶查詢方便時間",
    nextStep: "核對實際安排",
    interest: "medium",
    missing: [],
    sources: [],
    evidence: [],
    goal: body.goal,
  };
}
async function mount(
  page: Parameters<typeof mountFixture>[0],
  validate: (route: Route, body: Record<string, unknown>) => Promise<void>,
) {
  return mountFixture(page, {
    name: "draft_freshness",
    bundle,
    styles: [
      "src/components/ai/ai.css",
      "src/components/translation/translation.css",
    ],
    handle: async (route, url, body) => {
      if (url.pathname === "/api/assistant/validate")
        return validate(route, body!);
      if (url.pathname === "/api/assistant")
        return route.fulfill({ json: answer(body!) });
      return route.fulfill({
        status: 404,
        json: { error: "Unexpected synthetic request" },
      });
    },
  });
}
async function generate(page: Parameters<typeof mountFixture>[0]) {
  await page
    .getByRole("button", { name: "準備 AI 回覆建議", exact: true })
    .click();
  await expect(page.getByText(reply, { exact: true })).toBeVisible();
}
test("applying a suggestion validates the exact completed request before appending to the teammate's composer", async ({
  page,
}) => {
  const commands = await mount(page, async (route, body) =>
    route.fulfill({ json: answer(body) }),
  );
  await generate(page);
  await page.getByRole("button", { name: "加入回覆草稿", exact: true }).click();
  await expect(page.getByLabel("同事回覆草稿")).toHaveValue(
    "同事已寫好嘅內容\n" + reply,
  );
  expect(commands).toHaveLength(2);
  expect(commands[1].url).toContain("/api/assistant/validate");
  expect(commands[1].body).toEqual(commands[0].body);
});
test("a memory or reviewed voice correction clears only the stale suggestion and retains manually edited composer text", async ({
  page,
}) => {
  const commands = await mount(page, async (route) =>
    route.fulfill({
      status: 409,
      json: { error: "客戶背景已更新，請重新生成後再採用。" },
    }),
  );
  await generate(page);
  await page.getByLabel("同事回覆草稿").fill("同事手動更新嘅內容");
  await page.getByRole("button", { name: "加入回覆草稿", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("客戶背景已更新");
  await expect(
    page.getByRole("button", { name: "加入回覆草稿", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("同事回覆草稿")).toHaveValue(
    "同事手動更新嘅內容",
  );
  expect(
    commands.filter((c) => new URL(c.url).pathname === "/api/assistant"),
  ).toHaveLength(1);
});
test("an uncertain freshness check cannot apply a suggestion and retries the identical completed request", async ({
  page,
}) => {
  let checks = 0;
  const commands = await mount(page, async (route, body) => {
    checks++;
    if (checks === 1) return route.abort("failed");
    return route.fulfill({ json: answer(body) });
  });
  await generate(page);
  await page.getByRole("button", { name: "加入回覆草稿", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("同事回覆草稿")).toHaveValue("同事已寫好嘅內容");
  await page.getByRole("button", { name: "加入回覆草稿", exact: true }).click();
  await expect(page.getByLabel("同事回覆草稿")).toHaveValue(
    "同事已寫好嘅內容\n" + reply,
  );
  expect(commands).toHaveLength(3);
  expect(commands[1].body).toEqual(commands[0].body);
  expect(commands[2].body).toEqual(commands[0].body);
});
test("a stale suggestion cannot be adopted as a teammate handoff", async ({
  page,
}) => {
  await mount(page, async (route) =>
    route.fulfill({
      status: 409,
      json: { error: "建議所用資料已更新，請重新生成後再採用。" },
    }),
  );
  await generate(page);
  await page.getByRole("button", { name: "採納交接重點", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("資料已更新");
  await expect(page.getByLabel("已採納交接次數")).toHaveText("0");
  await expect(page.getByLabel("同事回覆草稿")).toHaveValue("同事已寫好嘅內容");
});
test("unrelated generic workspace updates leave a completed exact-customer suggestion available for validation", async ({
  page,
}) => {
  await mount(page, async (route, body) =>
    route.fulfill({ json: answer(body) }),
  );
  await generate(page);
  await page.evaluate(() =>
    window.dispatchEvent(new Event("convelta:data-changed")),
  );
  await expect(page.getByText(reply, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "加入回覆草稿", exact: true }).click();
  await expect(page.getByLabel("同事回覆草稿")).toHaveValue(
    "同事已寫好嘅內容\n" + reply,
  );
});
