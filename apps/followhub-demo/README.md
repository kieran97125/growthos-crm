# KiesTECH independent custom CRM demo

An independent Next.js application for demonstrating a customer conversation workspace. Deploy **only this directory** as the Vercel project root. The root CRM application remains separate.

## Delivery model — 2026-11-11

KiesTECH is a custom CRM delivered as one independent installation per client company. Each installation can contain that client's staff, brands and branches, with tailored Flow, BOT knowledge, broadcasts, reporting and optional POS. SmartVolt is the separate multi-company CRM SaaS; it may reference KiesTECH's interaction design, while KiesTECH may reuse its neutral internal POS patterns. Their delivery, identity, persistence and activation remain independent.

The [custom delivery and POS decision](../../docs/KIESTECH_CUSTOM_CRM_POS_20261111.md) defines reusable patterns, source ownership, optional internal versus third-party POS and acceptance cards. This decision does not add a POS to the current demo or activate any external connection.

## Platform identity

KiesTECH uses royal blue (`#2457E7`), cool silver (`#B9C5D8`) and navy ink (`#15233B`). Shared platform tokens live in `src/lib/brand.ts`; `BrandMark` supplies the same K vector to the workspace, browser icons (32/192/512), Apple icon (180) and maskable manifest. Icon routes are generated locally without external fonts or image services. The manifest provides home-screen identity, not offline synchronization. Existing installations may need to refresh or re-add their home-screen shortcut to clear a cached icon.

The Vercel project/directory and browser storage keys retain their existing internal identifiers, preserving links and saved demo data. Fictional client workspaces retain their own identities.

## Working experience

- Conversation inbox, assignment, internal notes, scoped customer profiles, tags, manual booking follow-up and quick replies.
- React Flow canvas with editable nodes, branches, parameter mappings, version snapshots, visible node deletion with confirmation, graph validation and execution of the saved graph.
- Native form preview and customer experience centre both create real pending follow-up cards inside this demo. Staff verification is separate from customer intent.
- Brand-scoped knowledge and AI settings. AI SDK 7 uses Vercel AI Gateway's project OIDC identity; the authenticated server route returns structured, grounded Cantonese suggestions and handoff summaries. Demo-engine fallback is explicitly selected and labelled.
- Broadcast campaigns: brand templates, new/existing segments, tags, per-contact parameter preview, CSV import, consent evidence, suppression, template revision checks, 24-hour frequency cap and idempotent launch into the demo inbox.
- Campaign event ledger, recipient drill-down, explicit reply attribution, staff-verified booking conversion, cancellation and attendance outcomes, transparent denominators and auditable CSV export. No seeded success metrics, assumed sales revenue or invented provider charges.

## Isolation and execution boundaries

All customer/brand/phone fixtures are synthetic. Browser state is versioned, schema validated and atomically stored in a single localStorage document. There is no Supabase, POS connection, shared database, production company configuration or actual WhatsApp channel.

Broadcast receipt controls are test inputs, not Meta webhooks. “模擬到提醒時間” executes the current graph and inserts the mapped reminder into the demo conversation; it does **not** establish a server-side scheduled job. An intake remains pending until staff verifies it. Real message sending is not implemented and cannot be enabled by changing a UI flag.

AI calls transmit only the selected synthetic conversation and effective same-brand approved knowledge to the project's model. No internal notes are included. The access code signs a one-hour HttpOnly session, with same-origin enforcement and a per-instance request limiter. This is demonstration access control, not production staff authentication or a global cost quota. Provider errors remain visible; the app never silently replaces a failed AI request with a fake AI result.

## Local development and checks

Use Node 24.

```sh
npm ci
npm run dev
npm test
npm run typecheck
npm run lint
npx playwright install --with-deps chromium
npm run test:e2e
npm run build
```

Root `/?view=inbox`, `flows`, `bot`, `broadcasts`, and `experience` select an initial workspace. The experience centre is the default. Each view shares the same browser state.

Create `.env.local` from `.env.example`. On Vercel set server-only `AI_GATEWAY_MODEL` and a dedicated random `DEMO_ACCESS_CODE`; enable project OIDC. No provider key is needed with working Vercel AI Gateway OIDC access and account credit. For local OIDC use a fresh token from this project's Vercel environment; never copy a client project's credentials. Model availability must be verified after deployment. The deployed live-model smoke test on 2026-11-10 authenticated successfully but Gateway returned HTTP 403 requiring a verified payment method on the account. Real AI generation remains blocked by account activation; it must not be described as verified working. The UI reports this activation requirement and offers an explicitly labelled deterministic engine. No card, credit purchase or client provider key was added.

