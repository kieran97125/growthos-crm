import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createCompanyState } from "../src/lib/saas/workspace";
import { assessChatTurn } from "../src/lib/web-chat/concierge-policy";
const db = new PGlite(),
  owner = randomUUID(),
  manager = randomUUID(),
  viewer = randomUUID();
const site = "https://merchant.example.org",
  token = "a".repeat(64),
  proof = "b".repeat(48);
async function rpc<T = Record<string, unknown>>(
  fn: string,
  args: unknown[],
): Promise<T> {
  return (
    await db.query<{ v: T }>(
      `select ${fn}(${args.map((_, i) => `$${i + 1}`).join(",")})v`,
      args,
    )
  ).rows[0].v;
}
before(async () => {
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to service_role,authenticated;alter default privileges in schema public grant all on tables to service_role;",
  );
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  for (const id of [owner, manager, viewer])
    await db.query("insert into auth.users values($1)", [id]);
  await db.exec("set role service_role");
  await db.exec(
    "insert into sv_ai_runtime values('platform','openai/gpt-5.4-mini','ready',null,now())",
  );
});
after(() => db.close());
test("public AI admission shares the staff daily budget and falls back to the human queue", async () => {
  const f = await fixture();
  await db.query(
    "update sv_ai_settings set daily_limit=1 where company_id=$1",
    [f.company],
  );
  await answer(f, await receive(f, "What features?"));
  await assert.rejects(
    () =>
      db.query(
        "insert into sv_ai_requests(company_id,request_id,actor_id,brand_id,source,status,workspace_revision,request_hash,model)values($1,$2,$3,'main','playground','running',0,$4,'synthetic/model')",
        [f.company, randomUUID(), owner, "a".repeat(64)],
      ),
    /ai_daily_limit/,
  );
  const second = await receive(f, "What services?");
  assert.equal(
    (
      await rpc("sv_web_chat_c_claim", [
        f.company,
        second,
        "openai/gpt-5.4-mini",
      ])
    ).dispatch,
    false,
  );
  assert.equal((await thread(f)).humanWaiting, true);
  assert.equal(
    (
      await db.query<{ n: number }>(
        "select count(*)::int n from sv_web_chat_c_turns where company_id=$1 and admitted_at is not null",
        [f.company],
      )
    ).rows[0].n,
    1,
  );
});
test("revoked public knowledge suppresses an in-flight answer and disabled widgets skip pending work", async () => {
  const f = await fixture(),
    id = await receive(f, "What features?");
  await rpc("sv_web_chat_c_claim", [f.company, id, "openai/gpt-5.4-mini"]);
  await db.query(
    "update sv_workspaces set payload=jsonb_set(payload,'{studio,articles}','[]')where company_id=$1",
    [f.company],
  );
  assert.equal(
    (
      await rpc("sv_web_chat_c_finish", [
        f.company,
        id,
        {
          decision: "draft",
          reply: "Outdated",
          sources: [{ id: "public-faq" }],
        },
        null,
        10,
        5,
      ])
    ).state,
    "superseded",
  );
  const g = await fixture(),
    next = await receive(g, "What features?");
  await rpc("sv_web_chat_configure", [
    g.company,
    owner,
    randomUUID(),
    { ...g.config, revision: 2, enabled: false },
    proof,
  ]);
  assert.equal(
    (await rpc("sv_web_chat_c_claim", [g.company, next, "openai/gpt-5.4-mini"]))
      .state,
    "skipped",
  );
});
async function fixture() {
  const company = randomUUID(),
    id = randomUUID(),
    thread = randomUUID();
  const state = createCompanyState({
    companyId: company,
    companyName: "Synthetic merchant",
    brands: [
      { id: "main", name: "Main", short: "M" },
      { id: "other", name: "Other", short: "O" },
    ],
    team: [{ id: owner, name: "Owner", initials: "O" }],
  });
  state.studio.articles = [
    {
      id: "public-faq",
      clientId: company,
      brandId: "main",
      title: "Public services",
      content: "We organise customer enquiries and follow-up work.",
      keywords: ["features"],
      source: site,
      status: "approved",
      validUntil: "9999-12-31",
      revision: 1,
    },
    {
      id: "internal",
      clientId: company,
      brandId: "main",
      title: "Internal only",
      content: "Private internal instructions.",
      keywords: [],
      source: "internal",
      status: "approved",
      validUntil: "9999-12-31",
      revision: 1,
    },
  ];
  await rpc("sv_provision_company", [
    company,
    "Synthetic merchant",
    owner,
    "Owner",
    JSON.stringify(state),
    ["crm"],
  ]);
  await db.query(
    "insert into sv_memberships(company_id,user_id,role,display_name,brand_ids,product_ids)values($1,$2,'manager','Other only',array['other'],array['crm']),($1,$3,'viewer','Viewer',null,array['crm'])",
    [company, manager, viewer],
  );
  await rpc("sv_ai_configure", [company, owner, true]);
  const config = {
    id,
    brandId: "main",
    name: "Merchant",
    greeting: "Hello",
    origins: [site],
    enabled: false,
    revision: 0,
    aiEnabled: true,
    aiArticleIds: ["public-faq"],
    accentColor: "#D97706",
  };
  await rpc("sv_web_chat_configure", [
    company,
    owner,
    randomUUID(),
    config,
    proof,
  ]);
  await rpc("sv_web_chat_activate", [
    company,
    owner,
    randomUUID(),
    id,
    1,
    proof,
  ]);
  await rpc("sv_web_chat_start", [
    id,
    site,
    thread,
    token,
    "Visitor",
    "c".repeat(64),
  ]);
  return { company, id, thread, config };
}
async function receive(
  f: Awaited<ReturnType<typeof fixture>>,
  body: string,
  kind: "message" | "human" | "human_only" | "resume_c" = "message",
  id = randomUUID(),
) {
  await rpc("sv_web_chat_receive", [
    f.id,
    site,
    f.thread,
    token,
    id,
    body,
    kind,
    assessChatTurn(body, kind),
  ]);
  return id;
}
async function thread(f: Awaited<ReturnType<typeof fixture>>) {
  return (
    await rpc<{ thread: Record<string, unknown>; messages: unknown[] }>(
      "sv_web_chat_staff_read",
      [f.company, owner, { threadId: f.thread }],
    )
  ).thread;
}
async function answer(f: Awaited<ReturnType<typeof fixture>>, id: string) {
  const claim = await rpc("sv_web_chat_c_claim", [
    f.company,
    id,
    "openai/gpt-5.4-mini",
  ]);
  assert.equal(claim.dispatch, true);
  await rpc("sv_web_chat_c_finish", [
    f.company,
    id,
    {
      decision: "draft",
      reply: "We organise customer enquiries and follow-up work.",
      summary: "The visitor wants to understand the features.",
      sources: [{ id: "public-faq" }],
    },
    null,
    100,
    20,
  ]);
  return claim;
}
test("company appearance and public knowledge are explicit, scoped configuration", async () => {
  const f = await fixture();
  const cfg = await rpc("sv_web_chat_public_config", [f.id, site]);
  assert.equal(cfg.accentColor, "#D97706");
  assert.equal(cfg.aiEnabled, true);
  assert.equal("aiArticleIds" in cfg, false);
  const id = await receive(f, "What features do you offer?");
  const claim = await answer(f, id);
  assert.deepEqual(
    (claim.articles as { id: string }[]).map((a) => a.id),
    ["public-faq"],
  );
  await assert.rejects(
    () =>
      rpc("sv_web_chat_configure", [
        f.company,
        manager,
        randomUUID(),
        { ...f.config, revision: 2, enabled: true, accentColor: "#123456" },
        proof,
      ]),
    /brand_scope|access_denied/,
  );
});
test("human request is durable; C can answer another question while the human request stays visible", async () => {
  const f = await fixture(),
    request = randomUUID();
  await receive(f, "我想同真人客服傾。", "human", request);
  await receive(f, "我想同真人客服傾。", "human", request);
  let t = await thread(f);
  assert.equal(t.humanWaiting, true);
  assert.equal(t.revision, 2);
  await rpc("sv_web_chat_staff_action", [
    f.company,
    owner,
    randomUUID(),
    { action: "claim", threadId: f.thread, revision: t.revision },
  ]);
  const question = await receive(f, "What features do you offer?");
  await answer(f, question);
  t = await thread(f);
  assert.equal(t.humanWaiting, true);
  assert.equal(t.assigneeId, owner);
  const notices = await rpc<{
    rows: {
      id: string;
      revision: number;
      website: { humanWaiting: boolean };
    }[];
  }>("sv_notification_read", [f.company, owner]);
  assert.equal(notices.rows.filter((n) => n.website).length, 1);
  assert.equal(notices.rows.find((n) => n.website)!.website.humanWaiting, true);
  const n = notices.rows.find((n) => n.website)!;
  await assert.rejects(
    () =>
      rpc("sv_notification_action", [
        f.company,
        owner,
        randomUUID(),
        "done",
        { id: n.id, revision: n.revision },
      ]),
    /chat_response_required/,
  );
  await rpc("sv_web_chat_staff_action", [
    f.company,
    owner,
    randomUUID(),
    {
      action: "reply",
      threadId: f.thread,
      revision: t.revision,
      body: "我係真人同事，想了解你嘅需要。",
    },
  ]);
  assert.equal((await thread(f)).humanWaiting, false);
  const next = await receive(f, "Can you explain the features?");
  await answer(f, next);
  assert.equal((await thread(f)).cPaused, false);
});
test("only-human preference survives questions and reloads until the visitor asks C to resume", async () => {
  const f = await fixture();
  await receive(f, "只想同真人傾，唔好AI答。", "human_only");
  const id = await receive(f, "What features do you offer?");
  assert.equal(
    (await rpc("sv_web_chat_c_claim", [f.company, id, "openai/gpt-5.4-mini"]))
      .dispatch,
    false,
  );
  assert.equal(
    (await rpc("sv_web_chat_visitor_read", [f.id, site, f.thread, token, 0]))
      .preference,
    "human_only",
  );
  const resume = await receive(f, "C幫我答下有咩功能。", "resume_c");
  await answer(f, resume);
  assert.equal((await thread(f)).humanWaiting, true);
});
test("a real staff reply suppresses a model answer already in flight", async () => {
  const f = await fixture(),
    id = await receive(f, "What features do you offer?");
  assert.equal(
    (await rpc("sv_web_chat_c_claim", [f.company, id, "openai/gpt-5.4-mini"]))
      .dispatch,
    true,
  );
  const t = await thread(f);
  await rpc("sv_web_chat_staff_action", [
    f.company,
    owner,
    randomUUID(),
    {
      action: "reply",
      threadId: f.thread,
      revision: t.revision,
      body: "A human answer",
    },
  ]);
  const result = await rpc("sv_web_chat_c_finish", [
    f.company,
    id,
    {
      decision: "draft",
      reply: "A stale answer",
      sources: [{ id: "public-faq" }],
    },
    null,
    100,
    20,
  ]);
  assert.equal(result.state, "superseded");
  const read = await rpc<{ messages: { body: string }[] }>(
    "sv_web_chat_visitor_read",
    [f.id, site, f.thread, token, 0],
  );
  assert.equal(
    read.messages.some((m) => m.body === "A stale answer"),
    false,
  );
});
test("claim and finish replays dispatch and publish once; terminal receipts are immutable", async () => {
  const f = await fixture(),
    id = await receive(f, "What features do you offer?");
  assert.equal(
    (await rpc("sv_web_chat_c_claim", [f.company, id, "openai/gpt-5.4-mini"]))
      .dispatch,
    true,
  );
  assert.equal(
    (await rpc("sv_web_chat_c_claim", [f.company, id, "openai/gpt-5.4-mini"]))
      .dispatch,
    false,
  );
  for (let i = 0; i < 2; i++)
    await rpc("sv_web_chat_c_finish", [
      f.company,
      id,
      {
        decision: "draft",
        reply: "One C answer",
        sources: [{ id: "public-faq" }],
      },
      null,
      100,
      20,
    ]);
  assert.equal(
    (
      await db.query<{ n: number }>(
        "select count(*)::int n from sv_web_chat_messages where thread_id=$1 and sender='c'",
        [f.thread],
      )
    ).rows[0].n,
    1,
  );
  await assert.rejects(
    () =>
      db.query(
        "update sv_web_chat_c_turns set state='queued'where company_id=$1 and message_id=$2",
        [f.company, id],
      ),
    /receipt_immutable/,
  );
});
test("public receipts and functions have no browser grants, and scoped staff cannot see the queue", async () => {
  const f = await fixture();
  await receive(f, "想搵真人。", "human");
  assert.equal(
    (
      await rpc<{ rows: unknown[] }>("sv_notification_read", [
        f.company,
        manager,
      ])
    ).rows.length,
    0,
  );
  assert.equal(
    (
      await rpc<{ threads: unknown[] }>("sv_web_chat_staff_read", [
        f.company,
        manager,
        {},
      ])
    ).threads.length,
    0,
  );
  for (const role of ["anon", "authenticated"]) {
    assert.equal(
      (
        await db.query<{ ok: boolean }>(
          "select has_table_privilege($1,'sv_web_chat_c_turns','SELECT,INSERT,UPDATE,DELETE')ok",
          [role],
        )
      ).rows[0].ok,
      false,
    );
    assert.equal(
      (
        await db.query<{ ok: boolean }>(
          "select has_function_privilege($1,'sv_web_chat_c_claim(uuid,uuid,text)','EXECUTE')ok",
          [role],
        )
      ).rows[0].ok,
      false,
    );
  }
  assert.equal(
    (
      await db.query<{ ok: boolean }>(
        "select has_table_privilege('service_role','sv_web_chat_messages','UPDATE,DELETE')ok",
      )
    ).rows[0].ok,
    false,
  );
});
