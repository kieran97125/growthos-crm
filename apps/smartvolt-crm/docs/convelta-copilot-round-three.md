# Convelta C — round three

The user moved round three ahead of channel-dependent round two. C is the
company's operating partner: it understands the current page and selected
customer, recalls the current user's work, reads authorized company records,
and prepares useful next steps with evidence.

## Delivered behavior

- The blue C mark opens an assistant beside the current page. The full C
  workroom is the default CRM AI page and is also available to a POS-only
  company at `/company/:company/copilot?product=pos`. Shared company chrome
  preserves the conversation and unsent composer while navigating within a
  product. History is scoped to company, actor and purchased product.
- The workroom includes task history, conversation, customer service/sales/
  analysis/activity prompts, source details, follow-up questions and saved
  campaign drafts. Campaign status describes internal preparation, not sending.
- Background observations use real current records: overdue work, dormant
  inquiries without a future confirmed appointment, customer interest tags,
  booking assistance and sufficiently supported cohort differences. A tag is
  proposed beside the native customer editor and requires explicit confirmation.
- Proactive comments wait for an idle, visible page and do not interrupt typing.
  Seen, dismissed, accepted, snoozed and quiet preferences persist. A recent
  interaction suppresses another interruption for three minutes across reloads.
  Proactive model generation has a separate maximum of three per Hong Kong day
  and five-minute spacing, within the existing shared company AI allowance.
  Preferences remain usable while C is thinking. Background operation is
  app-active/focus catch-up; this release does not introduce an offline scheduler.
- Every existing staff reply assistant offers six purposes: answer, booking,
  objection handling, follow-up, empathy and concise reply. The purpose is bound
  to the frozen idempotent request and uses the existing knowledge validation,
  owner configuration, daily quota and human review workflow.

## Data, memory and actions

The AI SDK tool loop has five read-only tools: business facts, approved company
knowledge, the Convelta usage guide, the current user's earlier C work, and
workspace configuration. Configuration covers saved Flow/BOT settings, actual
POS service catalog, recent/future appointments and active team role counts.
There is no invented shift roster or confirmed availability. Tool lists are
bounded and label partial coverage; complete aggregate SQL is calculated before
top-50 cohort display limits. Current tags overlap and cannot be summed.

CRM inquiry conversion uses distinct linked customers, their first recorded
incoming message in the 90-day window, and a confirmed booking after that inquiry.
Cancelled linked POS appointments are excluded. Current tags may follow a booking;
these are observational cohorts, not causal attribution. Proactive comparison
requires at least 20 people in the proposed cohort, 40 in the company baseline,
and separated 95% Wilson intervals. POS receipts are actual manual-verification
ledger receipts less refunds, not advertising revenue or acquisition performance.

Approved knowledge citations carry exact verified quotations. Output validation
rejects unknown evidence, unexecuted action claims, unsupported prices and unknown
URLs. Campaign copy prices must occur in the cited approved company quotations.
Customer text, names, knowledge and older messages are treated as untrusted data.
The agent cannot send, book, pay or change records. App-owned actions independently
recheck authorization, fresh context, revision and the owned server receipt.

Persistent threads/messages/feedback/briefs/command receipts have RLS enabled and
deny browser-role access. Security-invoker functions are service-role only and
reauthorize active membership/product access. Evidence and command receipts are
append-only. Repeated requests replay the same receipt; lost/expired workers
reconcile to a terminal result rather than dispatching a second model request.
Memory searches cannot access another actor's work or an unpurchased product.

No verified broadcast delivery adapter exists yet. C explicitly labels this
coverage unavailable; it cannot conclude that a company has stopped broadcasting
or infer consent. Round two, real channel authorization/acceptance and actual
campaign execution remain separate system cards.

## Navigation performance and dependency choice

Server identity/company access is deduplicated with request-scoped React cache.
The native inbox no longer loads the legacy full workspace/customer projection
before its own API request. Route loading feedback is immediate. C's initial
background read is delayed and never blocks navigation; AI inference is not in
the page-render path. Real company p95 under production traffic remains a distinct
measurement task; these changes do not claim a measured speedup.

`streamdown@2.7.1` is the one added runtime package. It provides maintained rich
AI Markdown, including readable lists/tables. The workroom is lazy loaded from
the common chrome. Raw HTML and remote images are disabled, links are HTTPS-only,
and Convelta's native CSS supplies responsive typography without a CSS framework
or unused code/math/diagram plugins. Existing AI SDK and Next packages are retained.

## Verification and rollout

Local typecheck, lint, 220 unit/PostgreSQL tests and the production build pass.
New tests cover complete aggregates, tenant/actor/product boundaries, immutable
replay, shared quota, stale worker recovery, explicit tag confirmation, owned
campaign plans, proactive limits, source/price validation and a real SDK mock
two-step tool loop. Browser acceptance composes the actual production components
with browser-only synthetic data; no fixture/auth bypass ships in the app.
Hosted browser/deployment evidence is recorded below when completed.

Dedicated hosted migration `20261113093933_convelta_copilot` was installed on
2026-11-13. SQL SHA-256:
`c7c12c93d685ed34b649b73c91376372553cdf6c6aface63c1a6ee4a83a05f6c`.
Five new tables have RLS and browser-denied grants; all seven C functions are
security invoker and deny anon/authenticated execution. The hosted company
snapshot is revision 3, with five approved articles and zero customers, inquiries,
confirmed bookings and active channels. Empty-state recommendations must remain
truthful. No synthetic customers or financial transactions were inserted.
Advisor findings for these private tables are informational deny-all RLS and
new unused indexes; existing website function/Auth/foreign-key findings are
outside this additive C migration.

Tracking: `ai-round-three`, `workspace-route-performance`, and the deferred
`round-two-journeys` company system cards. Actual authenticated C model acceptance
and production scale measurements must be recorded separately from mocked UI/SDK
verification if an authenticated owner session is unavailable.

## Product Learning

Product Learning Sync checked against the canonical protocol, index, checkpoint
and these relevant entries before implementation:

- `2026-07-16-alyssa-crm-operations-extraction.md`
- `2026-07-26-whatsapp-broadcast-operations-boundary.md`
- `2026-07-28-marketing-command-center-data-source-boundary.md`
- `2026-08-05-shared-cost-kpi-projection.md`
- `2026-08-10-permission-aware-aggregate-brand-scope.md`
- `2026-11-11-account-owned-report-segments.md`

Adopted only neutral source authority, complete aggregates, observational metric
limits, purchased-product scope and preparation/execution boundaries. No client
runtime, records, identity, prices, domains, credentials or hardcoding imported.
The canonical checkpoint is updated through the existing reviewed draft PR #88.
