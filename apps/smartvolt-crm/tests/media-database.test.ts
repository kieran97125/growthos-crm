import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createCompanyState } from "../src/lib/saas/workspace";
import { parseEvents } from "../src/lib/meta/protocol";
const db = new PGlite(),
  owner = randomUUID(),
  agent = randomUUID(),
  viewer = randomUUID(),
  outsider = randomUUID();
const val = async <T = Record<string, unknown>>(
  sql: string,
  args: unknown[] = [],
): Promise<T> => (await db.query<{ v: T }>(sql, args)).rows[0]?.v;
const rpc = <T = Record<string, unknown>>(name: string, args: unknown[]) =>
  val<T>(
    "select public." +
      name +
      "(" +
      args.map((_, i) => "$" + (i + 1)).join(",") +
      ")v",
    args,
  );
type Claim = { dispatch: boolean; message: { id: string; state: string } };
async function fixture(source: "whatsapp" | "meta" = "whatsapp") {
  const company = randomUUID(),
    connection = randomUUID(),
    unique = String(Math.floor(Math.random() * 1e12) + 10000),
    peer = "85290000001",
    now = Date.now();
  const state = createCompanyState({
    companyId: company,
    companyName: "Synthetic",
    brands: [
      { id: "main", name: "Main", short: "M" },
      { id: "other", name: "Other", short: "O" },
    ],
    team: [
      { id: owner, name: "Owner", initials: "O" },
      { id: agent, name: "Agent", initials: "A" },
    ],
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
    "insert into public.sv_memberships(company_id,user_id,role,display_name)values($1,$2,'agent','Agent'),($1,$3,'viewer','Viewer')",
    [company, agent, viewer],
  );
  let thread: string, message: string;
  if (source === "whatsapp") {
    await rpc("sv_wa_save_connection", [
      company,
      owner,
      JSON.stringify({
        id: connection,
        brandId: "main",
        appId: unique,
        accountId: unique,
        phoneNumberId: unique,
        displayPhone: "+852 9000 0001",
        encryptedCredentials: {
          version: 1,
          iv: "synthetic",
          ciphertext: "synthetic",
          tag: "synthetic",
        },
        verifyTokenHash: "a".repeat(64),
      }),
    ]);
    await rpc("sv_wa_verify_webhook", [connection, "a".repeat(64)]);
    await rpc("sv_wa_ingest", [
      connection,
      JSON.stringify([
        {
          kind: "message",
          providerId: "in-" + unique,
          phoneNumberId: unique,
          accountId: unique,
          identity: {
            kind: "phone",
            id: peer,
            phone: peer,
            bsuid: null,
            parentBsuid: null,
          },
          profileName: "Synthetic",
          providerAt: now,
          messageType: "image",
          body: "［圖片訊息］",
          replyToProviderId: null,
          referral: null,
          raw: { type: "image", image: { id: unique, mime_type: "image/png" } },
        },
      ]),
      null,
    ]);
    thread = await val<string>(
      "select id v from public.sv_wa_conversations where company_id=$1",
      [company],
    );
    message = await val<string>(
      "select id v from public.sv_wa_messages where company_id=$1",
      [company],
    );
  } else {
    await rpc("sv_meta_save", [
      company,
      owner,
      JSON.stringify({
        id: connection,
        brandId: "main",
        channel: "messenger",
        appId: unique,
        pageId: unique,
        accountId: unique,
        label: "Synthetic",
        credentials: { version: 1, ciphertext: "synthetic" },
      }),
    ]);
    const events = parseEvents(
      {
        object: "page",
        entry: [
          {
            id: unique,
            messaging: [
              {
                sender: { id: "20001" },
                recipient: { id: unique },
                timestamp: now,
                message: {
                  mid: "in-" + unique,
                  attachments: [
                    {
                      type: "image",
                      payload: { url: "https://lookaside.fbsbx.com/synthetic" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      now,
    );
    await rpc("sv_meta_ingest", [connection, JSON.stringify(events)]);
    thread = await val<string>(
      "select id v from public.sv_meta_threads where company_id=$1",
      [company],
    );
    message = await val<string>(
      "select id v from public.sv_meta_messages where company_id=$1",
      [company],
    );
  }
  return { company, connection, thread, message, source };
}
type F = Awaited<ReturnType<typeof fixture>>;
function data(f: F) {
  return {
    brandId: "main",
    source: f.source,
    sourceId: f.thread,
    filename: "資料.pdf",
    bytes: 99,
    mimeType: "application/pdf",
  };
}
async function asset(f: F, id = randomUUID(), actor = owner) {
  await rpc("sv_media_reserve", [
    f.company,
    actor,
    id,
    JSON.stringify(data(f)),
  ]);
  await rpc("sv_media_verify", [
    f.company,
    actor,
    id,
    JSON.stringify({
      kind: "document",
      mimeType: "application/pdf",
      bytes: 99,
      contentHash: "a".repeat(64),
    }),
  ]);
  return id;
}
async function revision(f: F) {
  return val<number>(
    "select revision::integer v from public." +
      (f.source === "whatsapp" ? "sv_wa_conversations" : "sv_meta_threads") +
      " where company_id=$1 and id=$2",
    [f.company, f.thread],
  );
}
async function editor(f: F, actor = owner) {
  const token = randomUUID();
  await rpc("sv_editor_action", [
    f.company,
    actor,
    f.source,
    f.thread,
    token,
    "acquire",
    null,
  ]);
  return token;
}
async function claim(
  f: F,
  id: string,
  client = randomUUID(),
  actor = owner,
  token: string | null = null,
  caption = "",
  expected?: number,
) {
  return rpc<Claim>("sv_media_claim", [
    f.company,
    actor,
    id,
    client,
    expected ?? (await revision(f)),
    caption,
    token,
  ]);
}
before(async () => {
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to service_role,authenticated;alter default privileges in schema public grant all on tables to service_role;",
  );
  for (const f of readdirSync("supabase/migrations")
    .filter(
      (f) =>
        f.endsWith(".sql") &&
        (f <= "20261115144827_convelta_dynamic_segments.sql" ||
          f.endsWith("_convelta_private_media.sql")),
    )
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  await db.query("insert into auth.users values($1),($2),($3),($4)", [
    owner,
    agent,
    viewer,
    outsider,
  ]);
  await db.exec("set role service_role");
});
after(() => db.close());
test("media storage is server-only, RLS enabled and receipt rewrite forbidden", async () => {
  for (const table of ["sv_media_assets", "sv_media_commands"]) {
    assert.equal(
      await val<boolean>(
        "select relrowsecurity v from pg_class where oid=('public.'||$1)::regclass",
        [table],
      ),
      true,
    );
    assert.equal(
      await val<boolean>(
        "select has_table_privilege('anon','public.'||$1,'select')or has_table_privilege('authenticated','public.'||$1,'select')v",
        [table],
      ),
      false,
    );
  }
  assert.equal(
    await val<boolean>(
      "select has_function_privilege('anon','public.sv_media_claim(uuid,uuid,uuid,uuid,bigint,text,uuid)','execute')v",
    ),
    false,
  );
});
test("upload reservations enforce company, brand, product, source and write role", async () => {
  const f = await fixture();
  for (const actor of [viewer, outsider])
    await assert.rejects(
      () =>
        rpc("sv_media_reserve", [
          f.company,
          actor,
          randomUUID(),
          JSON.stringify(data(f)),
        ]),
      /access_denied/,
    );
  await assert.rejects(
    () =>
      rpc("sv_media_reserve", [
        f.company,
        owner,
        randomUUID(),
        JSON.stringify({ ...data(f), brandId: "other" }),
      ]),
    /source_missing/,
  );
  const other = await fixture();
  await assert.rejects(
    () =>
      rpc("sv_media_reserve", [
        other.company,
        owner,
        randomUUID(),
        JSON.stringify(data(f)),
      ]),
    /scope|missing/,
  );
  await db.query(
    "update public.sv_company_products set status='suspended'where company_id=$1",
    [f.company],
  );
  await assert.rejects(
    () => asset(f),
    /product_required|product_not_purchased/,
  );
});
test("upload replay binds exact actor, thread, filename and declared bytes", async () => {
  const f = await fixture(),
    id = randomUUID();
  await rpc("sv_media_reserve", [
    f.company,
    owner,
    id,
    JSON.stringify(data(f)),
  ]);
  await rpc("sv_media_reserve", [
    f.company,
    owner,
    id,
    JSON.stringify(data(f)),
  ]);
  await assert.rejects(
    () =>
      rpc("sv_media_reserve", [f.company, agent, id, JSON.stringify(data(f))]),
    /idempotency/,
  );
  await assert.rejects(
    () =>
      rpc("sv_media_reserve", [
        f.company,
        owner,
        id,
        JSON.stringify({ ...data(f), bytes: 100 }),
      ]),
    /idempotency/,
  );
  assert.equal(
    await val<number>(
      "select count(*)::integer v from public.sv_media_assets where company_id=$1",
      [f.company],
    ),
    1,
  );
});
test("unverified, wrong-size, cancelled and expired uploads cannot be sent", async () => {
  const f = await fixture(),
    id = randomUUID();
  await rpc("sv_media_reserve", [
    f.company,
    owner,
    id,
    JSON.stringify(data(f)),
  ]);
  await assert.rejects(() => claim(f, id), /not_ready/);
  await assert.rejects(
    () =>
      rpc("sv_media_verify", [
        f.company,
        owner,
        id,
        JSON.stringify({
          kind: "document",
          mimeType: "application/pdf",
          bytes: 100,
          contentHash: "a".repeat(64),
        }),
      ]),
    /size_changed/,
  );
  await rpc("sv_media_cancel", [f.company, owner, id]);
  await assert.rejects(
    () =>
      rpc("sv_media_verify", [
        f.company,
        owner,
        id,
        JSON.stringify({
          kind: "document",
          mimeType: "application/pdf",
          bytes: 99,
          contentHash: "a".repeat(64),
        }),
      ]),
    /expired/,
  );
  const ready = await asset(f);
  await db.query(
    "update public.sv_media_assets set expires_at=now()-interval'1 second'where company_id=$1 and id=$2",
    [f.company, ready],
  );
  await assert.rejects(() => claim(f, ready), /not_ready/);
});
test("verified attachment bytes and lineage cannot be rewritten or deleted", async () => {
  const f = await fixture(),
    id = await asset(f);
  await assert.rejects(
    () =>
      db.query(
        "update public.sv_media_assets set content_hash=$3 where company_id=$1 and id=$2",
        [f.company, id, "b".repeat(64)],
      ),
    /immutable/,
  );
  await assert.rejects(
    () =>
      db.query(
        "delete from public.sv_media_assets where company_id=$1 and id=$2",
        [f.company, id],
      ),
    /permission denied|immutable/,
  );
});
for (const source of ["whatsapp", "meta"] as const)
  test(`${source} media send preserves lease, revision, single claim and unknown-result replay`, async () => {
    const f = await fixture(source),
      id = await asset(f),
      token = await editor(f),
      client = randomUUID();
    await assert.rejects(
      () => claim(f, id, randomUUID(), owner, randomUUID()),
      /editor_conflict/,
    );
    await assert.rejects(
      () => claim(f, id, randomUUID(), owner, token, "", 999),
      /revision_conflict/,
    );
    const first = await claim(f, id, client, owner, token);
    assert.equal(first.dispatch, true);
    const replay = await claim(f, id, client, owner, token);
    assert.equal(replay.dispatch, false);
    assert.equal(replay.message.id, first.message.id);
    if (source === "whatsapp")
      await rpc("sv_wa_finish_send", [
        f.company,
        first.message.id,
        "ambiguous",
        null,
        "delivery_unknown",
      ]);
    else
      await rpc("sv_meta_finish", [
        f.company,
        first.message.id,
        "uncertain",
        null,
        "provider_unreachable",
      ]);
    assert.equal((await claim(f, id, client, owner, token)).dispatch, false);
    await assert.rejects(
      () => claim(f, id, randomUUID(), owner, token),
      /unresolved/,
    );
    await assert.rejects(
      () => claim(f, id, client, owner, token, "changed"),
      /idempotency/,
    );
    await assert.rejects(
      () => rpc("sv_media_cancel", [f.company, owner, id]),
      /already_sent/,
    );
  });
test("media claim cannot attach an asset to an earlier text receipt", async () => {
  const f = await fixture(),
    id = await asset(f),
    client = randomUUID();
  await rpc("sv_wa_claim_send", [
    f.company,
    owner,
    f.thread,
    await revision(f),
    client,
    "[附件] 資料.pdf",
    null,
    null,
  ]);
  await assert.rejects(() => claim(f, id, client), /idempotency/);
  assert.equal(
    await val<number>(
      "select count(*)::integer v from public.sv_media_commands where company_id=$1",
      [f.company],
    ),
    0,
  );
});
test("provider media caching requires an actual exact source message and attachment index", async () => {
  const f = await fixture("meta"),
    id = randomUUID(),
    n = {
      ...data(f),
      messageId: f.message,
      index: 0,
      filename: "圖片.png",
      kind: "image",
      mimeType: "image/png",
      bytes: 99,
      contentHash: "a".repeat(64),
    };
  await rpc("sv_media_native", [f.company, viewer, id, JSON.stringify(n)]);
  await assert.rejects(
    () =>
      rpc("sv_media_native", [
        f.company,
        owner,
        randomUUID(),
        JSON.stringify({ ...n, messageId: randomUUID() }),
      ]),
    /source_missing/,
  );
  await assert.rejects(
    () =>
      rpc("sv_media_native", [
        f.company,
        owner,
        randomUUID(),
        JSON.stringify({ ...n, index: 1 }),
      ]),
    /source_missing/,
  );
  await assert.rejects(
    () =>
      rpc("sv_media_native", [
        f.company,
        owner,
        randomUUID(),
        JSON.stringify({ ...n, contentHash: "b".repeat(64) }),
      ]),
    /source_changed/,
  );
});
test("private cleanup cancels abandoned uploads but retains all sent or unknown evidence", async () => {
  const f = await fixture(),
    sent = await asset(f),
    unused = await asset(f),
    token = await editor(f),
    c = await claim(f, sent, randomUUID(), owner, token);
  await rpc("sv_wa_finish_send", [
    f.company,
    c.message.id,
    "ambiguous",
    null,
    "delivery_unknown",
  ]);
  await db.query(
    "update public.sv_media_assets set expires_at=now()-interval'1 hour'where company_id=$1",
    [f.company],
  );
  const batch = await rpc<{ id: string; objectPath: string }[]>(
    "sv_media_expire",
    [f.company],
  );
  assert.deepEqual(
    batch.map((x) => x.id),
    [unused],
  );
  assert.equal(
    await val<string>(
      "select state v from public.sv_media_assets where company_id=$1 and id=$2",
      [f.company, sent],
    ),
    "ready",
  );
  await rpc("sv_media_cleanup_ack", [f.company, [unused]]);
  assert.deepEqual(await rpc("sv_media_expire", [f.company]), []);
  await assert.rejects(() => claim(f, unused), /not_ready/);
});
test("per-company upload admission bounds storage abuse even when cancelled", async () => {
  const f = await fixture();
  for (let i = 0; i < 10; i++) {
    const id = randomUUID();
    await rpc("sv_media_reserve", [
      f.company,
      owner,
      id,
      JSON.stringify({ ...data(f), bytes: 25 * 1024 * 1024 }),
    ]);
    await rpc("sv_media_cancel", [f.company, owner, id]);
  }
  await assert.rejects(
    () =>
      rpc("sv_media_reserve", [
        f.company,
        owner,
        randomUUID(),
        JSON.stringify({ ...data(f), bytes: 25 * 1024 * 1024 }),
      ]),
    /upload_limit/,
  );
});

test("cancelled upload cleanup waits for the last signed-upload window before final ack", async () => {
  const f = await fixture(),
    id = randomUUID();
  await rpc("sv_media_reserve", [
    f.company,
    owner,
    id,
    JSON.stringify(data(f)),
  ]);
  await rpc("sv_media_cancel", [f.company, owner, id]);
  assert.deepEqual(await rpc("sv_media_expire", [f.company]), []);
  await rpc("sv_media_cleanup_ack", [f.company, [id]]);
  assert.equal(
    await val(
      "select cleaned_at v from public.sv_media_assets where company_id=$1 and id=$2",
      [f.company, id],
    ),
    null,
  );
  // Model elapsed provider-token time without any actual upload/token request.
  await db.exec("reset role");
  await db.query(
    "alter table public.sv_media_assets disable trigger sv_media_asset_guard",
  );
  await db.query(
    "update public.sv_media_assets set expires_at=now()-interval'1 second'where company_id=$1 and id=$2",
    [f.company, id],
  );
  await db.query(
    "alter table public.sv_media_assets enable trigger sv_media_asset_guard",
  );
  await db.exec("set role service_role");
  assert.deepEqual(
    (await rpc<{ id: string }[]>("sv_media_expire", [f.company])).map(
      (x) => x.id,
    ),
    [id],
  );
  await rpc("sv_media_cleanup_ack", [f.company, [id]]);
  assert.deepEqual(await rpc("sv_media_expire", [f.company]), []);
});

test("pending private uploads cannot be claimed by another authorized colleague", async () => {
  const f = await fixture(),
    id = await asset(f),
    token = await editor(f, agent);
  await assert.rejects(
    () => claim(f, id, randomUUID(), agent, token),
    /not_ready/,
  );
  assert.equal(
    await val<number>(
      "select count(*)::integer v from public.sv_media_commands where company_id=$1",
      [f.company],
    ),
    0,
  );
});
