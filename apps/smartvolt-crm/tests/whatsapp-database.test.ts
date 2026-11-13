import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { createCompanyState } from "../src/lib/saas/workspace";

const db = new PGlite();
const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const agent = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const viewer = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const outsider = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const company = "11111111-1111-4111-8111-111111111111";
const foreignCompany = "22222222-2222-4222-8222-222222222222";
const posCompany = "33333333-3333-4333-8333-333333333333";
const connection = "44444444-4444-4444-8444-444444444444";
const foreignConnection = "55555555-5555-4555-8555-555555555555";
const verifyHash = "a".repeat(64);
const now = Date.now();
let conversation: string;
let firstIncoming: string;
let workspaceBefore: unknown;

async function one<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  const result = await db.query<T>(sql, params);
  return result.rows[0];
}
async function json<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  return (await one<{ result: T }>(sql, params)).result;
}
const config = (id = connection, phone = "100000001") => ({
  id,
  brandId: "main",
  appId: "200000001",
  accountId: "300000001",
  messagingAccountId: "400000001",
  phoneNumberId: phone,
  displayPhone: "+852 9000 0001",
  encryptedCredentials: {
    version: 1,
    iv: "synthetic",
    ciphertext: "encrypted-test-only",
    tag: "synthetic",
  },
  verifyTokenHash: verifyHash,
});
const inbound = (providerId: string, opts: Record<string, unknown> = {}) => ({
  kind: "message",
  providerId,
  phoneNumberId: "100000001",
  accountId: "300000001",
  identity: {
    kind: "phone",
    id: "85290000001",
    phone: "85290000001",
    bsuid: null,
    parentBsuid: null,
  },
  profileName: "Same display name",
  providerAt: now - 60_000,
  messageType: "text",
  body: "想了解服務",
  replyToProviderId: null,
  referral: null,
  raw: { id: providerId, text: { body: "想了解服務" } },
  ...opts,
});
const status = (
  providerId: string,
  state: string,
  opts: Record<string, unknown> = {},
) => ({
  kind: "status",
  providerId,
  phoneNumberId: "100000001",
  accountId: "300000001",
  status: state,
  providerAt: now,
  recipient: null,
  opaqueCallbackData: null,
  errorCode: null,
  raw: { id: providerId, status: state },
  ...opts,
});
async function ingest(
  events: unknown[],
  envelope: unknown = null,
  id = connection,
) {
  return json<{ inserted: number; duplicates: number; statuses: number }>(
    "select public.sv_wa_ingest($1,$2::jsonb,$3::jsonb) result",
    [
      id,
      JSON.stringify(events),
      envelope === null ? null : JSON.stringify(envelope),
    ],
  );
}
async function conv(id = conversation) {
  return one<{
    id: string;
    revision: number;
    unread_count: number;
    read_seq: number;
    status: string;
    last_inbound_at: number;
    has_ad_referral: boolean;
  }>("select * from public.sv_wa_conversations where id=$1", [id]);
}
async function command(
  kind: string,
  opts: {
    id?: string;
    expected?: number;
    body?: string;
    through?: string;
    actor?: string;
    conversation?: string;
  } = {},
) {
  const cv = await conv(opts.conversation);
  return json<{
    revision: number;
    unread_count: number;
    read_seq: number;
    status: string;
  }>(
    "select public.sv_wa_conversation_command($1,$2,$3,$4,$5,$6,$7,$8) result",
    [
      company,
      opts.actor ?? owner,
      opts.conversation ?? conversation,
      opts.expected ?? cv.revision,
      opts.id ?? randomUUID(),
      kind,
      opts.body ?? null,
      opts.through ?? null,
    ],
  );
}
async function claim(
  opts: {
    id?: string;
    expected?: number;
    body?: string;
    actor?: string;
    company?: string;
    conversation?: string;
    replyTo?: string;
  } = {},
) {
  const cv = await conv(opts.conversation);
  return json<{
    dispatch: boolean;
    connectionId: string;
    remoteId: string;
    remoteKind: string;
    message: {
      id: string;
      state: string;
      provider_id: string | null;
      seq: number;
    };
  }>("select public.sv_wa_claim_send($1,$2,$3,$4,$5,$6,$7) result", [
    opts.company ?? company,
    opts.actor ?? owner,
    opts.conversation ?? conversation,
    opts.expected ?? cv.revision,
    opts.id ?? randomUUID(),
    opts.body ?? "你好，可以幫到你。",
    opts.replyTo ?? null,
  ]);
}
async function finish(
  id: string,
  disposition: string,
  provider: string | null = null,
  error: string | null = null,
) {
  return json<{
    id: string;
    state: string;
    provider_id: string | null;
    error_code: string | null;
  }>("select public.sv_wa_finish_send($1,$2,$3,$4,$5) result", [
    company,
    id,
    disposition,
    provider,
    error,
  ]);
}

