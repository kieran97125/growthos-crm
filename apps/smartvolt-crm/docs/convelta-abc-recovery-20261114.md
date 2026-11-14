# Convelta A/B/C implementation recovery checkpoint

Date: 2026-11-14 (Hong Kong). Status: **development interrupted; not accepted or released**.

The user authorized implementing batches A, B and C first (13 work packages) from [the expansion roadmap](convelta-expansion-roadmap-20261114.md). D/E/F remain outside this implementation request. Keep the beginner-friendly existing navigation and shared, company-isolated SaaS architecture.

## Published source and production

- Repository: kieran97125/growthos-crm.
- Planning source: `1b7ffc21a85bb0cb20cf3c4ee0a4bbedd0ff172f`, draft planning PR #9.
- Accepted runtime branch: `feat/smartvolt-standalone-saas-20261111`, source `19450c1893d46f6feb4dfd1518b9530c44202f37`.
- Independently rechecked after interruption: app.convelta.io remains on `dpl_Es1fAhBUk6EaidXBS1fAxutDCGC6`, READY, at that accepted runtime source.
- Latest hosted migration is still `20261113202249_convelta_inbox_translation`.
- **No ABC migration was applied, no application release was deployed, and no production invitations, customer messages, push notifications, AI/model calls or conversion events were sent during this attempt.**
- Existing translation/FAQ/operations releases and their acceptance remain unchanged.

## Interruption and source recovery

The executor reported `exec-server transport disconnected`, then `failed to resume exec-server session: recovery timed out after 45s`. The environment subsequently reported `unavailable`.

The interrupted checkout was:
`/workspace/scratch/144a38aaf58b/convelta`, local branch `feat/convelta-abc-20261114`, created from the planning commit above.

The feature edits were **uncommitted and not pushed** when the environment became unavailable. Recovery of those exact file bytes is **not yet verified**. This checkpoint commits documentation only; it is not a backup of the feature source.

On resumption, inspect that checkout before creating another implementation branch or replacing files. Do not reset, clean, or overwrite uncommitted source. If the checkout cannot be recovered, rebuild from the durable baseline and this record; do not claim the interrupted code was published.

The last attempted execution cell failed before running its first command. Its proposed notification-runtime files, service worker, scope-server helpers, ESLint/generated-file ignores and LiveBroadcast lint fix were **not applied**.

## Locally authored work before interruption

### A3/A4/B1/B2/B3: delivery and journeys

Confirmed local files:
- `src/lib/engagement/{model,templates,server,worker}.ts`
- `src/workflows/messages.ts`
- `src/app/api/companies/[companyId]/engagement/route.ts`
- `src/lib/saas/database.ts` (cookie-independent server database client); existing `saas/server.ts` re-exports it.
- `src/lib/whatsapp/graph.ts`: validated, single-attempt template POST using existing transport semantics.
- `next.config.ts`: withWorkflow; `src/proxy.ts`: excludes only documented internal Workflow paths.

Contracts drafted/implemented locally:
- SQL owns immutable audience/version evidence, contact preferences, durable outbox, dispatch admission, attempts and provider receipts. Workflow wakes/orchestrates; replay never independently authorizes a second provider POST.
- Company/brand/purpose consent, withdrawals, frequency, quiet hours, daily/minute caps, current actor/product/brand access, connection health and current template version checked at dispatch.
- Ambiguous provider outcomes remain unknown; signed receipts may reconcile them without a resend.
- Fixed Meta host, no following token-bearing pagination URLs, bounded full-inventory reads, exact named/positional variables; unsupported template components remain blocked.
- Campaigns save drafts and snapshots, publish/schedule/cancel; rendered per-customer message and source IDs retained.
- Frozen journey versions and source-bound runs for unanswered follow-up, confirmed POS appointment reminders and completed-service follow-up. Customer replies/withdrawals/source changes stop invalid steps.
- Appointment reminder steps use descending minutes-before-appointment; other recipes use ascending delays.

Packages installed only in the interrupted checkout:
- workflow 5.5.0, web-push 4.0.0, recharts 3.10.1.
- vitest 5.1.0, @workflow/vitest 5.0.9, @types/web-push.
- @types/node moved to a pinned Node 24 release because Vitest 5 rejects the former Node 20 type peer. Read the recovered lockfile for exact resolved type versions.
- No second queue/state/Redis stack was added.

### A2: team lifecycle and granular scopes

Confirmed local files:
- `src/lib/team/{model,server}.ts`
- `src/app/api/companies/[companyId]/team/route.ts`
- `src/app/api/team/accept/route.ts`
- `src/app/auth/invite/page.tsx`
- `src/lib/saas/member-scope.ts`
- Existing `src/lib/saas/server.ts` and workspace route project effective member products/brands.

