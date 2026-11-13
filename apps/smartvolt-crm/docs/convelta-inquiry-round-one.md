# Convelta inquiry → customer → booking operations

The requested first delivery connects actual WhatsApp, Messenger and Instagram threads to one company customer directory, a shared operational queue and an explicit booking handoff. CRM and POS remain independently purchased products. A new normalized directory is private; the versioned workspace retains a compatibility projection only for customers actually operated in POS. No customer, provider conversation, message or financial transaction is seeded in production.

## Product behavior

- The company CRM route opens a real unified inbox. The original Flow, AI BOT and broadcast studios remain separate views; the public preview remains synthetic and isolated.
- Provider ingestion transactionally creates a stable customer/thread link. Names and phone similarities never automatically merge identities. Staff can explicitly link an existing same-brand customer with a recorded reason and can restore a previous link. Historical bookings and money retain their original customer.
- All channels use company-scoped queues, complete-dataset counts, literal search and keyset pagination. Assignment, priority, Hong Kong follow-up time and next step have revision checks, active-member validation and immutable command receipts. Workload assignment selects an active non-viewer with the lowest open inquiry count across both transports. Shift/leave/skill-based routing is a separate system card.
- Customer profiles have searchable directory records, explicit channel links, editable preferences/tags and a paginated activity timeline. CRM-only responses omit financial events; POS-only customer responses omit channel conversations and CRM booking requests. Financial timeline responses expose selected summaries rather than payment snapshots or references.
- A booking request is an intention. CRM-only companies can manually confirm or cancel a basic booking. Companies with both products must inspect actual POS services, staff and resource combinations before confirmation. Confirmation revalidates the live company document and commits the POS appointment, request link, directory projection and timeline in one database transaction. Competing/stale commits cannot overwrite the accepted appointment.
- A channel-backed POS customer does not require a fabricated legacy conversation. Their appointment has a nullable legacy conversation reference plus an immutable request lineage. Reschedules, arrival, payment and refund operations continue through the existing POS engine and ledger. Payment remains manual verified registration; this release does not acquire or refund funds.
- Existing AI SDK generation now supports the actual stored WhatsApp transcript as well as Meta threads. Knowledge remains approved/company/brand scoped; internal notes are excluded. Source revision is rechecked before an answer is accepted. The booking panel performs real availability checks independently of model prose. Autonomous AI booking/tools remain a separate card.
- Drafts are retained across thread changes. Unknown network results retain the original command UUID. Provider acceptance, actual delivery and uncertain results remain distinct. Existing provider service-window, credential and dispatch admission checks remain authoritative.

## Source and data ownership

`sv_customers` and `sv_customer_brands` hold stable shared identity and brand relationships. `sv_customer_threads` binds actual provider conversations; a database trigger rejects cross-company/brand pointers. `sv_customer_events`, `sv_inquiry_commands` and WhatsApp handover activity are immutable. `sv_booking_requests` preserves the inquiry's original customer/source and points to the POS-owned appointment after confirmation. Existing raw provider events, message IDs and referral evidence remain in their native protected tables.

All new tables have RLS and no public/anon/authenticated table grants. Public RPC execution is denied to browser roles. Server routes check authenticated active company membership and purchased products; mutations enforce the existing canonical origin, bounded strict JSON and database reauthorization. Hosted default ALL grants are explicitly removed from immutable evidence.

The compatibility aggregate and financial command model retain their existing documented volume limits. Full large-volume command normalization remains the domain-projections/POS ledger card; the normalized customer directory itself is indexed and paginated. It is not claimed as completion of every financial normalization task.

## Product Learning Sync checked

Read the canonical private protocol, index and current reviewed-checkpoint proposal. Considered:

- `2026-07-16-crm-priority-a-operations.md`
- `2026-07-16-alyssa-crm-operations-extraction.md`
- `2026-07-26-whatsapp-broadcast-operations-boundary.md`
- `2026-07-29-connector-readiness-and-identity-boundary.md`
- `2026-07-31-master-owned-member-invitation-lifecycle.md`
- `2026-08-10-permission-aware-aggregate-brand-scope.md`
- `2026-10-08-completed-outcome-cancellation-correction.md`
- `2026-11-12-configured-pending-time-registration.md`

Adopt only neutral identity, intent/confirmation separation, active-membership, immutable evidence, truthful availability and state-transition principles. Client-specific source-register reconciliation and unknown-time conventions are deferred. No Alyssa identity, customer, prices, legal copy, tokens, runtime or implementation is imported. The canonical checkpoint is updated through its existing private review change.

## Acceptance and deployment record

