import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createCompanyState } from "../src/lib/saas/workspace";
const db = new PGlite(),
  owner = randomUUID(),
  viewer = randomUUID(),
  manager = randomUUID(),
  outsider = randomUUID();
const proof = "a".repeat(48),
  token = createHash("sha256").update("synthetic private token").digest("hex"),
  rate = "b".repeat(64),
  origin = "https://example.org";
async function rpc<T = Record<string, unknown>>(
  fn: string,
  args: unknown[],
): Promise<T> {
  return (
    await db.query<{ v: T }>(
      `select ${fn}(${args.map((_, i) => `$${i + 1}`).join(",")})v`,
      args,
    )
  ).rows[0]?.v;
}
before(async () => {
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to service_role,authenticated;alter default privileges in schema public grant all on tables to service_role;",
  );
  for (const file of readdirSync("supabase/migrations")
    .filter(
      (f) =>
        f.endsWith(".sql") &&
        (f <= "20261115144827_convelta_dynamic_segments.sql" ||
          f.endsWith("_convelta_website_chat.sql")),
    )
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  for (const user of [owner, viewer, manager, outsider])
    await db.query<Record<string, unknown>>(
      "insert into auth.users values($1)",
      [user],
    );
  await db.exec("set role service_role");
});
after(() => db.close());
async function fixture() {
  const company = randomUUID(),
    id = randomUUID();
  await rpc("sv_provision_company", [
    company,
    "Synthetic",
    owner,
    "Owner",
    JSON.stringify(
      createCompanyState({
        companyId: company,
        companyName: "Synthetic",
        brands: [
          { id: "main", name: "Main", short: "M" },
          { id: "other", name: "Other", short: "O" },
        ],
        team: [{ id: owner, name: "Owner", initials: "O" }],
      }),
    ),
    ["crm"],
  ]);
  await db.query<Record<string, unknown>>(
    "insert into sv_memberships(company_id,user_id,role,display_name,brand_ids,product_ids)values($1,$2,'viewer','Viewer',null,array['crm']),($1,$3,'manager','Scoped',array['other'],array['crm'])",
    [company, viewer, manager],
  );
  const config = {
    id,
    brandId: "main",
    name: "Synthetic",
    greeting: "Hello",
    origins: [origin],
    enabled: false,
    revision: 0,
  };
  await rpc("sv_web_chat_configure", [
    company,
    owner,
    randomUUID(),
    config,
    proof,
  ]);
  return { company, id, config };
}
async function enabled() {
  const f = await fixture();
  await rpc("sv_web_chat_verify", [
    f.company,
    owner,
    randomUUID(),
    f.id,
    1,
    origin,
    proof,
  ]);
  await rpc("sv_web_chat_configure", [
    f.company,
    owner,
    randomUUID(),
    { ...f.config, revision: 2, enabled: true },
    proof,
  ]);
  return f;
}
async function session(f: Awaited<ReturnType<typeof fixture>>) {
  const thread = randomUUID();
  await rpc("sv_web_chat_start", [
    f.id,
    origin,
    thread,
    token,
    "Visitor",
    rate,
  ]);
  return thread;
}
test("default disabled, verified exact origins and active CRM purchase are admission gates", async () => {
  const f = await fixture();
  await assert.rejects(
    () => rpc("sv_web_chat_public_config", [f.id, origin]),
    /chat_unavailable/,
  );
  await assert.rejects(
    () =>
      rpc("sv_web_chat_configure", [
        f.company,
        owner,
        randomUUID(),
        { ...f.config, revision: 1, enabled: true },
        proof,
      ]),
    /chat_domain_unverified/,
  );
  await assert.rejects(
    () =>
      rpc("sv_web_chat_verify", [
        f.company,
        owner,
        randomUUID(),
        f.id,
        1,
        origin,
        "bad",
      ]),
    /chat_domain_unverified/,
  );
  await rpc("sv_web_chat_verify", [
    f.company,
    owner,
    randomUUID(),
    f.id,
    1,
    origin,
    proof,
  ]);
  await rpc("sv_web_chat_configure", [
    f.company,
    owner,
    randomUUID(),
    { ...f.config, revision: 2, enabled: true },
    proof,
  ]);
  assert.equal(
    (await rpc("sv_web_chat_public_config", [f.id, origin])).name,
    "Synthetic",
  );
  await assert.rejects(
    () => rpc("sv_web_chat_public_config", [f.id, "https://www.example.org"]),
    /chat_unavailable/,
  );
  await db.query<Record<string, unknown>>(
    "update sv_company_products set status='suspended' where company_id=$1",
    [f.company],
  );
  await assert.rejects(
    () => rpc("sv_web_chat_public_config", [f.id, origin]),
    /chat_unavailable/,
  );
});
test("visitor sessions are immutable, scoped and do not create or guess customers", async () => {
  const f = await enabled(),
    thread = await session(f),
    foreign = await enabled();
  await rpc("sv_web_chat_start", [
    f.id,
    origin,
    thread,
    token,
    "Different name",
    rate,
  ]);
  await assert.rejects(
    () =>
      rpc("sv_web_chat_start", [
        foreign.id,
        origin,
        thread,
        token,
        "Visitor",
        rate,
      ]),
    /chat_session_invalid/,
  );
  await assert.rejects(
    () =>
      rpc("sv_web_chat_visitor_read", [
        f.id,
        origin,
        thread,
        "c".repeat(64),
        0,
      ]),
    /chat_session_invalid/,
  );
  assert.equal(
    (
      await db.query<Record<string, unknown>>(
        "select count(*)::int n from sv_customers where company_id=$1",
        [f.company],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await db.query<Record<string, unknown>>(
        "select visitor_name from sv_web_chat_threads where id=$1",
        [thread],
      )
    ).rows[0].visitor_name,
    "Visitor",
  );
});
test("lost-response retries keep a single message, while changed content or staff command collisions fail", async () => {
  const f = await enabled(),
    thread = await session(f),
    command = randomUUID();
  await rpc("sv_web_chat_visitor_send", [
    f.id,
    origin,
    thread,
    token,
    command,
    "Hello",
  ]);
  await rpc("sv_web_chat_visitor_send", [
    f.id,
    origin,
    thread,
    token,
    command,
    "Hello",
  ]);
  await assert.rejects(
    () =>
      rpc("sv_web_chat_visitor_send", [
        f.id,
        origin,
        thread,
        token,
        command,
        "Changed",
      ]),
    /idempotency_conflict/,
  );
  const result = await rpc<{ messages: { body: string }[] }>(
    "sv_web_chat_visitor_read",
    [f.id, origin, thread, token, 0],
  );
  assert.deepEqual(
    result.messages.map((m) => m.body),
    ["Hello"],
  );
  assert.equal(
    (
      await db.query<Record<string, unknown>>(
        "select revision from sv_web_chat_threads where id=$1",
        [thread],
      )
    ).rows[0].revision,
    1,
  );
});
test("staff reply is explicit and revision checked; viewer and out-of-brand staff cannot send or read", async () => {
  const f = await enabled(),
    thread = await session(f);
  await rpc("sv_web_chat_visitor_send", [
    f.id,
    origin,
    thread,
    token,
    randomUUID(),
    "Hello",
  ]);
  const data = {
    action: "reply",
    threadId: thread,
    revision: 1,
    body: "How can I help?",
  };
  await assert.rejects(
    () =>
      rpc("sv_web_chat_staff_action", [f.company, viewer, randomUUID(), data]),
    /access_denied/,
  );
  await assert.rejects(
    () =>
      rpc("sv_web_chat_staff_action", [f.company, manager, randomUUID(), data]),
    /brand_scope/,
  );
  await assert.rejects(
    () =>
      rpc("sv_web_chat_staff_read", [f.company, manager, { threadId: thread }]),
    /brand_scope/,
  );
  const command = randomUUID();
  await rpc("sv_web_chat_staff_action", [f.company, owner, command, data]);
  await rpc("sv_web_chat_staff_action", [f.company, owner, command, data]);
  await assert.rejects(
    () =>
      rpc("sv_web_chat_staff_action", [f.company, owner, randomUUID(), data]),
    /revision_conflict/,
  );
  const read = await rpc<{
    messages: { direction: string; actorName: string }[];
  }>("sv_web_chat_visitor_read", [f.id, origin, thread, token, 0]);
  assert.equal(read.messages.length, 2);
  assert.equal(read.messages[1].direction, "outgoing");
  assert.equal(read.messages[1].actorName, "Owner");
});
test("current scope narrowing protects old threads and later messages before pagination or aggregate", async () => {
  const f = await enabled(),
    thread = await session(f);
  await rpc("sv_web_chat_visitor_send", [
    f.id,
    origin,
    thread,
    token,
    randomUUID(),
    "Old private history",
  ]);
  await db.query<Record<string, unknown>>(
    "update sv_memberships set brand_ids=array['main'] where company_id=$1 and user_id=$2",
    [f.company, manager],
  );
  assert.equal(
    (
      await rpc<{ threads: unknown[] }>("sv_web_chat_staff_read", [
        f.company,
        manager,
        {},
      ])
    ).threads.length,
    1,
  );
  const priorScope = (
    await rpc<{ scopeStamp: string }>("sv_web_chat_staff_read", [
      f.company,
      manager,
      {},
    ])
  ).scopeStamp;
  await db.query<Record<string, unknown>>(
    "update sv_memberships set brand_ids=array['other'] where company_id=$1 and user_id=$2",
    [f.company, manager],
  );
  await rpc("sv_web_chat_visitor_send", [
    f.id,
    origin,
    thread,
    token,
    randomUUID(),
    "New private history",
  ]);
  assert.notEqual(
    (
      await rpc<{ scopeStamp: string }>("sv_web_chat_staff_read", [
        f.company,
        manager,
        {},
      ])
    ).scopeStamp,
    priorScope,
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
  await assert.rejects(
    () =>
      rpc("sv_web_chat_staff_read", [f.company, manager, { threadId: thread }]),
    /brand_scope/,
  );
  await assert.rejects(
    () =>
      rpc("sv_web_chat_staff_action", [
        f.company,
        manager,
        randomUUID(),
        { action: "close", threadId: thread, revision: 2 },
      ]),
    /brand_scope/,
  );
});
test("closed, expired or disabled sessions cannot submit further messages", async () => {
  const f = await enabled(),
    thread = await session(f);
  await rpc("sv_web_chat_staff_action", [
    f.company,
    owner,
    randomUUID(),
    { action: "close", threadId: thread, revision: 0 },
  ]);
  await assert.rejects(
    () =>
      rpc("sv_web_chat_visitor_send", [
        f.id,
        origin,
        thread,
        token,
        randomUUID(),
        "Hello",
      ]),
    /chat_closed/,
  );
  await rpc("sv_web_chat_staff_action", [
    f.company,
    owner,
    randomUUID(),
    { action: "reopen", threadId: thread, revision: 1 },
  ]);
  await rpc("sv_web_chat_visitor_send", [
    f.id,
    origin,
    thread,
    token,
    randomUUID(),
    "Hello",
  ]);
  await db.query<Record<string, unknown>>(
    "update sv_web_chat_threads set expires_at=now()-interval '1 day' where id=$1",
    [thread],
  );
  await assert.rejects(
    () => rpc("sv_web_chat_visitor_read", [f.id, origin, thread, token, 0]),
    /chat_session_invalid/,
  );
  await assert.rejects(
    () =>
      rpc("sv_web_chat_staff_action", [
        f.company,
        owner,
        randomUUID(),
        {
          action: "reply",
          threadId: thread,
          revision: 3,
          body: "Expired reply",
        },
      ]),
    /chat_expired/,
  );

  await db.query<Record<string, unknown>>(
    "update sv_web_chat_configs set enabled=false where id=$1",
    [f.id],
  );
  await assert.rejects(
    () =>
      rpc("sv_web_chat_start", [
        f.id,
        origin,
        randomUUID(),
        token,
        "Visitor",
        rate,
      ]),
    /chat_unavailable/,
  );
});
test("visitor and shared admission rate caps are durable and atomic", async () => {
  const f = await enabled(),
    thread = await session(f);
  for (let i = 0; i < 6; i++)
    await rpc("sv_web_chat_visitor_send", [
      f.id,
      origin,
      thread,
      token,
      randomUUID(),
      "Message " + i,
    ]);
  await assert.rejects(
    () =>
      rpc("sv_web_chat_visitor_send", [
        f.id,
        origin,
        thread,
        token,
        randomUUID(),
        "Seventh",
      ]),
    /chat_rate_limited/,
  );
  assert.equal(
    (
      await db.query<Record<string, unknown>>(
        "select count(*)::int n from sv_web_chat_messages where thread_id=$1",
        [thread],
      )
    ).rows[0].n,
    6,
  );
  for (let i = 0; i < 19; i++) await session(f);
  await assert.rejects(() => session(f), /chat_rate_limited/);
});
test("customer link uses an explicit existing identity in the same company and brand", async () => {
  const f = await enabled(),
    thread = await session(f),
    customer = randomUUID(),
    otherCustomer = randomUUID();
  await db.query<Record<string, unknown>>(
    "insert into sv_customers(company_id,id,name)values($1,$2,'Known'),($1,$3,'Other')",
    [f.company, customer, otherCustomer],
  );
  await db.query<Record<string, unknown>>(
    "insert into sv_customer_brands values($1,$2,'main'),($1,$3,'other')",
    [f.company, customer, otherCustomer],
  );
  await assert.rejects(
    () =>
      rpc("sv_web_chat_staff_action", [
        f.company,
        owner,
        randomUUID(),
        {
          action: "linkCustomer",
          threadId: thread,
          revision: 0,
          customerId: otherCustomer,
        },
      ]),
    /brand_scope/,
  );
  await rpc("sv_web_chat_staff_action", [
    f.company,
    owner,
    randomUUID(),
    {
      action: "linkCustomer",
      threadId: thread,
      revision: 0,
      customerId: customer,
    },
  ]);
  await rpc("sv_web_chat_visitor_send", [
    f.id,
    origin,
    thread,
    token,
    randomUUID(),
    "Linked inquiry",
  ]);
  assert.equal(
    (
      await db.query<Record<string, unknown>>(
        "select count(*)::int n from sv_customer_events where company_id=$1 and customer_id=$2",
        [f.company, customer],
      )
    ).rows[0].n,
    2,
  );
});
test("message reads are scoped, newest-first admission is returned chronologically, and older pages remain available", async () => {
  const f = await enabled(),
    thread = await session(f);
  for (let i = 0; i < 55; i++) {
    await db.query<Record<string, unknown>>(
      "insert into sv_web_chat_messages(company_id,thread_id,id,sequence,direction,body)values($1,$2,$3,$4,'incoming',$5)",
      [f.company, thread, randomUUID(), i + 1, "Line " + (i + 1)],
    );
  }
  const latest = await rpc<{ messages: { sequence: number }[] }>(
    "sv_web_chat_staff_read",
    [f.company, owner, { threadId: thread }],
  );
  assert.equal(latest.messages.length, 51);
  assert.equal(latest.messages[0].sequence, 5);
  assert.equal(latest.messages.at(-1)!.sequence, 55);
  const old = await rpc<{ messages: { sequence: number }[] }>(
    "sv_web_chat_staff_read",
    [f.company, owner, { threadId: thread, beforeSequence: 6 }],
  );
  assert.deepEqual(
    old.messages.map((m) => m.sequence),
    [1, 2, 3, 4, 5],
  );
});
test("all new tables have RLS with zero browser grants; message originals cannot be updated or deleted by runtime", async () => {
  const tables = [
    "sv_web_chat_configs",
    "sv_web_chat_threads",
    "sv_web_chat_messages",
    "sv_web_chat_limits",
  ];
  for (const table of tables) {
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select relrowsecurity from pg_class where oid=$1::regclass",
          [table],
        )
      ).rows[0].relrowsecurity,
      true,
    );
    for (const role of ["anon", "authenticated"])
      assert.equal(
        (
          await db.query<Record<string, unknown>>(
            "select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') a",
            [role, table],
          )
        ).rows[0].a,
        false,
      );
  }
  assert.equal(
    (
      await db.query<Record<string, unknown>>(
        "select has_table_privilege('service_role','sv_web_chat_messages','UPDATE,DELETE') a",
      )
    ).rows[0].a,
    false,
  );
});

