# Targeted review: website C recovery and notification settings

The owner questioned two paths in released runtime `3799d17`. Previous ordinary visitor/C/staff acceptance did not cover expired-worker recovery or legacy category defaults. General success is retained as dated evidence; complete acceptance of these two paths was reopened.

## Confirmed reproduction

Two new tests failed against the released schema, while its eight existing C database checks passed:

1. An interrupted, already-admitted C turn is recovered after a real staff response. The old timeout branch runs before locking/rechecking the thread and sets `human_waiting=true`, reopening resolved work.
2. A persisted notification preference has no `website` key. The UI and in-app synchronization default to on; Web Push admission defaults to off. Even an otherwise opted-in synthetic device receives no admission until that category is explicitly saved.

Fresh read-only inspection of the own-company scope found no open human-waiting thread with a staff response and no later visitor message. One preference row lacks the website key, overall push is off and there are no active devices. These observations are not a claim that every customer is unaffected or that a real device delivery occurred. No business rows, opt-in or device registration were changed for diagnosis.

## Fix

The additive migration `20261117062518_convelta_c_recovery_notification_defaults.sql` locks and rechecks the current conversation before expired-worker recovery. Staff responses, closure, pause, newer messages and knowledge/context changes supersede the old turn. A genuinely unanswered current turn still enters human follow-up exactly once. Unknown provider dispatch is never repeated; admitted evidence is retained. A fresh human request uses its own start time.

One effective-preference function supplies the read, synchronization and push boundaries. Missing website/observation flags use the displayed default; explicit false remains false. Existing global push consent, device registration, quiet periods and no-retry rules remain required. Legacy saves that omit a category preserve its explicit prior value and immutable request replay. No existing overall push switch or device subscription is enabled by the migration.

The actual notification workspace separately shows website CRM reminders and device-push readiness: unconfigured service, global off, no registered device or setup ready. Ready is a configuration state, not proof of delivery to an operating system.

## Verification boundaries

Focused regressions cover both reported failures and their counterexamples, explicit off/legacy saves, no global consent, no device, quiet hours, current-question fallback and replay. Native PostgreSQL tests hold the staff-response transaction while recovery competes, and separately admit a legacy website notification using a synthetic device without any network send. Actual component browser tests distinguish category on from global off/no-device/ready and preserve explicit category off in the saved command.

Exact-source full CI, additive hosted migration/readback, rollback-only hosted fault-injection acceptance and matching application release must complete before marking the code fix qualified. Real device/OS receipt remains a separate open acceptance item: the own account currently has no registered active device. Do not call website push fully accepted based on mocked transport, SQL admission or a checked checkbox.

## Product Learning Sync checked

Fresh canonical protocol, index and checkpoint were read. Entries considered: `2026-09-01-app-owned-destructive-action-lifecycle.md`, `2026-11-16-complete-operational-reads-and-durable-capture.md`, `2026-07-29-build-source-immutability-and-lead-schema-contract.md` and `2026-11-17-fresh-registration-and-provider-admission.md`. Adopted only neutral current-source, recovery, preference and phase-specific evidence invariants; provider-specific registration/recovery implementation remains deferred. No private client implementation or data was copied. The existing canonical review proposal is updated with the targeted finding and acceptance boundary.


## Qualified correction — 2026-11-17 HKT

[PR #18](https://github.com/kieran97125/growthos-crm/pull/18) is merged as `349db0af132680afc1a133929ff293b5754a99e4`. Runtime source `9ca67ff0abf6e9834b652d9cbeed5862f8baf1c5` passed both [independent CRM CI 44032288000](https://github.com/kieran97125/growthos-crm/actions/runs/44032288000) and [original CRM CI 44032287923](https://github.com/kieran97125/growthos-crm/actions/runs/44032287923). Verification comprises 537 program/database tests, two Workflow tests, 235 browser tests, four first-paint tests and native PostgreSQL concurrency. Both initial failure cases now pass along with staff-response/recovery contention, current-question fallback, closure/pause/newer-message controls, explicit-off legacy saves, consent/device/quiet-hours gates and no redispatch.

Production build `dpl_2TiMY3tEMikXWxGnNXv3xavhw4Ut` was staged, reached READY and was promoted without rebuilding. Independent resolution of `app.convelta.io` returns that deployment with the exact runtime SHA. Login, public widget frame, themed loader and notification service worker return 200; the anonymous private notification API remains 401. The bounded initial deployment-scoped error/fatal log read found no records. This is a release observation, not a long-term reliability claim.

### Hosted schema receipt

The native migration service recorded `20261117063833_convelta_c_recovery_notification_defaults` for reviewed source file `20261117062518_convelta_c_recovery_notification_defaults.sql`. This explicit source/native history mapping preserves the exact tested source; unrelated historical mappings remain unchanged.

All six definitions match a fresh local replay of the reviewed migrations. Each remains security-invoker, empty search path, service-executable and unavailable to the browser authenticated role:

| Function | Definition MD5 |
| --- | --- |
| `public.sv_notification_read` | `41ba5d2d90c8f4f352d3b4d18929d1be` |
| `public.sv_notification_sync` | `4c14a486d70a7705c83e190474f53bb9` |
| `public.sv_push_claim` | `b1f100529cc15880f48981ec471c71e7` |
| `public.sv_web_chat_c_claim` | `82739a9bf4da2283a0f81b805ba244ff` |
| `smartvolt_private.effective_notification_preferences` | `252b4d8607735c85701cf934e76aec78` |
| `smartvolt_private.sv_notification_action_before_web_chat` | `e4a9b621608b9ff02a5c2e2b26b23f30` |

A hosted transaction provisioned only synthetic audit scope, admitted a historical interrupted C worker, performed a real staff-action RPC, recovered the old worker and asserted no reopened waiting/active alert. A fresh synthetic human request tested the missing website preference and exactly one push admission with a synthetic device. Global-off/no-device admission was refused. No AI model or push-network send ran. The transaction rolled back; independent final SQL confirms the synthetic company is absent.

The existing own-company raw-preference fingerprint remained `eaefdeed1466462d4b6e79a6c09eced1` before/after migration and rollback acceptance; global push remains off and active devices remain zero. No actual consent, subscription or customer conversation was changed.

Browser artifact `14305823935` was downloaded and verified as SHA-256 `5b1215296b88c8db20fb3a02515d7ee95aaa79b985f2519204f63f97b1db9cdc`; notification readiness layout was visually inspected. The component fixture records a category-off command but deliberately re-serves its original data; that screenshot is not persistent-save or live device-delivery evidence. Database regressions separately verify saved effective preferences.

### Acceptance remains bounded

Both reported code defects are qualified as corrected. The earlier broad handoff/notification acceptance is superseded by this targeted finding; parent cards `website-c-visitor-concierge` and `website-c-crm-notifications` remain in progress. New `website-c-device-push-acceptance` is blocked until an actual authorized device is subscribed and real provider/OS display, return navigation and revocation are verified. The branding/setup card remains complete. No real customer impact is established, and no real device delivery is claimed. CMS/MCP, visitor-context enrichment and waiting escalation remain planned.
