# FollowHub conversation workspace and independent demo

The main CS task is reading and answering a customer conversation. The previous LeadOps table did not satisfy that task. The new workspace puts queues, conversation list, message thread/composer, and Customer 360 in one screen. The user's supplied reference supersedes the pilot-specific desktop-table preference; the existing table is retained for Lead operations.

## Delivery and separation

- `/crm`: honest connection-required conversation workspace. No fake provider connection or customer messages.
- `/crm/leads`: existing authenticated LeadOps table, filters and safe write boundaries.
- `/crm/demo`: explicitly synthetic interactive workspace with its own versioned local browser store.
- Independent hosted demo: a new Site project, separate from any existing customer project. No database, connector or live messaging configuration copied from any customer installation.
- Portable React modules are shared verbatim with the demo host. Domain model and schema, per-mount storage, conversation list, customer profile, reusable UI primitives and dialogs are separate modules.

## Usable flows

Reply, quoted reply, emoji, searchable saved replies with contact/brand interpolation; per-conversation drafts; separate internal notes; assignment with visible events; priority/pin; read queues; resolve/reopen; snooze; simulated inbound message; customer directory/editing/tags/notes; tentative booking with independent customer acceptance and staff confirmation; local persistence, validation and explicit reset. Responsive mobile list/chat navigation and customer sheet preserve the composer. All displayed delivery ticks are labelled as demo messages, never actual provider receipts.

## Remaining system cards

`CRM-001` user/brand authorization; `CRM-003` independent channel onboarding; `CRM-004` signed webhooks, durable inbox/outbox and delivery receipts; `CRM-005` channel identity and duplicate review; `CRM-006` multi-user collaboration; `CRM-007` governed reply libraries; the existing AI, automation, broadcast and reporting cards remain tracked in `src/lib/crm/capabilities.ts`. A demo action is not evidence that its production card is complete.

No live WhatsApp/Instagram/Messenger sends, external AI inference, production booking, media upload or shared cloud persistence are implemented by the demo. No API request is needed for a demo mutation. Generic channel icons are used, without copying Omnichat assets, names, phone numbers or messages from the supplied screenshot.

## Product Learning Sync checked

Canonical protocol, index and checkpoint read before implementation. Considered:

- `2026-07-16-crm-priority-a-operations.md`: distinct customer identity and booking confirmation states.
- `2026-07-16-alyssa-crm-operations-extraction.md`: compact conversation and Customer 360; neutral client/brand boundaries.
- `2026-07-17-alyssa-crm-regression-acceptance.md`: auth, loading and desktop acceptance pattern; pilot table layout stays with the Lead table, not the new reply workspace.
- `2026-07-26-whatsapp-broadcast-operations-boundary.md`: demo actions never bypass live-send/provider requirements.
- `2026-08-10-permission-aware-aggregate-brand-scope.md`: a single intersected brand/channel/search/queue filter envelope.
- `2026-10-06-current-pending-authority-bounded-edits.md`: current conversation status and immutable event history remain distinct.

The canonical checkpoint update remains a reviewed proposal in the existing private checkpoint PR, not an assertion of platform-wide adoption. The delivery direction is a reusable CRM core with isolated per-company configuration, installation and maintenance; subscription billing and self-service SaaS provisioning are not part of this change.

## Verification

37 domain tests cover existing safe operations plus conversation scope, identity restore, reply/note separation, duplicate prevention, quoted-reply scope, assignment, due snooze, reopening, non-cascading unread, combined filters, and booking confirmation. Browser acceptance covers four panes, local persistence, no outbound mutation, per-customer drafts, quick replies, quoting, read queues, assignment, status transitions, directory, tags/contact/booking editing, mobile layout and WCAG AA. Production fixture isolation and configured auth gates remain required. Final run receipts and deployment URL are recorded in the PR after verification.
