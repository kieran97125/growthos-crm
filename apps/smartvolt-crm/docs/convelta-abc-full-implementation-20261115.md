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

The first foundation checkpoint passed typecheck, a production build, and 10 isolated database scenarios. Subsequent source/version/reply/booking/STOP checks expanded to 15 passing database scenarios plus 7 official-template/transport cases. A full 308-test regression passed before adding the 7 template cases. Two actual Workflow engine integration tests pass (persistent sleep/wake and cancelled-claim transport exclusion). New UI passes typecheck/lint; six new browser scenarios and native PostgreSQL shared-claim/quota checks are now in hosted CI, with results pending. No customer message or conversion has been sent.

Still required before this whole ABC release can be called complete:

- Browser flows and native PostgreSQL concurrency acceptance; provision the watchdog environment and verify hosted scheduling. The private five-minute watchdog, paged tenant/source catch-up and real future-booking backfill are implemented candidates. Run history, additional recovery coverage and performance checks remain.
- A1 real channel operations acceptance and A2 actual mail acceptance remain separate external activation gates.
- A5 existing Convelta marketing website enquiry handoff.
- B4 internal notifications/push/preferences and deterministic C observations.
- C1 office-hours SLA/supervisor/collision protection, C2 stable branches/skills/roster routing, C3 full-source outcome reports and C4 verified Meta conversion feedback.
- Full regression, additive hosted migration parity/security/preservation checks, exact-commit CI/deployment and actual signed-in UI readback. Keep original system cards open until verified.

Do not mark ABC complete or replace production with this checkpoint alone.

## Runtime activation approval gate

Automatic approval review rejected creating `CRON_SECRET`, `SMARTVOLT_PUSH_PRIVATE_KEY` and `SMARTVOLT_PUSH_PUBLIC_KEY` in this app's existing Vercel production project. Its stated reason: general deployment approval did not explicitly authorize storing these newly generated credentials with the external production hosting service. A subsequent metadata-only check confirms none of the three keys was created. Do not retry this write by another route or place those keys in code, a different service, or a deployment payload. Complete unaffected work first; ask for the specific runtime-key storage authorization only when the full implementation and reviewable release are ready. Background recovery via the private cron endpoint and external device push remain gated until then. No customer data or real outbound was part of the attempted write.

## Next implementation boundaries

- Finish candidate acceptance first: 6 isolated browser tests in `e2e/engagement.spec.ts`; hosted native shared-claim/quota scenarios appended to `verify-operations-postgres.ts`; 2 actual Workflow integration tests use an intercepted synthetic Supabase HTTP boundary (leaf module mocks do not reach generated step bundles). Run logs must be checked before reporting browser success.
- Journey history now has a scoped keyset-paged API/UI; source catch-up/backfill must be exercised directly, and source-owned runs must be excluded from stats/history if the viewer lacks POS. The delivery ledger, policies, current actor authority, provider receipts and exact official template fingerprint remain the final send authority.
- B4: internal notification preferences/devices/in-app queue/push receipts, minimal push payload and 410 cleanup. Require current membership/product/brand again at push claim. Customer marketing consent is a separate ledger. C background observations should call existing deterministic `observations`/`factsFor` using a fresh scoped snapshot and never spend AI by default.
- C1: add business-hours SLA/read/reporting and real active-editor send admission. Extend the actual WA/Meta claim path, not just a UI warning. Maintain membership/product → connection → thread → editor/contact → job lock order. A same-command receipt can be read after an editor change, but a new provider attempt must obey the current lease. Explicit takeover retains local drafts. Existing legacy clients must also be blocked by a colleague's active lease.
- C2: stable branch IDs, skills, weekly roster and leave must compose with current presence/capacity/grants and existing `ops_assign`; never steal a valid manual owner or overbook the last slot. Extend existing rule schemas/UI and regenerate exact function overrides with tested anchors, not runtime SQL-text rewriting.
- C3: full source aggregate before paging. Use actual confirmed CRM requests, POS appointments, actual verified receipts/refunds; distinguish event-period measures from enquiry cohorts. Staff identity at query time must not be presented as historical attribution. Campaign 7-day latest touch is an association, with missing attribution/cost visible. Lazy Recharts only in reports plus accessible tables.
- A5: dedicated website enquiry intake is an existing `website_private` schema in this same Supabase project. Read only its configured `intake_settings.company_id`, owner-selected brand, stable non-test enquiry IDs; dedupe without overwriting manually edited customer fields. Do not fabricate a provider thread or infer channel-specific consent from a general enquiry.
- C4: brand-owned dataset/destination, encrypted credentials, test/live modes, immutable stable outcome IDs and source evidence, no AI intent/stage as conversion. Verify current official Meta payload documentation before writing transport.
- Continue using native GitHub source checkpoints; local `git push` cannot authenticate. Local head was aligned to `645367a284c7c054c74c72db6923788f84899932` before this next checkpoint. Production still remains f568 and no candidate migration is applied.

