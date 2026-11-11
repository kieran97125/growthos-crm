# SmartVolt CRM — independent company SaaS

Product decision: 2026-11-11. SmartVolt CRM is a standalone company CRM SaaS. KiesTECH is the interaction and visual reference. Customers sign in directly and enter their own company workspace; no Growth OS launcher, other-app entitlement, shared session, cross-app data contract, or external platform database is required.

## Delivered

- Independently buildable/deployable Next.js app with its own lockfile and environment.
- KiesTECH royal-blue/silver conversation inbox, customer context, follow-up/booking intake, Flow canvas/versioning, AI BOT/approved knowledge editor, broadcast planning and event-performance preview.
- Server-side company membership authorization on every operational read/write; owner/manager/agent/viewer roles.
- Dedicated Supabase Auth cookie sessions and company selection; single-company users go straight to their inbox.
- Empty real-company initialization: no fictional customers, prices, offers, approval or consent imported.
- Validated domain commands, server-owned timestamps/authors, serialized writes, optimistic revision conflicts, command idempotency, metadata audit and 30 document recovery versions.
- Browser roles have no raw operational table or privileged-function grants; all operational tables also enable RLS.
- A separate `/preview` with two explicitly fictional companies, browser-only edits and no live transport.
- Company settings show team roles and explicit system cards for every unfinished activation/development area.

## Current execution boundary

Dedicated database `smartvolt-crm-pos` (`dcnvuccvdvlpmpvkhuoc`, Singapore) is healthy and has the tenant, purchased-product, immutable POS ledger and ledger read-model migrations installed. Production has the dedicated URL, publishable key and canonical app URL configured. The server secret has not been supplied; company login remains disabled. There are no hosted Auth users or provisioned companies. Hosted email/password/session refresh/revocation acceptance remains pending; no working login or live service is implied.

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

