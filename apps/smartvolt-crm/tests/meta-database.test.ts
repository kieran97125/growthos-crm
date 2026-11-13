import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { createCompanyState } from "../src/lib/saas/workspace";
import { parseEvents } from "../src/lib/meta/protocol";
const db = new PGlite();
const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  viewer = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  outsider = "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  company = "11111111-1111-4111-8111-111111111111",
  foreign = "22222222-2222-4222-8222-222222222222",
  pos = "33333333-3333-4333-8333-333333333333",
  connection = "44444444-4444-4444-8444-444444444444";
const now = Date.now();
let thread: string;
async function one<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
) {
  return (await db.query<T>(sql, params)).rows[0];
}
async function result<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
) {
  return (await one<{ value: T }>(sql, params)).value;
}
const config = (id = connection) => ({
  id,
  brandId: "main",
  channel: "messenger",
  appId: "90001",
  pageId: "10001",
  accountId: "10001",
  label: "Synthetic Page",
  credentials: { version: 1, ciphertext: "synthetic-encrypted-only" },
});
const incoming = (mid: string, at = now) =>
  parseEvents(
    {
      object: "page",
      entry: [
        {
          id: "10001",
          messaging: [
            {
              sender: { id: "20001" },
              recipient: { id: "10001" },
              timestamp: at,
              message: { mid, text: "查詢方案", referral: { ad_id: "99001" } },
            },
          ],
        },
      ],
    },
    now,
  )[0];
