import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createCompanyState } from "../src/lib/saas/workspace";
const db = new PGlite(),
  owner = randomUUID(),
  viewer = randomUUID(),
  outsider = randomUUID();
async function val<T = Record<string, unknown>>(
  sql: string,
  args: unknown[] = [],
): Promise<T> {
  return (await db.query<{ v: T }>(sql, args)).rows[0]?.v;
}
const rpc = <T = Record<string, unknown>>(fn: string, args: unknown[]) =>
  val<T>(
    "select public." +
      fn +
      "(" +
      args.map((_, i) => "$" + (i + 1)).join(",") +
      ")v",
    args,
  );
async function fixture() {
  const company = randomUUID(),
    thread = "thread-" + randomUUID(),
    contact = "contact-" + randomUUID();
  const state = createCompanyState({
    companyId: company,
    companyName: "Synthetic",
    brands: [
      { id: "main", name: "Main", short: "M" },
      { id: "other", name: "Other", short: "O" },
    ],
    team: [{ id: owner, name: "Owner", initials: "O" }],
  });
  state.inbox.contacts.push({
    id: contact,
    clientId: company,
    name: "Synthetic",
    initials: "S",
    phone: "",
    email: "",
    company: "",
    tags: [],
    source: "synthetic",
    createdAt: 1,
    note: "",
  });
  state.inbox.conversations.push({
    id: thread,
    clientId: company,
    brandId: "main",
    contactId: contact,
    channel: "whatsapp",
    status: "open",
    owner,
    priority: false,
    pinned: false,
    unread: 0,
    snoozedUntil: null,
    subject: "Synthetic",
    updatedAt: 1,
  });
  await rpc("sv_provision_company", [
    company,
    "Synthetic",
    owner,
    "Owner",
    JSON.stringify(state),
    ["crm"],
  ]);
  await db.query(
    "insert into public.sv_memberships(company_id,user_id,role,display_name)values($1,$2,'viewer','Viewer')",
    [company, viewer],
  );
  await rpc("sv_ai_configure", [company, owner, true]);
  return { company, thread };
}
type F = Awaited<ReturnType<typeof fixture>>;
async function asset(f: F, id = randomUUID(), actor = owner, extra = {}) {
  const data = {
    brandId: "main",
    source: "conversation",
    sourceId: f.thread,
    messageId: id,
    origin: "staff_upload",
    contentHash: "a".repeat(64),
    mimeType: "audio/wav",
    audioBytes: 16044,
    durationSeconds: 1,
    ...extra,
  };
  await rpc("sv_voice_register", [f.company, actor, id, JSON.stringify(data)]);
  return { id, data };
}
const claim = (f: F, id: string, request = randomUUID(), actor = owner) =>
  rpc("sv_voice_claim", [
    f.company,
    actor,
    request,
    id,
    "synthetic/audio",
    "b".repeat(64),
  ]).then((receipt) => ({ request, receipt }));
const result = {
  text: "想預約星期六",
  language: "cantonese",
  extractions: [{ kind: "date", text: "想預約星期六", quote: "想預約星期六" }],
};
const finish = (
  f: F,
  request: string,
  data: unknown = result,
  error: string | null = null,
  actor = owner,
) =>
  rpc("sv_voice_finish", [
    f.company,
    actor,
    request,
    data === null ? null : JSON.stringify(data),
    error,
  ]);
