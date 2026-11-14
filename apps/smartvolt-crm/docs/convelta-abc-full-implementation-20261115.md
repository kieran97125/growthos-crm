# Convelta ABC full implementation

User authorization: complete and deploy **all original A/B/C packages**, 2026-11-15 HKT. This record is an implementation checkpoint, not a release claim.

Production remains the accepted A2 permission release `f5682878742697aa52cf2a5309b51f355ea16424`; its hosted migrations and customer/workspace preservation baseline are recorded in `convelta-a2-release-20261115.md`. New migrations below are local candidates, not applied.

Product Learning Sync checked. Canonical protocol `6a80846bfa10af9a4b84304688b19a326d0752b6`, index `1080e9542f7845a4a34a1815c85466f162fa3a76`, main checkpoint `e52e473ae1685b3c2be0a040ab19f5ee55c66b8d`; reviewed draft checkpoint remains PR 88 in leadhub-source-os. Considered the July 26 broadcast boundary, July 29 connector readiness, July 31 member lifecycle, August 10 permission-aware aggregates, October 6 optional operator settings, October 15 brand financial dashboards, August 3 conversion destination, November 11 account-owned report segments and August 5 Auth callback contracts. Only neutral contracts are adopted; no pilot implementation, credentials, customer records or identity imported.

## Candidate implementation

- `20261114173011_convelta_engagement_execution.sql`: shared policy/consent ledger, source-bound recipients, campaigns, one-attempt transactional outbox, append-only outcomes, official-template inventory, fenced scheduler generations, final current-authority/consent/template/window/frequency/quiet-time/quota checks. Customer STOP records opt-out and cancels pending marketing. Provider receipts update actual job states.
- `20261114174753_convelta_customer_journeys.sql`: immutable recipe versions, source versions, durable runs, unanswered/actual confirmed appointment/actual completed POS triggers, reply/human handoff/source-change cancellation, late-step exclusion. No synthetic provider thread is created.
- Workflow 5.5.0 integrated through its installed Next documentation; internal SDK routes excluded from session proxy, company APIs remain protected. Business ledger authorizes each single provider POST; a replay after unknown/dispatching does not resend.
- Official WA template synchronization uses fixed Graph host, bounded pages/body, exact locale/status/category/content fingerprint. Only text header/body/footer components are supported; unsupported media/buttons remain visibly unavailable.
- New `/crm/messaging` three-step campaign composer and recipient results; `/crm/journeys` recipe settings; per-customer consent UI. They call protected company APIs and retain the same command ID after a lost response.

## Current checks and remaining work

The first foundation checkpoint passed typecheck, a production build, and 10 isolated database scenarios. Subsequent source/version/reply/booking tests expanded to 14 passing scenarios; the latest STOP regression is being rechecked. New UI passed typecheck/lint before the most recent preference additions; browser acceptance is pending. No customer message or conversion has been sent.

Still required before this whole ABC release can be called complete:

- Durable Workflow integration tests, browser flows, native PostgreSQL concurrency, scheduling/watchdog route and deployment environment; catch-up paging, existing-source booking backfill, run history and performance checks.
- A1 real channel operations acceptance and A2 actual mail acceptance remain separate external activation gates.
- A5 existing Convelta marketing website enquiry handoff.
- B4 internal notifications/push/preferences and deterministic C observations.
- C1 office-hours SLA/supervisor/collision protection, C2 stable branches/skills/roster routing, C3 full-source outcome reports and C4 verified Meta conversion feedback.
- Full regression, additive hosted migration parity/security/preservation checks, exact-commit CI/deployment and actual signed-in UI readback. Keep original system cards open until verified.

Do not mark ABC complete or replace production with this checkpoint alone.
