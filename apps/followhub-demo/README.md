# FollowHub independent CRM demo

An independent Next.js application for demonstrating a customer conversation workspace. Deploy **only this directory** as the Vercel project root. The root CRM application remains separate.

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

AI calls transmit only the selected synthetic conversation and effective same-brand approved knowledge to the project's model. No internal notes are included. The access code signs a one-hour HttpOnly session, with same-origin enforcement and a per-instance request limiter. This is demonstration access control, not production multi-tenant authentication or a global cost quota. Provider errors remain visible; the app never silently replaces a failed AI request with a fake AI result.

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

Create `.env.local` from `.env.example`. On Vercel set server-only `AI_GATEWAY_MODEL` and a dedicated random `DEMO_ACCESS_CODE`; enable project OIDC. No provider key is needed with working Vercel AI Gateway OIDC access and account credit. For local OIDC use a fresh token from this project's Vercel environment; never copy a client project's credentials. Model availability must be verified after deployment.

The Vercel project root is `apps/followhub-demo`, framework Next.js, Node 24. `git.deploymentEnabled:false` prevents automatic deployments of unrelated repository changes; deploy a tested explicit Git branch/commit. Project-level Vercel protection is retained unless separately authorized.

## Data and API contracts

`src/lib/demo/state.ts` coordinates inbox, studio, campaigns and the event ledger. A campaign freezes its template/body after launch. The reducer rechecks audience eligibility at launch, rather than relying on an earlier preview. Per-recipient event IDs deduplicate delivery receipts; booking lifecycle events retain cancellations and reconfirmation history. New CSV contacts have unknown consent.

`POST /api/demo-access` validates the code and issues the session. `GET /api/ai/status` exposes only connectivity/configuration state. `POST /api/assistant` checks origin, session, payload scope, handoff policies, model output shape, source revisions, price grounding and booking claims. Browser-only demo operations have no external send endpoint.

## System cards for delivery beyond the demo

| Card                                 | Status                                   | Completion condition                                                                                           |
| ------------------------------------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| CHANNEL-01 Official WhatsApp         | Waiting for a dedicated demo WABA        | Dedicated number, approved templates, signed webhooks and real receipt reconciliation; no client account reuse |
| DELIVERY-01 Durable campaign jobs    | Designed; not enabled                    | Persistent outbox, per-recipient idempotency, retry/stop, suppression recheck and delivery receipt ledger      |
| REMINDER-01 Background reminders     | Preview available                        | Durable scheduler with HKT execution, booking-version invalidation and cancellation guards                     |
| IDENTITY-01 Multi-company operation  | Isolated demo only                       | Tenant-scoped persistence, roles, audit, retention and recovery; provider choice remains open                  |
| AI-01 Production controls            | Server route and demo access implemented | Distributed rate/cost limits, curated knowledge publishing, evaluation suite and human handoff monitoring      |
| REPORT-01 Real performance           | Demo events auditable                    | Verified provider receipts, approved attribution windows and separately reconciled booking/arrival outcomes    |
| REPORT-02 Revenue and messaging cost | Unknown by design                        | Verified financial records and provider charge source, without assuming a POS connection                       |

## Product Learning Sync checked

Read the canonical Product Learning Sync protocol, index and review checkpoint before implementation. Applied the WhatsApp broadcast operations boundary (2026-07-26: consent, suppression, approved version, send-time validation and idempotency) and permission-aware aggregate scope (2026-08-10: one brand scope for audience and metrics). Existing CRM graph, review-before-confirmation and destructive-action regressions are retained. No company runtime or credentials were changed. Canonical documentation changes remain review proposals rather than changes to a client application.

The standalone application owns its own lockfile and verification workflow. Root TypeScript and ESLint exclude `apps/` so each package is checked against its own dependencies instead of mixing different Next.js/React versions.
