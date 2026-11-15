# Convelta ABC full implementation

User authorization: complete and deploy **all original A/B/C packages**, 2026-11-15 HKT. Latest runtime release is now `58e489f8f78993ce1f584cf659449d1dc15c60a6`, READY as `dpl_7hcaDVRs7zHTSL7G6mbxteRnWUQ2` at app.convelta.io. Current capability/activation evidence is in `convelta-abc-release-20261115.md`.

The paragraphs below preserve chronological development checkpoints. Earlier candidate-only, unfinished and A2-production statements are historical. Thirteen additive migrations are now installed with exact SQL parity; original workspace fingerprints are unchanged. External channel/mail/Meta/device acceptance remains explicitly separate. No new production push key was stored.

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

Automatic approval review rejected creating `CRON_SECRET`, `SMARTVOLT_PUSH_PRIVATE_KEY` and `SMARTVOLT_PUSH_PUBLIC_KEY` in this app's existing Vercel production project. Its stated reason: general deployment approval did not explicitly authorize storing these newly generated credentials with the external production hosting service. A subsequent metadata-only check confirms none of the three keys was created. Do not retry this write by another route or place those keys in code, a different service, or a deployment payload. Complete unaffected work first; ask for the specific runtime-key storage authorization only when the full implementation and reviewable release are ready. Background recovery subsequently moved to a genuinely private Schedules function target, removing the cron-key requirement without any substitute credential disclosure. Only the two device-push runtime keys remain blocked by that storage rejection. No customer data or real outbound was part of the attempted write.

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

### Pre-release preservation baseline

- Read-only hosted checks confirm production remains A2: workspace revision 5 and all four section fingerprints unchanged; 77 system cards, zero CRM customers, zero WA/Meta connections and no candidate outbox tables. No candidate DDL applied.
- Hosted security categories remain the existing own-site definer/password warnings, with service-only table INFO. No new production privilege was granted. Baseline results are retained for post-migration comparison.
- Added covering indexes for new FK/source lookups, and corrected manual-template readiness to show real connection/inbound/acceptance/delivery evidence. Disabled connections cannot synchronize templates. These final candidate changes require exact-source acceptance.

### Private scheduling and browser acceptance correction

- Replaced the secret-bearing public cron route with the documented `@vercel/schedules` private function target (`schedule/v1beta` only). No `CRON_SECRET`, VAPID key or substitute credential has been written or disclosed. The blocked production push-key action remains blocked. Private deployment output and public inaccessibility must be verified before production promotion.
- Use a 15-minute recovery schedule compatible with all current plans. Exact delivery jobs still wake from verified source events and use durable workflow sleeps; do not promise five-minute recovery or instantaneous offline reminder delivery. Scheduler plan jitter remains applicable.
- Two tests exercise the real schedule SDK parser and partial-failure result. These tests are not proof of HTTP authentication: the platform's private function target is the required boundary.
- Cancelled run 187 artifacts exposed three stale implicit-label selectors, supervisor link contrast and real report-filter horizontal overflow. Updated accessible-role selectors, darkened the link, made report filters wrap with readable stacked labels, and isolated cost status text from its expandable evidence form.
- Local typecheck/lint and two schedule-handler cases passed. No candidate hosted migration/deployment or external recipient send yet. Full browser acceptance remains required for this checkpoint.

### C observations while the workbench is closed

- Completed the remaining B4 background-observation path: the private maintenance worker reuses C's existing deterministic observations and source facts from fresh, currently authorized, per-brand snapshots. Up to five brands rotate per user scan; no AI model, customer send or fabricated metric is invoked.
- Persisted observations retain source facts, checked time, current scope, stable notification identity and the existing C feedback/quiet rules. Source changes expire obsolete observations; out-of-order workers cannot restore an older snapshot, including after a newer empty snapshot. Notifications remain generic on external devices. Users can independently disable observations, snooze or complete each reminder.
- Added a server-only observation ledger/cursor and evidence in the reminder centre. Browser/raw-table permissions remain denied. Optional observation failure still lets actual follow-up reminders synchronize and dispatch, while the background execution reports the failed company for reconciliation.
- 44 local Copilot/database tests passed, including source retention, same-source dedupe, quiet-key suppression, revoked brand scope, empty-snapshot fencing and unchanged AI-request count. Private schedule preview `dpl_5ZDTkc7q8s2wVa7CwxArZkVUhL99` at d4c5e6a built READY; this proves deployment configuration acceptance, not yet production invocation or public inaccessibility.

