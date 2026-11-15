import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";

const company = randomUUID(),
  actor = randomUUID(),
  customer = "synthetic-customer";
type Event = {
  key: string;
  at: string;
  kind: string;
  source: string;
  source_id: string;
  data: Record<string, unknown>;
};
type Harness = { events: Event[]; calls: Record<string, unknown>[] };
const host = globalThis as typeof globalThis & {
  __memoryServerHarness?: Harness;
};
let api: typeof import("../src/lib/customer-memory/server");
before(async () => {
  const stubs: Record<string, string> = {
    "server-only": "export{};",
    "@/lib/saas/server": `export const requireCompany=async()=>({
      company:{id:'${company}'},user:{id:'${actor}'},products:['crm'],
      db:{rpc:async(fn,args)=>{
        if(fn!=='sv_customer_memory_read')throw new Error('unexpected RPC');
        const h=globalThis.__memoryServerHarness;h.calls.push(args);
        return {data:{brandId:'main',customerId:args.p_customer,
          brands:[{id:'main',name:'Synthetic'}],canEdit:true,memories:[],
          history:[],timeline:h.events,moreHistory:false},error:null};
      }}
    });`,
  };
  const out = await build({
    entryPoints: ["src/lib/customer-memory/server.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    plugins: [
      {
        name: "memory-server-fixture",
        setup(b) {
          b.onResolve({ filter: /.*/ }, (args) =>
            args.path in stubs
              ? { path: args.path, namespace: "memory-server-stub" }
              : undefined,
          );
          b.onLoad(
            { filter: /.*/, namespace: "memory-server-stub" },
            (args) => ({
              contents: stubs[args.path],
              loader: "js",
            }),
          );
        },
      },
    ],
  });
  api = await import(
    "data:text/javascript;base64," +
      Buffer.from(out.outputFiles[0].text).toString("base64")
  );
});
after(() => delete host.__memoryServerHarness);

test("the unified customer timeline preserves existing stage, routing, handoff and follow-up history", async () => {
  const events = [
    ["lifecycle-changed", { reason: "客戶確認有意預約" }],
    ["routing-assigned", { provider: "meta", threadId: "synthetic-thread" }],
    [
      "ai-handoff",
      {
        summary: "客戶想了解星期六安排",
        nextStep: "同事核對可用時間",
        reason: "需要真人接手",
      },
    ],
    ["followup-created", { title: "星期五再聯絡客戶" }],
    ["followup-updated", { status: "done" }],
  ] as const;
  const harness: Harness = {
    events: events.map(([kind, data], i) => ({
      key: "event:" + i,
      at: "2026-11-15T10:00:00+00:00",
      kind,
      source: "event",
      source_id: String(i),
      data,
    })),
    calls: [],
  };
  host.__memoryServerHarness = harness;
  const page = await api.readCustomerMemory(company, customer, {
    brandId: "main",
  });
  assert.deepEqual(
    page.timeline.map((event) => event.title),
    [
      "更新客戶階段",
      "派發對話負責人",
      "採納 AI 交接重點",
      "加入跟進事項",
      "更新跟進事項",
    ],
  );
  assert.equal(page.timeline[0].summary, "客戶確認有意預約");
  assert.equal(
    page.timeline[2].summary,
    "客戶想了解星期六安排\n同事核對可用時間\n需要真人接手",
  );
  assert.equal(page.timeline[3].summary, "星期五再聯絡客戶");
  assert.equal(page.timeline[4].summary, "已完成");
  assert.equal(
    page.timeline[1].source.href,
    `/company/${company}/crm?provider=meta&thread=synthetic-thread`,
  );
  assert.deepEqual(harness.calls, [
    {
      p_company: company,
      p_actor: actor,
      p_customer: customer,
      p_brand: "main",
      p_before: null,
      p_before_key: null,
    },
  ]);
});