test("duplicate configuration commands retain one row, one revision and the original domain proof", async () => {
  const f = await fixture(),
    id = randomUUID(),
    command = randomUUID(),
    data = { ...f.config, id };
  const results = await Promise.all([
    rpc("sv_web_chat_configure", [f.company, owner, command, data, proof]),
    rpc("sv_web_chat_configure", [
      f.company,
      owner,
      command,
      data,
      "b".repeat(48),
    ]),
  ]);
  assert.deepEqual(results, [{ ok: true }, { ok: true }]);
  const rows = await db.query<{ revision: number; verification: string }>(
    "select revision,verification from sv_web_chat_configs where company_id=$1 and id=$2",
    [f.company, id],
  );
  assert.equal(rows.rows.length, 1);
  assert.equal(rows.rows[0].revision, 1);
  assert.equal(rows.rows[0].verification, proof);
  assert.equal(
    (
      await db.query<{ n: number }>(
        "select count(*)::int n from sv_action_receipts where company_id=$1 and command_id=$2",
        [f.company, command],
      )
    ).rows[0].n,
    1,
  );
  await assert.rejects(
    () =>
      rpc("sv_web_chat_configure", [
        f.company,
        owner,
        command,
        { ...data, name: "Changed retry" },
        proof,
      ]),
    /idempotency_conflict/,
  );
});
