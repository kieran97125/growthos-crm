# Growth OS CRM

Standalone WhatsApp-first CRM product slice for Growth OS.

## Product Identity

- Product name: `Growth OS CRM`
- Optional app name: `FollowHub CRM`
- Positioning: `WhatsApp-first CRM`

This app is intentionally separate from the Growth OS platform shell so CRM can
use a full-screen operations layout: dark left sidebar, compact top metrics,
filter/search row, inbox table, and dedicated lead detail pages.

Alyssa, Ineffable Beauty, Skin Light, and future brands are demo/client brand
records only. They are not the CRM product identity.

## Routes

- `/` - CRM product home and entry point.
- `/crm` - LeadOps inbox.
- `/crm/leads/[leadId]` - lead detail workspace.
- `/crm/settings` - read-only WhatsApp channel settings foundation.
- `/crm/campaigns` - brand-filtered audience preview with recipient exclusion evidence; no sending.
- `/crm/automations` - scoped follow-up rule simulation; no record mutations.
- `/crm/system` - 18 product system cards with implementation state, dependencies, acceptance and official sources.
- `/login` - shared admin password gate.
- `/logout` - clears the admin session cookie.

## Data Model

The first standalone version reuses the Alyssa LeadOps CRM read model:

- `contacts`
- `leads`
- `lead_source_snapshots`
- `bookings`
- optional CRM Phase 2 tables if deliberately enabled later

The UI must not expose raw source snapshot payloads, WhatsApp token values, or
service-role keys.

## Write Safety

CRM operation writes are disabled by default.

- `CRM_WRITE_ENABLED` must be `true` before Phase 2 write actions can run.
- Missing Phase 2 tables keep write actions disabled.
- No WhatsApp API calls are made.
- No send-message endpoint is included.
- No Supabase migration is applied by this repo setup step.

## Environment Variables

Expected server/runtime variables:

- `GROWTHOS_CRM_ADMIN_PASSWORD`
- `GROWTHOS_CRM_ADMIN_SESSION_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRM_WRITE_ENABLED` optional, default disabled

For transition compatibility, the admin gate also accepts the old
`LAUNCHHUB_ADMIN_PASSWORD` and `LAUNCHHUB_ADMIN_SESSION_SECRET` names, but new
deployments should use the Growth OS CRM names.

## Docs

- `docs/CRM_SCHEMA_PROPOSAL.md`
- `docs/CRM_PHASE2_SCHEMA.sql`
- `docs/CRM_PHASE2_APPLY.sql`
- `docs/OMNICHAT_PARITY_REVIEW_20261109.md` - verified Omnichat capability mapping, current code audit and staged architecture.

These are documentation/review artifacts. Do not apply them automatically.

## Operations verification

Run `npm run test:operations`, `npm run typecheck`, `npm run lint`, `npm run test:e2e`, `npm run build`, and `npm run verify:production-boundary`.

The operating inbox now provides working search and combinable filters, overdue queues and URL-preserved views. Lead detail includes human-authored saved-reply drafts with explicit variable validation. Campaign and workflow pages use the current read model, limited to at most 500 current-month leads; they are not complete contact audiences or connected message streams.

The legacy read model has no verified client scope, marketing-consent ledger, provider connection or approved-template evidence. Campaign eligibility therefore remains zero. No provider sending, external AI, new write endpoint, database migration or live-activation flag is introduced. The current shared-admin access model still requires the tenant/brand membership work recorded in `CRM-001` before multi-tenant activation.

Browser acceptance uses explicitly synthetic fixtures at `/crm/acceptance` only in development with `CRM_ACCEPTANCE_FIXTURES=true`. In a production build the route always returns 404, even if that test flag is set. Run `npx playwright install --with-deps chromium` before browser acceptance; a local Chromium can be selected with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
