# Brand reply trials and response rules

Kieran requested two App improvements: realistic trial questions with answer/source/handoff explanations, and clearer brand tone, permitted scope and handoff conditions. Tracked in issue #21.

The existing company AI workroom now offers six editable scenarios. Choosing a scenario fills the question without any model dispatch. A generated trial keeps the proposed answer beside checked source quotations and specific, server-derived human-review reasons. Existing receipts without the new optional review field remain readable. Changing the question hides the previous answer; an unresolved request retains the original UUID and locks scenario and brand changes. A trial never creates a customer message or real handoff.

The brand settings page presents three sections: tone with explicitly illustrative samples, permitted knowledge topics, and mandatory handoff boundaries with trial shortcuts. Existing mode/hour controls remain available under an optional disclosure, with their actual design-versus-live scope stated. No new optional safety switch is introduced. The same saved profile, source retrieval, model budget and server-side validation remain authoritative.

The real-company sidebar uses the same AIDraft component as the workroom, and waits for successful workspace persistence before enabling a trial. The decorative save-success button is removed; displayed save state comes from the company store. Owner/manager configuration permission, independent brand policy, stale-revision/idempotent save behavior and company/product authorization remain unchanged. Rules links preserve the selected brand and open the settings tab directly.

## Tooling and data boundary

Installed React/Next, Lucide, Zod, AI SDK, Supabase, Playwright/axe and existing owned CSS are sufficient. No package, schema migration, provider connection, AI plan, background worker or new permission is required. Relevant installed Next.js client-component and form documentation was read before implementation. No production workspace or external channel is rewritten by deployment.

## Verification

Meaningful coverage adds saved scope to generated handoff explanations, six-scenario selection without dispatch, hiding an old answer, explicit trial-only human review, actual settings-component save/reload, failed-response same-command reconciliation and read-only agent controls. Desktop/mobile checks cover accessibility, containment and runtime errors. Existing full unit/database, Workflow, browser, production-build and native PostgreSQL gates remain required.

Local browser qualification is unavailable because the matching Playwright Chromium executable is not installed. This is an environment failure, not a passed browser check. Use the existing GitHub-hosted browser selection and complete CI before release. Final receipts belong on the source PR and issue #21.

## Product Learning Sync checked

Fresh canonical protocol, full index and main checkpoint were checked in kieran97125/leadhub-source-os. Considered entries `2026-10-06-optional-operator-settings.md`, `2026-10-06-report-description-density.md` and `2026-11-17-customer-platform-authority-separation.md`. Adopt only neutral progressive disclosure, visible critical failures and authority-preserving configuration principles. No pilot code, data, identity, domain, credential, prices or customer-specific rules are imported. The existing canonical draft review proposal #88 records this consumption; canonical main is not represented as merged.
