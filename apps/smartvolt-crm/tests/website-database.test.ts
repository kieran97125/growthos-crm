import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  createCompanyState,
  applyCompanyCommand,
} from "../src/lib/saas/workspace";
import { appSchema } from "../src/lib/demo/state";
import {
  initialWebsiteState,
  extractWebsitePage,
  websiteCandidates,
} from "../src/lib/website/crawl";
const db = new PGlite(),
  company = randomUUID(),
  foreign = randomUUID(),
  pos = randomUUID(),
  owner = randomUUID(),
  agent = randomUUID(),
  other = randomUUID();
async function val<T = unknown>(sql: string, args: unknown[] = []) {
  return (await db.query<{ v: T }>(sql, args)).rows[0]?.v;
}
const call = <T = unknown>(name: string, args: unknown[]) =>
  val<T>(`select ${name}(${args.map((_, i) => `$${i + 1}`).join(",")})v`, args);
before(async () => {
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to service_role,authenticated;alter default privileges in schema public grant all on tables to service_role;",
  );
  for (const f of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  for (const id of [owner, agent, other])
    await db.query("insert into auth.users values($1)", [id]);
  await db.exec("set role service_role");
  for (const [id, user, products] of [
    [company, owner, ["crm", "pos"]],
    [foreign, other, ["crm"]],
    [pos, owner, ["pos"]],
  ] as const) {
    const state = createCompanyState({
      companyId: id,
      companyName: "Synthetic",
      brands: [{ id: "main", name: "Brand", short: "B" }],
      team: [{ id: user, name: "Owner", initials: "O" }],
    });
    await call("sv_provision_company", [
      id,
      "Synthetic",
      user,
      "Owner",
      JSON.stringify(state),
      [...products],
    ]);
  }
  await db.query(
    "insert into sv_memberships(company_id,user_id,role,display_name)values($1,$2,'agent','Agent')",
    [company, agent],
  );
});
after(() => db.close());
const revision = () =>
  val<number>("select revision v from sv_workspaces where company_id=$1", [
    company,
  ]);