Hosted checkpoint `1c71b77`: typecheck/lint passed, original CRM workflow passed. Native verification exposed a missing whitespace in a newly added synthetic SQL statement; fixed. The unit job hit a V8 native `jit_page.has_value()` failure in the PGlite process, not a test assertion. Local Node reports 128 parallel WASM compiler tasks by default; the test command now bounds compilation to one task as well as one test file. The same acceptance tests are rerun; do not report them as passed until hosted evidence exists.

Checkpoint `afaa362` passed hosted typecheck, lint, **315 unit/database tests**, **2 actual Workflow tests**, production build, 4 first-paint checks, existing operations/website/translation interactions and native PostgreSQL shared claims/quota/consent checks. The final browser suite found six new isolated fixtures missing Next's browser environment shim and two navigation expectations still targeting the previous Flow/broadcast URLs. Those fixture expectations/shim are corrected in the next source checkpoint; they still require hosted recheck.

C1 editor admission is now an implemented candidate in `20261114183854_convelta_supervision_and_editors.sql`: fenced per-window leases, heartbeat/expiry, explicit revision-checked takeover, immutable ownership events, actual WA/Meta claim wrappers, original-receipt reads after a takeover, unresolved WA attempt blocking, and automatic-job exclusion while a human edits. Unified inbox retains drafts, adds the editor token to real send requests and acquires before a new send. Four new database cases pass, including same-member windows and a utility template after the text window; 39 existing/new provider database cases also pass. Working-hours SLA and supervisor UI remain unfinished. Isolated inbox browser fixtures now model editor requests independently from customer sends.

Additional canonical entries read in full before C1/C3 decisions: `2026-11-13-reviewed-appointment-owner-consolidation.md` (`c6cd97be3c1ab774b405421281b9d2b4f141f280`), `2026-11-12-configured-pending-time-registration.md` (`1b76d9ab6bd97dcb5ce05409edd21af2f8562ac7`) and `2026-11-11-coherent-report-classification-recovery.md` (`4a95f47762b14fcc1c05c79bab7fa4959f757d5d`). Adopt strict typed times, original observed event provenance, explicit source ownership and complete coherent aggregate boundaries; defer pilot repair/placeholder implementations. No linked client implementation is required or imported.

SLA design boundary for the next module: start the operator clock from the durable workbench receipt timestamp, and end a human response on actual provider acceptance; keep true provider time separate for the 24-hour sending window. Snapshot the brand's office-hours policy per episode so edits do not rewrite historical metrics. Internal notes do not count, known outbox automation is distinct from a human sending an AI-assisted draft, and unknown history is not invented. Report the instrumentation coverage explicitly. Queue metrics are full-scope before paging; new SLA instrumentation must not mark unmeasured old conversations as zero-delay successes.

Before B3 is final: extend the currently name-only merge fields with actual source-bound appointment date/time/service and brand, including those details in source version identity. Missing required source details must produce a skipped job with a clear reason, never abort incoming-message ingestion or invent a booking time. Keep campaign-only fields limited to available facts. Use a literal, single-pass interpolator so customer text containing merge syntax cannot recursively introduce another field. The manual approved-utility-template API now requires a current editor token; its inbox dialog still needs to be added.

