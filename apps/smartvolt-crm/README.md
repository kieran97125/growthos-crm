# SmartVolt CRM — independent company SaaS

Product decision: 2026-11-11. SmartVolt CRM is a standalone company CRM SaaS. KiesTECH is the interaction and visual reference. Customers sign in directly and enter their own company workspace; no Growth OS launcher, other-app entitlement, shared session, cross-app data contract, or external platform database is required.

## Delivered

- Independently buildable/deployable Next.js app with its own lockfile and environment.
- KiesTECH royal-blue/silver conversation inbox, customer context, follow-up/booking intake, Flow canvas/versioning, AI BOT/approved knowledge editor, broadcast planning and event-performance preview.
- Server-side company membership authorization on every operational read/write; owner/manager/agent/viewer roles.
- Dedicated Supabase Auth cookie sessions and company selection; single-company users go straight to their inbox.
- Empty real-company initialization: no fictional customers, prices, offers, approval or consent imported.
- Validated domain commands, server-owned timestamps/authors, serialized writes, optimistic revision conflicts, command idempotency, metadata audit and 30 document recovery versions.
- Browser roles have no raw operational table or privileged-function grants; all six tables also enable RLS.
- A separate `/preview` with two explicitly fictional companies, browser-only edits and no live transport.
- Company settings show team roles and explicit system cards for every unfinished activation/development area.

## Current execution boundary

This is a reviewable implementation, not an activated customer service. Dedicated hosted Auth/database credentials and production migrations have NOT been configured/applied. Auth is disabled when those values are absent; there is no fake company-login fallback. Hosted email/password/session refresh/revocation acceptance still requires the dedicated project.

Live WhatsApp/Instagram/Messenger transport, verified provider templates/receipts, reminder scheduler, real AI model execution, self-service member invitations, subscription payments and large-volume paginated read models are pending system cards. Real-company send/simulated inbound/receipt/reset commands are rejected. Existing KiesTECH and Alyssa deployments and databases are untouched.

The first persistence slice is a bounded, validated company aggregate (100 contacts, 3,000 messages, 4 MB) with commands and transactional revisions. It supports coherent operations and recovery; it is not the final large-volume message store. The `domain-projections` card tracks normalization/pagination before customer-scale rollout. Membership/configuration edits must update identity and company scope atomically in the later admin slice.

## Run and verify

```bash
cd apps/smartvolt-crm
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run dev
```

For browsers: `npx playwright install --with-deps chromium`, then `npm run test:e2e`. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` optionally selects an installed Chromium; CI uses the pinned Playwright browser.

## Dedicated activation

1. Configure a dedicated SmartVolt Supabase project and apply the reviewed migration in `supabase/migrations/` there only.
2. Configure the four server-only values in `.env.example` on the dedicated deployment. No fallback to generic or other-product variables exists.
3. Create and confirm the owner Auth identity through the dedicated project's administrative flow. Configure an owner recovery process and canonical Auth redirects before inviting employees.
4. Provision a company using an already confirmed owner identity (the command sends no email):
   `node --env-file=.env.local --import tsx scripts/provision-company.ts OWNER_USER_UUID 'Company' 'Brand' 'Owner name'`
5. Exercise two real company owners and an agent/viewer through login, refresh, mutation/reload, cross-company denial, suspension and signout. Verify recovery and backups before real customers are onboarded.

## Tooling choices

`@supabase/ssr` and `@supabase/supabase-js` are exactly pinned for dedicated cookie-auth/session handling and database access. `@electric-sql/pglite` executes the real PostgreSQL migration, privileges, RLS and transaction functions in isolated tests. The exact Supabase CLI generates migration names. Existing React Flow, Dagre, Zod, phone parsing, icons and Playwright are retained because the copied interaction patterns depend on them.

## Product Learning Sync checked

Canonical protocol, index and checkpoint were read. Considered entries: CRM extraction (2026-07-16), CRM regression acceptance (2026-07-17), broadcast execution boundary (2026-07-26), master-owned invitation lifecycle (2026-07-31), production Auth callbacks/email semantics (2026-08-05), platform identity/icons (2026-08-10). The user's 2026-11-11 standalone decision supersedes the earlier platform-dependency recommendation for this product. Only neutral patterns were reused. No client data, production credentials, legal identity, offers or runtime configuration was imported.