async function ready(
  id = randomUUID(),
  c = company,
  html = "<main><h1>品牌服務</h1><p>品牌介紹與服務內容，費用 HK$388。客戶需要核實時段，再由同事安排預約。每位客戶都先了解需要，才選擇合適服務。</p></main>",
  legacy = false,
) {
  const state = initialWebsiteState("https://brand.com");
  await call("sv_website_start", [c, owner, id, "main", JSON.stringify(state)]);
  const token = randomUUID();
  await call("sv_website_claim", [c, owner, id, token]);
  state.pages.push(
    extractWebsitePage(Buffer.from(html), "https://brand.com/").page,
  );
  state.queue = [];
  state.visited = [state.inputUrl];
  state.candidates = websiteCandidates(state, c, "main", id);
  if (legacy) {
    const page = state.pages[0];
    state.format = "pages";
    const { faqKey, ...source } = state.candidates[0].website!;
    void faqKey;
    state.candidates = [
      {
        ...state.candidates[0],
        title: page.title,
        content: page.text,
        status: "draft",
        website: {
          ...source,
          contentHash: createHash("sha256").update(page.text).digest("hex"),
        },
      },
    ];
  }
  await call("sv_website_finish", [
    c,
    owner,
    id,
    token,
    JSON.stringify(state),
    "ready",
  ]);
  return { id, state };
}
test("scan admission validates company, brand, manager and purchased CRM", async () => {
  const state = JSON.stringify(initialWebsiteState("https://brand.com"));
  await assert.rejects(
    () =>
      call("sv_website_start", [company, agent, randomUUID(), "main", state]),
    /website_access_denied/,
  );
  await assert.rejects(
    () =>
      call("sv_website_start", [foreign, owner, randomUUID(), "main", state]),
    /website_access_denied/,
  );
  await assert.rejects(
    () =>
      call("sv_website_start", [
        company,
        owner,
        randomUUID(),
        "foreign",
        state,
      ]),
    /website_brand_scope/,
  );
  await assert.rejects(
    () => call("sv_website_start", [pos, owner, randomUUID(), "main", state]),
    /website_product_required/,
  );
});
test("one worker owns a step; stale tokens cannot replace newly persisted progress", async () => {
  const id = randomUUID(),
    token = randomUUID(),
    state = initialWebsiteState("https://brand.com");
  assert.equal(
    await call("sv_website_start", [
      company,
      owner,
      id,
      "main",
      JSON.stringify(state),
    ]),
    id,
  );
  const claimed = await call<{ state: typeof state }>("sv_website_claim", [
    company,
    owner,
    id,
    token,
  ]);
  assert.deepEqual(claimed.state, state);
  assert.equal(
    await call("sv_website_claim", [company, owner, id, token]),
    null,
  );
  await assert.rejects(
    () =>
      call("sv_website_finish", [
        company,
        owner,
        id,
        randomUUID(),
        JSON.stringify(state),
        "ready",
      ]),
    /website_lease_lost/,
  );
  state.visited.push("https://brand.com/");
  state.queue = [];
  await call("sv_website_finish", [
    company,
    owner,
    id,
    token,
    JSON.stringify(state),
    "failed",
  ]);
  await assert.rejects(
    () =>
      call("sv_website_finish", [
        company,
        owner,
        id,
        token,
        JSON.stringify(state),
        "ready",
      ]),
    /website_lease_lost/,
  );
});
test("publication is atomic, immediately usable, preserves POS and replays once after unknown HTTP success", async () => {
  const { id, state } = await ready(),
    command = randomUUID(),
    selected = JSON.stringify(state.candidates.map((a) => a.id));
  const before = await val(
    "select payload->'pos' v from sv_workspaces where company_id=$1",
    [company],
  );
  const rev = (await revision())!;
  await assert.rejects(
    () =>
      call("sv_website_import", [
        company,
        owner,
        id,
        command,
        rev + 1,
        selected,
      ]),
    /revision_conflict/,
  );
  const result = await call<{
    state: unknown;
    added: number;
    revision: number;
  }>("sv_website_import", [company, owner, id, command, rev, selected]);
  assert.equal(result.added, 1);
  const parsed = appSchema.parse(result.state);
  assert.equal(parsed.studio.articles[0].status, "approved");
  assert.deepEqual(parsed.pos, before);
  const replay = await call<{ added: number; revision: number }>(
    "sv_website_import",
    [company, owner, id, command, rev, selected],
  );
  assert.equal(replay.added, 1);
  assert.equal(replay.revision, result.revision);
  await assert.rejects(
    () =>
      call("sv_website_import", [
        company,
        owner,
        id,
        randomUUID(),
        result.revision,
        selected,
      ]),
    /website_command_conflict/,
  );
});
test("rescan skips identical content without changing approved knowledge; foreign selections are rejected", async () => {
  await db.query(
    "update sv_workspaces set payload=jsonb_set(payload,'{studio,articles,0,status}','\"approved\"')where company_id=$1",
    [company],
  );
  const { id, state } = await ready(),
    rev = (await revision())!;
  await assert.rejects(
    () =>
      call("sv_website_import", [
        company,
        owner,
        id,
        randomUUID(),
        rev,
        JSON.stringify(["foreign"]),
      ]),
    /website_selection/,
  );
  const result = await call<{ added: number; skipped: number; state: unknown }>(
    "sv_website_import",
    [
      company,
      owner,
      id,
      randomUUID(),
      rev,
      JSON.stringify(state.candidates.map((a) => a.id)),
    ],
  );
  assert.equal(result.added, 0);
  assert.equal(result.skipped, 1);
  assert.equal(
    appSchema.parse(result.state).studio.articles[0].status,
    "approved",
  );
});
test("browser roles cannot read staging or execute website routines", async () => {
  await assert.rejects(
    () =>
      db.exec(
        "update sv_website_imports set state='{}'where status='imported'",
      ),
    /website_receipt_immutable/,
  );
  assert.equal(
    await val(
      "select has_table_privilege('anon','public.sv_website_imports','select')v",
    ),
    false,
  );
  assert.equal(
    await val(
      "select has_table_privilege('authenticated','public.sv_website_imports','select')v",
    ),
    false,
  );
  assert.equal(
    await val(
      "select has_function_privilege('authenticated','public.sv_website_import(uuid,uuid,uuid,uuid,bigint,jsonb)','execute')v",
    ),
    false,
  );
  assert.equal(
    await val(
      "select has_table_privilege('service_role','public.sv_website_imports','truncate')v",
    ),
    false,
  );
});