before(async () => {
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth,public to authenticated,service_role; grant execute on function auth.uid() to authenticated;",
  );
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.query("insert into auth.users values($1),($2),($3),($4)", [
    owner,
    agent,
    viewer,
    outsider,
  ]);
  await db.exec("set role service_role");
  for (const [id, user, products] of [
    [company, owner, ["crm"]],
    [foreignCompany, outsider, ["crm"]],
    [posCompany, owner, ["pos"]],
  ] as const) {
    const state = createCompanyState({
      companyId: id,
      companyName: "Synthetic database fixture",
      brands: [
        { id: "main", name: "Main", short: "M" },
        { id: "second", name: "Second", short: "S" },
      ],
      team: [{ id: user, name: "Owner", initials: "O" }],
    });
    await db.query(
      "select public.sv_provision_company($1,$2,$3,$4,$5::jsonb,$6::text[])",
      [
        id,
        "Synthetic database fixture",
        user,
        "Owner",
        JSON.stringify(state),
        [...products],
      ],
    );
  }
  await db.query(
    "insert into public.sv_memberships(company_id,user_id,role,display_name) values($1,$2,'agent','Agent'),($1,$3,'viewer','Viewer')",
    [company, agent, viewer],
  );
  workspaceBefore = await one(
    "select revision,payload from public.sv_workspaces where company_id=$1",
    [company],
  );
});
after(async () => {
  await db.close();
});

test("company provisioning seeds six unfinished WhatsApp system cards without duplicating the channel card", async () => {
  const id = randomUUID();
  const state = createCompanyState({
    companyId: id,
    companyName: "Provisioning hook fixture",
    brands: [{ id: "main", name: "Main", short: "M" }],
    team: [{ id: owner, name: "Owner", initials: "O" }],
  });
  await db.query(
    "select public.sv_provision_company($1,$2,$3,$4,$5::jsonb,$6::text[])",
    [
      id,
      "Provisioning hook fixture",
      owner,
      "Owner",
      JSON.stringify(state),
      ["crm"],
    ],
  );
  const cards = (
    await db.query<{ id: string; status: string }>(
      "select id,status from public.sv_system_cards where company_id=$1 and id like 'wa-%' order by id",
      [id],
    )
  ).rows;
  assert.deepEqual(
    cards.map((card) => card.id),
    [
      "wa-app-routing",
      "wa-customer-bridge",
      "wa-live-acceptance",
      "wa-media",
      "wa-operations",
      "wa-templates",
    ],
  );
  assert.equal(
    cards.find((card) => card.id === "wa-live-acceptance")?.status,
    "blocked",
  );
  assert.equal(cards.filter((card) => card.status === "planned").length, 5);
  await db.query("select smartvolt_private.wa_seed_system_cards($1)", [id]);
  assert.equal(
    (
      await one<{ count: number }>(
        "select count(*)::int count from public.sv_system_cards where company_id=$1 and id like 'wa-%'",
        [id],
      )
    ).count,
    6,
  );
  assert.equal(
    (
      await one<{ count: number }>(
        "select count(*)::int count from public.sv_system_cards where company_id=$1 and id='meta-channel'",
        [id],
      )
    ).count,
    1,
  );
});

