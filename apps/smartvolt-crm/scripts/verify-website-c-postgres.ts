import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createCompanyState } from "../src/lib/saas/workspace";
/** Uses the caller's isolated PostgreSQL service; no live model or tenant. */
export async function verifyWebsiteCNative(
  sql: (query: string) => Promise<string>,
  owner: string,
  raceUnderLock: <T>(lock: string, work: () => Promise<T>) => Promise<T>,
) {
  const q = (s: string) => "'" + s.replaceAll("'", "''") + "'";
  const json = async (s: string) => JSON.parse(await sql(s));
  const company = randomUUID(),
    widget = randomUUID(),
    thread = randomUUID(),
    message = randomUUID();
  const site = "https://native-c.example.org",
    proof = "d".repeat(48),
    token = "e".repeat(64);
  const state = createCompanyState({
    companyId: company,
    companyName: "Native C",
    brands: [{ id: "main", name: "Main", short: "M" }],
    team: [{ id: owner, name: "Owner", initials: "O" }],
  });
  state.studio.articles = [
    {
      id: "public-faq",
      clientId: company,
      brandId: "main",
      title: "Public services",
      content: "We organise enquiries and follow-up work.",
      keywords: ["features"],
      source: site,
      status: "approved",
      validUntil: "9999-12-31",
      revision: 1,
    },
  ];
  await sql(
    `select sv_provision_company(${q(company)},'Native C',${q(owner)},'Owner',${q(JSON.stringify(state))}::jsonb,array['crm']);select sv_ai_configure(${q(company)},${q(owner)},true);insert into sv_ai_runtime values('platform','synthetic/model','ready',null,now())on conflict(id)do update set model='synthetic/model',status='ready';`,
  );
  const config = {
    id: widget,
    brandId: "main",
    name: "Native C",
    greeting: "Hello",
    origins: [site],
    enabled: false,
    revision: 0,
    aiEnabled: true,
    aiArticleIds: ["public-faq"],
    accentColor: "#166534",
  };
  await sql(
    `select sv_web_chat_configure(${q(company)},${q(owner)},${q(randomUUID())},${q(JSON.stringify(config))}::jsonb,${q(proof)});select sv_web_chat_activate(${q(company)},${q(owner)},${q(randomUUID())},${q(widget)},1,${q(proof)});select sv_web_chat_start(${q(widget)},${q(site)},${q(thread)},${q(token)},'Native visitor',${q("f".repeat(64))});`,
  );
  const send = () =>
    json(
      `select sv_web_chat_receive(${q(widget)},${q(site)},${q(thread)},${q(token)},${q(message)},'What features?','message','{}');`,
    );
  const receipts = await Promise.all([send(), send()]);
  assert.deepEqual(receipts[0], receipts[1]);
  const claim = () =>
    json(
      `select sv_web_chat_c_claim(${q(company)},${q(message)},'synthetic/model');`,
    );
  const claims = await Promise.all(Array.from({ length: 8 }, claim));
  assert.equal(claims.filter((c) => c.dispatch).length, 1);
  const result = {
    decision: "draft",
    reply: "We organise enquiries and follow-up work.",
    sources: [{ id: "public-faq" }],
  };
  const finish = () =>
    json(
      `select sv_web_chat_c_finish(${q(company)},${q(message)},${q(JSON.stringify(result))}::jsonb,null,100,20);`,
    );
  const finishes = await Promise.all([finish(), finish()]);
  assert.equal(finishes[0].state, "completed");
  assert.equal(finishes[1].state, "completed");
  assert.equal(
    await sql(
      `select count(*)from sv_web_chat_messages where company_id=${q(company)}and sender='c';`,
    ),
    "1",
  );
  // Independent visitors compete for the final company-wide model admission.
  await sql(
    `update sv_ai_settings set daily_limit=2 where company_id=${q(company)};`,
  );
  const messages: string[] = [];
  for (let i = 0; i < 2; i++) {
    const t = randomUUID(),
      m = randomUUID();
    messages.push(m);
    await sql(
      `select sv_web_chat_start(${q(widget)},${q(site)},${q(t)},${q(token)},'Quota visitor',${q(String(i).repeat(64))});select sv_web_chat_receive(${q(widget)},${q(site)},${q(t)},${q(token)},${q(m)},'What features?','message','{}');`,
    );
  }
  const finalSlots = await Promise.all(
    messages.map((m) =>
      json(
        `select sv_web_chat_c_claim(${q(company)},${q(m)},'synthetic/model');`,
      ),
    ),
  );
  assert.equal(finalSlots.filter((c) => c.dispatch).length, 1);
  assert.equal(
    await sql(
      `select count(*)from sv_web_chat_c_turns where company_id=${q(company)}and admitted_at is not null;`,
    ),
    "2",
  );
  // The existing staff request ledger shares the same lock and final budget.
  await assert.rejects(
    () =>
      sql(
        `insert into sv_ai_requests(company_id,request_id,actor_id,brand_id,source,status,workspace_revision,request_hash,model)values(${q(company)},${q(randomUUID())},${q(owner)},'main','playground','running',0,'${"a".repeat(64)}','synthetic/model');`,
      ),
    /ai_daily_limit/,
  );
  console.log(
    "Native PostgreSQL: duplicate visitor capture, one C dispatch/publication and shared staff/public AI quota passed.",
  );
  const oldTurn = randomUUID();
  await sql(
    `update sv_ai_settings set daily_limit=100 where company_id=${q(company)};select sv_web_chat_receive(${q(widget)},${q(site)},${q(thread)},${q(token)},${q(oldTurn)},'Interrupted question','message','{}');update sv_web_chat_c_turns j set state='running',admitted_at=now()-interval'3 minutes',model='synthetic/model',context_hash=smartvolt_private.web_chat_c_context_hash(c)from sv_web_chat_configs c where j.company_id=${q(company)}and j.message_id=${q(oldTurn)}and c.company_id=j.company_id and c.id=${q(widget)};`,
  );
  const revision = Number(
    await sql(
      `select revision from sv_web_chat_threads where company_id=${q(company)}and id=${q(thread)};`,
    ),
  );
  const reply = {
    action: "reply",
    threadId: thread,
    revision,
    body: "Native staff resolves the question",
  };
  // Recovery starts while the staff response owns the thread row. It must
  // observe the committed response after waiting, not resurrect stale work.
  const recovered = await raceUnderLock(
    `select sv_web_chat_staff_action(${q(company)},${q(owner)},${q(randomUUID())},${q(JSON.stringify(reply))}::jsonb);`,
    () =>
      json(
        `select sv_web_chat_c_claim(${q(company)},${q(oldTurn)},'synthetic/model');`,
      ),
  );
  assert.equal(recovered.state, "superseded");
  assert.equal(
    await sql(
      `select human_waiting from sv_web_chat_threads where company_id=${q(company)}and id=${q(thread)};`,
    ),
    "f",
  );
  await sql(
    `select sv_web_chat_receive(${q(widget)},${q(site)},${q(thread)},${q(token)},${q(randomUUID())},'Human please','human','{}');select sv_notification_action(${q(company)},${q(owner)},${q(randomUUID())},'device',${q(JSON.stringify({ endpoint: "https://fcm.googleapis.com/native-c-" + company, p256dh: "synthetic", auth: "synthetic", label: "Native fake device — no network" }))}::jsonb);update sv_notification_preferences set data=(data-'website')||'{"push":true,"quietStart":0,"quietEnd":0}'::jsonb where company_id=${q(company)}and user_id=${q(owner)};`,
  );
  const preferences = await json(
    `select sv_notification_read(${q(company)},${q(owner)});`,
  );
  assert.equal(preferences.preferences.data.website, true);
  const notice = await sql(
    `select id from sv_notifications where company_id=${q(company)}and user_id=${q(owner)}and kind='website'and source_key like ${q("website:" + thread + ":% ".trim())}and state='open';`,
  );
  const admitted = await json(
    `select sv_push_claim(${q(company)},${q(owner)});`,
  );
  assert.ok(
    admitted.some(
      (a: { notificationId: string }) => a.notificationId === notice,
    ),
  );
  assert.equal(
    (await json(`select sv_push_claim(${q(company)},${q(owner)});`)).length,
    0,
  );
  console.log(
    "Native PostgreSQL: staff-held response versus expired C recovery, legacy website push defaults and no redispatch passed (no external send).",
  );
}