The Vercel project root is `apps/followhub-demo`, framework Next.js, Node 24. `git.deploymentEnabled:false` prevents automatic deployments of unrelated repository changes; deploy a tested explicit Git branch/commit. Project-level Vercel protection is retained unless separately authorized.

## Data and API contracts

`src/lib/demo/state.ts` coordinates inbox, studio, campaigns and the event ledger. A campaign freezes its template/body after launch. The reducer rechecks audience eligibility at launch, rather than relying on an earlier preview. Per-recipient event IDs deduplicate delivery receipts; booking lifecycle events retain cancellations and reconfirmation history. New CSV contacts have unknown consent.

`POST /api/demo-access` validates the code and issues the session. `GET /api/ai/status` exposes only connectivity/configuration state. `POST /api/assistant` checks origin, session, payload scope, handoff policies, model output shape, source revisions, price grounding and booking claims. Browser-only demo operations have no external send endpoint.

## System cards for delivery beyond the demo

| Card                                 | Status                                                | Completion condition                                                                                           |
| ------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| CHANNEL-01 Official WhatsApp         | Waiting for a dedicated demo WABA                     | Dedicated number, approved templates, signed webhooks and real receipt reconciliation; no client account reuse |
| DELIVERY-01 Durable campaign jobs    | Designed; not enabled                                 | Persistent outbox, per-recipient idempotency, retry/stop, suppression recheck and delivery receipt ledger      |
| REMINDER-01 Background reminders     | Preview available                                     | Durable scheduler with HKT execution, booking-version invalidation and cancellation guards                     |
| IDENTITY-01 Client staff access     | Isolated demo only                                    | Individual staff sessions, roles and brand/branch authorization within one independently deployed client; audit, retention and recovery |
| AI-00 Live model activation          | Blocked by Vercel account payment-method verification | Account owner activates Gateway; rerun grounded response and multi-turn memory checks                          |
| AI-01 Production controls            | Server route and demo access implemented              | Distributed rate/cost limits, curated knowledge publishing, evaluation suite and human handoff monitoring      |
| REPORT-01 Real performance           | Demo events auditable                                 | Verified provider receipts, approved attribution windows and separately reconciled booking/arrival outcomes    |
| REPORT-02 Revenue and messaging cost | Unknown by design                                     | Verified financial records and provider charge source, without assuming a POS connection                       |
| POS-01 Optional internal POS        | Design recorded; not ported                           | Independently adapted domain, calendar/cashier/packages and reciprocal CRM links; preserve drafts and validated state; no SaaS runtime dependency |
| POS-02 Existing-provider adapter    | No provider selected or verified                      | Document exact vendor/version/API permissions, source IDs, capabilities, mapping, freshness, replay and reconciliation acceptance |
| POS-03 Financial/source authority  | Design recorded; no live financial records             | Separate booking/payment/consumption, integer cents, immutable corrections, source-owned statuses and explicit revenue/attribution definitions |

## Product Learning Sync checked

Read the canonical Product Learning Sync protocol, index and review checkpoint before implementation. Rechecked for the 2026-11-11 KiesTECH identity change and applied the 2026-08-10 platform app identity/icon contract: one platform mark across UI, browser and mobile metadata with maskable safe area and no client logo reuse. Applied the WhatsApp broadcast operations boundary (2026-07-26: consent, suppression, approved version, send-time validation and idempotency) and permission-aware aggregate scope (2026-08-10: one brand scope for audience and metrics). Existing CRM graph, review-before-confirmation and destructive-action regressions are retained. No company runtime or credentials were changed. Canonical documentation changes remain review proposals rather than changes to a client application.

The standalone application owns its own lockfile and verification workflow. Root TypeScript and ESLint exclude `apps/` so each package is checked against its own dependencies instead of mixing different Next.js/React versions.

Product Learning Sync checked for the 2026-11-11 custom delivery decision: canonical protocol/index/checkpoint; CRM extraction (2026-07-16), brand-owned financial reporting (2026-10-15), and auditable outcome corrections (2026-10-08). Reviewed SmartVolt PR #7 at `2c62916ed9af9f756d5e5e1332819761b26e033e` as a source reference for its internal POS, not proof of a vendor connector or of KiesTECH implementation. Only neutral design constraints were considered; no client data or runtime was imported. The corresponding canonical checkpoint is a separate review proposal.
