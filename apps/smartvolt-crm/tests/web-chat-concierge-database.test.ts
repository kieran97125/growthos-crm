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
async function interruptedTurn(
  f: Awaited<ReturnType<typeof fixture>>,
  id: string,
) {
  // A previously admitted worker, not a second model dispatch or a mutable
  // terminal receipt. Fixtures supply its historical admission timestamp.
  await db.query(
    "update sv_web_chat_c_turns j set state='running',admitted_at=now()-interval '3 minutes',model='openai/gpt-5.4-mini',context_hash=smartvolt_private.web_chat_c_context_hash(c)from sv_web_chat_configs c where j.company_id=$1 and j.message_id=$2 and c.company_id=j.company_id and c.id=$3",
    [f.company, id, f.id],
  );
}
test("a legacy 35-article save is persisted instead of failing the hidden 30-article cap", async () => {
  const f = await fixture();
  const w = (
    await db.query<{ payload: ReturnType<typeof createCompanyState> }>(
      "select payload from sv_workspaces where company_id=$1",
      [f.company],
    )
  ).rows[0].payload;
  const articles = Array.from({ length: 35 }, (_, i) => ({
    ...w.studio.articles[0],
    id: `public-${i}`,
  }));
  w.studio.articles.push(...articles);
  await db.query("update sv_workspaces set payload=$2 where company_id=$1", [
    f.company,
    JSON.stringify(w),
  ]);
  await rpc("sv_web_chat_configure", [
    f.company,
    owner,
    randomUUID(),
    {
      ...f.config,
      revision: 2,
      aiArticleIds: articles.map((a) => a.id),
    },
    proof,
  ]);
  const settings = await rpc<{ configs: { aiArticleIds: string[] }[] }>(
    "sv_web_chat_settings",
    [f.company, owner],
  );
  assert.equal(settings.configs[0].aiArticleIds.length, 35);
});
test("automatic public knowledge follows approvals and edits beyond 30 while excluding private and foreign material", async () => {
  const f = await fixture();
  const w = (
    await db.query<{ payload: ReturnType<typeof createCompanyState> }>(
      "select payload from sv_workspaces where company_id=$1",
      [f.company],
    )
  ).rows[0].payload;
  const base = w.studio.articles[0];
  const articles = Array.from({ length: 35 }, (_, i) => ({
    ...base,
    id: `public-${String(i).padStart(2, "0")}`,
    website: {
      importId: randomUUID(),
      url: site,
      fetchedAt: new Date().toISOString(),
      contentHash: "a".repeat(64),
      truncated: false,
    },
  }));
  const excluded = [
    { ...base, id: "private-manual", source: "Internal team notes" },
    { ...articles[0], id: "private-override", visibility: "internal" as const },
    { ...articles[0], id: "draft", status: "draft" as const },
    { ...articles[0], id: "expired", validUntil: "2000-01-01" },
    { ...articles[0], id: "other-brand", brandId: "other" },
    { ...articles[0], id: "other-company", clientId: randomUUID() },
    {
      ...articles[0],
      id: "style-only",
      coaching: {
        analysisId: randomUUID(),
        index: 0,
        kind: "pattern" as const,
      },
    },
  ];
  w.studio.articles = [...articles, ...excluded];
  async function persist() {
    await db.query("update sv_workspaces set payload=$2 where company_id=$1", [
      f.company,
      JSON.stringify(w),
    ]);
  }
  await persist();
  await rpc("sv_web_chat_configure", [
    f.company,
    owner,
    randomUUID(),
    {
      ...f.config,
      revision: 2,
      enabled: true,
      aiKnowledgeMode: "brand_public",
      aiArticleIds: [],
    },
    proof,
  ]);
  const settings = await rpc<{
    configs: { aiKnowledgeMode: string }[];
    publicArticles: { id: string; autoPublic: boolean }[];
  }>("sv_web_chat_settings", [f.company, owner]);
  assert.equal(settings.configs[0].aiKnowledgeMode, "brand_public");
  assert.equal(
    settings.publicArticles.find((a) => a.id === "public-34")?.autoPublic,
    true,
  );
  assert.equal(
    settings.publicArticles.find((a) => a.id === "private-manual")?.autoPublic,
    false,
  );
  async function claim() {
    return rpc<{ dispatch: boolean; articles: typeof articles }>(
      "sv_web_chat_c_claim",
      [f.company, await receive(f, "features"), "openai/gpt-5.4-mini"],
    );
  }
  const id = await receive(f, "features");
  const first = await rpc<{ articles: typeof articles }>(
    "sv_web_chat_c_claim",
    [f.company, id, "openai/gpt-5.4-mini"],
  );
  assert.equal(first.articles.length, 35);
  assert.deepEqual(
    first.articles.map((a) => a.id),
    articles.map((a) => a.id),
  );
  articles[34].content = "Updated public answer after the thirtieth article";
  await persist();
  assert.equal(
    (
      await rpc("sv_web_chat_c_finish", [
        f.company,
        id,
        {
          decision: "draft",
          reply: "Old answer",
          sources: [{ id: "public-34" }],
        },
        null,
        1,
        1,
      ])
    ).state,
    "superseded",
  );
  assert.equal(
    (await claim()).articles.find((a) => a.id === "public-34")?.content,
    articles[34].content,
  );
  w.studio.articles.find((a) => a.id === "public-34")!.visibility = "internal";
  await persist();
  assert.equal(
    (await claim()).articles.some((a) => a.id === "public-34"),
    false,
  );
  w.studio.articles.push({
    ...base,
    id: "new-manual-public",
    visibility: "public",
  });
  await persist();
  const next = await claim();
  assert.equal(next.articles.length, 35);
  assert.equal(
    next.articles.some((a) => a.id === "new-manual-public"),
    true,
  );
});
test("legacy explicit knowledge is preserved and only an owner can opt into automatic publication", async () => {
  const f = await fixture();
  const read = () =>
    rpc<{ configs: { aiKnowledgeMode: string; aiArticleIds: string[] }[] }>(
      "sv_web_chat_settings",
      [f.company, owner],
    );
  assert.equal((await read()).configs[0].aiKnowledgeMode, "selected");
  await db.query(
    "update sv_memberships set brand_ids=array['main']where company_id=$1 and user_id=$2",
    [f.company, manager],
  );
  await assert.rejects(
    rpc("sv_web_chat_configure", [
      f.company,
      manager,
      randomUUID(),
      { ...f.config, revision: 2, aiKnowledgeMode: "brand_public" },
      proof,
    ]),
  );
  const command = randomUUID(),
    data = {
      ...f.config,
      revision: 2,
      enabled: true,
      aiKnowledgeMode: "brand_public",
    };
  await rpc("sv_web_chat_configure", [f.company, owner, command, data, proof]);
  await rpc("sv_web_chat_configure", [f.company, owner, command, data, proof]);
  assert.deepEqual((await read()).configs[0].aiArticleIds, ["public-faq"]);
  const id = await receive(f, "features");
  const claimed = await rpc<{ articles: { id: string }[] }>(
    "sv_web_chat_c_claim",
    [f.company, id, "openai/gpt-5.4-mini"],
  );
  assert.deepEqual(
    claimed.articles.map((a) => a.id),
    ["public-faq"],
  );
});
test("interrupted C recovery cannot reopen a human request after a real staff response", async () => {
  const f = await fixture(),
    id = await receive(f, "What features?");
  await interruptedTurn(f, id);
  const t = await thread(f);
  await rpc("sv_web_chat_staff_action", [
    f.company,
    owner,
    randomUUID(),
    {
      action: "reply",
      threadId: f.thread,
      revision: t.revision,
      body: "A real staff answer",
    },
  ]);
  assert.equal((await thread(f)).humanWaiting, false);
  await rpc("sv_web_chat_c_claim", [f.company, id, "openai/gpt-5.4-mini"]);
  assert.equal((await thread(f)).humanWaiting, false);
  const notices = await rpc<{ rows: unknown[] }>("sv_notification_read", [
    f.company,
    owner,
  ]);
  assert.equal(notices.rows.length, 0);
});
test("legacy website preference shown on in CRM admits push without needing a prior preference save", async () => {
  const f = await fixture();
  await receive(f, "想同真人傾", "human");
  await rpc("sv_notification_action", [
    f.company,
    owner,
    randomUUID(),
    "device",
    {
      endpoint: `https://fcm.googleapis.com/synthetic-${f.company}`,
      p256dh: "a".repeat(87),
      auth: "b".repeat(22),
      label: "Synthetic device — no network",
    },
  ]);
  // Persisted pre-website preferences: the category is absent, global opt-in
  // and the device were already explicitly enabled. Reading must not enable
  // global push or require an otherwise unnecessary preference save.
  await db.query(
    "update sv_notification_preferences set data=(data-'website')||'{\"quietStart\":0,\"quietEnd\":0}'::jsonb where company_id=$1",
    [f.company],
  );
  const read = await rpc<{ preferences: { data: Record<string, unknown> } }>(
    "sv_notification_read",
    [f.company, owner],
  );
  assert.equal(read.preferences.data.website, true);
  assert.equal(
    (
      await db.query<{ missing: boolean }>(
        "select not(data?'website')missing from sv_notification_preferences where company_id=$1",
        [f.company],
      )
    ).rows[0].missing,
    true,
  );
  assert.equal(
    (await rpc<unknown[]>("sv_push_claim", [f.company, owner])).length,
    1,
  );
  assert.equal(
    (await rpc<unknown[]>("sv_push_claim", [f.company, owner])).length,
    0,
  );
});
test("a genuinely unanswered interrupted turn still requests a human exactly once without another model dispatch", async () => {
  const f = await fixture(),
    id = await receive(f, "What features?");
  await interruptedTurn(f, id);
  assert.equal(
    (await rpc("sv_web_chat_c_claim", [f.company, id, "openai/gpt-5.4-mini"]))
      .state,
    "failed",
  );
  assert.equal((await thread(f)).humanWaiting, true);
  const before = (
    await db.query<{ n: number }>(
      "select count(*)::int n from sv_web_chat_messages where thread_id=$1 and sender='c'",
      [f.thread],
    )
  ).rows[0].n;
  await rpc("sv_web_chat_c_claim", [f.company, id, "openai/gpt-5.4-mini"]);
  assert.equal(
    (
      await db.query<{ n: number }>(
        "select count(*)::int n from sv_web_chat_messages where thread_id=$1 and sender='c'",
        [f.thread],
      )
    ).rows[0].n,
    before,
  );
  await rpc("sv_web_chat_staff_action", [
    f.company,
    owner,
    randomUUID(),
    {
      action: "reply",
      threadId: f.thread,
      revision: (await thread(f)).revision,
      body: "Staff replies after recovery",
    },
  ]);
  await rpc("sv_web_chat_c_claim", [f.company, id, "openai/gpt-5.4-mini"]);
  assert.equal((await thread(f)).humanWaiting, false);
});
for (const change of ["close", "pauseC", "newer_question"] as const)
  test(`interrupted recovery respects ${change} and never raises a new human request from the old turn`, async () => {
    const f = await fixture(),
      id = await receive(f, "What features?");
    await interruptedTurn(f, id);
    if (change === "newer_question") await receive(f, "Another question");
    else
      await rpc("sv_web_chat_staff_action", [
        f.company,
        owner,
        randomUUID(),
        {
          action: change,
          threadId: f.thread,
          revision: (await thread(f)).revision,
        },
      ]);
    assert.equal(
      (await rpc("sv_web_chat_c_claim", [f.company, id, "openai/gpt-5.4-mini"]))
        .state,
      "superseded",
    );
    assert.equal((await thread(f)).humanWaiting, false);
  });