For browsers: `npx playwright install --with-deps chromium`, then `npm run test:e2e`. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` optionally selects an installed Chromium. GitHub CI uses the official runner's preinstalled Chrome and records its version; other runners use the pinned Playwright browser with a bounded installation. All browser, accessibility and screenshot checks remain required.

## Dedicated activation

1. Reuse the dedicated SmartVolt project; do not recreate it or reapply historical migrations. Local migration filenames and SQL now match its exact installed history. The superseded standalone POS patch was consolidated in the installed purchased-product migration.
2. Complete the four server-only values in `.env.example` on the dedicated deployment by supplying `SMARTVOLT_SUPABASE_SECRET_KEY` through the secret environment field. No fallback to generic or other-product variables exists. Never commit or send the secret in chat.
3. Create and confirm the owner Auth identity through the dedicated project's administrative flow. Configure an owner recovery process and canonical Auth redirects before inviting employees.
4. Provision a company using an already confirmed owner identity (the command sends no email):
   `node --env-file=.env.local --import tsx scripts/provision-company.ts OWNER_USER_UUID 'Company' 'Brand' 'Owner name' crm,pos`
5. Exercise two real company owners and an agent/viewer through login, refresh, mutation/reload, cross-company denial, suspension and signout. Verify recovery and backups before real customers are onboarded.

## Tooling choices

`@supabase/ssr` and `@supabase/supabase-js` are exactly pinned for dedicated cookie-auth/session handling and database access. `@electric-sql/pglite` executes the real PostgreSQL migration, privileges, RLS and transaction functions in isolated tests. The exact Supabase CLI generates migration names. Existing React Flow, Dagre, Zod, phone parsing, icons and Playwright are retained because the copied interaction patterns depend on them.

## Product Learning Sync checked

Canonical protocol, index and checkpoint were read. Considered entries: CRM extraction (2026-07-16), CRM regression acceptance (2026-07-17), broadcast execution boundary (2026-07-26), master-owned invitation lifecycle (2026-07-31), production Auth callbacks/email semantics (2026-08-05), platform identity/icons (2026-08-10). The user's 2026-11-11 standalone decision supersedes the earlier platform-dependency recommendation for this product. Only neutral patterns were reused. No client data, production credentials, legal identity, offers or runtime configuration was imported.

## CRM × POS operational workspace

The `/preview?view=pos` route opens the POS inside this same independent company app. The product header switches between peer CRM and POS products only when the company owns both. POS has its own native customer directory and history. Switching workspaces keeps CRM composer drafts and the POS cart, date and filters mounted. Orders and POS domain records persist within the selected company's existing store; there is no other-app launcher or separate identity store.

Delivered work areas: daily operations, real day/week appointment calendar, cashier, prepaid packages, transaction/receipt history and catalog/resources. Services have duration and cleanup buffers. Availability checks staff/customer overlap and resource capacity. Cashier captures sale-time prices and package terms, exact integer cents, line quantities, manager discounts, deposits, balances, receipt printing and manually verified cash/FPS/card references. Paid orders are immutable. Full payment issues packages once; checked-in, matching, single-person appointments can consume one unit and complete atomically. Manager corrections append reversals/refunds with reasons. Appointment, payment and redemption statuses remain independent. POS appointments project into CRM; CRM cannot overwrite the source POS record.

`@fullcalendar/react` 7.1.4 supplies day/week layout, interactions and accessible calendar controls; `temporal-polyfill` 1.0.8 supplies its native Hong Kong timezone handling. The free calendar avoids a paid resource-scheduler dependency; room/staff validity is enforced in the domain, with a staff filter in the calendar. Neither package introduces an external service connection.

Manual registration does **not** initiate a charge or refund. A provider redirect never counts as paid. Actual acquiring/webhooks/reconciliation, recurring classes/subscriptions/waitlists, inventory/cost movements and complete acquisition-to-repurchase attribution have concrete `pos-*` system cards. Normalized immutable financial companion tables and bounded ledger reads are now implemented. The bounded company aggregate remains the command model; finish large-volume command normalization, reconciliation/recovery and dedicated hosted authorization acceptance before customer-scale financial operation. The broad `pos-ledger` card remains partially complete. Existing personal Supabase and other product environments are not used.

Product Learning Sync checked for this addition: canonical protocol, index and checkpoint; `2026-07-16-crm-priority-a-operations`, `2026-07-16-alyssa-crm-operations-extraction`, `2026-10-15-brand-owned-financial-dashboards`, `2026-10-08-completed-outcome-cancellation-correction`. Reused only neutral separation of booking/payment/consumption, brand ownership, integer cents and auditable corrections. All preview names/prices are fictional. New unrelated KOL, internal reporting and spatial entries are not imported.

## Independent products and purchased access (2026-11-11 correction)

CRM and POS are peer products with separate routes and navigation, not a CRM sidebar module. The only cross-product entry is the prominent global header switch, present only when both products are licensed. POS has no CRM rail, and native POS customer details work without CRM. Shared customer identity is infrastructure, not a requirement to buy CRM. Dual customers keep their conversation draft and cart during in-place product changes.

| Purchased products         | Default product | Cross-product entry | Operational access |
| -------------------------- | --------------- | ------------------- | ------------------ |
| CRM                        | CRM             | Hidden              | CRM only           |
| POS                        | POS             | Hidden              | POS only           |
| CRM + POS                  | CRM             | Header switch       | Both               |
| None, suspended or expired | None            | Hidden              | Denied             |

Canonical routes: `/company/:companyId/crm`, `/company/:companyId/pos`. Preview routes: `/preview/crm?plan=crm`, `/preview/pos?plan=pos`, and either product with `plan=both`. The preview toolbar deliberately simulates purchases and does not modify a real subscription. Old `?view=pos` preview links remain compatible.

`sv_company_products` is the private, server-owned purchase registry, separate from membership roles. Missing rows grant no access. Pages, assistant/workspace APIs, domain commands and the PostgreSQL write lock enforce purchases; browser-hidden navigation is not the authorization boundary. Raw table/privileged-function access is revoked from browser roles and RLS remains enabled. Product rows cannot be granted by editing a workspace payload or user metadata, even for a company owner.

Responses exclude unpurchased product records: CRM-only does not receive POS financial data; POS-only receives the shared customer directory and POS, with CRM message/history, campaign and knowledge content removed. Writes use the full internal server document and return a product-filtered projection, so revoking or switching products never deletes retained records.

The dedicated operator script lists companies grouped by current CRM/POS purchases, or atomically registers a verified purchased combination. These commands require the dedicated server-side project credentials; they do not connect to a personal Supabase or process payment:

```bash
node --env-file=.env.local --import tsx scripts/manage-products.ts
node --env-file=.env.local --import tsx scripts/manage-products.ts COMPANY_UUID crm
node --env-file=.env.local --import tsx scripts/manage-products.ts COMPANY_UUID pos
node --env-file=.env.local --import tsx scripts/manage-products.ts COMPANY_UUID crm,pos
node --env-file=.env.local --import tsx scripts/manage-products.ts COMPANY_UUID none
```

Provisioning requires an explicit final product argument (`crm`, `pos`, or `crm,pos`). Existing companies are not blanket-granted another product by migration. Product billing/webhook renewal, grace periods and a graphical SaaS operator registry are tracked by `product-billing-sync`; independent relational customer-directory normalization is tracked by `shared-customer-directory`. Database foundations are installed; real subscriptions and company accounts remain inactive.

Product Learning Sync checked for this correction: canonical protocol, index and checkpoint plus `2026-07-15-enterprise-pilot-positioning`, `2026-07-28-marketing-command-center-data-source-boundary`, `2026-07-31-master-owned-member-invitation-lifecycle`, `2026-08-10-platform-app-identity-icon-contract`, `2026-08-10-permission-aware-aggregate-brand-scope`. Adopted neutral independent identity, server-rechecked product permissions, private control-plane/RLS and permission-filtered reads; no external launcher, shared-platform dependency or client data is imported.

## Auditable POS ledger (2026-11-11)

Seven relational companion tables store appointment projections, order terms/version history, payments, refunds, package entitlements and redemption/reversal evidence. Projection runs in the same database transaction as the existing company command. Failure rolls back the document revision, recovery history, command audit and ledger together. A first deposit freezes order terms; original money/consumption rows cannot be changed or removed. Composite company keys, amount/package constraints and protected appointment identity prevent cross-company references and invalid balances. Table grants are reset before narrow service permissions, including denial of TRUNCATE. All seven tables have RLS and browser roles have no raw access.

Company settings → **查閱交易帳簿** opens `/company/:companyId/ledger`; `/api/companies/:companyId/pos/ledger` is the read API. Both recheck membership and POS purchase, and the read RPC repeats authorization. Reads contain order summaries, no customer identity/raw snapshots. Dates use Hong Kong midnight, cover at most 366 days and return at most 100 orders per page with stable time/ID pagination. The selected period is **order creation date**; payments/refunds are the lifetime registered amounts for those orders, including later receipts. Totals cover the whole selected cohort, not just the current page. Each page has one coherent database snapshot; separate pages may observe later revisions and are not an immutable export.

Product Learning Sync checked: canonical protocol/index/checkpoint and the existing standalone CRM/POS decisions; reused the already-reviewed July 16 CRM operations, October 8 auditable correction and October 15 brand-owned financial patterns. No new cross-product classification or pilot data import.