test("connection setup requires a real company owner, active CRM purchase and owned brand; returns no secrets", async () => {
  const save = (companyId: string, actor: string, value: unknown) =>
    json("select public.sv_wa_save_connection($1,$2,$3::jsonb) result", [
      companyId,
      actor,
      JSON.stringify(value),
    ]);
  await assert.rejects(save(company, agent, config()), /owner_required/);
  await assert.rejects(save(company, outsider, config()), /access_denied/);
  await assert.rejects(
    save(posCompany, owner, config()),
    /product_not_purchased/,
  );
  await assert.rejects(
    save(company, owner, { ...config(), brandId: "foreign-brand" }),
    /brand_missing/,
  );
  const saved = await save(company, owner, config());
  assert.equal(saved.state, "configured");
  assert.equal(saved.encrypted_credentials, undefined);
  assert.equal(saved.verify_token_hash, undefined);
  await assert.rejects(
    save(foreignCompany, outsider, config(foreignConnection, "100000002")),
    /sv_wa_connections_app_identity/,
  );
  await save(foreignCompany, outsider, {
    ...config(foreignConnection, "100000002"),
    appId: "200000002",
  });
  await assert.rejects(
    save(company, owner, config(foreignConnection)),
    /connection_scope/,
  );
  await assert.rejects(
    db.query("select public.sv_wa_verify_webhook($1,$2)", [
      connection,
      "b".repeat(64),
    ]),
    /verification_failed/,
  );
  await db.query("select public.sv_wa_verify_webhook($1,$2)", [
    connection,
    verifyHash,
  ]);
  assert.equal(
    (
      await one("select state from public.sv_wa_connections where id=$1", [
        connection,
      ])
    ).state,
    "configured",
  );
});

test("raw tables and all RPCs deny browser roles, including TRUNCATE; evidence is immutable even for service", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    for (const table of [
      "connections",
      "contacts",
      "conversations",
      "messages",
      "events",
      "commands",
    ])
      await assert.rejects(
        db.exec(`select * from public.sv_wa_${table}`),
        /permission denied/,
      );
    await assert.rejects(
      db.query("select public.sv_wa_ingest($1,'[]'::jsonb)", [connection]),
      /permission denied/,
    );
    await assert.rejects(
      db.exec("truncate public.sv_wa_events"),
      /permission denied/,
    );
  }
  await db.exec("set role service_role");
  await assert.rejects(
    db.exec("truncate public.sv_wa_events"),
    /permission denied/,
  );
  const grants = await one<{ unsafe: number }>(
    "select count(*)::int unsafe from information_schema.role_table_grants where table_name like 'sv_wa_%' and grantee in ('PUBLIC','anon','authenticated')",
  );
  assert.equal(grants.unsafe, 0);
  const funcs = await one<{ unsafe: number }>(
    "select count(*)::int unsafe from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'sv_wa_%' and (p.prosecdef or has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))",
  );
  assert.equal(funcs.unsafe, 0);
});

test("signed incoming message opens normalized conversation, durable sequence and ad badge without inventing consent", async () => {
  const event = inbound("wamid.incoming.1", {
    referral: {
      source_type: "ad",
      ctwa_clid: "private-click-id",
      source_id: "private-ad-id",
    },
  });
  const result = await ingest([event], {
    object: "whatsapp_business_account",
    entries: ["protected original bytes parsed"],
  });
  assert.deepEqual(result, { inserted: 1, duplicates: 0, statuses: 0 });
  const row = await one<{ id: string; conversation_id: string; seq: number }>(
    "select * from public.sv_wa_messages where provider_id='wamid.incoming.1'",
  );
  conversation = row.conversation_id;
  firstIncoming = row.id;
  assert.ok(row.seq > 0);
  const cv = await conv();
  assert.equal(cv.unread_count, 1);
  assert.equal(cv.last_inbound_at, now - 60_000);
  assert.equal(cv.has_ad_referral, true);
  assert.equal(
    (
      await one("select state from public.sv_wa_connections where id=$1", [
        connection,
      ])
    ).state,
    "active",
  );
  assert.equal(
    (
      await one<{ payload: { referral: { ctwa_clid: string } } }>(
        "select payload from public.sv_wa_events where kind='message' and provider_id='wamid.incoming.1'",
      )
    ).payload.referral.ctwa_clid,
    "private-click-id",
  );
  assert.deepEqual(
    await one(
      "select revision,payload from public.sv_workspaces where company_id=$1",
      [company],
    ),
    workspaceBefore,
  );
  const repeat = await ingest([event]);
  assert.deepEqual(repeat, { inserted: 0, duplicates: 1, statuses: 0 });
  assert.equal((await conv()).unread_count, 1);
});

