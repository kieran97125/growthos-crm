import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createCompanyState } from "../src/lib/saas/workspace";
const db = new PGlite(),
  owner = randomUUID(),
  manager = randomUUID(),
  viewer = randomUUID(),
  outsider = randomUUID();
async function value<T = unknown>(
  sql: string,
  args: unknown[] = [],
): Promise<T> {
  return (await db.query<{ v: T }>(sql, args)).rows[0]?.v;
}
const rpc = <T = Record<string, unknown>>(fn: string, args: unknown[]) =>
  value<T>(`select ${fn}(${args.map((_, i) => `$${i + 1}`).join(",")})v`, args);
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function fixture() {
  const company = randomUUID(),
    connection = randomUUID(),
    page = BigInt(
      "0x" + connection.replaceAll("-", "").slice(0, 12),
    ).toString();
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
  await db.query(
    "insert into sv_memberships(company_id,user_id,role,display_name,brand_ids,product_ids)values($1,$2,'viewer','Viewer',null,null),($1,$3,'manager','Scoped',array['other'],array['crm'])",
    [company, viewer, manager],
  );
  await db.query(
    "insert into sv_meta_connections(id,company_id,brand_id,channel,app_id,page_id,account_id,label,credentials,enabled)values($1,$2,'main','instagram','123',$3,$3,'Synthetic','{}',true)",
    [connection, company, page],
  );
  return { company, connection, page };
}
function definition(f: Fixture, extra = {}) {
  return {
    id: randomUUID(),
    revision: 0,
    connectionId: f.connection,
    brandId: "main",
    name: "Synthetic comment rule",
    postId: "10001",
    keywords: ["price"],
    match: "any",
    body: "Hello",
    enabled: true,
    ...extra,
  };
}
async function save(
  f: Fixture,
  d = definition(f),
  actor = owner,
  commandId = randomUUID(),
) {
  const action = { action: "save", commandId, definition: d },
    proof = {
      verified: true,
      connectionId: f.connection,
      accountId: f.page,
      postId: d.postId,
      permalink: "https://www.instagram.com/p/synthetic/",
    };
  const result = await rpc("sv_social_comment_action", [
    f.company,
    actor,
    "save",
    JSON.stringify(action),
    JSON.stringify(proof),
  ]);
  await db.query(
    "update sv_social_comment_rules set updated_at=now()-interval '1 minute'where company_id=$1 and id=$2",
    [f.company, d.id],
  );
  return { d, action, proof, result };
}
function event(f: Fixture, extra = {}) {
  const source = {
    channel: "instagram",
    accountId: f.page,
    commentId: "20001",
    postId: "10001",
    peerId: "30001",
    text: "PRICE please",
    eventAt: Date.now() - 500,
    createdAt: Date.now() - 1000,
    deleted: false,
    live: false,
    ...extra,
  };
  return {
    ...source,
    key: createHash("sha256").update(JSON.stringify(source)).digest("hex"),
  };
}
const ingest = (f: Fixture, e = event(f)) =>
  rpc<number>("sv_social_comments_ingest", [f.connection, JSON.stringify([e])]);
type Claim = {
  id: string;
  token: string;
  connectionId: string;
  commentId: string;
  postId: string;
  peerId: string;
  body: string;
  commentBody: string;
};
const claim = (f: Fixture) =>
  rpc<Claim | null>("sv_social_comments_claim", [f.company]);
function evidence(f: Fixture, c: Claim, extra = {}) {
  return {
    commentId: c.commentId,
    postId: c.postId,
    accountId: f.page,
    peerId: c.peerId,
    text: c.commentBody,
    createdAt: Date.now() - 1000,
    eligible: true,
    ...extra,
  };
}
const admit = (f: Fixture, c: Claim, e = evidence(f, c)) =>
  rpc<boolean>("sv_social_comment_admit", [
    f.company,
    c.id,
    c.token,
    JSON.stringify(e),
  ]);
