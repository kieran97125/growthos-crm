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

These are documentation/review artifacts. Do not apply them automatically.