test("website-off preference survives an old client save, and push still requires global opt-in and a registered device", async () => {
  const f = await fixture();
  await receive(f, "想同真人傾", "human");
  async function prefs(data: Record<string, unknown>) {
    const current = await rpc<{ preferences: { revision: number } }>(
      "sv_notification_read",
      [f.company, owner],
    );
    return rpc("sv_notification_action", [
      f.company,
      owner,
      randomUUID(),
      "preferences",
      {
        revision: current.preferences.revision,
        data: {
          assignment: true,
          followup: true,
          sla: true,
          push: false,
          quietStart: 0,
          quietEnd: 0,
          ...data,
        },
      },
    ]);
  }
  await prefs({ website: false });
  await prefs({ push: true });
  const p = await rpc<{ preferences: { data: { website: boolean } } }>(
    "sv_notification_read",
    [f.company, owner],
  );
  assert.equal(p.preferences.data.website, false);
  assert.equal(
    (await rpc<unknown[]>("sv_push_claim", [f.company, owner])).length,
    0,
  );
  await prefs({ website: true, push: true });
  assert.equal(
    (await rpc<unknown[]>("sv_push_claim", [f.company, owner])).length,
    0,
  );
  await rpc("sv_notification_action", [
    f.company,
    owner,
    randomUUID(),
    "device",
    {
      endpoint: `https://fcm.googleapis.com/synthetic-${f.company}`,
      p256dh: "a".repeat(87),
      auth: "b".repeat(22),
      label: "Synthetic device — no network",
    },
  ]);
  await prefs({ website: true, push: false });
  assert.equal(
    (await rpc<unknown[]>("sv_push_claim", [f.company, owner])).length,
    0,
  );
  const hour = (
    await db.query<{ h: number }>(
      "select extract(hour from now()at time zone'Asia/Hong_Kong')::int h",
    )
  ).rows[0].h;
  await prefs({
    website: true,
    push: true,
    quietStart: hour,
    quietEnd: (hour + 1) % 24,
  });
  assert.equal(
    (await rpc<unknown[]>("sv_push_claim", [f.company, owner])).length,
    0,
  );
  await prefs({ website: true, push: true });
  assert.equal(
    (await rpc<unknown[]>("sv_push_claim", [f.company, owner])).length,
    1,
  );
});

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
