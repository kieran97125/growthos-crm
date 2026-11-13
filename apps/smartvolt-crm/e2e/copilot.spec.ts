import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { BRAND_CSS } from "../src/lib/brand";
import { observations, factsFor } from "../src/lib/copilot/observations";
import {
  snapshotSchema,
  type Feedback,
  type CopilotRequest,
  type CopilotAnswer,
  type Message,
  type Task,
  type Thread,
} from "../src/lib/copilot/model";
const company = "66666666-6666-4666-8666-666666666666",
  base = `/company/${company}`,
  thread = "55555555-5555-4555-8555-555555555555";
let script = "";
const style = [
  "src/app/saas.css",
  "src/components/products/products.css",
  "src/components/inquiries/inquiries.css",
  "src/components/ai/ai.css",
  "src/components/workspace/workspace.css",
  "src/components/copilot/copilot.css",
]
  .map((p) => readFileSync(p, "utf8"))
  .join("\n");
test.beforeAll(async () => {
  script = (
    await build({
      stdin: {
        loader: "tsx",
        resolveDir: process.cwd(),
        contents: `
 import React,{useState,useEffect}from'react';import{createRoot}from'react-dom/client';
 import{CompanyWorkspaceChrome}from'./src/components/workspace/CompanyWorkspace';import{useWorkspaceCustomer}from'./src/components/workspace/context';
 import Workroom from'./src/components/copilot/CopilotWorkspace';import CustomerPanel from'./src/components/inquiries/CustomerPanel';import AIDraft from'./src/components/ai/AIDraft';
 const company='${company}',base='/company/'+company;
 const initial={customer:{id:'customer-one',name:'Synthetic customer',phone:'',email:'',tags:[],note:'',source:'messenger',brandIds:['main'],revision:0},links:[],events:[],nextEvent:null,requests:[],hasMoreRequests:false};
 function Customer(){useWorkspaceCustomer('crm',{contactId:'customer-one',brandId:'main'});const[data,setData]=useState(initial);
 useEffect(()=>{const reload=()=>fetch('/api/companies/'+company+'/customers?id=customer-one').then(r=>r.json()).then(setData);window.addEventListener('convelta:data-changed',reload);return()=>window.removeEventListener('convelta:data-changed',reload)},[]);
 return <main className='synthetic-customer'><CustomerPanel data={data} companyId={company} hasPos canEdit busy={false} mutate={async()=>true}/><AIDraft context={{companyId:company,brandId:'main',source:'meta',threadId:'${thread}'}}/></main>}
 function App(){const[url,setUrl]=useState(new URL(location.href));return <div onClickCapture={e=>{const a=e.target.closest('a');if(a&&a.getAttribute('href')?.startsWith(base)){e.preventDefault();e.stopPropagation();const u=new URL(a.href);history.pushState(null,'',u);setUrl(u)}}}><CompanyWorkspaceChrome companyId={company} companyName='C acceptance · synthetic' actorName='Synthetic owner' actorId='synthetic-owner' products={['crm','pos']} location={{pathname:url.pathname,search:url.search}}>{url.pathname.endsWith('/customers')?<Customer/>:url.pathname.endsWith('/ai')||url.pathname.endsWith('/copilot')?<Workroom/>:<main className='synthetic-home'><h1>工作區 · synthetic</h1><p>瀏覽器測試資料，唔係正式客戶紀錄。</p><label>正在輸入<input aria-label='測試中正在輸入' data-copilot-activity='replying'/></label></main>}</CompanyWorkspaceChrome></div>}
 createRoot(document.getElementById('fixture')).render(<App/>);
 `,
      },
      bundle: true,
      write: false,
      format: "iife",
      platform: "browser",
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
  options: {
    empty?: boolean;
    loseFirstResponse?: boolean;
    unsafe?: boolean;
    holdRead?: Promise<void>;
  } = {},
) {
  const feedback: Feedback[] = [],
    threads: Thread[] = [],
    tasks: Task[] = [],
    messages = new Map<string, Message[]>(),
    answers = new Map<string, CopilotAnswer>();
  const askCalls: CopilotRequest[] = [];
  let dispatches = 0,
    used = 0;
  const snapshot = snapshotSchema.parse({
    at: new Date().toISOString(),
    from: new Date(Date.now() - 90 * 86400000).toISOString(),
    product: "crm",
    brandId: null,
    revision: 0,
    brands: [{ id: "main", name: "Synthetic brand" }],
    customers: options.empty ? 0 : 60,
    inquiries: options.empty ? 0 : 60,
    confirmed: options.empty ? 0 : 20,
    overdue: options.empty ? 0 : 5,
    dormant: options.empty ? 0 : 40,
    untagged: options.empty ? 0 : 10,
    segments: options.empty
      ? []
      : [{ key: "tag:Interested", label: "Interested", leads: 20, booked: 18 }],
    pos: { appointments: 0, completed: 0, noShow: 0, revenueCents: 0 },
    customer: null,
    knowledge: [],
    channels: { connected: 0 },
    lastBroadcastAt: null,
    broadcastCoverage: "unavailable",
  });
  const customer = {
    id: "customer-one",
    name: "Synthetic customer",
    phone: "",
    email: "",
    tags: [] as string[],
    note: "",
    source: "messenger",
    brandIds: ["main"],
    revision: 0,
  };
  const customerDetail = () => ({
    customer,
    links: [],
    events: [],
    nextEvent: null,
    requests: [],
    hasMoreRequests: false,
  });
  await page.route(`**/api/companies/${company}/customers**`, (route) =>
    route.fulfill({ json: customerDetail() }),
  );
  await page.route("**/api/assistant", (route) => {
    const request = route.request().postDataJSON();
    return route.fulfill({
      json: {
        decision: "draft",
        reply:
          request.goal === "book"
            ? "我可以先了解你偏好嘅日子，再由同事核對安排。"
            : "我可以幫你了解服務需要。",
        reason: "Only approved fixture knowledge",
        summary: "客戶想了解預約",
        nextStep: "核對偏好日子",
        interest: "high",
        missing: [],
        sources: [],
        evidence: [],
        model: "synthetic/model",
        goal: request.goal,
      },
    });
  });
  await page.route(`**/api/companies/${company}/copilot**`, async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (req.method() === "GET") {
      if (options.holdRead) await options.holdRead;
      const context = JSON.parse(
          url.searchParams.get("context") ??
            '{"product":"crm","section":"ai","activity":"viewing"}',
        ),
        tid = url.searchParams.get("thread"),
        data = {
          ...snapshot,
          brandId: context.brandId ?? null,
          product: context.product,
          customer: context.customerId
            ? {
                id: customer.id,
                tags: customer.tags,
                revision: customer.revision,
                lastMessage: "想預約星期六，有咩時段？",
                lastMessageAt: Date.now(),
                booked: false,
              }
            : null,
        };
      await route.fulfill({
        json: {
          companyName: "C acceptance · synthetic",
          actorName: "Synthetic owner",
          context,
          observations: observations(data, context, feedback),
          feedback,
          facts: factsFor(data),
          threads,
          tasks,
          messages: messages.get(tid ?? "") ?? [],
          threadId: tid,
          ai: {
            enabled: true,
            model: "synthetic/model",
            canGenerate: true,
            canConfigure: true,
            used,
            limit: 30,
            verified: true,
          },
          at: snapshot.at,
          brands: snapshot.brands,
        },
      });
      return;
    }
    const command = req.postDataJSON();
    if (command.action === "ask") {
      const input = command.request as CopilotRequest;
      askCalls.push(input);
      let answer = answers.get(input.requestId);
      if (!answer) {
        dispatches++;
        used++;
        const createdAt = new Date().toISOString();
        answer = {
          answer: options.unsafe
            ? "<script>window.cInjected=true</script> **安全測試** ![tracking](https://unsafe.invalid/pixel)"
            : "我留意到有查詢等緊跟進，可以先準備一個有針對性嘅活動。[overdue]",
          factIds: ["overdue"],
          evidence: [],
          nextQuestions: ["想先了解客群準則嗎？"],
          campaign:
            input.mode === "proactive"
              ? null
              : {
                  title: "停滯查詢再互動",
                  objective: "了解未預約客人需要",
                  audience: "14日未有新來訊、未有未來確認預約；同意待核對",
                  message:
                    "你好，想了解你之前查詢嘅需要，而家仲有冇想我幫你睇嘅地方？",
                  steps: [
                    "核對對象及接收意願",
                    "審閱訊息草稿",
                    "確認渠道及頻率",
                  ],
                  measures: ["回覆人數", "確認預約人數"],
                },
          requestId: input.requestId,
          threadId: input.threadId,
          facts: [
            {
              id: "overdue",
              label: "到期未處理",
              value: "5段對話",
              source: "Synthetic formal-record fixture",
            },
          ],
          createdAt,
          scope: input.context,
        };
        answers.set(input.requestId, answer);
        threads.unshift({
          id: input.threadId,
          title: input.message.slice(0, 60),
          product: input.context.product,
          updated_at: createdAt,
        });
        const list = messages.get(input.threadId) ?? [];
        list.push(
          {
            id: input.requestId,
            role: "user",
            body: input.message,
            result: null,
            created_at: createdAt,
          },
          {
            id: input.requestId + "-answer",
            role: "assistant",
            body: answer.answer,
            result: answer,
            created_at: createdAt,
          },
        );
        messages.set(input.threadId, list);
        if (options.loseFirstResponse) {
          options.loseFirstResponse = false;
          await route.abort("failed");
          return;
        }
      }
      await route.fulfill({ json: answer });
      return;
    }
    if (command.action === "feedback") {
      feedback.push({
        signal_key: command.key,
        family: command.family,
        subject: command.subject,
        status: command.status,
        updated_at: new Date().toISOString(),
        until: new Date(Date.now() + 86400000).toISOString(),
      });
    }
    if (command.action === "tag") {
      customer.tags.push("預約意向");
      customer.revision++;
    }
    if (command.action === "save-brief") {
      const answer = answers.get(command.requestId)!;
      if (!tasks.some((t) => t.id === command.commandId))
        tasks.push({
          id: command.commandId,
          title: answer.campaign!.title,
          status: "draft",
          revision: 0,
          plan: answer.campaign,
          created_at: new Date().toISOString(),
        });
    }
    if (command.action === "brief-status") {
      const task = tasks.find((t) => t.id === command.id);
      if (task) {
        task.status = command.status;
        task.revision++;
      }
    }
    await route.fulfill({ json: { saved: true } });
  });
  const vars = Object.entries(BRAND_CSS)
    .map(([k, v]) => k + ":" + v)
    .join(";");
  const html = `<!doctype html><html lang="zh-HK"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>C acceptance · synthetic</title><style>:root{${vars}}*{box-sizing:border-box}body{margin:0;font-family:Arial,'Noto Sans CJK TC',sans-serif}button,input,textarea,select{font:inherit}.synthetic-home{padding:30px}.synthetic-customer{display:grid;grid-template-columns:minmax(300px,430px) minmax(300px,500px);gap:25px;padding:24px}@media(max-width:760px){.synthetic-customer{display:block;padding:18px}}${style}</style></head><body><div id="fixture"></div><script>${script.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
  await page.route(`**/company/${company}/**`, (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  return {
    askCalls: () => askCalls,
    dispatches: () => dispatches,
    feedback,
    tasks,
    customer,
  };
}
for (const mobile of [false, true])
  test(`${mobile ? "mobile" : "desktop"}: C workroom prepares a durable campaign draft with evidence and no external send`, async ({
    page,
  }, info) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const state = await fixture(page);
    await page.goto(base + "/crm/ai");
    await expect(
      page.getByRole("heading", { name: /下一步，\s*同 C 一齊諗。/ }),
    ).toBeVisible();
    const input = page.getByRole("textbox", { name: "同 C 講你想做到乜" });
    await input.fill("幫我建立一個再互動活動");
    await page.getByRole("button", { name: "交畀 C 處理" }).click();
    await expect(
      page.getByRole("heading", { name: "停滯查詢再互動" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "保存活動草稿", exact: true })
      .click();
    await expect(
      page.getByText("活動已保存為草稿，尚未推播。", { exact: true }),
    ).toBeVisible();
    expect(state.tasks).toHaveLength(1);
    expect(state.dispatches()).toBe(1);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "停滯查詢再互動" }),
    ).toBeVisible();
    expect(state.askCalls()).toHaveLength(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`${mobile ? "mobile" : "desktop"}-c-campaign.png`),
      fullPage: true,
    });
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(axe.violations).toEqual([]);
  });
test("the persistent C drawer retains the task and unsent composer through module navigation", async ({
  page,
}) => {
  await fixture(page);
  await page.goto(base + "/crm");
  await page
    .getByRole("button", { name: "開啟 C 全能助手", exact: true })
    .click();
  const dock = page.getByRole("complementary", {
    name: "C 全能助手",
    exact: true,
  });
  await dock.getByRole("textbox").fill("未完成嘅活動想法");
  await page
    .getByRole("navigation", { name: "CRM 功能", exact: true })
    .getByRole("link", { name: "AI 助理", exact: true })
    .click();
  await expect(dock.getByRole("textbox")).toHaveValue("未完成嘅活動想法");
  await expect(page.locator(".cq-header")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(dock).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "開啟 C 全能助手", exact: true }),
  ).toBeFocused();
});
test("C observes without a click, remembers a snooze after reload and does not send anything", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto(base + "/crm");
  const peek = page.getByRole("complementary", {
    name: "C 主動觀察",
    exact: true,
  });
  await expect(peek).toBeVisible({ timeout: 15000 });
  await expect
    .poll(() => state.askCalls().filter((q) => q.mode === "proactive").length)
    .toBe(1);
  await peek.getByRole("button", { name: "稍後提醒呢個觀察" }).click();
  await expect(peek).toHaveCount(0);
  expect(state.feedback.some((f) => f.status === "snoozed")).toBe(true);
  await page.reload();
  await page.waitForTimeout(8500);
  await expect(peek).toHaveCount(0);
  expect(state.askCalls().filter((q) => q.mode === "proactive")).toHaveLength(
    1,
  );
});
test("typing is not interrupted, and a new company never gets fabricated conversion observations", async ({
  page,
}) => {
  const state = await fixture(page, { empty: true });
  await page.goto(base + "/crm");
  const input = page.getByRole("textbox", { name: "測試中正在輸入" });
  await input.fill("正在處理客人查詢");
  await page.waitForTimeout(8500);
  await expect(page.locator(".cc-peek")).toHaveCount(0);
  expect(state.askCalls()).toHaveLength(0);
  await page
    .getByRole("button", { name: "開啟 C 全能助手", exact: true })
    .click();
  await expect(
    page.getByText(
      "而家未有客戶紀錄，未足夠判斷高轉化客群。你可以先同我傾業務、整理核准知識或者準備活動草稿。",
      { exact: true },
    ),
  ).toBeVisible();
});
test("native customer tagging exposes an explanation and a review step before applying", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto(base + "/crm/customers");
  await page.getByRole("button", { name: "編輯客戶資料", exact: true }).click();
  await page.getByRole("textbox", { name: "標籤（用「、」分隔）" }).focus();
  await expect(page.locator(".cc-tag-inline")).toBeVisible();
  await page
    .getByRole("button", { name: "開啟 C 全能助手", exact: true })
    .click();
  const dock = page.getByRole("complementary", {
    name: "C 全能助手",
    exact: true,
  });
  await dock.getByRole("button", { name: "檢視加「預約意向」" }).click();
  expect(state.customer.tags).toHaveLength(0);
  await dock.getByRole("button", { name: "確認加入標籤", exact: true }).click();
  await expect.poll(() => state.customer.tags).toContain("預約意向");
});
test("reply goals remain bound to the same company, brand and native thread", async ({
  page,
}) => {
  await fixture(page);
  await page.goto(base + "/crm/customers");
  await page.getByRole("button", { name: "引導預約", exact: true }).click();
  const request = page.waitForRequest(
    (r) => r.url().endsWith("/api/assistant") && r.method() === "POST",
  );
  await page
    .getByRole("button", { name: "準備 AI 回覆建議", exact: true })
    .click();
  expect((await request).postDataJSON()).toMatchObject({
    companyId: company,
    brandId: "main",
    source: "meta",
    threadId: thread,
    goal: "book",
  });
  await expect(
    page.getByText("我可以先了解你偏好嘅日子，再由同事核對安排。", {
      exact: true,
    }),
  ).toBeVisible();
});
test("an uncertain response reuses the same request and cannot create duplicate model work", async ({
  page,
}) => {
  const state = await fixture(page, { loseFirstResponse: true });
  await page.goto(base + "/crm/ai");
  await page
    .getByRole("textbox", { name: "同 C 講你想做到乜" })
    .fill("幫我整理下一步");
  await page.getByRole("button", { name: "交畀 C 處理" }).click();
  await page
    .getByRole("button", { name: "核對同一個 AI 請求", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "停滯查詢再互動" }),
  ).toBeVisible();
  expect(state.askCalls()).toHaveLength(2);
  expect(state.askCalls()[0].requestId).toBe(state.askCalls()[1].requestId);
  expect(state.dispatches()).toBe(1);
});
test("AI response rendering ignores injected HTML and remote image beacons", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("unsafe.invalid")) external.push(r.url());
  });
  await fixture(page, { unsafe: true });
  await page.goto(base + "/crm/ai");
  await page
    .getByRole("textbox", { name: "同 C 講你想做到乜" })
    .fill("排版測試");
  await page.getByRole("button", { name: "交畀 C 處理" }).click();
  await expect(page.locator(".cc-answer-text strong")).toHaveText("安全測試");
  expect(await page.evaluate(() => "cInjected" in window)).toBe(false);
  await expect(
    page.locator(".cc-answer-text img,.cc-answer-text script"),
  ).toHaveCount(0);
  expect(external).toEqual([]);
});
test("a slow C read does not block navigation or the company header", async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((r) => {
    release = r;
  });
  await fixture(page, { holdRead: held });
  await page.goto(base + "/crm");
  await page
    .getByRole("navigation", { name: "CRM 功能", exact: true })
    .getByRole("link", { name: "AI 助理", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /下一步，\s*同 C 一齊諗。/ }),
  ).toBeVisible();
  await expect(page.locator(".cq-header")).toBeVisible();
  release();
  await expect(
    page.getByText("你好，Synthetic owner。", { exact: true }),
  ).toBeVisible();
});