### Continuation: supervisor desk and strict editor admission

- Added working-hour SLA snapshots, real first human vs automated response measurement, resolved/reopened event receipts, old unmeasured pending conversations and brand-scoped supervisor queue. Calendar calculations cover weekends, holidays and DST; policy updates only affect new query episodes.
- Added supervisor desk, office-hours editor and Operations entry. All public human-send routes now require a valid per-window editor token, including the older WhatsApp and Meta pages. Takeover retains drafts and does not authorize retrying an unresolved send.
- Local typecheck and lint passed; 21 engagement/editor/SLA database tests passed. Hosted checkpoint 110e720 passed unit/database, durable Workflow, native Postgres, build, paint, original operations/knowledge/translation interactions; full browser found 3 stale template selectors and 1 real small-text contrast violation. Both have been corrected; rerun pending.
- Candidate only, no new production migration/deployment or external message sent. Runtime key creation remains blocked by automatic approval review; no retry or alternate credential disclosure performed.

### Continuation: real template reply, source fields and roster routing

- Added a service-template dialog inside the unified inbox. It resolves the exact selected thread/connection/customer; an approved UTILITY template, current service consent and the current editor lease are required. Command retries preserve the same request.
- Template inventories now load for the selected connection. Source-bound journey fields include actual appointment date/time/service and brand; interpolation is literal and single-pass. Missing facts skip with a reason; service/time changes retire obsolete reminders.
- Added fixed branch IDs, skills, weekly shift windows, leave periods and per-inquiry routing requirements. The existing serialized capacity admission now checks these facts. Existing owners remain retained. Added team routing settings and inquiry requirements controls.
- 23 local engagement/editor/SLA/source/roster DB tests passed; local typecheck/lint passed after correcting a JSX fragment. Full UI/native concurrency acceptance for the new roster work remains pending.
- A5 and B4 migration filenames reserved, still empty at this checkpoint. A5 source schema inspected read-only, with no enquiry content read. No runtime credential writes or live migration/deployment.

### Continuation: own-site handoff and deterministic notifications

- Implemented the existing own-site `website_private` intake adapter: owner-selected brand, stable enquiry/customer IDs, test exclusion, provenance retained, assignments, follow-up dates, notes and a dedicated sales enquiry view. Source reads are constrained to the existing intake company; no fabricated messaging threads, phone auto-merges, channel consent or overwriting manually edited customer fields.
- Added per-user notification facts, dedupe, snooze/done, preferences, private device subscriptions/revocation and one-attempt push admission. Sources are actual assignments, due follow-ups, overdue human-response episodes and own-site follow-ups. Current membership/brand/product authority is rechecked. Push contains generic text only and opens a freshly authorized page. Allowed push destinations are fixed browser vendors.
- Added the notification bell and C reminder entry; deterministic reminders do not invoke AI. Maintenance now includes bounded own-site catch-up and notification members. Device push still explicitly gated by the previously rejected runtime-key write, with no alternate disclosure attempted.
- Source-only candidate; no production migration/deployment, no real external recipient, push, enquiry or CAPI event sent. Local new DB tests include synthetic own-site preservation and reminder source/dedupe checks. Full browser acceptance remains pending.

### Continuation: source outcomes, reports and Meta feedback candidate

- Added an immutable business outcome ledger with observed booking/cancellation/attendance transitions and actual verified receipts/refunds. Historical status baselines have no fabricated occurrence time. Complete scoped aggregates precede campaign/evidence pagination; CRM-only managers receive no POS cash/cost evidence.
- Added period and first-enquiry-cohort reports, stable cutoff, lazy Recharts with tables, channels, actual first-human staff snapshots, seven-day latest accepted campaign association, missing association/cost visibility and source evidence. Campaign costs require verified source and both CRM/POS management authority.
- Added owner-configured brand Meta feedback destinations with API ownership/access checks, encrypted scoped credentials, separate measurement consent provenance, test/live receipts, stable event IDs and one external attempt. Only real confirmation/full-paid outcomes qualify. Unknown actual conversion channel uses `other`, not inferred ad/chat conversion. API receipt is distinct from matching/attribution/optimization.
- Primary current Meta server-event and user-data documentation checked (v27 reference); owner_business/owner_ad_account and POST /events/test_event_code verified against Meta's generated SDK. Several relocated business-messaging docs returned 429; no unsupported business-messaging payload was inferred from secondary blogs. Generic documented CAPI is used with actual-source constraints.
- C3/C4 UI and runtime remain candidate acceptance work. Last local DB suite passed 27 cases before latest C4 SQL additions; new money/cohort/feedback admission and UI acceptance tests still required. No remote migration/deployment, customer message, device push or Meta conversion sent.