All 198 local unit/PostgreSQL checks pass, including 13 new integration checks. The new checks exercise actual native ingestion and dedupe, tenant/browser grants, both-channel assignment, explicit identity linking/restoration, intention versus confirmation, atomic POS conversion, replay, stale concurrent writes, rescheduling, arrival, receipts/refunds, directory conflicts, CRM-only confirmation, WhatsApp AI source revision and a profile update racing the first POS materialization. TypeScript, lint and production build also pass. The connected product switch now uses an authenticated route with customer/brand context; the isolated preview retains its local product switch. The CRM shell renders directly so delayed stylesheets cannot strand a duplicate streamed root; heavy studios and POS JavaScript remain lazy. The unchanged four production cold-load/refresh checks pass on both desktop and mobile at source `4b8c5484fce4332e273df3864542713d9abddd51`.

The real browser controller is exercised on desktop/mobile through an isolated browser-only synthetic fixture. No fixture route, test login, production sample data or external provider request is shipped. Local Chromium is blocked by this execution environment's socket restriction; browser acceptance runs in the repository's existing GitHub Actions job. The exact accepted desktop/mobile screenshots were visually reviewed, with no horizontal overflow and passing WCAG A/AA checks.

The dedicated hosted database accepted migration `20261113041023_convelta_customer_inbox_handoff.sql` without altering its SQL bytes (SHA-256 `2037b920863e67b5b73b56f878ec415247760441eb47fa216b0dd23fd67d7b59`). Local naming follows the authoritative hosted migration version. A separate `20261113041203_convelta_customer_link_indexes.sql` covers the two new customer-brand foreign keys. Readback confirms all seven new tables have RLS, no browser table grants and no browser execution rights on operational RPCs. The actual Owner-scoped inbox and directory return empty results. Customer/thread/request/event and provider connection counts remain zero; workspace revision remains 3, AI readiness remains `ready` and the Hong Kong daily quota remains 30. Advisory readback confirms the two new missing-index notices are resolved; existing unrelated transport-index notices remain separate maintenance work.

Actual customer-originated channel inquiries and replies still require the company's provider assets, authorization and service readiness. Deployment and synthetic acceptance must not be represented as a successful live Meta/WhatsApp conversation. The existing live-channel system cards retain their actual state.

Migration `20261113042851_convelta_first_pos_profile_revision.sql` closes a reproduced concurrency gap before a channel customer first enters POS. A canonical profile edit invalidates the prepared workspace revision even when the customer has not been materialized there; the stale operation must reload instead of overwriting a newer name or preference. The regression fails before the fix and passes afterward. Hosted readback confirms the replacement function and unchanged empty company data.

## Released acceptance — 2026-11-13

Runtime `b52bce89a1aa6efb5eaf853f1cb01ee22601191d` is **READY** as `dpl_EgbUKSVSB1ZRCur1RG7VzmuviqKU` at https://app.convelta.io. The release is built from that exact Git source, using the existing independent project and Node 24.

- [Convelta CI 43366036238](https://github.com/kieran97125/growthos-crm/actions/runs/43366036238) passes typecheck, lint, all 198 unit/PostgreSQL tests, production build, all 69 browser interaction/accessibility tests and all four production cold-load/refresh tests. This includes the six new actual-controller browser flows; their inputs and provider responses remain isolated synthetic fixtures.
- [Original CRM regression 43366036216](https://github.com/kieran97125/growthos-crm/actions/runs/43366036216) also passes. Existing repository tooling already provides the AI SDK, Zod, PGlite, Playwright/axe, FullCalendar and the flow editor; no new dependency or lockfile change was needed.
- All three new hosted migrations are installed, with authoritative versions `20261113041023`, `20261113041203` and `20261113042851`. Readback confirms browser-denied operational RPCs and tables, immutable evidence grants and the first-POS profile revision guard. Real customer, thread, booking-request and customer-event counts remain zero.
- Ten live HTTP checks pass: login/CRM preview 200; anonymous inbox, customer and AI status 401 with private/no-store; foreign-origin inbox/customer writes 403; same-origin anonymous inbox write 401; fixture URL 404; private company entry redirects to login. The live browser independently confirms that protected entry. No authenticated Owner write was performed in that browser session, which has no signed-in account.
- The initial deployment-scoped error/fatal scan returns no logs. No real customer message, booking, money registration or model request was created by this release acceptance.

The company's actual POS catalog and resources are empty and one team member is configured. The blocked `inquiry-production-acceptance` card requires company-owned channel authorization, verified real services/prices/schedules/resources and a real inquiry-to-POS acceptance. Separate channel cards retain their actual Meta/WhatsApp blockers. Shift/leave/skill routing, autonomous AI tools/replies, broadcast execution and larger-volume POS command normalization remain unfinished system cards.
