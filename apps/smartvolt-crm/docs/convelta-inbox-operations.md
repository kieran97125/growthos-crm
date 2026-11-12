# Convelta inquiry ownership and follow-up

The user asked to optimize the live App and reference SleekFlow's services. The first functional phase connects real social inquiries to accountable team follow-up. Marketing keeps the approved blue/white identity, inquiry-led sales and original illustrations.

## Service reference and product direction

Primary references checked 2026-11-12:

- https://sleekflow.io/zh-hk — omnichannel inbox, automation, AI agents, customer context, analytics and custom integration.
- https://help.sleekflow.io/en_US/assigning-and-collaborating-on-conversations — ownership, team visibility and internal collaboration.
- https://help.sleekflow.io/en_US/getting-started-with-sleekflow-inbox — conversation lifecycle and follow-up.

Convelta's service journey is inquiry → accountable follow-up → consultation/booking → service operations. Team collaboration is implemented here; live AI, actual Meta activation, consent-governed broadcasts, complete provider-to-customer/booking linking and conversion reporting remain separate system cards. Competitor copy, customer claims, certifications and interfaces are not reused.

## Implemented behavior

The private Messenger/Instagram inbox stores customer display name, active company assignee, normal/high/urgent priority, next action, Hong Kong follow-up time and open/resolved status. A single explicit save commits the handover and immutable actor/time/before/after receipt atomically. No message is sent by saving a follow-up, and due-time reminders are inbox indicators rather than background notifications.

Queues cover open, mine, unassigned, due, priority, unread and resolved. Channel and literal customer-name/platform-account search apply before keyset pagination across the complete tenant dataset. Counts reflect the same channel/search conditions. Refresh resets the thread page rather than retaining records which no longer match the queue. Loaded message history and unsent replies remain intact.

The assignee must be an active company member with write permission, validated by the database and a composite tenant foreign key. Suspended, removed or view-only assignees return to the unassigned queue. They must be cleared or reassigned before the next handover. Viewers may inspect but cannot edit or mark read.

The command carries a UUID and expected thread revision. Stale writes are rejected without overwriting colleagues' changes. Lost responses preserve the UUID for confirmation, including when switching threads. Draft handovers remain in memory while switching threads; they are not persisted across page reloads. Recent 20 handovers are available in the side panel. Raw provider evidence and delivery semantics remain separate and immutable.

## Architecture and verification

The additive CLI-created migration introduces tenant-bound fields, service-only audit storage and two security-invoker RPCs. Browser table/RPC grants remain revoked; RLS is enabled, and the server checks session membership, CRM entitlement and mutation origin. Existing provider send claims, real 24-hour reply windows, receipt handling, encrypted credentials and manual-send reconciliation remain unchanged.

No dependency was added. Existing Lucide, Zod, Supabase, Next, PGlite, Playwright and axe support the UI, validation and verification.

Local checks: typecheck, lint, production build and 173 unit/database tests pass. Added tests cover tenant/assignee isolation, stale revisions, immutable replay receipts, former assignees, complete-dataset filters/keyset boundaries, literal search and Hong Kong date rollover. Browser acceptance exercises the real client with synthetic HTTP fixtures only; no production Auth exception, sample customer or provider request is introduced. CI and deployment results are recorded on the implementation branch and release record.

## Product Learning Sync checked

Canonical private protocol, enterprise learning index and checkpoint were checked before implementation. Exact entries considered:

- `entries/2026-07-16-alyssa-crm-operations-extraction.md` — adopted neutral assignment, priority, follow-up, queue and audit principles.
- `entries/2026-07-26-whatsapp-broadcast-operations-boundary.md` — retained the independent, consent-governed send execution boundary; broadcasts deferred.
- `entries/2026-07-29-connector-readiness-and-identity-boundary.md` — retained truthful readiness and provider/company authorization separation.
- `entries/2026-09-01-app-owned-destructive-action-lifecycle.md` — considered; destructive lifecycle changes are outside this phase.

The canonical checkpoint is updated through existing draft PR #88. No Alyssa identity, runtime, records, tokens, prices, domains, legal information or client workflow is imported.

## Remaining activation

Deployment of collaboration features does not establish a provider connection. Meta App Secret, verified Page authorization/subscriptions, Instagram brand account/linkage and real inbound/outbound acceptance remain pending. AI provider/model activation and a source-grounded human-reviewed workflow remain pending. The real company's system cards track these boundaries.

## Hosted schema verification

The finalized additive migration was applied to the dedicated Convelta database as authoritative version `20261112134105_convelta_inbox_operations`. The CLI-created source file is renamed to that version with SQL bytes unchanged. Readback confirms audit-table RLS, no anon/authenticated table access or RPC execution, and all real-company queues empty. No sample contacts, messages, provider events or handover receipts were inserted.

The local Playwright launch cannot create the required Chromium socket in this execution environment (`Operation not permitted`). Browser acceptance therefore runs in GitHub Actions using the repository's existing supported Chrome selection. This environment limitation is separate from the passing local build and unit/database checks.

The first implementation candidate `7e7c75ff29fa0b5ae93555128fd4cc9b297ec7e5` passed both CI workflows, including all 173 unit/database and 58 browser checks ([App acceptance run](https://github.com/kieran97125/growthos-crm/actions/runs/43229570213)). Screenshots confirm desktop/mobile layout, no horizontal overflow, accessible controls, durable handover and truthful receipt states.

Hosted readback identified the project's automatic ALL table grant to service_role, which differs from a plain Postgres test database. The separate additive `20261112134543_convelta_inbox_audit_grants` migration explicitly revokes those defaults, grants only select/insert/update for operational rows and select/insert for immutable provider/audit evidence. Readback confirms UPDATE, DELETE and TRUNCATE are denied for evidence while operational thread updates remain allowed. Regression setup now reproduces that hosted default and tests the restrictions. The original applied migration bytes are preserved.