test("mismatched account/phone and future timestamps reject the entire batch including evidence", async () => {
  const before = await one(
    "select count(*)::int total from public.sv_wa_events",
  );
  for (const bad of [
    inbound("invalid.phone", { phoneNumberId: "999999999" }),
    inbound("invalid.account", { accountId: "999999999" }),
    inbound("invalid.time", { providerAt: now + 600_000 }),
  ]) {
    await assert.rejects(
      ingest([inbound(`would-rollback-${randomUUID()}`), bad], {
        batch: "must roll back",
      }),
      /invalid_provider_/,
    );
    assert.deepEqual(
      await one("select count(*)::int total from public.sv_wa_events"),
      before,
    );
  }
  assert.equal((await conv()).unread_count, 1);
});

test("BSUID contacts remain separate despite identical names; optional messaging account is scoped", async () => {
  await ingest([
    inbound("wamid.bsuid.1", {
      accountId: "400000001",
      identity: {
        kind: "bsuid",
        id: "US.synthetic-one",
        phone: null,
        bsuid: "US.synthetic-one",
        parentBsuid: null,
      },
    }),
    inbound("wamid.bsuid.2", {
      identity: {
        kind: "bsuid",
        id: "US.synthetic-two",
        phone: null,
        bsuid: "US.synthetic-two",
        parentBsuid: null,
      },
      messageType: "image",
      body: "[圖片；暫未支援預覽]",
      raw: { type: "image", image: { id: "private-media-id" } },
    }),
  ]);
  const rows = (
    await db.query<{ id: string; contact_id: string; remote_kind: string }>(
      "select * from public.sv_wa_conversations where remote_kind='bsuid' order by remote_id",
    )
  ).rows;
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].contact_id, rows[1].contact_id);
  const send = await claim({ conversation: rows[0].id });
  assert.equal(send.remoteKind, "bsuid");
  assert.equal(send.remoteId, "US.synthetic-one");
  assert.equal(
    (
      await one("select phone from public.sv_wa_contacts where id=$1", [
        rows[0].contact_id,
      ])
    ).phone,
    null,
  );
});

test("claim durably records one send, replays without redispatch and rejects stale, changed, viewer and cross-company claims", async () => {
  await assert.rejects(claim({ actor: viewer }), /access_denied/);
  await assert.rejects(claim({ actor: outsider }), /access_denied/);
  await assert.rejects(
    claim({ company: foreignCompany, actor: outsider }),
    /conversation_missing/,
  );
  await assert.rejects(claim({ expected: -1 }), /revision_conflict/);
  const id = randomUUID();
  const expected = (await conv()).revision;
  const first = await claim({
    id,
    expected,
    actor: agent,
    replyTo: firstIncoming,
  });
  assert.equal(first.dispatch, true);
  assert.equal(first.message.state, "dispatching");
  assert.equal(first.message.provider_id, null);
  const replay = await claim({
    id,
    expected,
    actor: agent,
    replyTo: firstIncoming,
  });
  assert.equal(replay.dispatch, false);
  assert.equal(replay.message.id, first.message.id);
  await assert.rejects(
    claim({ id, body: "changed", actor: agent }),
    /idempotency_conflict/,
  );
  await assert.rejects(
    command("note", { id, body: "same UUID different kind", actor: agent }),
    /idempotency_conflict/,
  );
  assert.equal(
    (
      await one<{ count: number }>(
        "select count(*)::int count from public.sv_wa_messages where client_id=$1",
        [id],
      )
    ).count,
    1,
  );
  await db.query(
    "update public.sv_memberships set status='suspended' where company_id=$1 and user_id=$2",
    [company, agent],
  );
  await assert.rejects(
    claim({ id, expected, actor: agent, replyTo: firstIncoming }),
    /access_denied/,
  );
  await db.query(
    "update public.sv_memberships set status='active' where company_id=$1 and user_id=$2",
    [company, agent],
  );
});

