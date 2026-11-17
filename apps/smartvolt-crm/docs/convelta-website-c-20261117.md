# Website C: customer branding, public knowledge and human collaboration

Customers configure a separate C assistant for each company, brand and website in the existing CRM. Twelve palettes, an exact custom hex color, contrast-aware foregrounds and a desktop/mobile preview give every brand a consistent visitor experience. One combined Head snippet includes installation and ownership proof; one action checks unverified origins and activates the widget. Advanced DNS verification remains available. Existing embed snippets bootstrap the saved theme too.

The company owner explicitly selects approved, current, same-brand knowledge that may be disclosed publicly. Managers can change the appearance without changing public AI authorization. No internal knowledge, customer memory or learned communication patterns are included automatically. The existing AI SDK, evidence/price/link validation, model gateway and daily company budget are reused; no new dependency or additional paid service is required.

Human assignment, visitor preference, staff pause and the outstanding human response are independent state. A human request creates a durable waiting state and acknowledgement; C may answer later questions while that request stays open. Only-human preference persists until the visitor resumes C. A staff reply or newer context invalidates an in-flight C answer. C messages identify the AI explicitly. Claim and publication are replay-safe, with one durable model admission. Unknown provider results are never automatically redispatched.

CRM displays the visitor's stated enquiry, summary, outstanding question, wait duration, assignee and C status. New enquiries and human requests appear in scoped CRM notifications linked to the original conversation. Burst messages share one attention episode. Only a real staff reply or closing the conversation resolves that work; dismissing a notification cannot silently clear the visitor's request. Existing device push remains opt-in and respects quiet hours.

## Validation and release

Production baseline: `1dc6e13ac2f160c7611cdecf978ba639b35cd7d1`; latest upstream documentation `e9e7bcc6655fa8f424e3fc49446be960a30e921b` is preserved. Migration: `20261117053327_convelta_website_concierge.sql`.

Local checks: 521 existing/unit/database checks passed before the final focused additions; 18 focused C policy, appearance, database and embed checks pass. TypeScript, lint, workflow and exact-source hosted CI are required before release. Local Chromium could not start because the execution environment disallows its socket operation; this is an environment failure, not a successful browser test. Hosted browser tests cover actual settings components, 12 palettes/custom colors, contrast, combined installation, mobile accessibility, C/human collaboration and reload-safe visitor retry. Native PostgreSQL adds competing capture/claim/publication and shared company quota checks.

Deployment acceptance is still pending at the time of this implementation record. Publish the reviewed source, complete hosted CI, install the additive schema, stage the production build, verify it and promote that exact deployment. Commission only the company's explicitly selected public knowledge. Preserve existing AI budget, channel permissions, customer records and product entitlements.

## Product Learning Sync checked

Fresh canonical protocol, index and checkpoint were read in `kieran97125/leadhub-source-os`. Relevant entries considered:

- `docs/product-learning/entries/2026-09-01-app-owned-destructive-action-lifecycle.md`: source-owned notification lifecycle and dispatch-time revalidation.
- `docs/product-learning/entries/2026-11-16-complete-operational-reads-and-durable-capture.md`: atomic accepted message plus durable work intent, scoped complete reads and unknown-result reconciliation.
- `docs/product-learning/entries/2026-07-29-build-source-immutability-and-lead-schema-contract.md`: exact reviewed source, persistence contract and controlled post-deploy acceptance.
- `docs/product-learning/entries/2026-07-16-alyssa-crm-operations-extraction.md`: explicit ownership, context and compact operational UI.

Only general engineering invariants were applied. No private source implementation, client data or client-specific configuration was imported. The canonical checkpoint requires a corresponding reviewed update.

## Product boundary

This ships the existing Convelta website assistant and customer configuration. The separate SmartVolt AI website-management/CMS product, visual editor and MCP integrations remain a retained product idea; this change does not claim those products are built. Remaining source-page/UTM enrichment and scheduled escalation rules require their own tracked acceptance and must not be presented as delivered by this release.

## Qualified first release and final appearance review

Runtime `3d889f28949968833ae6ec5c9d733ebc91a0e780` passed full [CI run 44024472823](https://github.com/kieran97125/growthos-crm/actions/runs/44024472823) and the original CRM workflow. The run records 528 unit/database, two Workflow and four first-paint checks; all browser partitions and native PostgreSQL pass. Staged production deployment `dpl_9BaikzYiAdCuLsHdMvKRXweJqiv6` was fetched successfully before promotion, then independently resolved from `app.convelta.io`. All 24 hosted function fingerprints match the reviewed source. Rollback-only hosted functional acceptance passed and left no synthetic company.

The own site's C is enabled with five explicitly selected public articles, its blue brand color and the unchanged company AI limit of 30/day. Two real, source-grounded model answers were observed in the public widget, including one after human ownership; the human request and its CRM notification remained open. Human-only preference survived a real reload, and visitor-requested C resumption was exercised. Synthetic acceptance conversations are closed through the normal lifecycle and retained as audit records.

Artifact `14302069447` was downloaded and verified against SHA-256 `b08ea9a6ee09c0d535fc5e524a237f2c8e24073e0d318229c19f86a2ed1cf072`. Visual review found that the standalone mobile settings fixture should own its box sizing and keep the knowledge checkbox inline. The final appearance adjustment scopes those styles, shortens the mobile heading and adds a real card-boundary assertion. The migration filename is reconciled to the native hosted version `20261117053327`; its SQL bytes are unchanged. Final adjustment CI/release is recorded below when qualified.