Local contract:
- Stored membership brand/product grants; no authorization from editable JWT metadata.
- Owner-only invite/change/suspend/reactivate/remove, immutable owner path, revision checks, seat admission, append-only audit.
- Invitation access state is distinct from email transport state; submitted is not delivered/accepted.
- Domain-separated HMAC nonce derived from the existing server encryption key and command identity; only its hash stored.
- Administrative invitation for a new identity; existing confirmed identity can receive passwordless sign-in with creation disabled.
- Acceptance verifies the actual Auth user and email, nonce, expiry, company state and current product/brand grant; then installs membership atomically.
- Implicit invite fragment is removed from browser history and exchanged at a same-origin server endpoint for HttpOnly session cookies.

**Incomplete:** no team management UI, hosted Auth redirect/mailbox acceptance, recovery exercise, or comprehensive audit of legacy direct server reads was completed.

### B/C user interface

Confirmed local files:
- `src/components/engagement/{LiveBroadcast,Journeys,VariablesEditor}.tsx`
- `src/components/engagement/useCommand.ts`
- `src/components/engagement/engagement.css`
- Existing `BroadcastStudio.tsx` selects the live company surface while keeping demo behavior separate.
- `src/lib/supervision/{model,server}.ts`
- `src/app/api/companies/[companyId]/supervision/route.ts`

Live broadcast UI drafted: campaign rail; choose audience → write message → set time; current eligibility/reasons; template sync, variables and preview; quiet/rate settings; results; three editable journey recipes. Mobile styles, visible failure feedback and pending-command replay controls are present but not browser accepted.

Supervision server/model drafted: waiting/overdue rows, office-hours settings, rosters/leave/skills/branches, reply leases and full-dataset reports.

**Incomplete:** supervisor/report/roster/team/notification settings UI, customer contact-preference UI and inbox template/reply-presence integration.

## Local migration inventory — NONE applied remotely

Create migration files through the CLI; the following names were genuinely generated during the attempt:

1. `20261114110521_convelta_abc_messaging_foundation.sql`
   - message policies, preference current state + immutable events, templates, campaign versions, journeys/runs, jobs/attempts, idempotent command receipts, preview/render/publish policy.
2. `20261114110958_convelta_abc_delivery_worker.sql`
   - dispatch claim/finish, existing WA receipt integration, inbound withdrawal and journey stop triggers, stale attempts become unknown.
3. `20261114111230_convelta_abc_journeys_reads.sql`
   - provider template storage, preview/read pagination, frozen enrollment/scan, utility-template reply queue.
4. `20261114111912_convelta_abc_team_access.sql`
   - membership scope columns, staff invitations, team audit, grant/seat/owner checks, email claim and identity acceptance.
5. `20261114112356_convelta_abc_scope_enforcement.sql`
   - 28 explicit redefinitions of existing local functions and scope helpers to extend stored grants to legacy paths.
6. `20261114112548_convelta_abc_supervision_notifications.sql`
   - supervision settings, operating branches, roster/leave rules, reply leases, notification/push tables, private message timeline, business-minute/SLA computations and monitoring/read functions.
7. `20261114114258_convelta_abc_operations_reports.sql`
   - supervision mutations, verified outcome/campaign association views and aggregate-first operational reporting.

Static scope migration generation helper was local intermediate:
`/workspace/scratch/144a38aaf58b/build-abc-scope.py`.
It extracts only existing Convelta function definitions and makes explicit scoped replacements. It does not copy enterprise pilot code. Inspect both generated SQL and helper before regenerating.

All new raw evidence tables were designed with RLS and no PUBLIC/anon/authenticated grants; service-side RPCs use security invoker and explicit authorization. Verify exact final privileges and native Postgres lock behavior before release.

## Verification evidence and its limits

1. Early delivery database slice: 5/5 passed in PGlite, covering durable rendered snapshots and replay, unknown outcomes with no duplicate message, withdrawal/template/member rechecks, quiet-hour deferral/cancel and protected raw evidence.
2. Existing operations suite: 17/17 passed before the granular-scope migration was added.
3. After granular scope changes, a combined run had **19/22 passing**, with three assertions failing because rejection text/order changed (`customer_product_required` or `member_brand_scope` versus expected `access_denied`).
   - Authorization order was subsequently corrected in the local generator/helpers, preserving existing error contracts.
   - The latest rerun was started after the new reporting SQL, but its outcome was **not observed** before environment loss. Do not call that rerun successful.