async function isolatedCompany() {
  const c = randomUUID();
  const state = createCompanyState({
    companyId: c,
    companyName: "Synthetic",
    brands: [{ id: "main", name: "Brand", short: "B" }],
    team: [{ id: owner, name: "Owner", initials: "O" }],
  });
  await call("sv_provision_company", [
    c,
    "Synthetic",
    owner,
    "Owner",
    JSON.stringify(state),
    ["crm", "pos"],
  ]);
  return c;
}
async function publish(c: string, result: Awaited<ReturnType<typeof ready>>) {
  const revision = await val<number>(
    "select revision v from sv_workspaces where company_id=$1",
    [c],
  );
  return await call<{
    state: unknown;
    revision: number;
    added: number;
    skipped: number;
    refreshed: number;
  }>("sv_website_import", [
    c,
    owner,
    result.id,
    result.id,
    revision,
    JSON.stringify(result.state.candidates.map((a) => a.id)),
  ]);
}
test("rescan updates the same FAQ, preserves its identity and never overwrites a staff-edited answer", async () => {
  const c = await isolatedCompany();
  const html = (price: number) =>
    `<main><h1>服務收費係幾多？</h1><p>小組訓練每堂 HK$${price}，費用包含教練指導，請先聯絡同事確認時段。</p></main>`;
  const first = await publish(c, await ready(randomUUID(), c, html(388)));
  const firstArticle = appSchema.parse(first.state).studio.articles[0];
  const second = await publish(c, await ready(randomUUID(), c, html(488)));
  const updated = appSchema.parse(second.state);
  assert.equal(second.added, 0);
  assert.equal(second.refreshed, 1);
  assert.equal(updated.studio.articles.length, 1);
  assert.equal(updated.studio.articles[0].id, firstArticle.id);
  assert.match(updated.studio.articles[0].content, /488/);
  const edited = applyCompanyCommand(
    updated,
    {
      type: "studio",
      action: {
        type: "article",
        article: {
          ...updated.studio.articles[0],
          content: "同事特別提供嘅答案，請直接聯絡工作室確認。",
          revision: 3,
        },
      },
    },
    { id: owner, name: "Owner", role: "owner" },
    Date.now(),
    ["crm", "pos"],
  );
  await call("sv_commit_workspace", [
    c,
    owner,
    second.revision,
    randomUUID(),
    JSON.stringify(edited),
    "studio",
  ]);
  const third = await publish(c, await ready(randomUUID(), c, html(588)));
  assert.equal(third.added, 0);
  assert.equal(third.refreshed, 0);
  assert.equal(third.skipped, 1);
  assert.equal(
    appSchema.parse(third.state).studio.articles[0].content,
    "同事特別提供嘅答案，請直接聯絡工作室確認。",
  );
});
test("FAQ scans replace untouched legacy page dumps while keeping immutable original scan evidence", async () => {
  const c = await isolatedCompany();
  const old = await ready(randomUUID(), c, undefined, true);
  await publish(c, old);
  const result = await publish(c, await ready(randomUUID(), c));
  const items = appSchema.parse(result.state).studio.articles;
  assert.equal(items.length, 1);
  assert.notEqual(items[0].id, old.state.candidates[0].id);
  assert.ok(items[0].website?.faqKey);
  assert.equal(items[0].status, "approved");
  const saved = await val(
    "select state v from sv_website_imports where company_id=$1 and id=$2",
    [c, old.id],
  );
  assert.deepEqual(saved, old.state);
});
