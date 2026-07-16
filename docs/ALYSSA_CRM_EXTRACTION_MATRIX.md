# Alyssa CRM → Growth OS CRM Extraction Matrix

Product Learning Sync checked on 2026-07-16.

Canonical entry:
`kieran97125/leadhub-source-os/docs/product-learning/entries/2026-07-16-alyssa-crm-operations-extraction.md`

## Adopt now

| Capability | Growth OS packaging | Notes |
|---|---|---|
| Customer 360 lead detail | Core | One operational workspace for identity, source, conversation, booking and next action |
| Assignment and ownership | Core | Tenant-safe user assignment |
| Priority and lifecycle | Configurable | Default enum plus future client-defined labels |
| Follow-up due time and queues | Core | Supports CS daily operations and SLA |
| Tags | Configurable | Client/brand scoped, no client seed labels |
| Duplicate review | Core | Detect, review and merge state; merge action remains separately controlled |
| Conversation inbox | Core | WhatsApp-first but provider-neutral read model |
| WhatsApp connection wizard | Core | Simple guided setup; technical details hidden by default |
| Template mappings | Configurable | Provider template name + variable mapping |
| SLA policies | Configurable | Per client/brand threshold and queue |
| Payment proof workflow | Configurable | Operational verification state, not accounting ledger |
| Automation simulation | Core safety capability | Live mode disabled by default |

## Enterprise extension

- multi-brand command centre
- complex approval chains
- finance/accounting handoff
- custom routing and provider orchestration
- client-specific automation actions

## Do not port

- Alyssa or Ineffable brand names and slugs
- template copy, prices, treatments or branch names
- live customer conversations, phone numbers or payment proof
- client domains, WABA IDs, phone-number IDs, tokens or credentials
- client-specific legal identity or internal staff rules

## Delivery order

1. schema and tenant-isolation review
2. synthetic demo data only
3. Customer 360 and compact lead detail
4. tags, assignment, lifecycle and duplicate review
5. inbox and simple WhatsApp setup
6. template and SLA settings
7. payment verification
8. automation simulator
9. approved live operations in a later release

## Current branch state

The first migration is review-only and has not been applied to any Production database.

Refs #3.