### Full acceptance run 189 findings

- Hosted d4c5e6a passes native PostgreSQL races, typecheck/lint, unit/database, real Workflow, production build, four paint checks and the dedicated original operations/FAQ/translation flows. Its full suite completed: 115 passed, 11 failed. All twelve new ABC workspace cases passed, including mobile geometry and accessibility.
- Three campaign failures were the remaining implicit-label template selector, now changed to the accessible combobox role. The eight older WA/Meta fixture failures came from missing editor-lease interception and non-UUID synthetic thread IDs after strict lease admission was added. Fixtures now model the actual editor schema independently, retaining the original send, draft and unknown-result assertions; production validation was not weakened.
- Latest full local regression passes 340 tests. No candidate production migration or release yet. New source/fixture changes require the final hosted acceptance run.

### Hosted schema installed; final campaign-fixture correction

- Run 190 completed 123/126 browser cases. Every WA/Meta lease/send/draft/unknown-result case now passes, as do all ABC workspaces and the new observation source expansion. The last three failures are the campaign fixture selecting an incorrect accessible name (`官方模板` instead of actual `WhatsApp 官方模板`) and a fingerprint instead of the displayed template option. Corrected from the actual failure snapshot and component; no runtime validation or assertion relaxed.
- CI now runs all 126 browser scenarios once; removed the three redundant focused invocations already included in that full suite. Production paint, native PostgreSQL, unit/database and actual Workflow checks remain separate.
- Twelve additive hosted migrations are installed. Forty created tables and 76 related routines were audited: all created tables have RLS and deny browser privileges; checked routines are invoker, empty search path and deny browser execution. Two native SLA history foreign-key indexes were added after advisor review; no new unmatched FK findings remain for candidate tables. Existing security WARN categories/counts remain 2 anonymous definer, 3 authenticated definer and 1 password-protection warning; these are pre-existing own-site/Auth findings, not new browser grants.
- Source filenames are aligned to actual hosted migration versions, preserving every SQL byte. Original workspace revision remains 5 and inbox/POS/studio/broadcast fingerprints match the pre-release baseline. No customer, outbound, invitation or AI request was created.
- Owner-scoped production DB reads return all new modules with truthful empty state. Enabled own-site handoff for the existing single Convelta brand after checking intake ownership: zero real enquiries, three test enquiries excluded, zero fake customers created. Activation receipt `77d18581-463a-4ba4-8e48-91da7fe0b86a` is idempotent.
- Production application still remains A2 until the corrected exact-source acceptance completes. Runtime push-key storage remains blocked; no retry or alternate disclosure performed. Connected local browser context was unavailable; no new authenticated browser acceptance claimed.

### Explicit final campaign submission and watchdog wrap

- Run 191 passed 123 browser cases, then reached the actual campaign submit flow. Its screenshots exposed a real React/button activation defect: the step-two button was reused as a submit button after the synchronous step change, so the original click submitted before the time review. This code was never released; no real recipient exists or was sent to.
- The wizard now cancels navigation's default activation, gives navigation/retry/submit distinct keys, makes the final submit type explicit and rejects form submit before step three. The same browser tests now require the time-review heading and zero POST commands before an explicit final action. This is a runtime fix, not a weakened test. CI runs the six campaign cases first and the other 120 once afterward for quicker useful failure evidence.
- Fixed the watchdog's last-company boundary: it now wraps to active companies in the same tick instead of wasting every second tick for a single-company installation. An additional installed migration preserves acknowledgement fencing. All 34 focused engagement/database cases pass, including unacknowledged retry identity and immediate cursor wrap. This changes no customer or business record.
- Thirteen hosted migrations now match source SQL bytes; source filenames aligned to actual versions. Latest app release is still A2 pending the corrected exact-source acceptance.

### Campaign intent accepted; mobile border-box correction

- Run 192 passed the actual HKT schedule, zero-submit-before-review, single-command lost-response reconciliation, full recipient pagination, viewer restrictions and accessibility. The runtime submit defect is fixed.
- Its only remaining campaign failure measured the mobile dialog at 398px in a 390px viewport. Corrected the dialog and its descendants to border-box sizing so padding is included in the declared responsive width. The geometry assertion and Escape test remain unchanged.
- Hosted unit/database count is now 341 with the cursor-wrap regression; native PostgreSQL, two Workflow cases, build and four production paint cases pass. Remaining browser flows in this run were correctly skipped after the focused geometry failure; they still require the corrected-source full run.

