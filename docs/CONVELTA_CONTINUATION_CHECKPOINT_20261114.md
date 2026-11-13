# Convelta continuation checkpoint — 2026-11-14 HKT

This checkpoint resumes the existing “Convelta功能更新” and “Convelta功能更新 2” work. It records verified delivered behavior and the remaining company system cards without restarting accepted implementation.

## Accepted production

- Application: https://app.convelta.io
- Repository: `kieran97125/growthos-crm`
- Working branch: `feat/smartvolt-standalone-saas-20261111`
- Accepted runtime: `27637de71970b05ae5b8deb4c976406ca77f1370`
- Production deployment: `dpl_DW5JaRc77T3Rns9WDLkjpWAd5K9E`, READY; exact runtime and production alias independently read back.
- [Exact-source CI](https://github.com/kieran97125/growthos-crm/actions/runs/43468628232), [PR CI](https://github.com/kieran97125/growthos-crm/actions/runs/43468639434) and [original CRM regression](https://github.com/kieran97125/growthos-crm/actions/runs/43468639905) succeed.
- The verification logs record 243 unit/database checks, 90 browser checks, four production initial-paint/refresh checks, and three focused operations checks. The focused checks are repeated within the full browser suite, not counted as an additional 93 unique browser tests.
- Native PostgreSQL independently verifies busy-row skipping, queue catch-up, concurrent capacity admission, command replay and round-robin fairness.

The PR browser artifact `14059838275` was downloaded and independently verified against its SHA-256 `93f7bcb9c79a1ef42ef863f5d1a674d042b5e1f34504b4c5e88f9cbe63062a51`. Its six desktop/mobile pipeline, team and automation screenshots were inspected. They show the complete save action clear of C and preserve the mobile navigation.

The public login returns 200. Its ten linked stylesheets return 200; the delivered operations rule contains `.co-config-footer` with `padding-inline-end:80px`. The test-only operations fixture returns 404. The deployment-scoped initial error/fatal log scan returns no matching logs. Earlier production boundary checks are recorded in the preceding release evidence; this continuation does not relabel them as fresh authenticated checks.

An additional request to reread the private operations and follow-up APIs through Vercel's temporary-share fetch tool was rejected by automatic approval review because the share mechanism could expose private operational data. No bypass was attempted. Source authorization, accepted hosted tests, deployment metadata and public static-resource checks support the bounded release verification. No new authenticated Owner write, model request, provider conversation, booking or financial transaction is claimed here.

## Delivered behavior

| Area | Accepted behavior | Company card |
| --- | --- | --- |
| C placement and interface | Mouse/touch dragging, remembered placement, separated click/drag, following panel, cross-page drafts, concise blue/white work surfaces | `c-draggable-placement`, `convelta-interface-polish` complete |
| Customer lifecycle | Configurable stage names/tones, brand-owned state, required reasons, revision checks and immutable history | `crm-lifecycle` complete |
| Team routing | Online expiry, pause, capacity, brand/channel/tag/team rules, least-open/round-robin allocation and truthful waiting queue | `capacity-aware-routing` complete |
| Follow-up work | Named ownership, HKT due dates, completion/snooze, stage-triggered work, closure cancellation and durable replay | `inquiry-followup-work` complete |
| AI handoff | Explicit staff adoption of saved, source-current qualification with immutable evidence; staff choose any stage change | `ai-inquiry-handoff` complete |
| C/button clearance | Desktop/mobile default launcher does not overlap the actual routing Save action | `operations-launcher-clearance` complete |

System-card states were independently reread. The broad `conversation-operations` card remains in progress because its later external capabilities are unfinished. Company routing and stage-triggered follow-ups remain owner-configured; release verification does not enable these rules for the company.

Inquiry, booking, attendance and actual POS receipt/refund metrics retain their own event authority. An AI interest judgment or manually selected lifecycle label never establishes a confirmed booking, attendance or payment.

## Remaining work and resumption order

| Work | Existing system card | Dependency / acceptance |
| --- | --- | --- |
| C answer quality and bounded repair | `copilot-answer-quality` | Evaluation cases, category-only diagnostics, retained known usage and one bounded repair without relaxing evidence/price/URL/permission checks |
| Actual company inquiry-to-POS acceptance | `inquiry-production-acceptance`, `meta-live-acceptance`, `wa-live-acceptance` | Company-owned provider authorization and actual services/resources; real inbound, staff-approved reply and event readback |
| Offline observations and notifications | `copilot-background-observations`, `inbox-followup-notifications` | Durable jobs, preferences, delivery history, cancellation and provider/channel acceptance |
| Governed retention journeys | `round-two-journeys`, `customer-messaging-automation` | Consent/suppression, approved templates, recipient snapshots, replay-safe execution and actual provider receipts |
| Shifts, leave and skills | `inquiry-shift-routing` | Configured schedules, eligibility and workload admission beyond the delivered online/capacity rules |
| Advertising attribution and Meta feedback | `inbox-conversion-insights`, `meta-conversions-feedback` | Source-owned event IDs, costs, authorized destination and actual Meta acceptance |
| Calling | `unified-business-calling` | Authorized phone/provider capability and real inbound/outbound handover |
| Website sales handoff | `website-sales-app-handoff` | Private company sales scope and stable submission/source IDs, kept separate from tenant customer data |

These are existing cards, not claims that the corresponding capabilities are already operational. All implementation continues in the existing Convelta app and dedicated company boundary. CRM and POS remain separately purchased products.

## Product Learning Sync checked

The canonical private protocol, index, main checkpoint and existing draft review proposal #88 were read. Entries considered:

- `2026-07-16-crm-priority-a-operations.md`
- `2026-07-16-alyssa-crm-operations-extraction.md`
- `2026-07-17-alyssa-crm-regression-acceptance.md`
- `2026-07-26-whatsapp-broadcast-operations-boundary.md`
- `2026-08-10-permission-aware-aggregate-brand-scope.md`
- `2026-09-01-app-owned-destructive-action-lifecycle.md`
- `2026-10-06-report-description-density.md`
- `2026-10-06-source-owned-booking-dimensions.md`
- `2026-10-15-brand-owned-financial-dashboards.md`
- `2026-11-12-configured-pending-time-registration.md`
- `2026-11-13-reviewed-appointment-owner-consolidation.md`

Retain neutral ownership, explicit confirmation, complete scoped aggregates, event-owned outcomes, typed time fields and accepted release evidence. Client-specific source repair, financial formulas and heuristic merging are not imported. No client runtime, identity, records, prices, domains, credentials or implementation crosses into Convelta. The canonical consumption update remains a reviewed proposal, not a merged checkpoint.