test("ambiguous response never resends; signed callback reconciles provider ID and receipt order survives HTTP completion", async () => {
  const id = randomUUID();
  const claimed = await claim({ id });
  assert.equal(
    (await finish(claimed.message.id, "ambiguous", null, "timeout")).state,
    "unknown",
  );
  assert.equal((await claim({ id })).dispatch, false);
  await ingest([
    status("wamid.outbound.reconciled", "read", {
      opaqueCallbackData: claimed.message.id,
    }),
  ]);
  const late = await finish(
    claimed.message.id,
    "accepted",
    "wamid.outbound.reconciled",
  );
  assert.equal(late.state, "read");
  assert.equal(late.provider_id, "wamid.outbound.reconciled");
  await ingest([
    status("wamid.outbound.reconciled", "sent", { providerAt: now - 5000 }),
    status("wamid.outbound.reconciled", "failed", { errorCode: 131026 }),
  ]);
  assert.equal(
    (await finish(claimed.message.id, "definitive", null, "network-error"))
      .state,
    "read",
  );
  await assert.rejects(
    finish(claimed.message.id, "accepted", "different-provider-id"),
    /provider_id_conflict/,
  );
  const other = await claim();
  assert.equal(
    (await finish(other.message.id, "accepted", "wamid.receipts.2")).state,
    "accepted",
  );
  await ingest([
    status("wamid.receipts.2", "sent", { providerAt: now - 4000 }),
    status("wamid.receipts.2", "failed", {
      providerAt: now - 5000,
      errorCode: 7,
    }),
  ]);
  assert.equal(
    (
      await one("select state from public.sv_wa_messages where id=$1", [
        other.message.id,
      ])
    ).state,
    "sent",
  );
  await ingest([
    status("wamid.receipts.2", "failed", {
      providerAt: now - 3000,
      errorCode: 8,
    }),
    status("wamid.receipts.2", "sent", { providerAt: now - 4500 }),
  ]);
  assert.equal(
    (
      await one("select state from public.sv_wa_messages where id=$1", [
        other.message.id,
      ])
    ).state,
    "failed",
  );
  assert.equal(
    (
      await one("select error_code from public.sv_wa_messages where id=$1", [
        other.message.id,
      ])
    ).error_code,
    "8",
  );
  const beforeResponse = await claim();
  await ingest([status("wamid.early-without-callback", "delivered")]);
  assert.equal(
    (
      await finish(
        beforeResponse.message.id,
        "accepted",
        "wamid.early-without-callback",
      )
    ).state,
    "delivered",
  );
  await ingest([
    status("wamid.receipts.2", "delivered", { providerAt: now - 2000 }),
  ]);
  assert.equal(
    (
      await one("select state from public.sv_wa_messages where id=$1", [
        other.message.id,
      ])
    ).state,
    "delivered",
  );
});

test("read uses displayed sequence horizon; a newer inbound remains unread; note/resolve/reopen commands are idempotent", async () => {
  await ingest([inbound("wamid.incoming.newer", { providerAt: now - 1000 })]);
  const id = randomUUID();
  const expected = (await conv()).revision;
  const read = await command("read", { id, expected, through: firstIncoming });
  assert.equal(read.unread_count, 1);
  const retry = await command("read", { id, expected, through: firstIncoming });
  assert.equal(retry.revision, read.revision);
  await assert.rejects(command("resolve", { expected }), /revision_conflict/);
  const noteId = randomUUID();
  const note = await command("note", { id: noteId, body: "內部筆記" });
  assert.equal(
    (await command("note", { id: noteId, expected: 0, body: "內部筆記" }))
      .revision,
    note.revision,
  );
  assert.equal(
    (
      await one<{ count: number }>(
        "select count(*)::int count from public.sv_wa_messages where client_id=$1 and direction='note'",
        [noteId],
      )
    ).count,
    1,
  );
  assert.equal((await command("resolve")).status, "resolved");
  // A replay is not a new user contact and must not reopen a resolved conversation.
  await ingest([inbound("wamid.incoming.newer", { providerAt: now - 1000 })]);
  assert.equal((await conv()).status, "resolved");
  await ingest([
    inbound("wamid.incoming.old", { providerAt: now - 86_400_000 * 3 }),
  ]);
  assert.equal((await conv()).status, "open");
  assert.equal((await conv()).last_inbound_at, now - 1000);
  assert.equal((await conv()).has_ad_referral, true);
});