### Verified ABC runtime release

- Exact source 58e489f passes 341 unit/database, 2 Workflow, 4 paint and all 126 browser cases; native PostgreSQL and original CRM workflow pass. READY production dpl_7hcaDVRs7zHTSL7G6mbxteRnWUQ2 now owns app.convelta.io.
- Real unauthenticated HTTP boundaries and private-function 404 were read back. Workspace fingerprints and zero customer/outbound/invitation/new-model baseline remain unchanged. Owner-scoped DB module reads work; live authenticated UI is honestly pending because browser context was lost and fallback showed the login wall.
- Subsequent workflow-only changes preserve the six campaign screenshots in a separate output directory instead of letting the other 120 cases clean them. Runtime App code and SQL are unchanged. First private schedule invocation and external device/channel/mail/Meta acceptance remain on follow-up cards.

### First production schedule and retained evidence accepted

- The actual automatic private schedule invoked production 58e489f at 2026-11-14 22:20:06 UTC (2026-11-15 06:20 HKT): checked 1, completed 1, failed 0. The company checkpoint and fresh brand observation source snapshot were independently read back, with zero new AI requests. No cron secret or replacement credential was created, and no manual maintenance invocation or customer send was used for this proof. Execution-core and C-background cards are complete.
- Documentation/test-output source e4b521b repeats all 341 unit/database, 126 browser, 4 paint and 2 actual Workflow cases plus native PostgreSQL; original CRM also passes. App runtime, dependencies, configuration and SQL are byte-identical to production 58e489f. Retained artifact 14134518611 SHA256 2de4a8e9e6b739e127f0a904073d8d8fe49f375604b22092cedaa6c819c91200 is verified; the final campaign mobile review screen was visually checked.
- External channel/mail/Meta activation, signed-in Owner UI acceptance and user-device push remain separately tracked. VAPID key persistence remains blocked by automatic review pending specific authorization; no bypass or retry occurred.

### Explicitly authorised Web Push activation and signed-in acceptance

- On 2026-11-15 the owner explicitly authorised generating and storing the notification signing key pair in the existing Convelta Vercel production project. One new pair was generated and validated, then stored using the native environment-variable API: private key is sensitive/write-only, public key is encrypted, both production-only. No credential was committed, written to a local file or printed. Public-key SHA256: 8ef650dbc52be3a577201453138f3a103c38e3828f0739944f2aa8ae8f6ad31d.
- The already accepted runtime 58e489f was rebuilt as READY production dpl_CwRY28rc8gG8FZnXiv46AyknAHYJ at 2026-11-15 14:16 HKT; app.convelta.io now uses that deployment. Signed-in reminder controls change from unavailable to enabled after reload, proving the configuration is applied. The current device enable attempt remains pending browser permission/setup; no registered device or delivery is claimed.
- The connected signed-in browser is available again. Actual operations, reminders, supervisor, sales, journeys, campaign, routing and Meta configuration pages were read; routing and Meta pages survived reload. These reads do not fabricate customer records or external provider activation.
- A reproducible React 418 text hydration recovery occurs on a fresh report page. Native server/Chrome locale punctuation differs. Candidate fix uses one explicit Hong Kong formatter assembled from calendar parts for ABC timestamps, keeping rendering pure and preserving source instants without suppressing warnings. Three local midnight/time-zone/invalid-input cases pass; the report browser case now asserts the precise Hong Kong cutoff. Type/lint/full hosted acceptance and production reproduction readback are required before declaring this issue fixed.

Product Learning Sync checked: protocol 6a80846bfa10af9a4b84304688b19a326d0752b6, index 1080e9542f7845a4a34a1815c85466f162fa3a76 and main checkpoint e52e473ae1685b3c2be0a040ab19f5ee55c66b8d remain unchanged; the existing canonical draft checkpoint d5368971d8cd969cc5102f41af930c90cb7f08cd was read. Reconsidered entries 2026-07-29-connector-readiness-and-identity-boundary and 2026-10-06-optional-operator-settings. Only neutral readiness/visible-failure contracts apply; no pilot data, identity, credentials or implementation imported.