### Acceptance checkpoint: all ABC modules have candidate implementation

- Fixed web-push v4 named-export compatibility; production build passed with every new route. Added exact current cutoff input, compact shared operations navigation and the correct customer deep link.
- Added real-component browser fixtures for supervisor, roster, sales handoff, reminders, reports and Meta feedback: accessible/mobile layout, actual command schemas, lost-response same-command retry, source ID/time conversion and test/live UI semantics. Hosted run pending.
- 33 focused database/provider tests passed including partial/full payment/refund separation, scoped report money, complete totals across pages, measurement consent, stable feedback IDs and unknown-send fencing. Earlier full local suite passed 327 cases before these last additions. Latest full rerun still required.
- Added post-response delivery wake only after verified provider ingestion or an authorized successful inbox/workspace mutation, so new source events can wake the durable outbox immediately. The separately authenticated watchdog remains the recovery path; its new runtime secret is still blocked by the explicit automatic review rejection.
- Further acceptance/hardening still required: background maintenance duration/fairness, native editor/roster concurrency, report cohort/source edge cases, A1 operational diagnostic clarity and full browser fixes. No production migration/deployment or external recipient send has occurred.

### Recovery and concurrency hardening

- Added bounded background pools: admitted peers finish even if another receipt fails. Notification and Meta provider work no longer serializes all network timeouts. Maintenance processes bounded company pairs and only acknowledges the last actually processed batch; unfinished tenants are not skipped when a time budget expires.
- Added native PostgreSQL races for roster-qualified final capacity and competing editor/takeover. Added source-money, whole-page totals and current measurement-consent feedback cases; focused 33-case source/provider suite passed before the pool addition.
- Corrected a React purity lint finding in the new report cutoff control; server-side future-cutoff validation remains authoritative. Type/lint and latest focused pool suite rerun are in progress. Full browser and native CI remain required before release.

### First-record concurrency and loading correction

- Administrative records created by a first write now start at revision 1; an empty form's expected revision 0 cannot overwrite another newly saved record. Added serialization for absent settings/cost rows where needed and a regression proving stale consent/branch forms fail without changing the first writer's data.
- Changed brand/page loaders to avoid displaying the previous view as the new view; an acknowledged save followed by a failed refresh remains reported as saved. Adjusted shared forms and compact mobile navigation.
- Local focused source/provider/background suite: 35 passed. Native CI for cd7ee3 passed roster-qualified final slot and competing editor takeover; its main job passed unit/database, Workflow integration, build, production paint, operations and knowledge checks and is running browser acceptance. Latest revision/loading changes require the next exact-source CI pass.

### Browser harness and company messaging stop switch

- cd7ee3 native PostgreSQL tests passed, including actual competing editor and roster/capacity races. Hosted verify passed unit/database, actual Workflow, build, paint, operations and knowledge interactions, then found a fixture build configuration gap: the newly imported template CSS was not handled by the older inbox/translation esbuild fixtures. Corrected loaders and injected the actual styles; production build was unaffected. Full browser rerun pending.
- Added a company stop switch for automated customer messages: cancellation is recorded for pending campaign/journey work, new campaigns are blocked while stopped, send admission rechecks it and restarting does not silently revive cancelled jobs. Explicit human replies remain separately authorized.
- Source still candidate; no production DDL/runtime change or external send. Runtime secret creation remains blocked by the earlier automatic review rejection.