before(async () => {
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to service_role,authenticated;alter default privileges in schema public grant all on tables to service_role;",
  );
  for (const f of readdirSync("supabase/migrations")
    .filter(
      (f) =>
        f.endsWith(".sql") &&
        (f <= "20261115094755_convelta_cs_coaching.sql" ||
          f.endsWith("_convelta_voice_transcription.sql")),
    )
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  await db.query("insert into auth.users values($1),($2),($3)", [
    owner,
    viewer,
    outsider,
  ]);
  await db.exec("set role service_role");
});
after(() => db.close());
test("voice registration scopes company, source, brand, product and role", async () => {
  const f = await fixture();
  await assert.rejects(() => asset(f, randomUUID(), viewer), /access_denied/);
  await assert.rejects(() => asset(f, randomUUID(), outsider), /access_denied/);
  await assert.rejects(
    () => asset(f, randomUUID(), owner, { brandId: "other" }),
    /source_missing/,
  );
  await assert.rejects(
    () => asset(f, randomUUID(), owner, { origin: "provider" }),
    /source_missing/,
  );
  const other = await fixture();
  await assert.rejects(
    () => asset({ ...other, thread: f.thread }),
    /source_missing/,
  );
  await db.query(
    "update public.sv_company_products set status='suspended'where company_id=$1 and product='crm'",
    [f.company],
  );
  await assert.rejects(
    () => asset(f),
    /product_not_purchased|product_required/,
  );
});
test("one immutable audio registration is replayable only with matching lineage and bytes", async () => {
  const f = await fixture(),
    a = await asset(f);
  await rpc("sv_voice_register", [
    f.company,
    owner,
    a.id,
    JSON.stringify(a.data),
  ]);
  assert.equal(
    await val<number>(
      "select count(*)::integer v from public.sv_voice_assets where company_id=$1",
      [f.company],
    ),
    1,
  );
  await assert.rejects(
    () =>
      rpc("sv_voice_register", [
        f.company,
        owner,
        a.id,
        JSON.stringify({ ...a.data, contentHash: "c".repeat(64) }),
      ]),
    /idempotency_conflict/,
  );
  await assert.rejects(
    () => asset(f, randomUUID(), owner, { durationSeconds: 301 }),
    /check constraint/,
  );
});
test("shared AI admission reserves once, isolates request IDs and reuses completed originals", async () => {
  const f = await fixture(),
    a = await asset(f),
    c = await claim(f, a.id);
  assert.equal(c.receipt.dispatch, true);
  assert.equal((await claim(f, a.id, c.request)).receipt.dispatch, false);
  await assert.rejects(
    () => claim(f, a.id, c.request, viewer),
    /access_denied/,
  );
  await assert.rejects(
    () => rpc("sv_ai_finish", [f.company, owner, c.request, "{}", null, 0, 0]),
    /idempotency_conflict/,
  );
  await finish(f, c.request);
  assert.equal((await claim(f, a.id)).receipt.dispatch, false);
  assert.equal(
    await val<number>(
      "select count(*)::integer v from public.sv_ai_requests where company_id=$1",
      [f.company],
    ),
    1,
  );
});
test("the same company quota also limits explicit audio requests after failed reservations", async () => {
  const f = await fixture(),
    a = await asset(f);
  await db.query(
    "update public.sv_ai_settings set daily_limit=1 where company_id=$1",
    [f.company],
  );
  const c = await claim(f, a.id);
  await finish(f, c.request, null, "unavailable");
  await assert.rejects(() => claim(f, a.id), /daily_limit/);
});
test("finish rejects fabricated extracted quotations and preserves failed receipt outcomes", async () => {
  const f = await fixture(),
    a = await asset(f),
    c = await claim(f, a.id);
  await assert.rejects(
    () =>
      finish(f, c.request, {
        ...result,
        extractions: [
          { kind: "date", text: "明天已付款", quote: "明天已付款" },
        ],
      }),
    /voice_invalid/,
  );
  const good = await finish(f, c.request);
  assert.equal(good.status, "completed");
  assert.equal(
    (await finish(f, c.request, null, "unavailable")).status,
    "completed",
  );
  assert.equal(
    await val<number>(
      "select count(*)::integer v from public.sv_voice_transcripts where company_id=$1",
      [f.company],
    ),
    1,
  );
});
test("staff corrections are append-only, audited and reject lost updates without altering the ASR original", async () => {
  const f = await fixture(),
    a = await asset(f),
    c = await claim(f, a.id);
  await finish(f, c.request);
  const command = randomUUID(),
    args = [
      f.company,
      owner,
      c.request,
      command,
      0,
      "想預約星期日",
      "核對原音後更正",
      "[]",
    ];
  await rpc("sv_voice_correct", args);
  await rpc("sv_voice_correct", args);
  await assert.rejects(
    () =>
      rpc("sv_voice_correct", [
        f.company,
        owner,
        c.request,
        randomUUID(),
        0,
        "改變",
        "stale",
        "[]",
      ]),
    /revision_conflict/,
  );
  await assert.rejects(
    () =>
      rpc("sv_voice_correct", [
        f.company,
        viewer,
        c.request,
        randomUUID(),
        1,
        "改變",
        "viewer",
        "[]",
      ]),
    /access_denied/,
  );
  assert.equal(
    await val<string>(
      "select original_text v from public.sv_voice_transcripts where company_id=$1",
      [f.company],
    ),
    result.text,
  );
  assert.equal(
    await val<number>(
      "select count(*)::integer v from public.sv_voice_corrections where company_id=$1",
      [f.company],
    ),
    1,
  );
});
test("new evidence tables and RPCs deny browser grants", async () => {
  await db.exec("reset role");
  assert.equal(
    await val<number>(
      "select count(*)::integer v from information_schema.role_table_grants where table_schema='public'and table_name in('sv_voice_assets','sv_voice_transcripts','sv_voice_corrections')and grantee in('anon','authenticated','PUBLIC')",
    ),
    0,
  );
  const rl = await db.query<{ relrowsecurity: boolean }>(
    "select relrowsecurity from pg_class where oid in('public.sv_voice_assets'::regclass,'public.sv_voice_transcripts'::regclass,'public.sv_voice_corrections'::regclass)",
  );
  assert.ok(rl.rows.every((x) => x.relrowsecurity));
  await db.exec("set role service_role");
});
