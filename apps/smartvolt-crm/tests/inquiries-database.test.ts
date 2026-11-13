import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  createCompanyState,
  applyCompanyCommand,
} from "../src/lib/saas/workspace";
import { appSchema, type AppState } from "../src/lib/demo/state";
import { parseEvents } from "../src/lib/meta/protocol";
const db = new PGlite(),
  owner = randomUUID(),
  agent = randomUUID(),
  viewer = randomUUID(),
  outsider = randomUUID();
const company = randomUUID(),
  foreign = randomUUID(),
  crm = randomUUID(),
  pos = randomUUID();
let meta: string,
  wa: string,
  connection: string,
  customer: string,
  waCustomer: string,
  requestId: string,
  appointmentId: string;
async function one<T = Record<string, unknown>>(
  sql: string,
  p: unknown[] = [],
) {
  return (await db.query<T>(sql, p)).rows[0];
}
async function value<T = Record<string, unknown>>(
  sql: string,
  p: unknown[] = [],
) {
  return (await one<{ v: T }>(sql, p)).v;
}
const actor = { id: owner, name: "Synthetic owner", role: "owner" as const };
const operations = {
  customer_name: "Casey",
  assignee_id: null as string | null,
  priority: "normal",
  follow_up_at: null,
  next_step: "",
  status: "open",
};
before(async () => {
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,service_role;alter default privileges in schema public grant all on tables to service_role;",
  );
  for (const f of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  for (const u of [owner, agent, viewer, outsider])
    await db.query("insert into auth.users values($1)", [u]);
  await db.exec("set role service_role");
  for (const [id, u, products] of [
    [company, owner, ["crm", "pos"]],
    [foreign, outsider, ["crm", "pos"]],
    [crm, owner, ["crm"]],
    [pos, owner, ["pos"]],
  ] as const) {
    const s = createCompanyState({
      companyId: id,
      companyName: "Synthetic",
      brands: [
        { id: "main", name: "Main", short: "M" },
        { id: "other", name: "Other", short: "O" },
      ],
      team: [
        { id: u, name: "Owner", initials: "O" },
        { id: agent, name: "Agent", initials: "A" },
      ],
    });
    s.pos!.catalog.push({
      id: "service",
      brandId: "main",
      name: "Synthetic service",
      kind: "service",
      category: "Services",
      priceCents: 10000,
      durationMinutes: 30,
      bufferMinutes: 0,
      resourceKind: "none",
      serviceId: null,
      units: 1,
      validDays: 365,
      active: true,
    });
    await db.query(
      "select sv_provision_company($1,$2,$3,$4,$5::jsonb,$6::text[])",
      [id, "Synthetic", u, "Owner", JSON.stringify(s), [...products]],
    );
  }
  await db.query(
    "insert into sv_memberships(company_id,user_id,role,display_name)values($1,$2,'agent','Agent'),($1,$3,'viewer','Viewer')",
    [company, agent, viewer],
  );
  connection = randomUUID();
  await db.query("select sv_meta_save($1,$2,$3::jsonb)", [
    company,
    owner,
    JSON.stringify({
      id: connection,
      brandId: "main",
      channel: "messenger",
      appId: "90001",
      pageId: "10001",
      accountId: "10001",
      label: "Synthetic",
      credentials: { test: true },
    }),
  ]);
  const events = parseEvents({
    object: "page",
    entry: [
      {
        id: "10001",
        messaging: [
          {
            sender: { id: "20001" },
            recipient: { id: "10001" },
            timestamp: Date.now(),
            message: {
              mid: "synthetic-mid",
              text: "想預約星期六",
              referral: { ad_id: "90002" },
            },
          },
        ],
      },
    ],
  });
  for (let i = 0; i < 2; i++)
    await db.query("select sv_meta_ingest($1,$2::jsonb)", [
      connection,
      JSON.stringify(events),
    ]);
  meta = String(
    (
      await one("select id from sv_meta_threads where connection_id=$1", [
        connection,
      ])
    ).id,
  );
  const wc = randomUUID(),
    wp = randomUUID();
  wa = randomUUID();
  await db.query(
    "insert into sv_wa_connections(id,company_id,brand_id,app_id,account_id,phone_number_id,encrypted_credentials,verify_token_hash,state,webhook_verified_at)values($1,$2,'main','99999','88888','77777','{\"test\":true}',repeat('a',64),'active',now())",
    [wc, company],
  );
  await db.query(
    "insert into sv_wa_contacts(id,company_id,display_name,phone)values($1,$2,'Casey','85260000000')",
    [wp, company],
  );
  await db.query(
    "insert into sv_wa_conversations(id,company_id,connection_id,contact_id,brand_id,remote_id,remote_kind,last_message_at,last_inbound_at)values($1,$2,$3,$4,'main','85260000000','phone',$5,$5)",
    [wa, company, wc, wp, Date.now()],
  );
  customer = String(
    (
      await one(
        "select customer_id from sv_customer_threads where company_id=$1 and thread_id=$2",
        [company, meta],
      )
    ).customer_id,
  );
  waCustomer = String(
    (
      await one(
        "select customer_id from sv_customer_threads where company_id=$1 and thread_id=$2",
        [company, wa],
      )
    ).customer_id,
  );
});
after(() => db.close());
async function threadRev() {
  return Number(
    (await one("select revision from sv_wa_conversations where id=$1", [wa]))
      .revision,
  );
}
async function list(
  queue = "all",
  channel = "all",
  search = "",
  before: string | null = null,
  key: string | null = null,
) {
  return value<{
    threads: Record<string, unknown>[];
    counts: Record<string, number>;
  }>("select sv_inbox_list($1,$2,$3,$4,$5,$6,$7)v", [
    company,
    owner,
    queue,
    channel,
    search,
    before,
    key,
  ]);
}
test("inbound replay creates one channel identity; matching names never auto-merge", async () => {
  assert.notEqual(customer, waCustomer);
  assert.equal(
    (
      await one(
        "select count(*)::int n from sv_meta_messages where thread_id=$1",
        [meta],
      )
    ).n,
    1,
  );
  assert.equal((await list()).threads.length, 2);
});
test("private data and functions reject browsers, foreign actors and POS-only inbox access", async () => {
  for (const table of [
    "sv_customers",
    "sv_customer_brands",
    "sv_customer_threads",
    "sv_customer_events",
    "sv_booking_requests",
    "sv_inquiry_commands",
    "sv_wa_thread_activity",
  ]) {
    assert.equal(
      (
        await one("select relrowsecurity from pg_class where relname=$1", [
          table,
        ])
      ).relrowsecurity,
      true,
    );
    for (const role of ["anon", "authenticated"])
      assert.equal(
        (
          await one("select has_table_privilege($1,$2,'SELECT')allowed", [
            role,
            "public." + table,
          ])
        ).allowed,
        false,
      );
  }
  for (const table of [
    "sv_customer_events",
    "sv_inquiry_commands",
    "sv_wa_thread_activity",
  ])
    for (const op of ["UPDATE", "DELETE", "TRUNCATE"])
      assert.equal(
        (
          await one("select has_table_privilege('service_role',$1,$2)allowed", [
            "public." + table,
            op,
          ])
        ).allowed,
        false,
      );
  await assert.rejects(
    () => db.query("select sv_inbox_list($1,$2)", [company, outsider]),
    /access_denied/,
  );
  await assert.rejects(
    () => db.query("select sv_inbox_list($1,$2)", [pos, owner]),
    /product_required/,
  );
  await db.exec("set role authenticated");
  await assert.rejects(
    () => db.query("select sv_inbox_list($1,$2)", [company, owner]),
    /permission denied/,
  );
  await db.exec("set role service_role");
});
test("WhatsApp assignment rejects stale writes and inactive/view-only assignees, with replay-safe audit", async () => {
  const id = randomUUID(),
    rev = await threadRev(),
    data = {
      ...operations,
      assignee_id: agent,
      priority: "urgent",
      follow_up_at: "2026-01-01T10:00:00+08:00",
      next_step: "安排預約",
    };
  const args = [company, owner, wa, id, rev, JSON.stringify(data)];
  for (let i = 0; i < 2; i++)
    await db.query(
      "select sv_wa_manage_thread($1,$2,$3,$4,$5,$6::jsonb)",
      args,
    );
  assert.equal(
    (
      await one(
        "select count(*)::int n from sv_wa_thread_activity where command_id=$1",
        [id],
      )
    ).n,
    1,
  );
  await assert.rejects(
    () =>
      db.query("select sv_wa_manage_thread($1,$2,$3,$4,$5,$6::jsonb)", [
        company,
        owner,
        wa,
        randomUUID(),
        rev,
        JSON.stringify(data),
      ]),
    /revision_conflict/,
  );
  const current = await threadRev();
  await assert.rejects(
    () =>
      db.query("select sv_wa_manage_thread($1,$2,$3,$4,$5,$6::jsonb)", [
        company,
        owner,
        wa,
        randomUUID(),
        current,
        JSON.stringify({ ...data, assignee_id: viewer }),
      ]),
    /assignee_invalid/,
  );
  assert.equal((await list("overdue")).counts.overdue, 1);
  assert.equal((await list("priority", "whatsapp")).threads.length, 1);
});
test("workload routing spans both channels and Meta note reconciliation never duplicates", async () => {
  const rev = await threadRev(),
    command = randomUUID();
  for (let i = 0; i < 2; i++)
    await db.query("select sv_inquiry_auto_assign($1,$2,'whatsapp',$3,$4,$5)", [
      company,
      owner,
      wa,
      rev,
      command,
    ]);
  assert.equal(
    (await one("select assignee_id from sv_wa_conversations where id=$1", [wa]))
      .assignee_id,
    owner,
  );
  const note = randomUUID();
  for (let i = 0; i < 2; i++)
    await db.query(
      "select sv_inquiry_meta_note($1,$2,$3,$4,'Synthetic internal note')",
      [company, owner, meta, note],
    );
  assert.equal(
    (
      await one(
        "select count(*)::int n from sv_meta_messages where thread_id=$1 and direction='note'",
        [meta],
      )
    ).n,
    1,
  );
  await assert.rejects(
    () =>
      db.query("select sv_inquiry_meta_note($1,$2,$3,$4,'Different body')", [
        company,
        owner,
        meta,
        note,
      ]),
    /idempotency_conflict/,
  );
});
test("identity links require explicit evidence, can be restored and cannot splice tenants", async () => {
  const command = randomUUID();
  for (let i = 0; i < 2; i++)
    await db.query(
      "select sv_customer_relink($1,$2,'meta',$3,$4,0,$5,'Customer confirmed identity')",
      [company, owner, meta, waCustomer, command],
    );
  assert.equal(
    (
      await one(
        "select customer_id from sv_customer_threads where thread_id=$1",
        [meta],
      )
    ).customer_id,
    waCustomer,
  );
  await db.query(
    "select sv_customer_relink($1,$2,'meta',$3,$4,1,$5,'Restore prior identity')",
    [company, owner, meta, customer, randomUUID()],
  );
  assert.equal(
    (
      await one(
        "select count(*)::int n from sv_customer_events where kind='identity-linked' and customer_id=$1",
        [customer],
      )
    ).n,
    1,
  );
  await assert.rejects(
    () =>
      db.query(
        "select sv_customer_relink($1,$2,'meta',$3,$4,2,$5,'Unverified foreign identity')",
        [foreign, outsider, meta, customer, randomUUID()],
      ),
    /no rows/,
  );
  await assert.rejects(
    () =>
      db.query(
        "insert into sv_customer_threads values($1,'meta',$2,'main',$3,0)",
        [foreign, meta, customer],
      ),
    /brand_scope/,
  );
});
test("inquiry registration creates only an intention, with no automatic confirmation or payment", async () => {
  requestId = randomUUID();
  const data = {
      provider: "meta",
      threadId: meta,
      customerId: customer,
      linkRevision: 2,
      service: "Synthetic service",
      desiredAt: "2026-12-01T10:00:00+08:00",
      guests: 1,
      note: "Customer requested time",
    },
    cmd = randomUUID();
  for (let i = 0; i < 2; i++)
    await db.query(
      "select sv_booking_request($1,$2,$3,$4,'create',$5::jsonb,0)",
      [company, owner, cmd, requestId, JSON.stringify(data)],
    );
  assert.equal(
    (
      await one("select status from sv_booking_requests where id=$1", [
        requestId,
      ])
    ).status,
    "requested",
  );
  assert.equal(
    (
      await one(
        "select count(*)::int n from sv_pos_appointments where company_id=$1",
        [company],
      )
    ).n,
    0,
  );
  await assert.rejects(
    () =>
      db.query("select sv_booking_request($1,$2,$3,$4,'confirm','{}',0)", [
        company,
        owner,
        randomUUID(),
        requestId,
      ]),
    /pos_required/,
  );
  await assert.rejects(
    () =>
      db.query("select sv_booking_request($1,$2,$3,$4,'cancel','{}',0)", [
        company,
        viewer,
        randomUUID(),
        requestId,
      ]),
    /access_denied/,
  );
});
async function document() {
  return one<{ payload: AppState; revision: number }>(
    "select payload,revision from sv_workspaces where company_id=$1",
    [company],
  );
}
const startsAt = Date.parse("2026-12-01T10:00:00+08:00");
test("POS handoff and source linkage commit once; stale concurrent confirmation cannot overwrite", async () => {
  const doc = await document(),
    contact = await value("select sv_customer_json($1,$2)v", [
      company,
      customer,
    ]);
  const state = appSchema.parse({
    ...doc.payload,
    inbox: { ...doc.payload.inbox, contacts: [contact] },
  });
  const command = randomUUID(),
    selection = {
      serviceId: "service",
      staffId: owner,
      resourceId: null,
      startsAt,
    };
  appointmentId = "request-" + requestId;
  const next = applyCompanyCommand(
    state,
    {
      type: "pos",
      command: {
        kind: "appointment-save",
        id: command,
        appointmentId,
        contactId: customer,
        ...selection,
        guests: 1,
        status: "confirmed",
        note: "Customer requested time",
      },
    },
    actor,
    Date.now(),
    ["crm", "pos"],
  );
  next.pos!.appointments[0].requestId = requestId;
  assert.equal(next.pos!.appointments[0].conversationId, null);
  assert.equal(next.inbox.conversations.length, 0);
  assert.equal(next.inbox.bookings.length, 0);
  const args = [
    company,
    owner,
    command,
    requestId,
    doc.revision,
    0,
    JSON.stringify(selection),
    JSON.stringify(next),
  ];
  for (let i = 0; i < 2; i++)
    await db.query(
      "select sv_commit_booking($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)",
      args,
    );
  assert.equal(
    (
      await one(
        "select count(*)::int n from sv_pos_appointments where company_id=$1",
        [company],
      )
    ).n,
    1,
  );
  assert.equal(
    (
      await one("select status from sv_booking_requests where id=$1", [
        requestId,
      ])
    ).status,
    "linked",
  );
  await assert.rejects(
    () =>
      db.query(
        "select sv_commit_booking($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)",
        [
          ...args.slice(0, 6),
          JSON.stringify({ ...selection, startsAt: startsAt + 60000 }),
          JSON.stringify(next),
        ],
      ),
    /idempotency_conflict/,
  );
  await assert.rejects(
    () =>
      db.query("select sv_commit_workspace($1,$2,$3,$4,$5::jsonb,'pos')", [
        company,
        owner,
        doc.revision,
        randomUUID(),
        JSON.stringify(next),
      ]),
    /revision_conflict/,
  );
  const current = await document();
  assert.throws(
    () =>
      applyCompanyCommand(
        current.payload,
        {
          type: "pos",
          command: {
            kind: "appointment-save",
            id: randomUUID(),
            appointmentId: "competing",
            contactId: customer,
            ...selection,
            guests: 1,
            status: "confirmed",
            note: "",
          },
        },
        actor,
        Date.now(),
        ["crm", "pos"],
      ),
    /已有預約/,
  );
});
async function posCommand(command: Record<string, unknown>) {
  const doc = await document(),
    id = randomUUID();
  const state = applyCompanyCommand(
    doc.payload,
    { type: "pos", command: { ...command, id } },
    actor,
    Date.now(),
    ["crm", "pos"],
  );
  await db.query("select sv_commit_workspace($1,$2,$3,$4,$5::jsonb,'pos')", [
    company,
    owner,
    doc.revision,
    id,
    JSON.stringify(state),
  ]);
  return state;
}
test("reschedule, arrival, manual receipts and refunds remain on the same customer timeline", async () => {
  await posCommand({
    kind: "appointment-save",
    appointmentId,
    contactId: customer,
    serviceId: "service",
    staffId: owner,
    resourceId: null,
    startsAt: startsAt + 3600000,
    guests: 1,
    status: "confirmed",
    note: "Rescheduled",
  });
  await posCommand({
    kind: "appointment-status",
    appointmentId,
    status: "checked_in",
  });
  await posCommand({
    kind: "cart-add",
    orderId: "order",
    contactId: customer,
    itemId: "service",
    appointmentId,
  });
  await posCommand({
    kind: "payment-record",
    orderId: "order",
    amountCents: 10000,
    method: "cash",
    reference: "",
  });
  await posCommand({
    kind: "refund-record",
    orderId: "order",
    amountCents: 2000,
    reason: "Synthetic partial refund",
  });
  const history = (
    await db.query<{ kind: string }>(
      "select kind from sv_customer_events where company_id=$1 and customer_id=$2",
      [company, customer],
    )
  ).rows.map((x) => x.kind);
  assert.ok(history.includes("pos-payment"));
  assert.ok(history.includes("pos-refund"));
  assert.ok(history.filter((x) => x === "pos-appointment").length >= 3);
  assert.equal(
    (
      await one(
        "select snapshot->>'requestId' request from sv_pos_appointments where company_id=$1 and id=$2",
        [company, appointmentId],
      )
    ).request,
    requestId,
  );
});
test("canonical profile edits survive later operations and reject stale customer snapshots", async () => {
  const id = randomUUID(),
    rev = Number(
      (
        await one(
          "select revision from sv_customers where company_id=$1 and id=$2",
          [company, customer],
        )
      ).revision,
    ),
    doc = await document(),
    data = {
      name: "Verified Casey",
      phone: "",
      email: "",
      tags: ["Returning"],
      note: "Verified preference",
    };
  for (let i = 0; i < 2; i++)
    await db.query("select sv_customer_update($1,$2,$3,$4,$5,$6::jsonb)", [
      company,
      owner,
      customer,
      rev,
      id,
      JSON.stringify(data),
    ]);
  await assert.rejects(
    () =>
      db.query("select sv_commit_workspace($1,$2,$3,$4,$5::jsonb,'pos')", [
        company,
        owner,
        doc.revision,
        randomUUID(),
        JSON.stringify(doc.payload),
      ]),
    /revision_conflict/,
  );
  await posCommand({
    kind: "appointment-status",
    appointmentId,
    status: "completed",
  });
  assert.equal(
    (
      await one("select name from sv_customers where company_id=$1 and id=$2", [
        company,
        customer,
      ])
    ).name,
    "Verified Casey",
  );
  await assert.rejects(
    () =>
      db.query("select sv_customer_update($1,$2,$3,$4,$5,$6::jsonb)", [
        company,
        owner,
        customer,
        rev,
        randomUUID(),
        JSON.stringify(data),
      ]),
    /revision_conflict/,
  );
});
test("unified filtering and totals cover the full dataset before keyset pagination", async () => {
  for (let i = 0; i < 55; i++)
    await db.query(
      "insert into sv_meta_threads(company_id,connection_id,peer_id)values($1,$2,$3)",
      [company, connection, String(40000 + i)],
    );
  const first = await list();
  assert.equal(first.threads.length, 51);
  assert.ok(first.counts.all >= 57);
  const last = first.threads[49],
    second = await list(
      "all",
      "all",
      "",
      String(last.updated_at),
      String(last.key),
    ),
    seen = new Set(first.threads.slice(0, 50).map((x) => x.key));
  assert.ok(second.threads.every((t) => !seen.has(t.key)));
  await db.query(
    "update sv_memberships set status='suspended' where company_id=$1 and user_id=$2",
    [company, owner],
  );
  await assert.rejects(
    () => db.query("select sv_inbox_list($1,$2)", [company, owner]),
    /access_denied/,
  );
  await db.query(
    "update sv_memberships set status='active' where company_id=$1 and user_id=$2",
    [company, owner],
  );
});
test("CRM-only companies confirm basic bookings independently of POS", async () => {
  const id = randomUUID();
  await db.query("select sv_meta_save($1,$2,$3::jsonb)", [
    crm,
    owner,
    JSON.stringify({
      id,
      brandId: "main",
      channel: "messenger",
      appId: "90003",
      pageId: "10003",
      accountId: "10003",
      label: "CRM only synthetic",
      credentials: { test: true },
    }),
  ]);
  const thread = randomUUID();
  await db.query(
    "insert into sv_meta_threads(id,company_id,connection_id,peer_id)values($1,$2,$3,'22222')",
    [thread, crm, id],
  );
  const link = await one(
      "select customer_id,revision from sv_customer_threads where company_id=$1 and thread_id=$2",
      [crm, thread],
    ),
    request = randomUUID();
  await db.query(
    "select sv_booking_request($1,$2,$3,$4,'create',$5::jsonb,0)",
    [
      crm,
      owner,
      randomUUID(),
      request,
      JSON.stringify({
        provider: "meta",
        threadId: thread,
        customerId: link.customer_id,
        linkRevision: 0,
        service: "Consultation",
        desiredAt: "2026-12-01T14:00:00+08:00",
        guests: 1,
        note: "",
      }),
    ],
  );
  await db.query("select sv_booking_request($1,$2,$3,$4,'confirm','{}',0)", [
    crm,
    owner,
    randomUUID(),
    request,
  ]);
  assert.equal(
    (await one("select status from sv_booking_requests where id=$1", [request]))
      .status,
    "confirmed",
  );
  assert.equal(
    (
      await one(
        "select count(*)::int n from sv_pos_appointments where company_id=$1",
        [crm],
      )
    ).n,
    0,
  );
});
test("WhatsApp AI claims bind brand and source revision and reject stale generated results", async () => {
  await db.query("select sv_ai_configure($1,$2,true)", [company, owner]);
  const doc = await document(),
    request = randomUUID(),
    rev = await threadRev();
  await db.query(
    "select sv_ai_claim($1,$2,$3,'main','whatsapp',$4,$5,$6,'openai/synthetic',repeat('a',64))",
    [company, owner, request, wa, doc.revision, rev],
  );
  await db.query("select sv_wa_manage_thread($1,$2,$3,$4,$5,$6::jsonb)", [
    company,
    owner,
    wa,
    randomUUID(),
    rev,
    JSON.stringify({ ...operations, next_step: "Changed during generation" }),
  ]);
  const result = await value<{ status: string; error_code: string }>(
    'select sv_ai_finish($1,$2,$3,\'{"reply":"synthetic"}\',null,10,10)v',
    [company, owner, request],
  );
  assert.equal(result.status, "failed");
  assert.equal(result.error_code, "context_changed");
});
