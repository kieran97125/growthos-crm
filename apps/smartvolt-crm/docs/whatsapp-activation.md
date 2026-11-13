# SmartVolt WhatsApp activation and acceptance

Record updated 2026-11-12, Hong Kong time. SmartVolt is the first provisioned real company, with a confirmed real Auth identity as Owner and explicit CRM + POS access. Its customers, messages, POS records, AI flows, bots and articles are empty. The current source provides a dedicated-company WhatsApp transport and manual inbox; a live WhatsApp connection is not yet established. Personal login email and Auth/company UUIDs are excluded from this repository.

## Delivery and activation are separate

| Stage | Evidence required | Recorded state |
| --- | --- | --- |
| Source implementation | Reviewed transport, migration, API, setup and inbox changes at an exact commit | Released runtime `f59ef92bbd9c655c897315dfb0c9c263f944cbe0`, after transport commit `bf2af88`; source PR [#7](https://github.com/kieran97125/growthos-crm/pull/7) |
| Automated verification | Typecheck, lint, migration/protocol/server tests, build and browser presentation checks at that commit | [SmartVolt CI 43082211762](https://github.com/kieran97125/growthos-crm/actions/runs/43082211762) passed typecheck/lint, 151 unit tests, build and all 48 browser checks (13 WhatsApp). Desktop/mobile screenshots reviewed; A/AA assertions passed. [Original CRM 43082211696](https://github.com/kieran97125/growthos-crm/actions/runs/43082211696) succeeded separately |
| Hosted installation | Exact migration installed on the dedicated SmartVolt database; deployed commit and private endpoint checks | All five exact local migrations are installed on `dcnvuccvdvlpmpvkhuoc`, including `20261111182900_smartvolt_whatsapp_transport.sql`. Six WhatsApp tables have RLS and no browser SELECT or service TRUNCATE grants. Production `dpl_2wkMe5L6PYSA5CRCAsbi3dR1LW8w` is READY at https://smartvolt-crm.vercel.app, exact runtime `f59ef92bbd9c655c897315dfb0c9c263f944cbe0`. Login/previews 200; anonymous WhatsApp reads 401/private-no-store; cross-origin mutation 403; same-origin anonymous mutation 401; unknown webhook GET/POST 404. Twelve client assets plus login HTML contained no private-key/token patterns. Authenticated Owner/provider acceptance remains separate |
| Server credential storage | Production-only server secret and WhatsApp encryption key configured without revealing their values | Dedicated database secret and `SMARTVOLT_WHATSAPP_ENCRYPTION_KEY` are configured; no company provider credentials have been encrypted yet |
| Company Owner | Confirmed Auth identity, SmartVolt company membership, CRM purchase and successful private read/write | Real confirmed Auth identity and first SmartVolt Owner/company provisioned with CRM + POS. Owner login, refresh/revocation and authenticated private write/reload acceptance remain pending |
| Meta ownership | Correct business portfolio, app, account and phone ownership/administrative authority | App `1477331174353843` is created and linked to new SmartVolt portfolio `1878035743357766`; existing personal Meta administrator's full control was verified. WhatsApp + Cloud API terms were accepted and the overview confirmed. A Meta-provided test number exists, with no provider token or recipient selected and no send. No personal number was submitted or migrated. Production account/registered-phone onboarding remains pending |
| Meta publication | App published with the required policies, configuration and permissions for real production data | Pending. Current Meta UI explicitly limits unpublished apps to dashboard test webhooks and blocks real production data even for app-role users. Own-business operation without app review does not waive publication requirements |
| Configured connection | Owner saves company/brand-scoped credentials after a read-only phone inspection | Pending; phone inspection alone does not prove sending permissions, WABA subscription or inbound delivery |
| Verified webhook | Matching GET challenge and signed POST processing on the deployed callback | Pending; a verified challenge does not prove the WABA is subscribed or a real message was received |
| Real inbound | Signed provider event, matching configured WABA/phone, normalized conversation and durable message ID | Pending |
| Manual outbound | Authorized user deliberately sends a reply to that incoming conversation; one durable command and provider message ID | Pending; provider acceptance alone is not delivery |
| Delivery receipt | Matching signed `delivered` event; `read` recorded only when Meta supplies it | Pending |

No stage may be inferred from a later-looking UI label, a local fixture or a successful database connection. The older standalone checkpoint's “hosted activation deferred” describes that earlier release; the user's real-WhatsApp request now authorizes work toward activation without making unfinished stages complete.

Installed migration history matches these exact repository filenames:

- `20261111135121_smartvolt_standalone_tenants.sql`
- `20261111135805_smartvolt_independent_product_entitlements.sql`
- `20261111153934_smartvolt_pos_immutable_ledger.sql`
- `20261111153944_smartvolt_pos_ledger_read_model.sql`
- `20261111182900_smartvolt_whatsapp_transport.sql`

Historical deployment `dpl_9z5psRaNpdXxHpUTajqosjzw4Vjn` ran `9c0648a66d0f5bf359c9d25b8343b35ed6860a17` and proved enabled login plus anonymous 401/private-no-store behavior. It predates the current WhatsApp runtime and is not its release receipt.

## Implemented transport boundary

- The Owner configures a connection at `/company/:companyId/settings/whatsapp`. Active membership, CRM purchase, company and brand ownership are rechecked on the server; setup requires the Owner role. The database repeats authorization for commands.
- App Secret and Access Token use AES-256-GCM encryption with company/connection authenticated scope. The server-held 32-byte base64 master key is separate from the database secret. Saved credentials and raw provider envelopes are not returned to the inbox. The generated verify token is shown once; only its hash is stored.
- The public callback is `/api/webhooks/whatsapp/:connectionId`. Verification checks the challenge token; POST processing authenticates the original bytes, then validates configured account and phone scope. Raw evidence is private and append-only. Duplicate provider events are deduplicated transactionally.
- Live contacts, conversations, messages, commands and provider events use six normalized, tenant-scoped tables. They do not consume the bounded demo/workspace message array. Browser roles have no raw table/RPC access; RLS and composite company keys remain enforced.
- `/company/:companyId/crm/whatsapp` provides paginated inbox/message reads, manual text replies, quotes, read horizons, resolve and reopen. It displays internal notes; the scoped command API supports note creation, while a dedicated note composer remains part of the operations card. Phone and BSUID identities remain distinct; a missing phone is not replaced with a fabricated one. Unsupported media is shown as a type placeholder without claiming the attachment was downloaded or understood.
- A new outgoing reply requires an active connection, verified webhook and a genuine incoming provider timestamp within the 24-hour service window. The SQL claim stores actor, revision and idempotency evidence before one network attempt. A repeated command reads its recorded outcome. An ambiguous timeout/response remains uncertain and is not automatically sent again; a later signed status can reconcile it.
- `accepted`, `sent`, `delivered`, `read` and `failed` remain separate. Older receipt order cannot reverse stronger delivery evidence. An internal note is local company activity, not a WhatsApp delivery receipt. A customer inquiry does not create marketing consent.

The current callback handles one dedicated Meta App and one phone. `sv_wa_connections_app_identity` prevents another connection from reusing that App. It is not an app-scoped multi-phone dispatcher or a general self-service onboarding service.

## First real-company acceptance

1. Use the already confirmed real SmartVolt Owner and provisioned CRM + POS company. Do not recreate them or insert fictional employees/customers to satisfy acceptance. Exercise login, refresh, signout/revocation, recovery and an authorized private company write/reload. Provisioning and server configuration do not establish those session checks.
2. Use the verified dedicated SmartVolt app/portfolio and existing personal administrator. Confirm the intended registered business number; choose the appropriate existing-number migration/coexistence or new-number onboarding flow before any reassignment. App/portfolio creation and accepted terms do not establish account or phone registration. Do not reuse another product's App/account/number, tokens or legal identity.
3. Complete Meta's publish checklist, including the required policy URLs/disclosures and any business or permission verification Meta requests for this use case. Publish the app and verify its actual state before testing real production messages. The current unpublished-app warning applies even to app-role users; an exemption from app review for one's own business is not an exemption from publication. Dashboard test webhooks prove only test handling.
4. Establish the dedicated messaging account and registered phone with the required asset permissions. Verify the actual token's scopes, asset assignments, expiry and app/business requirements for the intended operation. Subscribe the app's `messages` webhook field and the relevant account's `subscribed_apps` relationship. These are operator activation steps; the current setup form does not perform them.
5. Confirm the exact reviewed migration is installed, the browser gate passes and the intended app commit is deployed on the canonical HTTPS origin. Record the new deployment ID and endpoint checks. Verify the production WhatsApp encryption setting. The Owner then enters the dedicated provider credentials in the protected setup form. Keep secrets out of chat, source control, screenshots and acceptance receipts. Saving performs only a read-only provider phone inspection before storing encrypted credentials.
6. Copy the callback URL and one-time verify token into the dedicated app's webhook configuration. Confirm the GET challenge, then confirm account subscription independently. Configuration or credential changes reset readiness. Do not change an existing connection's company/account/phone identity once it has conversations; create a separately scoped connection when required.
7. From a separately controlled real WhatsApp account, send an agreed customer-style inquiry to the selected business number. Verify the matching signed inbound event and the same conversation after reload. This is the first evidence of real inbound transport; synthetic preview fixtures and dashboard test events are not accepted for this stage.
8. The signed-in Owner/authorized agent opens that incoming conversation and deliberately sends an agreed manual reply inside the service window. Record one local command ID, its provider message ID and the resulting signed delivery status. Use only the agreed recipient for acceptance. A connection check must never send an unsolicited message to a customer.
9. Record provider acceptance and `delivered` independently. Record `read` only if supplied. If the response is uncertain, preserve the command and reconcile receipts; do not create a new send merely to obtain a green status. Verify another company/viewer cannot mutate or read this company's private content. Complete operational recovery/monitoring work before treating the connection as a broad company rollout.

## Unfinished system cards

The WhatsApp migration seeds the following cards for existing companies and through an `sv_companies` insert trigger for future companies. The first real SmartVolt company is now provisioned; its unfinished cards remain open until acceptance evidence closes their actual scope.

| Card | Initial status | Completion evidence |
| --- | --- | --- |
| `wa-live-acceptance` | `blocked` | Owner/company and app/portfolio are established; app publication/policies, registered number, app/account subscriptions, hosted Owner acceptance, real inbound, deliberate manual reply and signed `delivered` receipt remain required |
| `wa-app-routing` | `planned` | App-scoped webhook dispatch for multiple phones/companies plus Embedded Signup and authorization/revocation acceptance; preserve tenant and asset scope |
| `wa-media` | `planned` | Protected provider media retrieval, previews, retention and attachment replies; no placeholder presented as attachment content |
| `wa-customer-bridge` | `planned` | Explicit identity link to the independent shared customer/POS directory and journey; no merge by display name and no claimed automatic sync today |
| `wa-templates` | `planned` | Approved-template synchronization and outside-window replies; separately designed opt-in/suppression, broadcast and bulk-send acceptance |
| `wa-operations` | `planned` | Owner disconnect, credential rotation/recovery, retention policy, monitoring, actionable alerts and a dedicated internal-note composer; complete operator lifecycle |

The existing `meta-channel` card remains broader than this WhatsApp slice: Instagram and Messenger remain unfinished. `ai-activation` remains blocked until company usage/cost controls, actual model credentials, brand knowledge and reply behavior are verified. `staff-invitations`, `shared-customer-directory`, `domain-projections` and billing cards retain their separate scope. WhatsApp relational pagination does not complete every CRM/POS projection, nor does a WhatsApp contact automatically become the shared POS customer.

## Evidence receipt

Keep one bounded acceptance record containing the source commit/PR and check-run links, database migration, deployment ID/URL, HKT timestamps, verified company/actor scope, opaque local connection/conversation/command IDs and provider message/status IDs. Record missing or failed stages explicitly. Do not include access tokens, app secret, verify token, raw customer payloads or unrelated customer phone numbers. Screenshots are supporting evidence; the persisted command/event and provider receipt establish execution. A cancelled session or partial log is not completed acceptance.

Protocol/database/server tests use isolated fixtures and fake fetches. Browser presentation tests inspect isolated layout, accessibility, disabled actions and receipt wording. Controller tests bundle the actual client components in memory with intercepted APIs, checking durable send intent, ambiguous response recovery and stale selection. They introduce no production route or Auth exception. These checks do not authenticate a hosted Owner or send a real message. Actual hosted acceptance is the separate sequence above.

The unpublished [privacy policy draft](privacy-policy-draft.md) records the public-contact, operator, retention/deletion and processor-disclosure decisions required before a public policy URL. It is not an approved legal policy or permission to publish the Meta app.

## Product Learning Sync checked

The canonical protocol, index and checkpoint in `kieran97125/leadhub-source-os` were read. Relevant considered entries under `docs/product-learning/entries/`:

- `2026-07-16-alyssa-crm-operations-extraction.md`
- `2026-07-17-alyssa-crm-regression-acceptance.md`
- `2026-07-26-whatsapp-broadcast-operations-boundary.md`
- `2026-07-29-connector-readiness-and-identity-boundary.md`
- `2026-07-31-master-owned-member-invitation-lifecycle.md`
- `2026-08-03-operational-write-integrity.md`
- `2026-08-05-production-auth-callback-email-contract.md`
- `2026-08-11-hosted-auth-template-sync.md`
- `2026-09-01-app-owned-destructive-action-lifecycle.md`
- `2026-10-22-bounded-provider-qa-and-checkpointed-receipts.md`

Adopted into this source implementation: neutral company/brand isolation, protected provider credentials, server-rechecked identity, distinct readiness stages, atomic/idempotent commands, private immutable provider evidence, safe receipt wording and bounded acceptance receipts. Auth/invitation/hosted-template and destructive-action lifecycle entries were reviewed for the remaining session acceptance and operator lifecycle. The broadcast entry informs future template/marketing execution; it does not convert a customer-initiated manual service reply into a marketing broadcast. No Alyssa/IB/KiesTECH client identity, data, credentials, production configuration or workflow hardcoding is imported. The standalone company architecture remains the current user direction.

## Canonical checkpoint review — pending

Target: [`docs/product-learning/GROWTH_OS_SYNC_CHECKPOINT.md`](https://github.com/kieran97125/leadhub-source-os/blob/main/docs/product-learning/GROWTH_OS_SYNC_CHECKPOINT.md). Repository `AGENTS.md` requires a **reviewed change** in that canonical repository. Draft canonical [PR #87](https://github.com/kieran97125/leadhub-source-os/pull/87) is separate from source [PR #7](https://github.com/kieran97125/growthos-crm/pull/7); it is not recorded as merged here. Its final evidence update must include the exact tested runtime commit, CI results and verified new production deployment while preserving all pending provider-activation stages. The earlier standalone/CRM/POS decisions remain historical evidence. A chat summary or draft PR is not a completed canonical checkpoint review.

For later acceptance, append or update the relevant row through another reviewed canonical change with the exact operational evidence and remaining deferred scope. Do not retroactively claim this source-delivery record proves the provider was connected.
