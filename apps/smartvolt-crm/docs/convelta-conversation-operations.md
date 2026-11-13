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

Canonical main protocol, learning index and checkpoint read before planning.
Exact entries considered:

- `entries/2026-07-16-alyssa-crm-operations-extraction.md`
- `entries/2026-07-17-alyssa-crm-regression-acceptance.md`
- `entries/2026-07-26-whatsapp-broadcast-operations-boundary.md`
- `entries/2026-08-10-permission-aware-aggregate-brand-scope.md`
- `entries/2026-10-15-brand-owned-financial-dashboards.md`
- `entries/2026-10-06-source-owned-booking-dimensions.md`
- `entries/2026-09-01-app-owned-destructive-action-lifecycle.md`

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
