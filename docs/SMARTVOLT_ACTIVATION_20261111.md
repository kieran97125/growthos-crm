# SmartVolt functionality and dedicated database activation

User direction: complete application functionality and Supabase preparation before marketing website or pricing work.

## Hosted state verified

Dedicated project `smartvolt-crm-pos`, ref `dcnvuccvdvlpmpvkhuoc`, Singapore, organization `uottulobzmlxijkrskgj` created successfully. Seven initial SmartVolt tables exist, all with RLS. Browser roles have no raw operational privileges. `sv_commit_workspace` includes POS commands, company scope validation and private purchased-product enforcement. No companies, users or fabricated customer records were provisioned.

The intermediate POS migration confirmation expired. The later independent-product migration installed the final, superseding commit/provision functions, including POS cards for future companies. Verified function flags `pos_supported`, `purchase_enforced` and `scope_guard` are true. The intermediate standalone migration is not recorded as applied. Do not run an earlier migration after a later function version without reconciling the final definitions.

The new `smartvolt_member_lifecycle` migration is NOT installed: the request was interrupted and a subsequent table inventory confirmed `sv_member_events` does not exist. Apply only after confirming current migration history and target project.

## Implementation in this change

- Owner-only role/status/name changes for existing members, protected owner identity, seat checks, stale revision rejection and atomic team-scope updates.
- Append-only member change audit, workspace recovery snapshot and command idempotency. No browser grants or product-purchase changes.
- Password setting for authenticated identities, explicit recovery/invitation token-hash callback, canonical origin validation, no caller-selected redirect and no token logging.
- Invalid/expired-link and password-updated login states. Auth identity confirmation does not automatically grant or activate company membership.

No invitation or recovery email was sent. First owner creation, initial team invitation/acceptance UI, SMTP/template setup and hosted auth lifecycle verification remain pending. Global signout requests refresh-session revocation; already issued access JWTs have their normal expiry, so do not claim immediate universal token revocation.

## Activation blocker

Automatic approval review rejected copying the dedicated Supabase backend secret into the SmartVolt Vercel production environment because explicit approval for that sensitive credential and destination is required. No workaround or alternate transmission was attempted. Treat all four proposed environment-variable writes as unconfirmed; inspect before applying. No secret appears in this repository.

Request approval specifically for storing the SmartVolt-only Supabase backend key as the encrypted/sensitive server-only `SMARTVOLT_SUPABASE_SECRET_KEY` on Vercel project `smartvolt-crm`. It must never be prefixed `NEXT_PUBLIC_` or sent to a browser.

## Remaining system cards

| Card                        | Status      | Completion evidence                                                                                                           |
| --------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| dedicated-auth-activation   | Blocked     | Approved server configuration, dedicated owner creation, real login/refresh/signout, two-company isolation                    |
| staff-lifecycle             | In progress | New owner controls implemented; hosted migration, invitation state machine, seat and cross-company browser acceptance pending |
| auth-recovery               | In progress | Callback/password code implemented; canonical hosted Auth URL, templates, SMTP and real recipient acceptance pending          |
| normalized-directory-ledger | Planned     | Shared customer directory, immutable relational orders/payment/refund/redemption ledger, pagination and backup/restore        |
| meta-channel                | Blocked     | Company-specific WhatsApp assets/credentials, signed webhook, live send/inbound/status and template approval                  |
| ai-activation               | Blocked     | Company usage quotas, model activation, server-owned company/brand knowledge and live grounding evaluations                   |
| durable-jobs                | Planned     | Reminder scheduler/outbox, dedupe/retry/cancellation and provider receipt reconciliation                                      |
| pos-classes                 | Planned     | Capacity, recurring classes, waitlist and memberships                                                                         |
| pos-retail-stock            | Planned     | Stock movements, purchases and cost tracking                                                                                  |
| pos-acquisition             | Planned     | Source → booking → attendance → purchase/refund → repeat journey                                                              |
| subscription-payments       | Deferred    | Pricing and provider setup after functionality; verified webhooks, renewal and grace rules                                    |

Do not represent the seven-table foundation or browser-only preview as a customer-ready SaaS. Other product databases and deployments are unchanged.

## Product Learning Sync checked

Canonical protocol, index and checkpoint were read before implementation. Considered `2026-07-31-master-owned-member-invitation-lifecycle` and `2026-08-05-production-auth-callback-email-contract`. Reuse only neutral owner-protection, transactional membership, canonical-origin and explicit OTP patterns. Provider submission is distinct from receipt/acceptance. No new Core classification or canonical adoption is claimed; checkpoint review proposal accompanies this work.
