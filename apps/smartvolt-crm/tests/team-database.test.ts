import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createCompanyState } from "../src/lib/saas/workspace";
import { appSchema } from "../src/lib/demo/state";
import { parseEvents } from "../src/lib/meta/protocol";
import { invitationToken, invitationHash } from "../src/lib/team/token";
const db = new PGlite(),
  company = randomUUID(),
  foreign = randomUUID(),
  owner = randomUUID(),
  agent = randomUUID(),
  outsider = randomUUID(),
  joiner = randomUUID();
const connections = [randomUUID(), randomUUID()];
let threads: string[] = [];
async function val<T = unknown>(sql: string, args: unknown[] = []) {
  return (await db.query<{ v: T }>(sql, args)).rows[0]?.v;
}
const call = <T = unknown>(fn: string, args: unknown[]) =>
  val<T>(`select ${fn}(${args.map((_, i) => `$${i + 1}`).join(",")})v`, args);
const action = (
  kind: string,
  data: object,
  actor = owner,
  command = randomUUID(),
  tenant = company,
) =>
  call("sv_team_action", [tenant, actor, command, kind, JSON.stringify(data)]);
const inviteData = (id = randomUUID(), extra: object = {}) => ({
  id,
  name: "New colleague",
  email: `synthetic-${id}@example.invalid`,
  role: "agent",
  brandIds: ["main"],
  productIds: ["crm"],
  tokenHash: "a".repeat(64),
  ...extra,
});
before(async () => {
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,service_role;alter default privileges in schema public grant all on tables to service_role;",
  );
  for (const f of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  for (const u of [owner, agent, outsider, joiner])
    await db.query("insert into auth.users values($1)", [u]);
  await db.exec("set role service_role");
  for (const [id, user] of [
    [company, owner],
    [foreign, outsider],
  ]) {
    const state = createCompanyState({
      companyId: id,
      companyName: "Synthetic tenant",
      brands: [
        { id: "main", name: "Main", short: "M" },
        { id: "other", name: "Other", short: "O" },
      ],
      team: [{ id: user, name: "Owner", initials: "O" }],
    });
    await call("sv_provision_company", [
      id,
      "Synthetic tenant",
      user,
      "Owner",
      JSON.stringify(state),
      ["crm", "pos"],
    ]);
  }
  await db.query(
    "insert into sv_memberships(company_id,user_id,role,display_name,brand_ids,product_ids)values($1,$2,'agent','Scoped colleague',array['main'],array['crm'])",
    [company, agent],
  );
  for (let i = 0; i < 2; i++) {
    await call("sv_meta_save", [
      company,
      owner,
      JSON.stringify({
        id: connections[i],
        brandId: i ? "other" : "main",
        channel: "messenger",
        appId: "90001",
        pageId: String(10001 + i),
        accountId: String(10001 + i),
        label: "Synthetic",
        credentials: { test: true },
      }),
    ]);
    const events = parseEvents({
      object: "page",
      entry: [
        {
          id: String(10001 + i),
          messaging: [
            {
              sender: { id: String(30001 + i) },
              recipient: { id: String(10001 + i) },
              timestamp: Date.now(),
              message: { mid: `scope-${i}`, text: "Synthetic inquiry" },
            },
          ],
        },
      ],
    });
    await call("sv_meta_ingest", [connections[i], JSON.stringify(events)]);
  }
  threads = (
    await db.query<{ id: string }>(
      "select id from sv_meta_threads where company_id=$1 order by peer_id",
      [company],
    )
  ).rows.map((t) => t.id);
  // Denied rows sort before allowed rows. A post-page filter would return an empty directory.
  for (let i = 0; i < 64; i++) {
    const id = `a-hidden-${i.toString().padStart(3, "0")}`;
    await db.query(
      "insert into sv_customers(company_id,id,name)values($1,$2,'Hidden')",
      [company, id],
    );
    await db.query("insert into sv_customer_brands values($1,$2,'other')", [
      company,
      id,
    ]);
  }
});
after(() => db.close());
test("brand grants constrain directory, inbox counts and operations before pagination", async () => {
  const directory = await call<{ id: string; name: string }[]>(
    "sv_customer_list",
    [company, agent, null, "", null],
  );
  assert.equal(directory.length, 1);
  assert.equal(
    directory.some((c) => c.name === "Hidden"),
    false,
  );
  const inbox = await call<{ rows: unknown[]; counts: { all: number } }>(
    "sv_inbox_list",
    [company, agent],
  );
  assert.equal(inbox.counts.all, 1);
  const meta = await call<{ threads: unknown[]; counts: { all: number } }>(
    "sv_meta_inbox_list",
    [company, agent],
  );
  assert.equal(meta.threads.length, 1);
  assert.equal(meta.counts.all, 1);
  const ops = await val<{
    brands: { id: string }[];
    records: unknown[];
    stages: { count: number }[];
  }>(
    "select sv_ops_read($1,$2,null,null,'',null,null,now()-interval '1 day',now()+interval '1 day')v",
    [company, agent],
  );
  assert.deepEqual(
    ops.brands.map((b) => b.id),
    ["main"],
  );
  assert.equal(
    ops.stages.reduce((n, s) => n + s.count, 0),
    1,
  );
});
test("same-company foreign-brand writes and cross-company access are refused", async () => {
  await assert.rejects(
    call("sv_ops_context", [company, agent, "meta", threads[1]]),
    /brand_scope/,
  );
  await assert.rejects(
    call("sv_meta_command", [company, agent, threads[1], "note", "forbidden"]),
    /brand_scope/,
  );
  await assert.rejects(
    call("sv_meta_command", [
      company,
      outsider,
      threads[0],
      "note",
      "forbidden",
    ]),
    /access_denied/,
  );
  await assert.rejects(
    call("sv_member_scope", [foreign, agent, "main"]),
    /access_denied/,
  );
});
test("only the owner invites; scope and purchased modules cannot be fabricated", async () => {
  await assert.rejects(action("invite", inviteData(), agent), /access_denied/);
  await assert.rejects(
    action("invite", inviteData(), outsider),
    /access_denied/,
  );
  await assert.rejects(
    action("invite", inviteData(undefined, { brandIds: ["fabricated"] })),
    /brand_scope/,
  );
  await assert.rejects(
    action("invite", inviteData(undefined, { productIds: ["unbought"] })),
    /team_product_invalid/,
  );
});
test("invitation receipt replay does not duplicate a seat or a mail claim", async () => {
  const data = inviteData(),
    command = randomUUID();
  await action("invite", data, owner, command);
  await action("invite", data, owner, command);
  assert.equal(
    await val(
      "select count(*)::int v from sv_staff_invitations where company_id=$1 and id=$2",
      [company, data.id],
    ),
    1,
  );
  assert.equal(
    await call("sv_team_mail_claim", [company, owner, data.id]),
    true,
  );
  assert.equal(
    await call("sv_team_mail_claim", [company, owner, data.id]),
    false,
  );
  await assert.rejects(
    action("invite", { ...data, name: "Changed" }, owner, command),
    /idempotency_conflict/,
  );
  await action("revoke", { id: data.id });
});
test("acceptance requires the exact invitation identity/hash; accepted membership has stored grants", async () => {
  const data = inviteData();
  await action("invite", data);
  await assert.rejects(
    call("sv_team_accept", [
      data.id,
      joiner,
      "other@example.invalid",
      data.tokenHash,
    ]),
    /no rows/,
  );
  await assert.rejects(
    call("sv_team_accept", [data.id, joiner, data.email, "b".repeat(64)]),
    /no rows/,
  );
  assert.equal(
    await call("sv_team_accept", [data.id, joiner, data.email, data.tokenHash]),
    company,
  );
  assert.equal(
    await call("sv_team_accept", [data.id, joiner, data.email, data.tokenHash]),
    company,
  );
  assert.equal(
    await call("sv_authorize", [company, joiner, "crm", true, false, "main"]),
    "agent",
  );
  await assert.rejects(
    call("sv_authorize", [company, joiner, "pos"]),
    /product_required/,
  );
  await assert.rejects(
    call("sv_authorize", [company, joiner, "crm", false, false, "other"]),
    /brand_scope/,
  );
});
test("revoking or expiring an invitation prevents account activation", async () => {
  const revoked = inviteData(),
    expired = inviteData();
  await action("invite", revoked);
  await action("revoke", { id: revoked.id });
  await assert.rejects(
    call("sv_team_accept", [
      revoked.id,
      outsider,
      revoked.email,
      revoked.tokenHash,
    ]),
    /invitation_expired/,
  );
  await action("invite", expired);
  await db.query(
    "update sv_staff_invitations set expires_at=now()-interval '1 second'where company_id=$1 and id=$2",
    [company, expired.id],
  );
  await assert.rejects(
    call("sv_team_accept", [
      expired.id,
      outsider,
      expired.email,
      expired.tokenHash,
    ]),
    /invitation_expired/,
  );
});
test("owner recovery is protected and stale member revisions cannot override a later edit", async () => {
  const data = {
    userId: joiner,
    revision: 0,
    name: "Joined",
    role: "agent",
    brandIds: ["main"],
    productIds: ["crm"],
    status: "suspended",
  };
  await action("member", data);
  await assert.rejects(
    action("member", { ...data, status: "active" }),
    /revision_conflict/,
  );
  await assert.rejects(
    action("member", { ...data, userId: owner }),
    /owner_protected/,
  );
  await assert.rejects(
    call("sv_meta_command", [
      company,
      joiner,
      threads[0],
      "note",
      "cannot write",
    ]),
    /access_denied/,
  );
  const doc = await val<{ payload: unknown }>(
    "select jsonb_build_object('payload',payload)v from sv_workspaces where company_id=$1",
    [company],
  );
  assert.equal(appSchema.safeParse(doc.payload).success, true);
  await action("member", { ...data, revision: 1, status: "active" });
});
test("a pending old invitation cannot undo a subsequent suspension", async () => {
  const data = inviteData();
  await action("invite", data);
  await action("member", {
    userId: joiner,
    revision: 2,
    name: "Joined",
    role: "agent",
    brandIds: ["main"],
    productIds: ["crm"],
    status: "suspended",
  });
  await assert.rejects(
    call("sv_team_accept", [data.id, joiner, data.email, data.tokenHash]),
    /invitation_context_changed/,
  );
  await action("revoke", { id: data.id });
});
test("seat reservations prevent owner reactivation from overbooking outstanding invitations", async () => {
  const current = await val<number>(
    "select count(*)::int v from sv_memberships where company_id=$1 and status='active'",
    [company],
  );
  await db.query("update sv_companies set seat_limit=$2 where id=$1", [
    company,
    current + 1,
  ]);
  const data = inviteData();
  await action("invite", data);
  await assert.rejects(action("invite", inviteData()), /seat_limit/);
  await assert.rejects(
    action("member", {
      userId: joiner,
      revision: 3,
      name: "Joined",
      role: "agent",
      brandIds: ["main"],
      productIds: ["crm"],
      status: "active",
    }),
    /seat_limit/,
  );
  await action("revoke", { id: data.id });
  await db.query("update sv_companies set seat_limit=5 where id=$1", [company]);
});
test("shared profiles require every affected brand, so an allowed link cannot edit a hidden brand", async () => {
  const id = await val<string>(
    "select customer_id v from sv_customer_threads where company_id=$1 and thread_id=$2",
    [company, threads[0]],
  );
  await db.query("insert into sv_customer_brands values($1,$2,'other')", [
    company,
    id,
  ]);
  await assert.rejects(
    call("sv_customer_update", [
      company,
      agent,
      id,
      0,
      randomUUID(),
      JSON.stringify({
        name: "Overwrite",
        phone: "",
        email: "",
        tags: [],
        note: "",
      }),
    ]),
    /brand_scope/,
  );
});
test("workspace commits preserve denied-brand records even when an internal caller supplies a replacement", async () => {
  const doc = await val<{
    payload: ReturnType<typeof createCompanyState>;
    revision: number;
  }>(
    "select jsonb_build_object('payload',payload,'revision',revision)v from sv_workspaces where company_id=$1",
    [company],
  );
  const original = doc.payload.studio.bots.find((b) => b.brandId === "other")!;
  const next = structuredClone(doc.payload);
  next.studio.bots.find((b) => b.brandId === "other")!.greeting =
    "Overwrite hidden brand";
  await assert.rejects(
    call("sv_commit_workspace", [
      company,
      agent,
      doc.revision,
      randomUUID(),
      JSON.stringify(next),
      "inbox",
    ]),
    /brand_scope/,
  );
  assert.equal(
    (
      await val<{ greeting: string }>(
        "select b v from sv_workspaces,jsonb_array_elements(payload#>'{studio,bots}')b where company_id=$1 and b->>'brandId'='other'",
        [company],
      )
    ).greeting,
    original.greeting,
  );
});
test("revoking a product affects existing conversations and cached C receipts immediately", async () => {
  const request = randomUUID(),
    thread = randomUUID();
  await db.query(
    "insert into sv_copilot_threads(company_id,id,actor_id,product,title)values($1,$2,$3,'crm','Synthetic')",
    [company, thread, agent],
  );
  await db.query(
    "insert into sv_ai_requests(company_id,request_id,actor_id,brand_id,source,source_id,workspace_revision,model,request_hash,product,feature,status,result)values($1,$2,$3,'main','copilot',$4,0,'synthetic/model',$5,'crm','copilot','completed','{}')",
    [company, request, agent, thread, "a".repeat(64)],
  );
  const data = {
    userId: agent,
    revision: 0,
    name: "Scoped colleague",
    role: "agent",
    brandIds: ["main"],
    productIds: ["pos"],
    status: "active",
  };
  await action("member", data);
  await assert.rejects(
    call("sv_meta_command", [company, agent, threads[0], "note", "forbidden"]),
    /product_required/,
  );
  await assert.rejects(
    call("sv_copilot_receipt", [company, agent, "crm", request]),
    /product_required/,
  );
  await action("member", {
    ...data,
    revision: 1,
    productIds: ["crm"],
    brandIds: ["other"],
  });
  await assert.rejects(
    call("sv_copilot_receipt", [company, agent, "crm", request]),
    /brand_scope/,
  );
  const list = await call<unknown[]>("sv_copilot_thread_list", [
    company,
    agent,
    "crm",
  ]);
  assert.equal(list.length, 0);
});
test("C evidence scopes protect combined product/brand facts even when the display brand remains allowed", async () => {
  async function grant(brandIds: string[] | null, productIds: string[]) {
    const revision = await val<number>(
      "select access_revision v from sv_memberships where company_id=$1 and user_id=$2",
      [company, agent],
    );
    await action("member", {
      userId: agent,
      revision,
      name: "Scoped colleague",
      role: "agent",
      brandIds,
      productIds,
      status: "active",
    });
  }
  async function receipt() {
    const request = randomUUID(),
      thread = randomUUID();
    await db.query(
      "insert into sv_copilot_threads(company_id,id,actor_id,product,title)values($1,$2,$3,'crm','Combined evidence')",
      [company, thread, agent],
    );
    await db.query(
      "insert into sv_ai_requests(company_id,request_id,actor_id,brand_id,source,source_id,workspace_revision,model,request_hash,product,feature,status,result)values($1,$2,$3,'main','copilot',$4,0,'synthetic/model',$5,'crm','copilot','completed','{}')",
      [company, request, agent, thread, "b".repeat(64)],
    );
    return request;
  }
  await grant(null, ["crm", "pos"]);
  const combined = await receipt();
  assert.equal(
    await call("smartvolt_private.copilot_receipt_allowed", [
      company,
      agent,
      combined,
    ]),
    true,
  );
  await grant(null, ["crm"]);
  await assert.rejects(
    call("sv_copilot_receipt", [company, agent, "crm", combined]),
    /brand_scope/,
  );
  const crmOnly = await receipt();
  await call("sv_copilot_receipt", [company, agent, "crm", crmOnly]);
  await grant(["main"], ["crm", "pos"]);
  // 'main' is still allowed, but the original answer also saw the other brand.
  await assert.rejects(
    call("sv_copilot_receipt", [company, agent, "crm", combined]),
    /brand_scope/,
  );
  const current = await receipt();
  await call("sv_copilot_receipt", [company, agent, "crm", current]);
  assert.equal(
    (
      await call<{ title: string }[]>("sv_copilot_thread_list", [
        company,
        agent,
        "crm",
      ])
    ).filter((t) => t.title === "Combined evidence").length,
    1,
  );
});
test("invitation and audit tables/RPCs remain inaccessible to browser roles; evidence cannot be rewritten", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    try {
      await assert.rejects(
        db.exec("select * from public.sv_staff_invitations"),
        /permission denied/,
      );
      await assert.rejects(
        call("sv_team_action", [company, owner, randomUUID(), "revoke", "{}"]),
        /permission denied/,
      );
    } finally {
      await db.exec("set role service_role");
    }
  }
  await assert.rejects(
    db.query("update sv_access_audit set kind='rewrite'where company_id=$1", [
      company,
    ]),
    /immutable/,
  );
  await assert.rejects(db.exec("truncate sv_action_receipts"), /immutable/);
});
test("invitation tokens are deterministic for safe retries and isolated by company and command", () => {
  const key = Buffer.alloc(32, 4),
    command = randomUUID(),
    a = invitationToken(key, company, command);
  assert.equal(invitationToken(key, company, command), a);
  assert.notEqual(invitationToken(key, foreign, command), a);
  assert.notEqual(invitationToken(key, company, randomUUID()), a);
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(invitationHash(a).length, 64);
});
