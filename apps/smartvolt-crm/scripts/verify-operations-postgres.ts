// This runs only against a disposable, empty GitHub Actions PostgreSQL service.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createCompanyState } from "../src/lib/saas/workspace";
import { defaultSettings } from "../src/lib/operations/model";
import type { Flow } from "../src/components/crm/studio/model";
if (
  process.env.CI !== "true" ||
  process.env.PGHOST !== "127.0.0.1" ||
  process.env.PGDATABASE !== "convelta_operations"
)
  throw new Error("Native verification requires its isolated CI database.");
const args = ["-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"],
  quote = (s: string) => "'" + s.replaceAll("'", "''") + "'";
function execute(input: string) {
  const child = spawn("psql", args, { stdio: ["pipe", "pipe", "pipe"] });
  let output = "",
    error = "";
  child.stdout.on("data", (part) => {
    output += part;
  });
  child.stderr.on("data", (part) => {
    error += part;
  });
  const done = new Promise<string>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve(output.trim())
        : reject(new Error(error || "Native database verification failed.")),
    );
  });
  child.stdin.end(input);
  return { child, done };
}
async function sql(query: string) {
  return execute("set role service_role;set statement_timeout='5s';" + query)
    .done;
}
async function json<T>(query: string): Promise<T> {
  return JSON.parse(await sql(query));
}
async function raceUnderNativeLock<T>(
  lock: string,
  compete: () => Promise<T>,
): Promise<T> {
  const holder = execute(
    `set role service_role;begin;${lock}\n\\echo EXPANSION_LOCK_HELD\nselect pg_sleep(2);commit;`,
  );
  try {
    await new Promise<void>((resolve, reject) => {
      let output = "";
      const timer = setTimeout(
        () => reject(new Error("Native expansion lock handshake timed out.")),
        5000,
      );
      holder.child.stdout.on("data", (part) => {
        output += part;
        if (output.includes("EXPANSION_LOCK_HELD")) {
          clearTimeout(timer);
          resolve();
        }
      });
      holder.done.catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    return await compete();
  } finally {
    await holder.done;
  }
}
async function main() {
  const empty = await execute(
    "select count(*)from information_schema.tables where table_schema='public';",
  ).done;
  assert.equal(
    empty,
    "0",
    "Never run test migrations against a populated database.",
  );
  await execute(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,service_role;alter default privileges in schema public grant all on tables to service_role;",
  ).done;
  for (const f of readdirSync("supabase/migrations")
    .filter((s) => s.endsWith(".sql"))
    .sort())
    await execute(readFileSync("supabase/migrations/" + f, "utf8")).done;
  const company = randomUUID(),
    owner = randomUUID(),
    agent = randomUUID(),
    connection = randomUUID();
  await execute(
    `insert into auth.users values(${quote(owner)}),(${quote(agent)});`,
  ).done;
  const state = createCompanyState({
    companyId: company,
    companyName: "Native synthetic",
    brands: [{ id: "main", name: "Main", short: "M" }],
    team: [{ id: owner, name: "Owner", initials: "O" }],
  });
  await sql(
    `select sv_provision_company(${quote(company)},'Native synthetic',${quote(owner)},'Owner',${quote(JSON.stringify(state))}::jsonb,array['crm','pos']);insert into sv_memberships(company_id,user_id,role,display_name)values(${quote(company)},${quote(agent)},'agent','Agent');`,
  );
  await sql(
    `select sv_meta_save(${quote(company)},${quote(owner)},${quote(JSON.stringify({ id: connection, brandId: "main", channel: "messenger", appId: "90001", pageId: "10001", accountId: "10001", label: "Native synthetic", credentials: { test: true } }))}::jsonb);`,
  );
  let peer = 100000;
  async function inquiry() {
    return sql(
      `insert into sv_meta_threads(company_id,connection_id,peer_id)values(${quote(company)},${quote(connection)},${quote(String(++peer))})returning id;`,
    );
  }
  async function settings(maxOpen: number, method = "least_open") {
    const data = structuredClone(defaultSettings);
    data.routingEnabled = true;
    data.rules = [
      {
        id: randomUUID(),
        name: "Native admission",
        enabled: true,
        brandId: null,
        channel: "all",
        team: "",
        tags: [],
        onlineOnly: true,
        maxOpen,
        method: method as "least_open" | "round_robin",
      },
    ];
    const revision = await sql(
      `select revision from sv_ops_settings where company_id=${quote(company)};`,
    );
    await sql(
      `select sv_ops_action(${quote(company)},${quote(owner)},${quote(randomUUID())},'settings',${quote(JSON.stringify({ revision: Number(revision), data }))}::jsonb);`,
    );
  }
  await sql(
    `insert into sv_agent_routing(company_id,user_id,capacity,presence,seen_at)values(${quote(company)},${quote(owner)},100,'online',now()),(${quote(company)},${quote(agent)},100,'online',now());`,
  );
  await settings(100);
  const locked = await inquiry(),
    other = await inquiry();
  const holder = execute(
    `set role service_role;begin;select id from sv_meta_threads where id=${quote(locked)}for update;\n\\echo OPS_LOCK_HELD\nselect pg_sleep(2);commit;`,
  );
  await new Promise<void>((resolve, reject) => {
    let text = "";
    const timer = setTimeout(
      () => reject(new Error("Native row-lock handshake timed out.")),
      5000,
    );
    holder.child.stdout.on("data", (part) => {
      text += part;
      if (text.includes("OPS_LOCK_HELD")) {
        clearTimeout(timer);
        resolve();
      }
    });
    holder.done.catch(reject);
  });
  const busy = await json<{ queued: boolean; reason: string }>(
    `select sv_inquiry_auto_assign(${quote(company)},${quote(owner)},'meta',${quote(locked)},0,${quote(randomUUID())});`,
  );
  assert.equal(busy.queued, true);
  assert.equal(busy.reason, "busy");
  const catchup = await json<{ assigned: number }>(
    `select sv_ops_route_waiting(${quote(company)},${quote(owner)});`,
  );
  assert.equal(catchup.assigned, 1);
  assert.notEqual(
    await sql(
      `select assignee_id from sv_meta_threads where id=${quote(other)};`,
    ),
    "",
  );
  await holder.done;

  // Simultaneous requests must admit only one conversation into the last slot.
  await sql(
    `update sv_meta_threads set assignee_id=null,revision=0 where company_id=${quote(company)};update sv_agent_routing set paused=(user_id<>${quote(owner)}::uuid)where company_id=${quote(company)};`,
  );
  await settings(1);
  const candidates = [await inquiry(), await inquiry()],
    commands = [randomUUID(), randomUUID()];
  const call = (id: string, command: string) =>
    `select sv_inquiry_auto_assign(${quote(company)},${quote(owner)},'meta',${quote(id)},0,${quote(command)});`;
  const admitted = await Promise.all(
    candidates.map((id, i) =>
      json<{ saved: boolean; queued: boolean }>(call(id, commands[i])),
    ),
  );
  assert.equal(admitted.filter((r) => r.saved).length, 1);
  assert.equal(admitted.filter((r) => r.queued).length, 1);
  assert.equal(
    await sql(
      `select count(*)from sv_meta_threads where company_id=${quote(company)}and assignee_id is not null;`,
    ),
    "1",
  );
  const winner = admitted.findIndex((r) => r.saved);
  assert.deepEqual(
    await json(call(candidates[winner], commands[winner])),
    admitted[winner],
  );

  // Different rows are routed concurrently; the shared round-robin cursor stays fair.
  await sql(
    `update sv_meta_threads set assignee_id=null,revision=0 where company_id=${quote(company)};update sv_agent_routing set paused=false,presence='online',seen_at=now()where company_id=${quote(company)};`,
  );
  await settings(100, "round_robin");
  const round = await Promise.all(Array.from({ length: 12 }, () => inquiry()));
  await Promise.all(round.map((id) => json(call(id, randomUUID()))));
  const loads = await json<{ owner: number; agent: number }>(
    `select json_build_object('owner',count(*)filter(where assignee_id=${quote(owner)}::uuid),'agent',count(*)filter(where assignee_id=${quote(agent)}::uuid))from sv_meta_threads where company_id=${quote(company)};`,
  );
  assert.equal(loads.owner, 6);
  assert.equal(loads.agent, 6);
  // Translation uses the same company budget lock as replies and C. Multiple
  // browser clicks and concurrent actors must never reserve the last slot twice.
  await sql(`select sv_ai_configure(${quote(company)},${quote(owner)},true);`);
  const translationData = {
    mode: "draft",
    source: "meta",
    brandId: "main",
    threadId: candidates[0],
    text: "想約星期六",
    target: "en",
  };
  const translate = (id: string, actor: string, data: object, hash: string) =>
    `select sv_translation_claim(${quote(company)},${quote(actor)},${quote(id)},${quote(JSON.stringify(data))}::jsonb,'synthetic/model',${quote(hash)});`;
  const translationIds = Array.from({ length: 8 }, () => randomUUID());
  const reservations = await Promise.all(
    translationIds.map((id) =>
      json<{ dispatch: boolean }>(
        translate(id, owner, translationData, "a".repeat(64)),
      ),
    ),
  );
  assert.equal(reservations.filter((r) => r.dispatch).length, 1);
  assert.equal(
    await sql(
      `select count(*)from sv_ai_requests where company_id=${quote(company)}and feature='translation';`,
    ),
    "1",
  );
  const translationWinner =
    translationIds[reservations.findIndex((r) => r.dispatch)];
  await json(
    `select sv_translation_finish(${quote(company)},${quote(owner)},${quote(translationWinner)},${quote(JSON.stringify({ requestId: translationWinner, target: "en", text: "I would like to book Saturday." }))}::jsonb,null,40,15);`,
  );
  await sql(
    `update sv_ai_settings set daily_limit=2 where company_id=${quote(company)};`,
  );
  const lastSlot = await Promise.allSettled(
    [owner, agent].map((actor, i) =>
      json(
        translate(
          randomUUID(),
          actor,
          { ...translationData, text: "unique " + i },
          String(i + 1).repeat(64),
        ),
      ),
    ),
  );
  assert.equal(lastSlot.filter((r) => r.status === "fulfilled").length, 1);
  const quotaFailure = lastSlot.find((r) => r.status === "rejected");
  assert.ok(
    quotaFailure?.status === "rejected" &&
      /ai_daily_limit/.test(String(quotaFailure.reason)),
  );
  // The same outbox claim is contested by separate native PostgreSQL sessions.
  await sql(
    `select sv_engagement_action(${quote(company)},${quote(owner)},${quote(randomUUID())},'policy',${quote(JSON.stringify({ marketingEnabled: true, quietStart: 0, quietEnd: 0, frequencyHours: 72, dailyLimit: 1000, minuteLimit: 2, revision: 0 }))}::jsonb);`,
  );
  async function delivery() {
    const thread = await inquiry();
    await sql(
      `update sv_meta_threads set last_inbound_at=${Date.now()} where id=${quote(thread)};`,
    );
    const customer = await sql(
      `select customer_id from sv_customer_threads where company_id=${quote(company)}and provider='meta'and thread_id=${quote(thread)};`,
    );
    await sql(
      `select sv_engagement_action(${quote(company)},${quote(owner)},${quote(randomUUID())},'preference',${quote(JSON.stringify({ customerId: customer, brandId: "main", channel: "messenger", purpose: "marketing", allowed: true, source: "Native synthetic opt-in evidence", revision: 0 }))}::jsonb);`,
    );
    const source = randomUUID();
    await sql(
      `select sv_engagement_action(${quote(company)},${quote(owner)},${quote(randomUUID())},'campaign',${quote(JSON.stringify({ id: source, brandId: "main", provider: "meta", connectionId: connection, name: "Native synthetic campaign", purpose: "marketing", definition: { kind: "text", body: "Native message", values: [] }, audience: { customer }, dueAt: new Date().toISOString() }))}::jsonb);`,
    );
    const job = await sql(
      `select id from sv_delivery_jobs where company_id=${quote(company)}and source_id=${quote(source)};`,
    );
    return { job, customer };
  }
  const firstDelivery = await delivery(),
    claim = (job: string) =>
      json<{ dispatch: boolean }>(
        `select sv_delivery_claim(${quote(company)},${quote(job)});`,
      );
  const claims = await Promise.all([
    claim(firstDelivery.job),
    claim(firstDelivery.job),
  ]);
  assert.equal(claims.filter((c) => c.dispatch).length, 1);
  await sql(
    `select sv_delivery_finish(${quote(company)},${quote(firstDelivery.job)},'ambiguous',null,'delivery_unknown');`,
  );
  assert.equal((await claim(firstDelivery.job)).dispatch, false);
  const quotaDeliveries = [await delivery(), await delivery()],
    quotaClaims = await Promise.all(quotaDeliveries.map((d) => claim(d.job)));
  assert.equal(quotaClaims.filter((c) => c.dispatch).length, 1);
  assert.equal(
    await sql(
      `select count(*)from sv_delivery_jobs where company_id=${quote(company)}and attempted_at is not null;`,
    ),
    "2",
  );
  const withdrawn = await delivery();
  await sql(
    `select sv_engagement_action(${quote(company)},${quote(owner)},${quote(randomUUID())},'preference',${quote(JSON.stringify({ customerId: withdrawn.customer, brandId: "main", channel: "messenger", purpose: "marketing", allowed: false, source: "Native synthetic withdrawal", revision: 1 }))}::jsonb);`,
  );
  assert.equal((await claim(withdrawn.job)).dispatch, false);
  assert.equal(
    await sql(
      `select state from sv_delivery_jobs where company_id=${quote(company)}and id=${quote(withdrawn.job)};`,
    ),
    "cancelled",
  );
  // Roster constraints participate in the same serialized final capacity slot.
  const branch = randomUUID();
  const roster = (kind: string, data: object) =>
    sql(
      `select sv_roster_action(${quote(company)},${quote(owner)},${quote(randomUUID())},${quote(kind)},${quote(JSON.stringify(data))}::jsonb);`,
    );
  await roster("branch", {
    id: branch,
    name: "Native branch",
    active: true,
    revision: 0,
  });
  for (const user of [owner, agent])
    await roster("member", {
      userId: user,
      branchIds: user === owner ? [branch] : [],
      skills: user === owner ? ["English"] : [],
      timeZone: "Asia/Hong_Kong",
      rosterEnabled: false,
      weekly: [],
      leavePeriods: [],
      revision: 0,
    });
  await sql(
    `update sv_meta_threads set status='resolved'where company_id=${quote(company)};update sv_agent_routing set paused=false,presence='online',seen_at=now(),capacity=1 where company_id=${quote(company)};`,
  );
  await settings(1);
  const routed = await Promise.all(Array.from({ length: 8 }, () => inquiry()));
  for (const id of routed)
    await roster("requirement", {
      provider: "meta",
      threadId: id,
      branchId: branch,
      skills: ["English"],
      revision: 0,
    });
  const routeResults = await Promise.all(
    routed.map((id) =>
      json<{ saved: boolean; ownerId?: string }>(call(id, randomUUID())),
    ),
  );
  assert.equal(routeResults.filter((r) => r.saved).length, 1);
  assert.equal(routeResults.find((r) => r.saved)?.ownerId, owner);
  // A native race between two members admits exactly one editor window.
  const editorThread = await inquiry(),
    tokens = [randomUUID(), randomUUID()],
    actors = [owner, agent];
  const editor = (who: number, mode: string, revision: number | null = null) =>
    json<{ held: boolean; revision: number }>(
      `select sv_editor_action(${quote(company)},${quote(actors[who])},'meta',${quote(editorThread)},${quote(tokens[who])},${quote(mode)},${revision ?? "null"});`,
    );
  const edits = await Promise.all([editor(0, "acquire"), editor(1, "acquire")]);
  assert.equal(edits.filter((r) => r.held).length, 1);
  const old = edits.findIndex((r) => r.held),
    next = 1 - old;
  assert.equal(
    (await editor(next, "takeover", edits[old].revision)).held,
    true,
  );
  assert.equal((await editor(old, "read")).held, false);

  // Two matching rules and duplicate webhook workers still create one private
  // reply candidate. Separate PostgreSQL sessions then compete for checking and
  // final admission; this never calls a provider or fabricates a received DM.
  const socialPost = "10001_900001",
    socialComment = "900001_900002",
    socialPeer = String(++peer);
  for (let i = 0; i < 2; i++) {
    const commandId = randomUUID(),
      definition = {
        id: randomUUID(),
        brandId: "main",
        connectionId: connection,
        postId: socialPost,
        name: "Native synthetic comment rule " + i,
        keywords: ["details"],
        match: "any",
        body: "Native synthetic private reply",
        enabled: true,
        revision: 0,
      };
    await json(
      `select sv_social_comment_action(${quote(company)},${quote(owner)},'save',${quote(JSON.stringify({ commandId, definition }))}::jsonb,${quote(JSON.stringify({ connectionId: connection, postId: socialPost, accountId: "10001", verified: true }))}::jsonb);`,
    );
  }
  const socialAt = Date.now(),
    socialEvent = {
      key: "c".repeat(64),
      accountId: "10001",
      channel: "messenger",
      commentId: socialComment,
      postId: socialPost,
      peerId: socialPeer,
      text: "Please send details",
      createdAt: socialAt,
      eventAt: socialAt,
      deleted: false,
      live: false,
    },
    socialIngest = () =>
      json<number>(
        `select sv_social_comments_ingest(${quote(connection)},${quote(JSON.stringify([socialEvent]))}::jsonb);`,
      );
  const socialIngests = await Promise.all([socialIngest(), socialIngest()]);
  assert.equal(
    socialIngests.reduce((total, count) => total + count, 0),
    1,
  );
  assert.equal(
    await sql(
      `select count(*)from sv_social_comment_jobs where company_id=${quote(company)}and comment_id=${quote(socialComment)};`,
    ),
    "1",
  );
  type SocialClaim = { id: string; token: string } | null;
  const socialClaim = () =>
      json<SocialClaim>(`select sv_social_comments_claim(${quote(company)});`),
    socialClaims = await Promise.all([socialClaim(), socialClaim()]),
    socialWinner = socialClaims.find((claim) => claim !== null);
  assert.equal(socialClaims.filter((claim) => claim !== null).length, 1);
  assert.ok(socialWinner);
  const socialEvidence = {
      commentId: socialComment,
      postId: socialPost,
      accountId: "10001",
      peerId: socialPeer,
      text: socialEvent.text,
      eligible: true,
      createdAt: socialAt,
    },
    socialAdmit = () =>
      json<boolean>(
        `select sv_social_comment_admit(${quote(company)},${quote(socialWinner.id)},${quote(socialWinner.token)},${quote(JSON.stringify(socialEvidence))}::jsonb);`,
      ),
    socialAdmissions = await Promise.all([socialAdmit(), socialAdmit()]);
  assert.equal(socialAdmissions.filter(Boolean).length, 1);
  await sql(
    `select sv_social_comment_finish(${quote(company)},${quote(socialWinner.id)},${quote(socialWinner.token)},'uncertain',null,null,'native_unknown');`,
  );
  assert.equal(await socialClaim(), null);
  assert.equal(await socialAdmit(), false);
  assert.equal(
    await sql(
      `select count(*)from sv_social_comment_attempts where company_id=${quote(company)}and job_id=${quote(socialWinner.id)}and state='sending';`,
    ),
    "1",
  );
  assert.equal(
    await sql(
      `select state from sv_social_comment_jobs where company_id=${quote(company)}and id=${quote(socialWinner.id)};`,
    ),
    "uncertain",
  );
  console.log(
    "Native PostgreSQL: duplicate comment ingestion, overlapping rules, competing admission and unknown replay passed.",
  );

  // Publish the same arbitrary graph as the saved canvas, then race retries of
  // the actual enrollment action and competing catch-up workers. Only the shared
  // outbox may admit an external attempt; no transport is called by this script.
  const flowThread = await inquiry(),
    flowPeer = String(peer),
    flowId = "native-free-graph",
    flowNodeConfig = {
      message: "Native graph message",
      owner,
      waitHours: 1,
      reminderHour: 9,
      template: "Native graph reminder",
      bindings: [],
    },
    graph: Flow = {
      id: flowId,
      clientId: company,
      brandId: "main",
      name: "Native arbitrary graph",
      description: "Synthetic graph admission",
      revision: 1,
      updatedAt: Date.now(),
      nodes: [
        {
          id: "start",
          kind: "trigger",
          title: "Start",
          description: "",
          position: { x: 0, y: 0 },
          config: flowNodeConfig,
        },
        {
          id: "send",
          kind: "message",
          title: "Send",
          description: "",
          position: { x: 200, y: 0 },
          config: flowNodeConfig,
        },
        {
          id: "end",
          kind: "end",
          title: "End",
          description: "",
          position: { x: 400, y: 0 },
          config: flowNodeConfig,
        },
      ],
      edges: [
        {
          id: "start-send",
          source: "start",
          target: "send",
          sourceHandle: null,
        },
        { id: "send-end", source: "send", target: "end", sourceHandle: null },
      ],
    };
  await sql(
    `select sv_meta_ingest(${quote(connection)},${quote(JSON.stringify([{ kind: "inbound", channel: "messenger", accountId: "10001", peerId: flowPeer, at: Date.now(), key: "d".repeat(64), mid: "native-graph-inbound", body: "Native service inquiry", raw: {} }]))}::jsonb);update sv_workspaces set payload=jsonb_set(payload,'{studio,flows}',${quote(JSON.stringify([graph]))}::jsonb),revision=revision+1 where company_id=${quote(company)};`,
  );
  const flowCustomer = await sql(
    `select customer_id from sv_customer_threads where company_id=${quote(company)}and provider='meta'and thread_id=${quote(flowThread)};`,
  );
  await sql(
    `select sv_engagement_action(${quote(company)},${quote(owner)},${quote(randomUUID())},'preference',${quote(JSON.stringify({ customerId: flowCustomer, brandId: "main", channel: "messenger", purpose: "service", allowed: true, source: "Native synthetic service request", revision: 0 }))}::jsonb);update sv_delivery_policies set minute_limit=100 where company_id=${quote(company)};`,
  );
  const publishCommand = randomUUID(),
    publication = {
      action: "publish",
      commandId: publishCommand,
      flow: graph,
      revision: 0,
      trigger: "manual",
      provider: "meta",
      connectionId: connection,
      purpose: "service",
      enabled: true,
      deliveries: {},
    };
  await json(
    `select sv_flow_action(${quote(company)},${quote(owner)},${quote(publishCommand)},'publish',${quote(JSON.stringify(publication))}::jsonb);`,
  );
  const enrollmentCommand = randomUUID(),
    enrollment = {
      action: "enroll",
      commandId: enrollmentCommand,
      flowId,
      threadId: flowThread,
    },
    enrollFlow = () =>
      json<{ saved: boolean; runId: string }>(
        `select sv_flow_action(${quote(company)},${quote(owner)},${quote(enrollmentCommand)},'enroll',${quote(JSON.stringify(enrollment))}::jsonb);`,
      ),
    flowEnrollments = await Promise.all([enrollFlow(), enrollFlow()]);
  assert.deepEqual(flowEnrollments[0], flowEnrollments[1]);
  assert.equal(
    await sql(
      `select count(*)from sv_flow_runs where company_id=${quote(company)}and flow_id=${quote(flowId)};`,
    ),
    "1",
  );
  const flowRun = flowEnrollments[0].runId,
    catchUpFlow = () => json(`select sv_flow_catchup(${quote(company)});`);
  await Promise.all([catchUpFlow(), catchUpFlow()]);
  const flowJobs = await json<{ id: string }[]>(
    `select coalesce(json_agg(json_build_object('id',id)),'[]'::json)from sv_delivery_jobs where company_id=${quote(company)}and origin='flow'and source_id=${quote(flowRun)};`,
  );
  assert.equal(flowJobs.length, 1);
  const flowAdmissions = await Promise.all([
    claim(flowJobs[0].id),
    claim(flowJobs[0].id),
  ]);
  assert.equal(flowAdmissions.filter((result) => result.dispatch).length, 1);
  await sql(
    `select sv_delivery_finish(${quote(company)},${quote(flowJobs[0].id)},'ambiguous',null,'native_graph_unknown');`,
  );
  assert.equal((await claim(flowJobs[0].id)).dispatch, false);
  await sql(
    `update sv_flow_runs set due_at=now() where company_id=${quote(company)}and id=${quote(flowRun)};`,
  );
  await Promise.all([catchUpFlow(), catchUpFlow()]);
  assert.equal(
    await sql(
      `select state from sv_flow_runs where company_id=${quote(company)}and id=${quote(flowRun)};`,
    ),
    "stopped",
  );
  assert.equal(
    await sql(
      `select count(*)from sv_delivery_jobs where company_id=${quote(company)}and origin='flow'and source_id=${quote(flowRun)};`,
    ),
    "1",
  );
  console.log(
    "Native PostgreSQL: duplicate graph enrollment, competing catch-up/outbox claims and unknown-result stop passed.",
  );

  // A private attachment wraps the same real editor/window/actor admission as
  // text. Verified asset metadata here is synthetic; byte sniffing and storage
  // transport are covered separately and are never bypassed for live data.
  const mediaThread = await inquiry(),
    mediaPeer = String(peer),
    mediaAsset = randomUUID(),
    mediaCommand = randomUUID(),
    mediaEditor = randomUUID();
  await sql(
    `select sv_meta_ingest(${quote(connection)},${quote(JSON.stringify([{ kind: "inbound", channel: "messenger", accountId: "10001", peerId: mediaPeer, at: Date.now(), key: "e".repeat(64), mid: "native-media-inbound", body: "Native attachment inquiry", raw: {} }]))}::jsonb);`,
  );
  await json(
    `select sv_media_reserve(${quote(company)},${quote(owner)},${quote(mediaAsset)},${quote(JSON.stringify({ brandId: "main", source: "meta", sourceId: mediaThread, filename: "native-synthetic.pdf", bytes: 128, mimeType: "application/pdf" }))}::jsonb);`,
  );
  await json(
    `select sv_media_verify(${quote(company)},${quote(owner)},${quote(mediaAsset)},${quote(JSON.stringify({ kind: "document", mimeType: "application/pdf", bytes: 128, contentHash: "f".repeat(64) }))}::jsonb);`,
  );
  assert.equal(
    (
      await json<{ held: boolean }>(
        `select sv_editor_action(${quote(company)},${quote(owner)},'meta',${quote(mediaThread)},${quote(mediaEditor)},'acquire',null);`,
      )
    ).held,
    true,
  );
  const mediaRevision = Number(
      await sql(
        `select revision from sv_meta_threads where company_id=${quote(company)}and id=${quote(mediaThread)};`,
      ),
    ),
    claimMedia = () =>
      json<{ dispatch: boolean; message: { id: string; state: string } }>(
        `select sv_media_claim(${quote(company)},${quote(owner)},${quote(mediaAsset)},${quote(mediaCommand)},${mediaRevision},'Native attachment caption',${quote(mediaEditor)});`,
      ),
    mediaClaims = await Promise.all([claimMedia(), claimMedia()]);
  assert.equal(mediaClaims.filter((result) => result.dispatch).length, 1);
  assert.equal(mediaClaims[0].message.id, mediaClaims[1].message.id);
  assert.equal(
    await sql(
      `select count(*)from sv_media_commands where company_id=${quote(company)}and client_id=${quote(mediaCommand)};`,
    ),
    "1",
  );
  assert.equal(
    await sql(
      `select count(*)from sv_meta_messages where company_id=${quote(company)}and thread_id=${quote(mediaThread)}and direction='outbound';`,
    ),
    "1",
  );
  await sql(
    `select sv_meta_finish(${quote(company)},${quote(mediaClaims[0].message.id)},'uncertain',null,'native_media_unknown');`,
  );
  const mediaReplay = await claimMedia();
  assert.equal(mediaReplay.dispatch, false);
  assert.equal(mediaReplay.message.state, "uncertain");
  assert.equal(mediaReplay.message.id, mediaClaims[0].message.id);
  console.log(
    "Native PostgreSQL: private-media competing admission and same-receipt unknown replay passed.",
  );

  // Synthetic website sessions never guess a CRM identity. A verified site must
  // be explicitly enabled, and both visitor and staff retries share one durable
  // message sequence even when separate PostgreSQL sessions arrive together.
  const chatOrigin = "https://example.org",
    chatProof = "a".repeat(48),
    chatHash = "b".repeat(64),
    chatRate = "9".repeat(64),
    chatWidget = randomUUID(),
    chatThread = randomUUID(),
    chatVisitorCommand = randomUUID(),
    chatStaffCommand = randomUUID(),
    chatForeignCompany = randomUUID(),
    chatForeignWidget = randomUUID();
  const createChatWidget = async (tenant: string, id: string) => {
    const data = {
      id,
      brandId: "main",
      name: "Native synthetic website",
      greeting: "Native synthetic greeting",
      origins: [chatOrigin],
      enabled: false,
      revision: 0,
    };
    const command = randomUUID(),
      configure = () =>
        json<{ ok: boolean }>(
          `select sv_web_chat_configure(${quote(tenant)},${quote(owner)},${quote(command)},${quote(JSON.stringify(data))}::jsonb,${quote(chatProof)});`,
        ),
      // Both callers contend while a separate transaction holds the config
      // lock; the shared command receipt must still resolve to one revision.
      configurations = await raceUnderNativeLock(
        `select pg_advisory_xact_lock(hashtextextended('web-chat-config:'||${quote(tenant)}||':'||${quote(id)},0));`,
        () => Promise.all([configure(), configure()]),
      );
    assert.deepEqual(configurations[0], configurations[1]);
    assert.equal(configurations[0].ok, true);
    assert.equal(
      await sql(
        `select count(*)from sv_action_receipts where company_id=${quote(tenant)}and command_id=${quote(command)}and kind='web-chat-config';`,
      ),
      "1",
    );
    assert.equal(
      await sql(
        `select revision from sv_web_chat_configs where company_id=${quote(tenant)}and id=${quote(id)};`,
      ),
      "1",
    );
    await assert.rejects(
      () =>
        json(
          `select sv_web_chat_public_config(${quote(id)},${quote(chatOrigin)});`,
        ),
      /chat_unavailable/,
    );
    await json(
      `select sv_web_chat_verify(${quote(tenant)},${quote(owner)},${quote(randomUUID())},${quote(id)},1,${quote(chatOrigin)},${quote(chatProof)});`,
    );
    await json(
      `select sv_web_chat_configure(${quote(tenant)},${quote(owner)},${quote(randomUUID())},${quote(JSON.stringify({ ...data, revision: 2, enabled: true }))}::jsonb,${quote(chatProof)});`,
    );
  };
  await createChatWidget(company, chatWidget);
  const chatForeignState = createCompanyState({
    companyId: chatForeignCompany,
    companyName: "Native foreign website",
    brands: [{ id: "main", name: "Main", short: "M" }],
    team: [{ id: owner, name: "Owner", initials: "O" }],
  });
  await sql(
    `select sv_provision_company(${quote(chatForeignCompany)},'Native foreign website',${quote(owner)},'Owner',${quote(JSON.stringify(chatForeignState))}::jsonb,array['crm']);`,
  );
  await createChatWidget(chatForeignCompany, chatForeignWidget);
  const customersBeforeChat = await sql(
    `select count(*)from sv_customers where company_id=${quote(company)};`,
  );
  await json(
    `select sv_web_chat_start(${quote(chatWidget)},${quote(chatOrigin)},${quote(chatThread)},${quote(chatHash)},'Native visitor',${quote(chatRate)});`,
  );
  const chatSend = (
      widget = chatWidget,
      origin = chatOrigin,
      hash = chatHash,
      body = "Native visitor question",
    ) =>
      json<{ ok: boolean; id: string }>(
        `select sv_web_chat_visitor_send(${quote(widget)},${quote(origin)},${quote(chatThread)},${quote(hash)},${quote(chatVisitorCommand)},${quote(body)});`,
      ),
    chatVisitorReplies = await Promise.all([chatSend(), chatSend()]);
  assert.deepEqual(chatVisitorReplies[0], chatVisitorReplies[1]);
  assert.equal(chatVisitorReplies[0].id, chatVisitorCommand);
  assert.equal(
    await sql(
      `select count(*)from sv_web_chat_messages where company_id=${quote(company)}and thread_id=${quote(chatThread)};`,
    ),
    "1",
  );
  assert.equal(
    await sql(
      `select revision from sv_web_chat_threads where company_id=${quote(company)}and id=${quote(chatThread)};`,
    ),
    "1",
  );
  await assert.rejects(
    () => chatSend(chatWidget, chatOrigin, "c".repeat(64)),
    /chat_session_invalid/,
  );
  await assert.rejects(
    () => chatSend(chatWidget, "https://www.example.org"),
    /chat_unavailable/,
  );
  await assert.rejects(
    () => chatSend(chatForeignWidget),
    /chat_session_invalid/,
  );
  await assert.rejects(
    () => chatSend(chatWidget, chatOrigin, chatHash, "Changed retry"),
    /idempotency_conflict/,
  );
  assert.equal(
    await sql(
      `select count(*)from sv_customers where company_id=${quote(company)};`,
    ),
    customersBeforeChat,
  );
  assert.equal(
    await sql(
      `select count(*)from sv_web_chat_threads where company_id=${quote(company)}and id=${quote(chatThread)}and customer_id is null;`,
    ),
    "1",
  );
  const chatStaffData = {
      action: "reply",
      threadId: chatThread,
      revision: 1,
      body: "Native staff reply",
    },
    chatStaffReply = () =>
      json<{ ok: boolean }>(
        `select sv_web_chat_staff_action(${quote(company)},${quote(owner)},${quote(chatStaffCommand)},${quote(JSON.stringify(chatStaffData))}::jsonb);`,
      ),
    chatStaffReplies = await Promise.all([chatStaffReply(), chatStaffReply()]);
  assert.deepEqual(chatStaffReplies[0], chatStaffReplies[1]);
  assert.equal(chatStaffReplies[0].ok, true);
  assert.equal(
    await sql(
      `select count(*)from sv_web_chat_messages where company_id=${quote(company)}and thread_id=${quote(chatThread)};`,
    ),
    "2",
  );
  assert.equal(
    await sql(
      `select revision from sv_web_chat_threads where company_id=${quote(company)}and id=${quote(chatThread)};`,
    ),
    "2",
  );
  assert.equal(
    await sql(
      `select count(*)from sv_action_receipts where company_id=${quote(company)}and command_id=${quote(chatStaffCommand)}and kind='web-chat-staff';`,
    ),
    "1",
  );
  const chatHistory = await json<{
    messages: { id: string; body: string; sequence: number }[];
  }>(
    `select sv_web_chat_visitor_read(${quote(chatWidget)},${quote(chatOrigin)},${quote(chatThread)},${quote(chatHash)},0);`,
  );
  assert.deepEqual(
    chatHistory.messages.map((message) => message.id),
    [chatVisitorCommand, chatStaffCommand],
  );
  assert.deepEqual(
    chatHistory.messages.map((message) => message.sequence),
    [1, 2],
  );
  console.log(
    "Native PostgreSQL: verified website enablement, competing visitor/staff retries, exact session scope and explicit CRM identity passed.",
  );
  console.log(
    "Native PostgreSQL: roster-scoped final slot and competing editor takeover passed.",
  );
  console.log(
    "Native PostgreSQL: one external-attempt admission, unknown replay, concurrent shared quota and consent cancellation passed.",
  );
  console.log(
    "Native PostgreSQL: parallel translation deduplication and shared last-slot AI quota passed.",
  );
  console.log(
    "Native PostgreSQL: busy-row skip, queue catch-up, concurrent capacity, receipt replay and round-robin fairness passed.",
  );
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
