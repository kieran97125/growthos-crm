# Website C: automatic public knowledge and saving

The owner reported 35 checked articles against an undisclosed 30-item API/database limit, followed by a generic validation error. Two regressions reproduce the failure on the released schema. The model worker separately parsed at most 30 articles, so increasing only the form limit would still fail at answer time.

New widgets use automatic brand-public knowledge. The setup page shows the available count and a collapsed read-only list, with no article checkbox task. Existing curated widgets keep their explicit grants; an owner can adopt automatic synchronization in one action. The current Convelta widget will adopt that mode under the owner's request after qualification. API, database and worker now agree with the existing studio capacity of 100 articles. Retrieval still selects at most 12 relevant articles and 16,000 content characters; the company AI budget is unchanged.

Automatic knowledge includes current, approved, same-company/same-brand website-import FAQ and explicitly public manual articles. Existing explicit grants remain available. Internal overrides, drafts, expired records, other tenants/brands and coaching patterns are excluded. The FAQ editor has a public/internal scope control; existing unspecified scope is preserved, and new manual records start internal. Website-import provenance supplies the existing public-source authority. No internal article is made public solely because it was approved for staff use.

Adding or editing eligible knowledge updates C without configuring each widget again. Setting an article internal or revoking approval removes it; the context hash also rejects an answer admitted under superseded publication. Only an owner can change the widget's public-knowledge policy. Existing role, brand, replay, source validation and domain verification contracts remain.

The additive migration is `20261117065652_convelta_c_automatic_public_knowledge.sql`. It preserves legacy widget mode and explicit IDs. No global backfill of public visibility, device opt-in, subscription, customer conversation or private provider configuration is performed. Existing owned React/SWR, Zod, retrieval, PostgreSQL and Playwright/PGlite tooling are sufficient; no dependency is added.

Verification covers the reported 35-item command and persistence, automatic inclusion beyond article 30, source/company/brand/privacy/approval/expiry controls, current edits, publication revocation, owner-only policy changes, replay, prompt budgeting and actual setup-component save/reload without article checkboxes. Native PostgreSQL verifies a 35-article admission and rejects an answer after a public source is withdrawn. Exact-source CI, hosted fingerprint/rollback acceptance and release receipts are recorded after qualification.

The separate website C handoff and notification defects were corrected in PR #18. Parent acceptance remains open; real device/provider/OS delivery still requires an authorized registered device. This knowledge setup change does not close that item or establish customer impact.

## Product Learning Sync checked

Fresh canonical protocol, index and checkpoint were checked. Considered `2026-10-06-optional-operator-settings.md`, `2026-09-01-app-owned-destructive-action-lifecycle.md`, `2026-11-16-complete-operational-reads-and-durable-capture.md`, `2026-07-29-build-source-immutability-and-lead-schema-contract.md` and `2026-11-17-fresh-registration-and-provider-admission.md`. Only neutral progressive-disclosure, current-publication, preserved authority and bounded-evidence invariants are adopted. Private provider/capture implementation and client data remain outside this project. The existing canonical draft review proposal records the consumed learning; canonical main is not represented as merged.


## Qualified release — 2026-11-17 HKT

[PR #19](https://github.com/kieran97125/growthos-crm/pull/19) merged as `4a6561faee408a5930491125f0ecab3b5ee60a50`. Exact runtime `467b7ef30f63c4ac6c85ff3b9886e1634b2ddb57` passes [CI 44036067665](https://github.com/kieran97125/growthos-crm/actions/runs/44036067665) and [original CRM CI 44036067662](https://github.com/kieran97125/growthos-crm/actions/runs/44036067662): 542 program/database, two Workflow, 237 browser and four first-paint tests, plus native PostgreSQL. The actual setup component's 35-article save/reload and legacy opt-in pass; desktop/mobile FAQ scope edits persist. These are controlled fixtures, not an authenticated owner-browser session.

Browser artifact `14308220498` matches SHA-256 `286b3e4f350392ca304d6d0833007f7b860130eae1a9b65ac9dcf9a5fc024dee`. Its JSON confirms both new setup cases and both desktop/mobile FAQ publication cases are expected successes. The 35-article setup and mobile screenshots were visually inspected: count/automatic-sync summary, collapsed list, no article checklist, contained controls and readable preview.

Native hosted migration version `20261117070908_convelta_c_automatic_public_knowledge` maps to exact reviewed source `20261117065652_convelta_c_automatic_public_knowledge.sql`; source is not renamed after qualification. All five definitions match the local full replay. Each is security-invoker with empty search path, service-executable and unavailable to anon/authenticated browser roles:

| Function | Definition MD5 |
| --- | --- |
| `public.sv_web_chat_configure` | `a980a16f432dec015dc72d46b02c2e56` |
| `public.sv_web_chat_settings` | `4ff9c06d13ab060d9fc4b0f21c6fe65c` |
| `smartvolt_private.web_chat_article_public` | `705a723311c99981e5fec020739c4c41` |
| `smartvolt_private.web_chat_c_context_hash` | `8806d80e3364850c5fbde0b166cb2fd3` |
| `smartvolt_private.web_chat_public_articles` | `f4d027cb40d3bb01c9f58f031a66ef46` |

Hosted rollback-only acceptance passes 35-ID persistence, automatic admission, private/draft/expiry/foreign-brand exclusion, immutable configuration replay and publication withdrawal. No actual model or network send ran; the synthetic company is absent after rollback.

Staged build `dpl_2dfCkKYUEkLhV4R8eaK17Fygxqer` reached READY and was promoted without rebuilding. Independent `app.convelta.io` resolution confirms that exact runtime SHA. Public login, frame and themed loader return 200; anonymous private settings API remains 401. The bounded initial deployment-scoped error/fatal read found no records; this is not a long-term error-free claim.

### Current Convelta setting

After qualification, the owner's requested automatic synchronization was saved through the existing owner configuration RPC, with revision/advisory locking and an immutable command receipt. The six legacy manual public product FAQ were individually inspected for scope/content and granted alongside existing explicit IDs; website-import FAQ join automatically. This is an authorized own-company configuration operation, not a global visibility backfill. Revision is now 7, mode `brand_public`, with 36 currently available public articles. A before/after hash inside the transaction verifies the remaining widget attributes are identical, including the current color, origins, greeting and enablement.

Workspace payload hash remains `f116221a302010ec5661d538e6501629`; raw notification preferences remain `eaefdeed1466462d4b6e79a6c09eced1`. No knowledge content, actual customer conversation or push consent was rewritten. Overall push is still off and registered active devices remain zero. The focused knowledge-setup card is complete; handoff/notification parent acceptance and real device delivery retain their previous open/blocked boundaries.
