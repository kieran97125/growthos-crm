# Convelta conversation operations

The user requested the public strengths of Respond.io be adopted into Convelta.
This is a product capability comparison, implemented against Convelta's own
identity, data and design system. CRM and POS stay separately purchased products.

The delivery standard is one operational chain: inquiry → qualification →
accountable handoff → booking → actual attendance/payment → retention. A stage
or AI interest label is never proof of a booking, attendance or received payment.

## Capability and acceptance map

| Public reference capability | Convelta delivery | Required evidence |
| --- | --- | --- |
| AI qualification and human takeover | Adopt persisted, source-current AI need/interest/next-step into an auditable handoff | Saved response, unchanged transcript and explicit staff acceptance |
| Workflow routing | Configurable brand/channel/tag/team rules, least-open and round-robin assignment, online expiry and capacity | Concurrent admission, no inactive/viewer/paused assignment, truthful unassigned queue |
| Lifecycle | Company-configured stages, brand-owned customer state and immutable reasons/history | Full-dataset filters/counts, revision checks, no financial inference from labels |
| Follow-ups and team visibility | Named tasks, due work, completion/snooze and manager visibility | Durable storage, current owner authorization, replay and cancellation |
| Targeted retention/broadcast | Consent-governed audience and recipient execution | Consent/suppression/templates, snapshot approval, idempotent provider acceptance and delivery receipts |
| Conversion feedback | Source-bound conversion event preparation and Meta acceptance tracking | Real lead/payment authority, stable event ID, authorized destination and independent test receipt |
| Shared chat/call workspace | Existing WhatsApp/Meta customer identity; calling shares that boundary | Authorized provider capability, actual inbound/outbound call and human transfer |

Public references checked 2026-11-13:

- https://respond.io/help/ai-agents/getting-started-with-ai-agents
- https://respond.io/help/workflows/step-assign-to
- https://respond.io/help/workspace-settings/workspace-settings-lifecycle
- https://respond.io/help/workflows/step-send-conversions-api-event
- https://respond.io/team-inbox
- https://respond.io/whatsapp-business-calling-api

Existing React, Zod, Lucide, AI SDK, PGlite, Playwright/axe and namespaced CSS
cover the operations layer. Pinned `swr@2.5.1` adds actor/company-scoped
request deduplication, cursor pagination and revalidation after writes/reconnects.
No additional drag, global state or chart dependency is needed. Installed Next route-handler/lazy-loading and AI SDK structured-output
documentation were checked. Provider-specific calling and delivery capabilities
remain separate from the local operations implementation and its acceptance.

## Product Learning Sync checked

Canonical main protocol, learning index and checkpoint were read before planning.
The release continuation also reviewed the current private proposal and the four
additional operations, description-density and source-ownership entries below.
Exact entries considered:

- `entries/2026-07-16-alyssa-crm-operations-extraction.md`
- `entries/2026-07-17-alyssa-crm-regression-acceptance.md`
- `entries/2026-07-26-whatsapp-broadcast-operations-boundary.md`
- `entries/2026-08-10-permission-aware-aggregate-brand-scope.md`
- `entries/2026-10-15-brand-owned-financial-dashboards.md`
- `entries/2026-10-06-source-owned-booking-dimensions.md`
- `entries/2026-09-01-app-owned-destructive-action-lifecycle.md`

- `entries/2026-07-16-crm-priority-a-operations.md`
- `entries/2026-10-06-report-description-density.md`
- `entries/2026-11-12-configured-pending-time-registration.md`
- `entries/2026-11-13-reviewed-appointment-owner-consolidation.md`

Adopt neutral scoped operations, immutable reasons, event-owned dimensions,
complete aggregation, governed execution and acceptance principles. External
register mappings and client financial projections stay Enterprise/configurable;
they are not copied into Core. No client records, pricing, brand identity,
credentials, source code or runtime are imported. The checkpoint is updated
through canonical draft PR #88; unfinished capabilities remain system cards.


## Hosted schema readback

Migration `20261113162451_convelta_conversation_operations.sql` is recorded in the
hosted project as `convelta_conversation_operations`. The repository bytes and
hosted migration statements share SHA-256
`f7e82f27d86e72622f1eecf2df1dc865713526317a68c782a550531797510a8e`.
The version rename changes no SQL bytes.

Readback verifies all seven new tables have RLS and no anonymous/authenticated
read grants. All seven operations RPCs are security invoker and deny direct
browser execution. Service-role UPDATE, DELETE and TRUNCATE are absent on
accepted AI handoffs. Existing active membership and CRM/POS entitlement checks
remain inside the RPC boundary.

The actual company remains empty: no customers, linked threads, booking requests,
payments, named tasks or accepted handoffs were seeded. Five neutral stages have
zero counts; all outcome counters are zero. Routing and stage-created follow-ups
start disabled, and presence is offline. This privileged readback is not an
Owner browser login or a customer/model/provider write.