async function ingest(events: unknown[]) {
  return result<number>("select public.sv_meta_ingest($1,$2::jsonb) value", [
    connection,
    JSON.stringify(events),
  ]);
}
async function revision() {
  return Number(
    (
      await one("select revision from public.sv_meta_threads where id=$1", [
        thread,
      ])
    ).revision,
  );
}
async function claim(
  id = randomUUID(),
  actor = owner,
  target = company,
  body = "你好，可以幫到你。",
  expected?: number,
) {
  return result<{ dispatch: boolean; message: { id: string; state: string } }>(
    "select public.sv_meta_claim($1,$2,$3,$4,$5,$6) value",
    [target, actor, thread, id, expected ?? (await revision()), body],
  );
}
before(async () => {
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,service_role;alter default privileges in schema public grant all on tables to service_role;",
  );
  for (const f of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  await db.query("insert into auth.users values($1),($2),($3)", [
    owner,
    viewer,
    outsider,
  ]);
  await db.exec("set role service_role");
  for (const [id, user, products] of [
    [company, owner, ["crm"]],
    [foreign, outsider, ["crm"]],
    [pos, owner, ["pos"]],
  ] as const) {
    const state = createCompanyState({
      companyId: id,
      companyName: "Synthetic",
      brands: [{ id: "main", name: "Synthetic", short: "S" }],
      team: [{ id: user, name: "Owner", initials: "O" }],
    });
    await db.query(
      "select public.sv_provision_company($1,$2,$3,$4,$5::jsonb,$6::text[])",
      [id, "Synthetic", user, "Owner", JSON.stringify(state), [...products]],
    );
  }
  await db.query(
    "insert into public.sv_memberships(company_id,user_id,role,display_name)values($1,$2,'viewer','Viewer')",
    [company, viewer],
  );
});
after(() => db.close());
test("only active CRM Owner can connect a brand and duplicate Page cannot cross tenants", async () => {
  await assert.rejects(() =>
    db.query("select public.sv_meta_save($1,$2,$3::jsonb)", [
      company,
      viewer,
      JSON.stringify(config()),
    ]),
  );
  await assert.rejects(() =>
    db.query("select public.sv_meta_save($1,$2,$3::jsonb)", [
      pos,
      owner,
      JSON.stringify(config()),
    ]),
  );
  await assert.rejects(() =>
    db.query("select public.sv_meta_save($1,$2,$3::jsonb)", [
      company,
      owner,
      JSON.stringify({ ...config(), brandId: "foreign" }),
    ]),
  );
  await db.query("select public.sv_meta_save($1,$2,$3::jsonb)", [
    company,
    owner,
    JSON.stringify(config()),
  ]);
  await assert.rejects(() =>
    db.query("select public.sv_meta_save($1,$2,$3::jsonb)", [
      foreign,
      outsider,
      JSON.stringify(config(randomUUID())),
    ]),
  );
  await assert.rejects(() =>
    db.query("select public.sv_meta_save($1,$2,$3::jsonb)", [
      company,
      owner,
      JSON.stringify({ ...config(), accountId: "99999" }),
    ]),
  );
});
test("signed event projections deduplicate messages and preserve referral without changing workspace data", async () => {
  const before = await one(
    "select revision,payload from public.sv_workspaces where company_id=$1",
    [company],
  );
  assert.equal(await ingest([incoming("mid.inbound")]), 1);
  assert.equal(await ingest([incoming("mid.inbound")]), 0);
  thread = String(
    (
      await one(
        "select id from public.sv_meta_threads where connection_id=$1",
        [connection],
      )
    ).id,
  );
  const message = await one(
    "select * from public.sv_meta_messages where thread_id=$1",
    [thread],
  );
  assert.deepEqual(message.referral, { ad_id: "99001" });
  assert.equal(message.direction, "inbound");
  assert.equal(
    (
      await one(
        "select count(*)::int n from public.sv_meta_messages where thread_id=$1",
        [thread],
      )
    ).n,
    1,
  );
  assert.deepEqual(
    await one(
      "select revision,payload from public.sv_workspaces where company_id=$1",
      [company],
    ),
    before,
  );
});
test("provider-account mismatch rolls back the entire batch including its evidence", async () => {
  const count = await one("select count(*)::int n from public.sv_meta_events");
  await assert.rejects(() =>
    ingest([
      incoming("mid.rollback"),
      { ...incoming("mid.foreign"), accountId: "99999" },
    ]),
  );
  assert.deepEqual(
    await one("select count(*)::int n from public.sv_meta_events"),
    count,
  );
});
test("send is atomically claimed once and replay cannot dispatch or change payload", async () => {
  const id = randomUUID(),
    rev = await revision();
  const [first, replay] = await Promise.all([
    claim(id, owner, company, "回覆", rev),
    claim(id, owner, company, "回覆", rev),
  ]);
  assert.equal([first.dispatch, replay.dispatch].filter(Boolean).length, 1);
  await assert.rejects(() => claim(id, owner, company, "不同內容"));
  await assert.rejects(() => claim(randomUUID(), viewer));
  await assert.rejects(() => claim(randomUUID(), outsider, foreign));
  await db.query("select public.sv_meta_finish($1,$2,$3,$4,$5)", [
    company,
    first.message.id,
    "accepted",
    "mid.outbound",
    null,
  ]);
});
test("echo and receipts do not open a reply window; known receipts advance monotonically", async () => {
  const inbound = (
    await one(
      "select last_inbound_at from public.sv_meta_threads where id=$1",
      [thread],
    )
  ).last_inbound_at;
  const echo = parseEvents(
    {
      object: "page",
      entry: [
        {
          id: "10001",
          messaging: [
            {
              sender: { id: "10001" },
              recipient: { id: "20001" },
              timestamp: now,
              message: { mid: "mid.outbound", is_echo: true, text: "回覆" },
            },
          ],
        },
      ],
    },
    now,
  )[0];
  await ingest([echo]);
  assert.equal(
    (
      await one(
        "select last_inbound_at from public.sv_meta_threads where id=$1",
        [thread],
      )
    ).last_inbound_at,
    inbound,
  );
  const receipt = (kind: string) => ({
    ...incoming("unused"),
    kind,
    mid: "mid.outbound",
    key: (kind === "read" ? "a" : "b").repeat(64),
    body: "",
  });
  await ingest([receipt("read"), receipt("delivered")]);
  assert.equal(
    (
      await one(
        "select state from public.sv_meta_messages where provider_id='mid.outbound'",
      )
    ).state,
    "read",
  );
});
test("receipt arriving before HTTP completion is retained and ambiguous send blocks redispatch", async () => {
  const send = await claim();
  const e = {
    ...incoming("unused2"),
    kind: "delivered",
    mid: "mid.race",
    key: "c".repeat(64),
    body: "",
  };
  await ingest([e]);
  await db.query("select public.sv_meta_finish($1,$2,$3,$4,$5)", [
    company,
    send.message.id,
    "accepted",
    "mid.race",
    null,
  ]);
  assert.equal(
    (
      await one("select state from public.sv_meta_messages where id=$1", [
        send.message.id,
      ])
    ).state,
    "delivered",
  );
  const uncertain = await claim();
  await db.query("select public.sv_meta_finish($1,$2,$3,$4,$5)", [
    company,
    uncertain.message.id,
    "uncertain",
    null,
    "provider_unreachable",
  ]);
  await assert.rejects(() => claim(), /meta_send_unresolved/);
  await db.query(
    "update public.sv_meta_messages set state='failed' where id=$1",
    [uncertain.message.id],
  );
});
test("window uses genuine provider time and delayed events never renew it", async () => {
  await db.query(
    "update public.sv_meta_threads set last_inbound_at=$2 where id=$1",
    [thread, now - 86400001],
  );
  await assert.rejects(() => claim(), /meta_window_closed/);
  await ingest([incoming("mid.delayed", now - 2 * 86400000)]);
  await assert.rejects(() => claim(), /meta_window_closed/);
  await ingest([incoming("mid.current", Date.now())]);
  const send = await claim();
  await db.query("select public.sv_meta_finish($1,$2,$3,$4,$5)", [
    company,
    send.message.id,
    "failed",
    null,
    "provider_rejected",
  ]);
});
test("notes stay internal, viewer cannot mutate, disabled connection cannot send, evidence cannot be rewritten", async () => {
  await db.query("select public.sv_meta_command($1,$2,$3,$4,$5)", [
    company,
    owner,
    thread,
    "note",
    "需要預約示範",
  ]);
  assert.equal(
    (
      await one(
        "select state from public.sv_meta_messages where thread_id=$1 and direction='note'",
        [thread],
      )
    ).state,
    "note",
  );
  await assert.rejects(() =>
    db.query("select public.sv_meta_command($1,$2,$3,$4,$5)", [
      company,
      viewer,
      thread,
      "note",
      "不允許",
    ]),
  );
  await db.query(
    "update public.sv_meta_connections set enabled=false where id=$1",
    [connection],
  );
  await assert.rejects(() => claim());
  await assert.rejects(() =>
    db.exec("update public.sv_meta_events set kind='read'"),
  );
  await assert.rejects(() => db.exec("truncate public.sv_meta_events"));
  for (const role of ["anon", "authenticated"]) {
    await db.exec("reset role;set role " + role);
    await assert.rejects(() =>
      db.exec("select * from public.sv_meta_connections"),
    );
    await assert.rejects(() =>
      db.exec("select * from public.sv_meta_messages"),
    );
    await assert.rejects(() =>
      db.query("select public.sv_meta_authorize($1,$2)", [company, owner]),
    );
  }
  await db.exec("reset role;set role service_role");
});
test("read horizon never consumes a later unseen message and referrals alone never create an inquiry", async () => {
  await db.query(
    "update public.sv_meta_connections set enabled=true where id=$1",
    [connection],
  );
  const first = await one<{ seq: number }>(
    "select seq from public.sv_meta_messages where thread_id=$1 order by seq limit 1",
    [thread],
  );
  await ingest([incoming("mid.after-horizon", Date.now())]);
  await db.query("select public.sv_meta_command($1,$2,$3,$4,$5,$6)", [
    company,
    owner,
    thread,
    "read",
    null,
    first.seq,
  ]);
  assert.equal(
    Number(
      (
        await one("select read_seq from public.sv_meta_threads where id=$1", [
          thread,
        ])
      ).read_seq,
    ),
    Number(first.seq),
  );
  const before = await one(
    "select count(*)::int n from public.sv_meta_threads",
  );
  const referral = {
    ...incoming("unused-referral"),
    peerId: "88888",
    kind: "referral",
    mid: null,
    key: "d".repeat(64),
    body: "",
  };
  await ingest([referral]);
  assert.deepEqual(
    await one("select count(*)::int n from public.sv_meta_threads"),
    before,
  );
  await assert.rejects(() =>
    db.query("select public.sv_meta_disable($1,$2,$3)", [
      company,
      viewer,
      connection,
    ]),
  );
  await db.query("select public.sv_meta_disable($1,$2,$3)", [
    company,
    owner,
    connection,
  ]);
  assert.equal(
    (
      await one("select enabled from public.sv_meta_connections where id=$1", [
        connection,
      ])
    ).enabled,
    false,
  );
});

