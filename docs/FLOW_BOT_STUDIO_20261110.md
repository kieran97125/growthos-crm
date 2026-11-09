# Flow and BOT Studio

The conversation workspace now has two editing surfaces and an in-thread assistant. The product handles customer intent and staff follow-up independently of a POS or availability calendar. A submitted form or a customer's acceptance never confirms an appointment.

## Delivered experience

- Flow canvas: real React Flow nodes, connectors, drag/drop, zoom, minimap, auto-layout, accessible next-step selectors, editable settings, graph validation, local version snapshots and restore.
- Twelve node kinds cover triggers, intent, new/existing branches, knowledge answers, intake forms, follow-up cards, staff review, reminder templates, handoff, fixed messages, delays and completion. Simulation follows the edited graph instead of a hard-coded animation.
- Appointment path: intent → follow-up card → staff verification → previous-day reminder preview in Hong Kong time. The simulated review gate, notification consent, approved template and required mappings must all pass. There is no real scheduler or provider send.
- WhatsApp form: an interactive two-step phone preview for service, branch and preferred time. Completion is explicitly an intent pending staff verification. This is distinct from publishing a native Meta Flow.
- BOT Studio: separate fictional brand profiles; assist, after-hours and bounded modes; tone, greeting, reception hours and topic permissions; editable knowledge with approval, expiry, source and revision; a test conversation with explicit human takeover and return.
- Inbox assistant: grounds a deterministic example in current contact, latest inbound message and same-brand knowledge; inserts an editable draft or opens the existing pending follow-up form. It cannot claim live availability or book automatically.

The demo clearly labels the deterministic reply engine. It does not call an LLM, send WhatsApp messages, read company data or synchronize a POS. Settings persist only in the current browser. Editing a reception schedule changes profile configuration; the test conversation has an explicit business-hours override, not a wall-clock scheduler.

## Durable architecture and remaining system cards

The portable `components/crm/studio` module separates versioned Zod contracts, pure graph/reply engines, per-mount browser store, reusable result cards, canvas and BOT editor. React Flow and Dagre are pinned for their actual graph editing/layout roles. Heavy editors are lazy-loaded. Conversation state and studio configuration use separate validated storage namespaces. No model SDK is installed until a real server-side provider adapter is selected.

| Card              | Next implementation                                                                                              | Release evidence                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| CRM-001           | Per-company users, memberships and server-derived brand scope                                                    | Unauthorized cross-company/brand reads and writes fail                                                    |
| CRM-003 / CRM-004 | Independent WABA onboarding, signed webhooks, durable inbox/outbox and provider adapter                          | Real test-number send/receive and verified receipts; replay deduplication                                 |
| CRM-009 / CRM-010 | Purpose-specific consent, suppression and current approved-template registry                                     | Last-moment eligibility recheck and no duplicate sends                                                    |
| CRM-011 / CRM-012 | Server graph versions, event subscriptions, durable scheduled jobs and cancellation                              | Page closure, retries, deployment changes and staff handoff cannot skip gates or replay side effects      |
| CRM-013           | Server model adapter, authorized retrieval, conversation memory, validated structured responses and usage limits | Cantonese evaluation set, citation checks, unsupported-answer handoff, brand isolation and human takeover |
| CRM-014           | Staff-verified appointment events independent of customer acceptance                                             | Change/cancel invalidates previous reminder jobs; historical events retained                              |
| CRM-019           | Native Meta Flow JSON, WABA publish and completion adapter                                                       | Validated form, signed/de-duplicated completion, pending intent only                                      |

Without an integration, changes made solely in another booking system are not observable by this CRM. Staff must update CRM follow-up details to invalidate old reminders. Formal scheduling will use appointment-event versions and deterministic idempotency keys; a browser simulation is not evidence of that production capability.

## Product Learning Sync checked

Canonical protocol, index and consumer checkpoint were read before implementation on 2026-11-10 HKT, together with the six relevant operations, conversation/Customer 360, regression, WhatsApp execution, permission-scope and current-pending/history entries already listed in the conversation delivery record. No new relevant AI/Flow entry was present in the reviewed index. Applied principles are separate contact/lead identity, customer acceptance distinct from staff confirmation, no demo-to-live bypass, intersected brand scope, and current state distinct from event history. These are product patterns only; no client records, credentials, identifiers or provider settings are imported.

The existing private checkpoint review remains a proposal until reviewed/merged. POS is excluded by the user's direction. The independent owner-private demo remains separate from all client installations. Verification and publication receipts are attached to the existing implementation PR after the checks finish.

## Verification

60 domain tests include graph cycles/orphans/branch handles, edited-route execution, independent new/existing review gates, all template mappings, missing approval/consent, service-window blocks, source status/expiry/brand isolation, human ownership, mode behavior, knowledge revisions and immutable version restoration. Browser acceptance adds real editor interactions, native form intent, knowledge edits, copilot drafts, desktop/mobile layouts and WCAG AA to the existing conversation/operations suite. Production build and configured auth/fixture boundaries remain required before publication.
