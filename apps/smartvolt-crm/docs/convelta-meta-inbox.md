# Convelta as its first live customer

The user intends to receive inquiries from Convelta's own advertising and reply from its private Convelta company workspace. This release implements the Messenger/Instagram transport and operator interface. Provider activation is a separate acceptance stage; an empty inbox or saved credential is not a connected-channel claim.

## Activation cards

| Card | Current state | Acceptance |
| --- | --- | --- |
| `meta-inbox-implementation` | Prepared for release | Signed webhooks, scoped private inbox, manual replies, internal notes, source evidence, pagination and unread horizon. Local type/lint/build and unit/database checks; browser controller acceptance in CI. |
| `meta-cloud-authentication` | Blocked at Facebook CAPTCHA | User completes the challenge in the same cloud browser; never share credentials in chat. |
| `meta-app-identity` | App ID configured; App Secret missing | Dedicated Convelta platform app, protected production secret and owner-visible readiness pass. Legal business verification is separate. |
| `meta-page-authorization` | Pending | Verify the actual Graph Page ID and a valid Page token from the intended app, then validate Page identity, scopes and expiry before encrypted storage. Public profile IDs are not assumed to be Graph asset IDs. |
| `meta-subscriptions` | Pending | Verify the callback challenge and subscribe the company Page to the relevant message, echo, referral and receipt events in Meta. Grant only the approved messaging scopes. |
| `meta-first-inquiry` | Pending | A real customer-originated inquiry appears in the correct company inbox with the actual platform message ID. Referral evidence is shown only when supplied by Meta. |
| `meta-first-reply` | Pending | Owner sends one authorized reply inside the real customer-service window. Verify platform acceptance and any available receipt; accepted does not mean delivered. |
| `instagram-brand-account` | Not created | User-owned brand registration, handle, required terms and professional account setup; link the correct Page and validate Instagram asset ownership. |
| `brand-social-profile` | Assets prepared | Apply the yellow avatar, Facebook cover and approved bios on the actual brand accounts, then verify the rendered result. |
| `ai-live-service` | Not activated | Approved provider/model, knowledge, action scope, human handoff and end-to-end verification before presenting any automatic reply as operational. |

## Boundary and behavior

The existing company membership, CRM product grant and strict mutation origin remain authoritative. The server never accepts a client-supplied recipient, company credential envelope or webhook account mapping. Provider peer IDs come from the verified connection and stored thread. Only an active company Owner can connect or disable an account; viewers cannot send or mark read.

Page credentials use AES-GCM with a separate HKDF purpose derived from the existing server master key. Tokens never enter workspace payloads or browser persistence. Raw events form immutable private evidence, HMAC verification covers the exact request bytes, and batches deduplicate before projection. Events cannot move between companies. Echoes, receipts and standalone referral events do not create or renew a customer-service reply window.

Sending first commits an idempotent, revision-checked claim, then makes one provider attempt and stores its outcome. Network uncertainty does not trigger a blind resend. The controller keeps a failed or uncertain draft and can reconcile the original UUID; the database prevents another unresolved dispatch. An event that arrives before the HTTP response can still advance the recorded receipt. Watermarks without an explicit message reference are retained as evidence and do not falsely mark individual messages delivered/read. Internal notes never call the provider.

The public website uses original abstract workflow artwork, not full CRM/POS screenshots. Public inquiry composition is browser-local and explicitly requires the visitor to send the result through the official Facebook Page; it is not a live lead submission endpoint. Product screenshots are absent from the current build. Existing app preview routes remain a separate public product surface.

## Validation

The automated suite covers signature/account boundaries, duplicate event ingestion, atomic claims and replay payload checks, membership/product restrictions, receipt ordering, immutable evidence, read horizons, expired windows and RLS grants. Browser-only fixtures exercise the real inbox controller on desktop/mobile, accessibility, accepted-versus-delivered states, draft recovery, same-UUID reconciliation, internal notes and honest unconfigured states. Fixtures contain no production identities, contacts, credentials or provider requests.

Product Learning Sync checked: canonical protocol, index and checkpoint were read, together with `entries/2026-07-16-alyssa-crm-operations-extraction.md`, `entries/2026-07-26-whatsapp-broadcast-operations-boundary.md`, `entries/2026-07-29-connector-readiness-and-identity-boundary.md` and `entries/2026-08-10-platform-app-identity-icon-contract.md`. Only neutral isolation, readiness/evidence and identity principles apply. Provider payload handling is a new Convelta implementation checked against primary Meta protocol references. No Alyssa runtime, client identity, data, prices or secrets were imported. Canonical checkpoint review remains in draft PR #88.

No dependency was added: the installed Next.js, Zod, Supabase client, Node cryptography, PGlite, Playwright and axe tooling cover the implementation and verification.

## Hosted migration and public hosting

The source migration was created with the Supabase CLI before the hosted apply operation. The hosted operation assigned authoritative version `20261112123549`; the existing SQL file is aligned to that version with its bytes unchanged. This keeps future migration history comparisons consistent.

The original website publication on ChatGPT Sites did not provide reliable access to all visitors: the user supplied a Cloudflare block page naming chatgpt.site. The same static bright-yellow build was moved to a dedicated Vercel project (`convelta-website`), production deployment `dpl_EpK258EUsjruyQMbgAtfB6Ve1SUT`. Apex and www now route to Vercel; www redirects to the canonical apex. Anonymous HTTPS checks return 200 and an x-vercel-id. The app subdomain and its existing security boundaries remain separate.