const followup = {
  customer_name: "Synthetic inquiry",
  assignee_id: owner,
  priority: "urgent",
  follow_up_at: "2026-01-01T00:00:00Z",
  next_step: "確認需求後安排示範",
  status: "open",
};
async function manage(
  data: object,
  command = randomUUID(),
  expected?: number,
  actor = owner,
  target = company,
  targetThread?: string,
) {
  return result<{ saved: boolean; replayed: boolean }>(
    "select public.sv_meta_manage_thread($1,$2,$3,$4,$5,$6::jsonb) value",
    [
      target,
      actor,
      targetThread ?? thread,
      command,
      expected ?? (await revision()),
      JSON.stringify(data),
    ],
  );
}
async function list(
  queue = "all",
  channel = "all",
  search = "",
  before?: { updated_at: string; id: string },
  target = company,
  actor = owner,
) {
  return result<{
    threads: Record<string, unknown>[];
    counts: Record<string, number>;
  }>("select public.sv_meta_inbox_list($1,$2,$3,$4,$5,$6,$7) value", [
    target,
    actor,
    queue,
    channel,
    search,
    before?.updated_at ?? null,
    before?.id ?? null,
  ]);
}
test("operational handover is tenant-bound, revision-checked, durable and replay-safe", async () => {
  const command = randomUUID(),
    expected = await revision();
  assert.equal((await manage(followup, command, expected)).replayed, false);
  assert.equal((await manage(followup, command, expected)).replayed, true);
  assert.equal(await revision(), expected + 1);
  const receipt = await one(
    "select previous,next,actor_name from public.sv_meta_thread_activity where command_id=$1",
    [command],
  );
  assert.equal((receipt.next as typeof followup).next_step, followup.next_step);
  assert.equal(receipt.actor_name, "Owner");
  await assert.rejects(
    () => manage({ ...followup, next_step: "different" }, command, expected),
    /meta_idempotency_conflict/,
  );
  await assert.rejects(
    () => manage(followup, randomUUID(), expected),
    /meta_revision_conflict/,
  );
  await assert.rejects(
    () => manage(followup, randomUUID(), undefined, viewer),
    /meta_access_denied/,
  );
  await assert.rejects(() =>
    manage(followup, randomUUID(), undefined, outsider, foreign),
  );
  await assert.rejects(
    () => manage(followup, randomUUID(), undefined, owner, pos),
    /meta_product_required/,
  );
  await assert.rejects(
    () => manage({ ...followup, assignee_id: outsider }),
    /meta_assignee_invalid/,
  );
  await assert.rejects(
    () => manage({ ...followup, assignee_id: viewer }),
    /meta_assignee_invalid/,
  );
  await assert.rejects(
    () => manage({ ...followup, next_step: "x".repeat(501) }),
    /meta_operations_invalid/,
  );
  await assert.rejects(
    () => manage({ ...followup, follow_up_at: "infinity" }),
    /meta_operations_invalid/,
  );
  await assert.rejects(() =>
    db.exec("update public.sv_meta_thread_activity set actor_name='rewritten'"),
  );
  await assert.rejects(() =>
    db.exec("delete from public.sv_meta_thread_activity"),
  );
  await assert.rejects(() =>
    db.exec("truncate public.sv_meta_thread_activity"),
  );
  const grants = await one(
    "select has_table_privilege('service_role','public.sv_meta_thread_activity','UPDATE') as update,has_table_privilege('service_role','public.sv_meta_thread_activity','DELETE') as delete,has_table_privilege('service_role','public.sv_meta_events','TRUNCATE') as truncate",
  );
  assert.deepEqual(grants, { update: false, delete: false, truncate: false });
  assert.equal(
    (await one("select count(*)::int n from public.sv_meta_thread_activity")).n,
    1,
  );
});
test("complete-dataset queues and literal search run before keyset pagination", async () => {
  await db.query(
    "insert into public.sv_meta_threads(company_id,connection_id,peer_id,customer_name,updated_at) select $1,$2,(40000+n)::text,'Older inquiry '||n,'2026-01-01'::timestamptz from generate_series(1,104)n",
    [company, connection],
  );
  const first = await list();
  assert.equal(first.threads.length, 101);
  assert.equal(first.counts.all, 105);
  const cursor = first.threads[99] as { updated_at: string; id: string };
  const second = await list("all", "all", "", cursor);
  assert.equal(second.threads.length, 5);
  assert.equal(
    second.threads.some((t) =>
      first.threads.slice(0, 100).some((f) => f.id === t.id),
    ),
    false,
  );
  assert.equal((await list("mine")).counts.mine, 1);
  assert.equal((await list("overdue")).threads[0].id, thread);
  assert.equal((await list("priority")).threads[0].id, thread);
  assert.equal((await list("unassigned")).counts.unassigned, 104);
  assert.equal((await list("all", "instagram")).threads.length, 0);
  assert.equal(
    (await list("all", "all", "Older inquiry 104")).threads.length,
    1,
  );
  assert.equal((await list("all", "all", "%")).threads.length, 0);
  assert.equal(
    (await list("all", "all", "", undefined, foreign, outsider)).threads.length,
    0,
  );
  assert.equal(
    (await list("all", "all", "", undefined, company, viewer)).counts.all,
    105,
  );
  await assert.rejects(
    () => list("all", "all", "", undefined, company, outsider),
    /meta_access_denied/,
  );
  await assert.rejects(() => list("unsupported"), /meta_query_invalid/);
  const current = await revision();
  await manage({ ...followup, status: "resolved" });
  assert.equal((await list("overdue")).threads.length, 0);
  assert.equal((await list("resolved")).threads[0].id, thread);
  // A status change invalidates a simultaneous handover from another browser.
  await assert.rejects(
    () => manage(followup, randomUUID(), current),
    /meta_revision_conflict/,
  );
});
test("former assignees return to unassigned and immutable receipts remain confirmable", async () => {
  await db.query(
    "insert into public.sv_memberships(company_id,user_id,role,display_name)values($1,$2,'agent','Synthetic agent')",
    [company, outsider],
  );
  const command = randomUUID(),
    expected = await revision(),
    data = { ...followup, assignee_id: outsider };
  await manage(data, command, expected);
  await db.query(
    "update public.sv_memberships set status='suspended' where company_id=$1 and user_id=$2",
    [company, outsider],
  );
  assert.equal((await list("unassigned")).counts.unassigned, 105);
  assert.equal((await manage(data, command, expected)).replayed, true);
  await assert.rejects(() => manage(data), /meta_assignee_invalid/);
  await manage({ ...data, assignee_id: null });
  assert.equal((await list("unassigned")).counts.unassigned, 105);
  for (const role of ["anon", "authenticated"]) {
    await db.exec("reset role;set role " + role);
    await assert.rejects(() =>
      db.exec("select * from public.sv_meta_thread_activity"),
    );
    await assert.rejects(() => list());
    await assert.rejects(() => manage(followup, randomUUID(), 0));
  }
  await db.exec("reset role;set role service_role");
});
