# Growth OS CRM ↔ Alyssa CRM Alignment Audit

Date: 2026-07-14
Working branch: `audit/alyssa-crm-alignment`

## Scope

This audit compares the standalone `growthos-crm` app against the CRM capabilities currently present in `alyssa-lead-capture-os`.

The objective is not to copy Alyssa identity or LaunchHub code. The objective is to port useful CRM capability into the standalone Growth OS CRM while preserving clean app boundaries, multi-tenant direction, and production safety.

## Current Growth OS CRM baseline

Already present:

- Standalone full-screen CRM app
- Dark CRM sidebar
- `/crm` inbox
- `/crm/leads/[leadId]` lead detail
- `/crm/settings` read-only WhatsApp settings foundation
- LeadOps read model using contacts, leads, source snapshots and bookings
- CTWA / form source context
- Admin password gate
- CRM write feature flag
- Phase 2 schema planning docs
- No WhatsApp API connection
- No send-message endpoint
- No raw source snapshot payload in normal UI

## Alignment matrix

| Capability | Alyssa CRM | Growth OS CRM | Decision | Priority |
|---|---|---|---|---|
| Standalone CRM shell | Yes | Yes | Keep Growth OS version | Done |
| Inbox table | Advanced support-inbox style | Basic support-inbox style | Port missing filters/presets/selection | P1 |
| Dashboard overview | Yes | No dedicated dashboard | Port as CRM home overview | P1 |
| Booking-first workbench | Yes | Partial in detail page | Port safe UI/read model | P1 |
| Confirm booking flow | Yes | Phase 2 action foundation | Review existing actions before enabling | P1 |
| Follow-up flow | Yes | Partial Phase 2 foundation | Port read model and guarded actions | P1 |
| Show / no-show / paid / lost outcomes | Yes | Partial | Port guarded outcome workflow | P1 |
| Conversation workspace shell | Yes | No | Port UI shell first, read-only | P0 |
| Quick Replies | Yes | No | Port editor + composer insertion | P0 |
| AI Assist | Local/rule-based draft UI | No | Port local draft-only assistant | P0 |
| Reply Composer | Yes | No | Port editable composer, no auto-send | P0 |
| CRM settings IA | Section-based editor | Single settings page | Port section-based structure | P1 |
| Quick Replies settings save | Server-side DB-backed in Alyssa | No | Keep read-only until schema review | P2 |
| AI knowledge source settings | Yes, setup UI | No | Port UI/read-only architecture | P1 |
| Website crawl / external AI | Not active in Alyssa | No | Do not add yet | Hold |
| Conversation history schema plan | Yes | No | Add planning docs only | P1 |
| WhatsApp connection settings UX | Yes | Partial foundation | Port provider/readiness UI | P1 |
| Meta WhatsApp Cloud API MVP | Yes | No | Do not enable directly; security review first | P2 / gated |
| WhatsApp webhook receiver | Yes in Alyssa MVP | No | Hold until schema/env/security review | Gated |
| WhatsApp send endpoint | Yes in Alyssa MVP | No | Do not port in first pass | Gated |
| Credential encryption | Yes in Alyssa MVP | No | Required before connection MVP | Gated |
| Message history tables | Yes in Alyssa apply SQL | No | Proposal/review only | Gated |
| CRM reports | Yes | No | Port safe read-only reports later | P2 |
| Source quality overview | Yes | Partial source context | Port aggregate-only view | P2 |
| Conversion overview | Yes | No | Port aggregate-only view | P2 |
| Daily workbench | Yes | No | Port after conversation/reply flow | P2 |
| Team / assignment | Planned or partial | Disabled Phase 2 | Keep disabled until auth/tenant model | P2 |
| Multi-tenant identity | Alyssa brand-first | Not fully implemented | Target `tenant_id + brand_id + normalized_phone` | Architecture |

## Key findings

### 1. Growth OS CRM is structurally correct but functionally behind

The standalone repo is the right long-term product boundary. It should remain separate from LaunchHub and from the Growth OS platform shell.

The main missing product layer is the day-to-day CS conversation workflow:

- Conversation workspace
- Reply composer
- Quick Replies
- Local AI Assist drafts
- Booking/follow-up/outcome actions presented around the conversation

### 2. Safe features can be ported now

The following can be implemented without WhatsApp API or schema migration:

- Conversation workspace shell
- Internal context timeline
- Editable reply composer
- Quick Reply insertion
- Rule-based/local AI draft suggestions
- Disabled send button
- Section-based settings UX
- Read-only WhatsApp connection readiness
- Conversation history planning docs

### 3. High-risk features must remain gated

Do not directly port or enable these in the first implementation pass:

- Meta WhatsApp Cloud API connection
- Access-token storage
- Webhook verification/receive routes
- Real send-message endpoint
- Message history writes
- CRM schema apply scripts
- Auto-send or external AI API

These require:

- Reviewed tenant/brand ownership model
- Reviewed Supabase schema
- RLS and authorization
- Server-only encrypted credentials
- Webhook replay/idempotency handling
- Delivery/read/failure event handling
- Production secret management

## Recommended implementation sequence

### Phase A — P0 conversation workflow foundation

1. Port conversation-first lead detail layout.
2. Add `ConversationPanel` using internal CRM interactions only.
3. Add editable `ReplyComposer`.
4. Add Quick Replies insertion.
5. Add local/rule-based AI Assist suggestions.
6. Keep send disabled and manual WhatsApp open available.
7. Preserve current CRM write safety.

### Phase B — P1 operations and settings

1. Add dashboard overview.
2. Add booking-first workbench.
3. Refine inbox with column presets and source/status filters.
4. Add section-based settings editor.
5. Add WhatsApp connection readiness UX.
6. Add AI knowledge source setup UI without crawling or external AI.
7. Add conversation history schema planning docs.

### Phase C — P2 reporting and guarded writes

1. Add source quality overview.
2. Add conversion overview.
3. Add daily workbench.
4. Review booking/follow-up/outcome writes against deployed tables and RLS.
5. Add feature flags per capability.

### Phase D — gated WhatsApp connection MVP

Only after explicit review:

1. Review WhatsApp connection schema.
2. Implement encrypted credentials.
3. Implement webhook verification and idempotent inbound processing.
4. Implement message history tables.
5. Implement guarded send endpoint.
6. Test with a single brand before multi-tenant rollout.

## App boundary rules

- LaunchHub owns public forms, embed, attribution capture and lead creation.
- CRM owns follow-up, booking, conversation, outcomes and CS operations.
- GrowthRadar consumes safe aggregates and outcome summaries.
- Growth OS platform owns users, clients, brands, memberships and module access.
- Raw source snapshot evidence remains internal and is never exposed as a normal CRM setting.

## Immediate next task

Implement Phase A on a feature branch:

- conversation workspace shell
- reply composer
- quick replies
- local AI Assist drafts
- manual WhatsApp open
- disabled send state

No schema migration. No WhatsApp API. No secrets. No external AI.