4. Latest observed TypeScript check completed with exit 0 after correcting POS projection fields to catalog/resources, linking bookings by conversation and versions by their embedded flow.
5. Workflow compilation succeeded with 1 workflow/20 discovered steps and Next production compilation succeeded; that earlier build then failed TypeScript on the now-corrected projection fields. No later full build success is recorded.
6. Latest observed lint still had one error: synchronous setState inside the LiveBroadcast preview effect. Generated Workflow output warnings and an unused test variable also remain.
   - The proposed fix was in the unexecuted failed cell. It is **not present** yet.
7. No new Workflow integration, browser/axe/mobile, native PostgreSQL concurrency, second-tenant end-to-end or production acceptance has passed for ABC.
8. `tests/engagement-database.test.ts` is the new local five-case test file. Existing suites remain the regression authority.

## Release blockers and next implementation work

- Recover/persist the exact local source first; run git status/diff, inspect packages/lockfile and read this record.
- Complete member scoping on all legacy direct server reads: WA connection/inbox/detail; Meta detail/connection list; customer brand links/events/requests; copilot historical thread/brief/receipt reads and any cached AI paths. SQL list functions alone are insufficient. Filter scoped POS audit history too.
- Complete command-level brand checks, employee directory projection, immutable owner/seat lifecycle and current-grant revocation tests.
- Review the granular SQL generator's function signatures, exact predicate substitutions and old error ordering, including WA manage and booking request action names.
- Install generated Workflow output ignores, fix preview effect without disabling hooks rules, bind previews to their current audience key, fix comma-entry UX, enforce read-only controls and add real result pagination.
- Add independent durable Workflow tests, worker ownership/generation lease, wake-up on new earlier jobs and a bounded watchdog. Current starts can create duplicate sleeping workflows; SQL prevents duplicate sends but resource coordination is unfinished.
- Validate user-initiated utility template replies for agent role; current dispatch admission is too restricted to owner/manager for this path.
- Add observable blocked outcomes for credential/setup failure. Ensure template rechecks do not prevent an already-completed publish receipt from being recovered during provider downtime.
- Complete journey integration with CRM confirmed bookings as well as POS, explicit human takeover, late reminders, version edit/stop and multi-step frequency semantics; integrate supported published Flow versions honestly.
- Finish B4: subscription endpoint allowlist, private device storage, dedicated internal notification preference/quiet/daily budget, one-attempt push claims, expiry/410 handling, no sensitive message preview, private service worker click target and actual device acceptance. No notification runtime/service worker source was applied.
- Finish C1/C2: render supervision and roster settings; atomically enforce reply leases in real send admission, preserve drafts and provide explicit takeover; expose branch/skill routing and verify concurrent capacity/revocation/leave.
- Validate C3 aggregate counts before pagination, business-hour first reply, resolved/reopened definitions, first-inquiry cohort and observation cutoff, actual booking/attendance and cents minus refunds. Show the seven-day latest-campaign temporal association as such, never a causal lift or fabricated ROAS.
- A1: per-channel configuration/authorization/inbound/send/receipt readiness UI and real provider acceptance remain open.
- A5: the same dedicated project already has `website_private.enquiries`, `enquiry_events`, `intake_settings`, `rate_buckets`; only schema/function definitions were inspected, not customer records. Resolve company from the existing intake setting; configure brand explicitly; use stable enquiry IDs and exclude tests. Implement own-site handoff without fake WhatsApp/Meta threads or inferring WhatsApp marketing consent.
- C4: source evidence and Meta CAPI implementation not started. Verify current official Business Messaging API event/permission requirements first; earlier direct pages returned 429 and searches did not establish the complete payload contract. Never infer a conversion from interest/stage, create synthetic production conversions or copy private pilot data.
- Run focused tests, full serial unit/database suite, lint, build, Workflow integration, hosted browser/axe/mobile, native PostgreSQL concurrency, second tenant and current-grant boundary cases. Only then apply reviewed additive migrations, deploy the exact accepted source and verify current production.
- Keep D/E/F planned and preserve all previously completed cards. ABC is not complete.

## Product Learning Sync checked

Fresh canonical protocol/index/main checkpoint and the existing reviewed-change proposal were read. Entries considered in full:
- 2026-07-26-whatsapp-broadcast-operations-boundary.md
- 2026-07-29-connector-readiness-and-identity-boundary.md
- 2026-07-31-master-owned-member-invitation-lifecycle.md
- 2026-08-10-permission-aware-aggregate-brand-scope.md
- 2026-10-06-optional-operator-settings.md
- 2026-10-15-brand-owned-financial-dashboards.md
- 2026-08-03-brand-owned-conversion-destination.md
- 2026-11-11-account-owned-report-segments.md

Only neutral product contracts were used. No pilot credentials, identity, legal copy, prices, operational formulas, customer records or implementation code were imported. The canonical reviewed-change proposal remains draft PR #88 in leadhub-source-os. This interrupted implementation is not a new accepted release or Core adoption claim.