test("24-hour window uses genuine incoming provider time, never receipt time or delayed replay", async () => {
  await ingest([
    inbound("wamid.expired.in", {
      identity: { kind: "phone", id: "85290000009", phone: "85290000009" },
      providerAt: now - 86_400_000 - 10_000,
    }),
  ]);
  const old = await one<{ id: string }>(
    "select id from public.sv_wa_conversations where remote_id='85290000009'",
  );
  await ingest([status("wamid.unknown.receipt", "read", { providerAt: now })]);
  await assert.rejects(claim({ conversation: old.id }), /reply_window_closed/);
  await db.query(
    "update public.sv_company_products set status='suspended' where company_id=$1 and product='crm'",
    [company],
  );
  await assert.rejects(claim(), /product_not_purchased/);
  await assert.rejects(
    command("note", { body: "blocked" }),
    /product_not_purchased/,
  );
  await assert.rejects(
    ingest([inbound("wamid.blocked")]),
    /product_not_purchased/,
  );
  await db.query(
    "update public.sv_company_products set status='active' where company_id=$1 and product='crm'",
    [company],
  );
});

test("composite foreign keys block tenant splicing; service and owner cannot rewrite evidence; no default grant bypass", async () => {
  await assert.rejects(
    db.query(
      "update public.sv_wa_conversations set company_id=$1 where id=$2",
      [foreignCompany, conversation],
    ),
    /foreign key/,
  );
  await assert.rejects(
    db.query("update public.sv_wa_messages set connection_id=$1 where id=$2", [
      foreignConnection,
      firstIncoming,
    ]),
    /foreign key/,
  );
  await assert.rejects(
    db.exec("update public.sv_wa_events set payload='{}'::jsonb"),
    /permission denied/,
  );
  await db.exec("reset role");
  await assert.rejects(
    db.exec("update public.sv_wa_events set payload='{}'::jsonb"),
    /whatsapp_evidence_immutable/,
  );
  await assert.rejects(
    db.exec("delete from public.sv_wa_commands"),
    /whatsapp_evidence_immutable/,
  );
  await assert.rejects(
    db.exec("truncate public.sv_wa_events"),
    /whatsapp_evidence_immutable/,
  );
  await db.exec("set role service_role");
  assert.deepEqual(
    await one(
      "select revision,payload from public.sv_workspaces where company_id=$1",
      [company],
    ),
    workspaceBefore,
  );
});

test("connection credentials rotate to configured and invalidate readiness; existing identity cannot be moved", async () => {
  await assert.rejects(
    json("select public.sv_wa_save_connection($1,$2,$3::jsonb) result", [
      company,
      owner,
      JSON.stringify({ ...config(), brandId: "second" }),
    ]),
    /connection_identity_in_use/,
  );
  const saved = await json(
    "select public.sv_wa_save_connection($1,$2,$3::jsonb) result",
    [
      company,
      owner,
      JSON.stringify({
        ...config(),
        encryptedCredentials: { version: 1, ciphertext: "rotated-synthetic" },
      }),
    ],
  );
  assert.equal(saved.state, "configured");
  assert.equal(saved.webhook_verified_at, null);
  await assert.rejects(claim(), /connection_not_ready/);
  await db.query("select public.sv_wa_verify_webhook($1,$2)", [
    connection,
    verifyHash,
  ]);
  await assert.rejects(claim(), /connection_not_ready/);
  await ingest([inbound("wamid.after.rotation", { providerAt: now })]);
  assert.equal((await claim()).dispatch, true);
});
