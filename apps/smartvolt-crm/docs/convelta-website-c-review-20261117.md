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
