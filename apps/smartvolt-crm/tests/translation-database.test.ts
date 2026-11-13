import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { createCompanyState } from "../src/lib/saas/workspace";
const db = new PGlite();
const company = randomUUID(),
  foreign = randomUUID(),
  pos = randomUUID(),
  owner = randomUUID(),
  agent = randomUUID(),
  viewer = randomUUID(),
  outsider = randomUUID();
const meta = randomUUID(),
  wa = randomUUID(),
  mc = randomUUID(),
  wc = randomUUID(),
  wp = randomUUID(),
  mm = randomUUID(),
  wm = randomUUID(),
  media = randomUUID();
const incoming = {
  mode: "message",
  source: "conversation",
  threadId: "c1",
  brandId: "main",
  messageId: "m1",
  target: "en",
};
function draft(text = "想約星期六") {
  return {
    mode: "draft",
    source: "conversation",
    threadId: "c1",
    brandId: "main",
    text,
    target: "en",
  };
}
async function one(sql: string, p: unknown[] = []) {
  return (await db.query<Record<string, unknown>>(sql, p)).rows[0];
}
type Receipt = {
  dispatch: boolean;
  status: string;
  result?: { text: string; target: string; requestId: string };
  error_code?: string;
  sourceText?: string;
};
async function claim(
  data: object = draft(),
  id = randomUUID(),
  actor = owner,
  target = company,
) {
  return (
    await one("select sv_translation_claim($1,$2,$3,$4::jsonb,$5,$6)v", [
      target,
      actor,
      id,
      JSON.stringify(data),
      "synthetic/model",
      createHash("sha256").update(JSON.stringify(data)).digest("hex"),
    ])
  ).v as Receipt;
}
async function finish(
  id: string,
  actor = owner,
  text = "I would like to book Saturday.",
  target = company,
) {
  return (
    await one("select sv_translation_finish($1,$2,$3,$4::jsonb,null,120,30)v", [
      target,
      actor,
      id,
      JSON.stringify({ requestId: id, target: "en", text }),
    ])
  ).v as Receipt;
}
before(async () => {
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to service_role,authenticated;alter default privileges in schema public grant all on tables to service_role;",
  );
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  for (const u of [owner, agent, viewer, outsider])
    await db.query("insert into auth.users values($1)", [u]);
  await db.exec("set role service_role");
  for (const [id, u, products] of [
    [company, owner, ["crm"]],
    [foreign, outsider, ["crm"]],
    [pos, owner, ["pos"]],
  ] as const) {
    const s = createCompanyState({
      companyId: id,
      companyName: "Synthetic",
      brands: [{ id: "main", name: "Synthetic", short: "S" }],
      team: [{ id: u, name: "Owner", initials: "O" }],
    });
    s.inbox.contacts.push({
      id: "customer1",
      clientId: id,
      name: "Synthetic",
      initials: "S",
      phone: "",
      email: "",
      company: "",
      tags: [],
      source: "synthetic",
      createdAt: Date.now(),
      note: "",
      brandIds: ["main"],
    });
    s.inbox.conversations.push({
      id: "c1",
      clientId: id,
      brandId: "main",
      contactId: "customer1",
      channel: "whatsapp",
      status: "open",
      owner: null,
      priority: false,
      pinned: false,
      unread: 1,
      snoozedUntil: null,
      subject: "Synthetic",
      updatedAt: Date.now(),
    });
    s.inbox.messages.push(
      {
        id: "m1",
        conversationId: "c1",
        kind: "incoming",
        body: "想約星期六，HK$200 嗎？",
        author: "Synthetic",
        at: Date.now(),
        replyTo: null,
      },
      {
        id: "n1",
        conversationId: "c1",
        kind: "note",
        body: "private note",
        author: "Owner",
        at: Date.now(),
        replyTo: null,
      },
    );
    await db.query(
      "select sv_provision_company($1,'Synthetic',$2,'Owner',$3::jsonb,$4::text[])",
      [id, u, JSON.stringify(s), [...products]],
    );
  }
  await db.query(
    "insert into sv_memberships(company_id,user_id,role,display_name)values($1,$2,'agent','Agent'),($1,$3,'viewer','Viewer')",
    [company, agent, viewer],
  );
  await db.query("select sv_meta_save($1,$2,$3::jsonb)", [
    company,
    owner,
    JSON.stringify({
      id: mc,
      brandId: "main",
      channel: "messenger",
      appId: "90001",
      pageId: "10001",
      accountId: "10001",
      label: "Synthetic",
      credentials: { test: true },
    }),
  ]);
  await db.query(
    "insert into sv_meta_threads(id,company_id,connection_id,peer_id,last_inbound_at)values($1,$2,$3,'20001',0)",
    [meta, company, mc],
  );
  await db.query(
    "insert into sv_meta_messages(id,company_id,thread_id,direction,body,state)values($1,$2,$3,'inbound','Can I book Saturday?','received')",
    [mm, company, meta],
  );
  await db.query(
    "insert into sv_wa_connections(id,company_id,brand_id,app_id,account_id,phone_number_id,encrypted_credentials,verify_token_hash,state,webhook_verified_at)values($1,$2,'main','99999','88888','77777','{\"test\":true}',repeat('a',64),'active',now())",
    [wc, company],
  );
  await db.query(
    "insert into sv_wa_contacts(id,company_id,display_name,phone)values($1,$2,'Synthetic','85260000000')",
    [wp, company],
  );
  await db.query(
    "insert into sv_wa_conversations(id,company_id,connection_id,contact_id,brand_id,remote_id,remote_kind,last_message_at,last_inbound_at)values($1,$2,$3,$4,'main','85260000000','phone',0,0)",
    [wa, company, wc, wp],
  );
  for (const [id, type] of [
    [wm, "text"],
    [media, "image"],
  ])
    await db.query(
      "insert into sv_wa_messages(id,company_id,connection_id,conversation_id,provider_id,fingerprint,direction,body,message_type,provider_at,author_name,state)values($1,$2,$3,$4,$1::uuid::text,repeat('a',64),'incoming','Can I book Saturday?',$5,0,'Synthetic','accepted')",
      [id, company, wc, wa, type],
    );
  await db.query("select sv_ai_configure($1,$2,true)", [company, owner]);
  await db.query("select sv_ai_configure($1,$2,true)", [foreign, outsider]);
});
after(() => db.close());
test("translation requires an active CRM writer and validates company, brand, conversation and original message", async () => {
  for (const actor of [viewer, outsider])
    await assert.rejects(
      () => claim(draft(), randomUUID(), actor),
      /ai_access_denied/,
    );
  await assert.rejects(
    () => claim(draft(), randomUUID(), owner, foreign),
    /ai_access_denied/,
  );
  await assert.rejects(
    () => claim(draft(), randomUUID(), owner, pos),
    /ai_product_required/,
  );
  await assert.rejects(
    () => claim({ ...draft(), brandId: "foreign" }),
    /ai_brand_scope/,
  );
  await assert.rejects(
    () => claim({ ...draft(), threadId: "foreign" }),
    /ai_conversation_scope/,
  );
  await assert.rejects(
    () => claim({ ...incoming, messageId: "n1" }),
    /translation_source/,
  );
  await assert.rejects(
    () => claim({ ...incoming, text: "forged customer source" }),
    /ai_invalid/,
  );
  const id = randomUUID();
  assert.equal((await claim(draft(), id, agent)).dispatch, true);
  await finish(id, agent);
});
test("all three inbox sources resolve the exact incoming text; wrong thread, media and unknown messages cannot be translated", async () => {
  for (const [source, threadId, messageId, expected] of [
    ["conversation", "c1", "m1", "想約星期六，HK$200 嗎？"],
    ["meta", meta, mm, "Can I book Saturday?"],
    ["whatsapp", wa, wm, "Can I book Saturday?"],
  ] as const) {
    const id = randomUUID(),
      data = { ...incoming, source, threadId, messageId };
    const result = await claim(data, id);
    assert.equal(result.dispatch, true);
    assert.equal(result.sourceText, expected);
    await finish(id);
  }
  await assert.rejects(
    () =>
      claim({
        ...incoming,
        source: "whatsapp",
        threadId: wa,
        messageId: media,
      }),
    /translation_source/,
  );
  await assert.rejects(
    () =>
      claim({ ...incoming, source: "whatsapp", threadId: wa, messageId: mm }),
    /translation_source/,
  );
});
test("parallel identical translations share an actor-owned reservation and completed cache without charging twice", async () => {
  const data = draft("唯一原文"),
    id = randomUUID(),
    other = randomUUID();
  assert.equal((await claim(data, id)).dispatch, true);
  const [a, b] = await Promise.all([claim(data, other), claim(data, id)]);
  assert.equal(a.dispatch, false);
  assert.equal(b.dispatch, false);
  assert.equal(a.status, "running");
  await assert.rejects(
    () => claim({ ...data, target: "zh-Hant" }, id),
    /ai_idempotency_conflict/,
  );
  await assert.rejects(() => claim(data, id, agent), /ai_idempotency_conflict/);
  await assert.rejects(() => finish(id, agent));
  await finish(id);
  const cached = await claim(data, other);
  assert.equal(cached.result?.requestId, id);
  assert.equal(
    (
      await one(
        "select count(*)::int n from sv_ai_requests where feature='translation' and request_hash=(select request_hash from sv_ai_requests where request_id=$1)",
        [id],
      )
    ).n,
    1,
  );
  await assert.rejects(
    () =>
      db.query("update sv_ai_requests set result='{}' where request_id=$1", [
        id,
      ]),
    /ai_receipt_immutable/,
  );
});
test("new inbound messages and unrelated workspace edits preserve a translation; edited source invalidates its result", async () => {
  const id = randomUUID();
  await claim({ ...incoming, target: "en" }, id); // completed cache from an earlier test is valid
  const data = draft("另一個未送出草稿"),
    draftId = randomUUID();
  await claim(data, draftId);
  await db.query(
    "update sv_workspaces set revision=revision+1 where company_id=$1",
    [company],
  );
  await db.query(
    "update sv_wa_conversations set revision=revision+1 where id=$1",
    [wa],
  );
  assert.equal((await finish(draftId)).status, "completed");
  const newId = randomUUID(),
    newData = { ...incoming, target: "zh-Hant" };
  await claim(newData, newId);
  await db.query(
    "update sv_workspaces set payload=jsonb_set(payload,'{inbox,messages,0,body}',to_jsonb('原文已修改'::text)),revision=revision+1 where company_id=$1",
    [company],
  );
  const stale = await db.query(
    "select sv_translation_finish($1,$2,$3,$4::jsonb,null,10,20)v",
    [
      company,
      owner,
      newId,
      JSON.stringify({ requestId: newId, target: "zh-Hant", text: "翻譯" }),
    ],
  );
  assert.equal(
    (stale.rows[0] as { v: Receipt }).v.error_code,
    "source_changed",
  );
});
test("owner suspension discards translations and reply routines cannot complete translation receipts", async () => {
  const id = randomUUID();
  await claim(draft("暫停測試"), id);
  await assert.rejects(
    () =>
      db.query("select sv_ai_finish($1,$2,$3,'{}',null,1,1)", [
        company,
        owner,
        id,
      ]),
    /ai_idempotency_conflict/,
  );
  await db.query("select sv_ai_configure($1,$2,false)", [company, owner]);
  assert.equal((await finish(id)).error_code, "disabled");
  await assert.rejects(() => claim(draft("未啟用")), /ai_disabled/);
  await db.query("select sv_ai_configure($1,$2,true)", [company, owner]);
});
test("translation and existing AI features share the HKT daily budget; retries never reserve another slot", async () => {
  const count = Number(
    (
      await one(
        "select count(*)n from sv_ai_requests where company_id=$1 and created_at>=date_trunc('day',now()at time zone'Asia/Hong_Kong')at time zone'Asia/Hong_Kong'",
        [company],
      )
    ).n,
  );
  await db.query(
    "update sv_ai_settings set daily_limit=$2 where company_id=$1",
    [company, count + 1],
  );
  const data = draft("最後一個 quota"),
    id = randomUUID();
  await claim(data, id);
  assert.equal((await claim(data, id)).dispatch, false);
  await assert.rejects(
    () => claim(draft("超額"), randomUUID(), agent),
    /ai_daily_limit/,
  );
  const revision = (
    await one("select revision from sv_workspaces where company_id=$1", [
      company,
    ])
  ).revision;
  await assert.rejects(
    () =>
      db.query(
        "select sv_ai_claim($1,$2,$3,'main','playground',null,$4,null,'synthetic/model',$5)",
        [company, agent, randomUUID(), revision, "a".repeat(64)],
      ),
    /ai_daily_limit/,
  );
  await finish(id);
  await db.query(
    "update sv_ai_settings set daily_limit=100 where company_id=$1",
    [company],
  );
  const receipt = await one(
    "select feature,product,input_tokens,output_tokens,translation_context from sv_ai_requests where request_id=$1",
    [id],
  );
  assert.equal(receipt.feature, "translation");
  assert.equal(receipt.product, "crm");
  assert.equal(receipt.input_tokens, 120);
  assert.equal(receipt.output_tokens, 30);
  assert.ok(!JSON.stringify(receipt.translation_context).includes("最後一個"));
});
test("browser roles cannot read translation receipts or execute source, claim and finish routines", async () => {
  for (const role of ["anon", "authenticated"]) {
    assert.equal(
      (
        await one(
          "select has_table_privilege($1,'public.sv_ai_requests','select')allowed",
          [role],
        )
      ).allowed,
      false,
    );
    for (const signature of [
      "public.sv_translation_source(uuid,text,text,text,text)",
      "public.sv_translation_claim(uuid,uuid,uuid,jsonb,text,text)",
      "public.sv_translation_finish(uuid,uuid,uuid,jsonb,text,integer,integer)",
    ])
      assert.equal(
        (
          await one("select has_function_privilege($1,$2,'execute')allowed", [
            role,
            signature,
          ])
        ).allowed,
        false,
      );
  }
});