before(async () => {
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to service_role,authenticated;alter default privileges in schema public grant all on tables to service_role;",
  );
  for (const file of readdirSync("supabase/migrations")
    .filter(
      (f) =>
        f.endsWith(".sql") &&
        (f < "20261115164112" ||
          f.endsWith("convelta_social_comment_replies.sql")),
    )
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  for (const actor of [owner, manager, viewer, outsider])
    await db.query("insert into auth.users values($1)", [actor]);
  await db.exec("set role service_role");
});
after(() => db.close());
test("rule scope, owner proof, optimistic revision and immutable command replay", async () => {
  const f = await fixture(),
    d = definition(f);
  await assert.rejects(save(f, d, viewer), /access_denied/);
  await assert.rejects(save(f, d, manager), /brand_scope/);
  await assert.rejects(save(f, d, outsider), /access_denied/);
  const invalid = { action: "save", commandId: randomUUID(), definition: d };
  await assert.rejects(
    rpc("sv_social_comment_action", [
      f.company,
      owner,
      "save",
      JSON.stringify(invalid),
      JSON.stringify({ verified: true }),
    ]),
    /social_post_unverified/,
  );
  const saved = await save(f, d);
  assert.deepEqual(
    await rpc("sv_social_comment_action", [
      f.company,
      owner,
      "save",
      JSON.stringify(saved.action),
      JSON.stringify(saved.proof),
    ]),
    saved.result,
  );
  await assert.rejects(save(f, d), /social_revision_conflict/);
  await assert.rejects(
    db.query(
      "update sv_social_rule_versions set definition='{}'where company_id=$1",
      [f.company],
    ),
    /permission denied/,
  );
  await db.exec("reset role");
  try {
    await assert.rejects(
      db.query(
        "update sv_social_rule_versions set definition='{}'where company_id=$1",
        [f.company],
      ),
      /immutable|rewrite/i,
    );
  } finally {
    await db.exec("set role service_role");
  }
});
test("duplicated webhooks and competing rules create one private reply with no new customer/window", async () => {
  const f = await fixture();
  await save(f);
  await save(f);
  const e = event(f);
  assert.equal(await ingest(f, e), 1);
  assert.equal(await ingest(f, e), 0);
  assert.equal(await ingest(f, { ...e, eventAt: e.eventAt + 100, key: "b".repeat(64) }), 0);
  assert.equal(
    await value(
      "select count(*)v from sv_social_comment_jobs where company_id=$1",
      [f.company],
    ),
    1,
  );
  assert.equal(
    await value("select count(*)v from sv_customers where company_id=$1", [
      f.company,
    ]),
    0,
  );
  assert.equal(
    await value("select count(*)v from sv_meta_threads where company_id=$1", [
      f.company,
    ]),
    0,
  );
  const c = (await claim(f))!;
  assert.ok(c);
  assert.equal(await claim(f), null);
  assert.equal(await admit(f, c), true);
  assert.equal(await admit(f, c), false);
  await rpc("sv_social_comment_finish", [
    f.company,
    c.id,
    c.token,
    "accepted",
    "mid.synthetic",
    "30001",
    null,
  ]);
  assert.equal(await claim(f), null);
  assert.equal(await ingest(f, event(f, { commentId: "20002" })), 0);
});
test("unknown or interrupted sends cannot be claimed or retried", async () => {
  const f = await fixture();
  await save(f);
  await ingest(f);
  const c = (await claim(f))!;
  await admit(f, c);
  await rpc("sv_social_comment_finish", [
    f.company,
    c.id,
    c.token,
    "uncertain",
    null,
    null,
    "provider_unreachable",
  ]);
  assert.equal(await claim(f), null);
  assert.equal(await admit(f, c), false);
  await assert.rejects(
    rpc("sv_social_comment_action", [
      f.company,
      owner,
      "retry",
      JSON.stringify({ id: c.id, commandId: randomUUID() }),
      null,
    ]),
    /social_retry_unavailable/,
  );
  assert.equal(
    await value(
      "select count(*)v from sv_social_comment_attempts where company_id=$1 and state='sending'",
      [f.company],
    ),
    1,
  );
  const g = await fixture();
  await save(g);
  await ingest(g);
  const interrupted = (await claim(g))!;
  await admit(g, interrupted);
  await db.query(
    "update sv_social_comment_jobs set attempted_at=now()-interval '6 minutes'where company_id=$1",
    [g.company],
  );
  assert.equal(await claim(g), null);
  assert.equal(
    await value(
      "select state v from sv_social_comment_jobs where company_id=$1",
      [g.company],
    ),
    "uncertain",
  );
});
test("deletions, edits and expired/Live sources stop queued work without extra sends", async () => {
  for (const edit of [{ deleted: true }, { text: "Not interested" }]) {
    const f = await fixture();
    await save(f);
    await ingest(f);
    await ingest(f, event(f, { ...edit, eventAt: Date.now() }));
    assert.equal(await claim(f), null);
  }
  const f = await fixture();
  await save(f);
  assert.equal(await ingest(f, event(f, { live: true })), 0);
  const g = await fixture();
  await save(g);
  await ingest(g);
  const c = (await claim(g))!;
  assert.equal(
    await admit(g, c, evidence(g, c, { createdAt: Date.now() - 8 * 86400000 })),
    false,
  );
  const tombstone = await fixture();
  await save(tombstone);
  await ingest(tombstone, event(tombstone, { deleted: true }));
  assert.equal(
    await ingest(tombstone, event(tombstone, { eventAt: Date.now() })),
    0,
  );
});
test("pausing a rule/company, connection or actor authority prevents final dispatch", async () => {
  for (const change of ["rule", "company", "connection", "actor"]) {
    const f = await fixture();
    const saved = await save(f);
    await ingest(f);
    const c = (await claim(f))!;
    if (change === "rule")
      await rpc("sv_social_comment_action", [
        f.company,
        owner,
        "toggle",
        JSON.stringify({
          id: saved.d.id,
          revision: 1,
          commandId: randomUUID(),
          enabled: false,
        }),
        null,
      ]);
    if (change === "company")
      await db.query(
        "insert into sv_delivery_policies(company_id,automations_paused)values($1,true)",
        [f.company],
      );
    if (change === "connection")
      await db.query(
        "update sv_meta_connections set enabled=false where company_id=$1",
        [f.company],
      );
    if (change === "actor")
      await db.query(
        "update sv_memberships set status='suspended'where company_id=$1 and user_id=$2",
        [f.company, owner],
      );
    assert.equal(await admit(f, c), false);
  }
});
test("missing or changed provider evidence fails closed and cannot cross tenant", async () => {
  for (const patch of [
    { accountId: "999" },
    { peerId: "999" },
    { postId: "999" },
    { text: "edited" },
    { eligible: false },
    { createdAt: null },
  ]) {
    const f = await fixture();
    await save(f);
    await ingest(f);
    const c = (await claim(f))!;
    assert.equal(await admit(f, c, evidence(f, c, patch)), false);
  }
  const f = await fixture();
  await save(f);
  await ingest(f);
  const c = (await claim(f))!;
  assert.equal(await admit(f, c, { eligible: true } as never), false);
  const g = await fixture();
  assert.equal(
    await rpc("sv_social_comment_admit", [
      g.company,
      c.id,
      c.token,
      JSON.stringify(evidence(f, c)),
    ]),
    false,
  );
  await assert.rejects(
    ingest(f, event(f, { accountId: g.page })),
    /social_source_mismatch/,
  );
});
test("read-only scope and privacy are applied before history pagination", async () => {
  const f = await fixture();
  await save(f);
  await ingest(f);
  const scoped = await rpc<{ rules: unknown[]; deliveries: unknown[] }>(
    "sv_social_comments_read",
    [f.company, manager, null, null],
  );
  assert.equal(scoped.rules.length, 0);
  assert.equal(scoped.deliveries.length, 0);
  await assert.rejects(
    rpc("sv_social_comments_read", [f.company, outsider, null, null]),
    /access_denied/,
  );
  const rows = await db.query<{ name: string; rls: boolean; grants: number }>(
    "select c.relname name,c.relrowsecurity rls,(select count(*)from information_schema.table_privileges p where p.table_schema='public'and p.table_name=c.relname and p.grantee in('anon','authenticated'))::int grants from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'and c.relname in('sv_social_comment_rules','sv_social_rule_versions','sv_social_comment_events','sv_social_comments','sv_social_comment_jobs','sv_social_comment_attempts')",
  );
  assert.equal(rows.rows.length, 6);
  assert.ok(rows.rows.every((r) => r.rls && r.grants === 0));
});