Post-change advisors introduce no new security warning and no missing foreign-key
index. The seven additional RLS-without-policy INFO findings describe deliberate
service-only tables with no browser grants. Existing account/auth warnings remain
outside this delivery. New indexes are currently unused because the company has
no operational rows; no synthetic business records are inserted to exercise them.


## Resulting experience

The company CRM rail opens `/crm/operations`. Customer stages, follow-up tasks,
team capacity and automation each have a focused view. Desktop uses a compact
customer table; mobile uses stacked records. Company stage names, tones and
active state are configurable. Existing stage identities and outcome kinds stay
stable; all stage edits require a reason and expected revision.

The actual inbox now adopts a saved AI request into an immutable handoff, edits
the same lifecycle state and creates named HKT follow-ups. Acceptance checks the
request's actor, company, product, brand, thread, transcript, identity-link and
lifecycle revisions. A client cannot provide its own AI summary. Staff choose
whether to change stage; handoff never implies a customer message was sent.

Ordered routing matches brand, channel, tags and team. Least-open and round-robin
methods enforce active non-viewer membership, pause, online expiry, brand scope
and capacity across both channels. Busy threads are skipped before the company
assignment lock. A bounded catch-up queue rotates waiting work; unmatched or
full-capacity work remains explicitly unassigned. Presence/settings saves commit
before catch-up begins, so a secondary queue error cannot undo the saved primary
operation. Presence is server-timed and refreshed only by a visible working page.

Follow-up tasks retain named ownership, finite due dates, completion/cancellation
and exact UUID receipts. Staff can recover unowned or inactive-owner work;
manager-only settings and team controls stay separate from ordinary task edits.
Unconfirmed network responses freeze the original command for reconciliation.
The task list and customer list use full cursor pagination. Counts and business
results aggregate before display limits. C reads the same stored stage/task
sources; POS snapshots retain their own product boundary.

Period metrics use inquiry creation, the first qualifying immutable booking or
attendance event, and each actual POS receipt/refund occurrence date. Operational
stage labels and AI interest do not establish a booking, attendance or payment.
No provider send, model change, added credential or business-data seed is part of
this operations delivery.


## Accepted release — 2026-11-14 HKT

Runtime `27637de71970b05ae5b8deb4c976406ca77f1370` is READY as
`dpl_DW5JaRc77T3Rns9WDLkjpWAd5K9E` at https://app.convelta.io.
[Exact-source CI](https://github.com/kieran97125/growthos-crm/actions/runs/43468639434)
passes typecheck, lint, all 243 unit/database checks, build, four production
cold-load/refresh checks, three focused operations interactions and all 90 browser
checks. The independent native PostgreSQL job passes locked-row skipping, queue
catch-up, simultaneous last-slot capacity admission, durable receipt replay and
12-request round-robin distribution.
[Original CRM regression](https://github.com/kieran97125/growthos-crm/actions/runs/43468639905)
also passes.

Desktop/mobile pipeline, team, rules and inbox-handoff screenshots were reviewed.
Final visual review found and corrected C covering part of the workflow Save
button. The footer reserves 80px and both viewport tests assert that the complete
Save rectangle and C launcher do not intersect. Accessibility and viewport
overflow checks remain required. The final browser archive is artifact
`14059838275`, SHA-256
`93f7bcb9c79a1ef42ef863f5d1a674d042b5e1f34504b4c5e88f9cbe63062a51`.

Actual final-runtime HTTP verification records login 200, operations-page
login redirect 307, main/tasks/attention private APIs 401 with no-store headers,
foreign-origin presence POST 403, and the unshipped fixture 404. Delivered CSS
contains the operations surfaces, presence control, draggable C styles and
`padding-inline-end:80px` clearance. Deployment metadata confirms the exact
accepted Git SHA and the app.convelta.io alias; the post-check error/fatal log
scan is empty. Privileged database readback again confirms zero operational
business records, neutral defaults and denied browser grants.

This evidence uses isolated synthetic browser/database fixtures plus actual
production schema, asset and boundary readback. It does not claim another
authenticated Owner/model write, physical iPhone/Safari qualification or live
provider messaging. The [release record](../../../docs/CONVELTA_CONVERSATION_OPERATIONS_RELEASE_20261114.md)
describes acceptance recovery and the earlier production candidate.

The master operations card remains in progress. Core lifecycle and saved AI
handoff are complete; shift/leave/skills, offline notifications, paid-channel
attribution, consent-governed broadcast execution, Meta conversion acceptance,
calling and first real inquiry-to-POS acceptance remain separately tracked.
Those capabilities still require implementation and/or authorized provider
assets and independent real-flow acceptance. No live channel was enabled.

The [RLS advisor reference](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
explains the informational no-policy finding for deliberately service-only
tables. [Foreign-key index guidance](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)
covers the unchanged pre-existing recommendations. Strict typed scheduling and
explicit identity ownership remain unchanged; the reviewed source consolidation
helper and withdrawn pending-time compatibility are not adopted.
