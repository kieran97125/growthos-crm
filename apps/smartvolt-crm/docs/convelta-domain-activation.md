# Convelta domain activation

Verified 2026-11-12, Hong Kong time. The user has authorized the Convelta website and `convelta.io`. This record distinguishes the hosting setup from registration and production activation. The initial verification found no purchase or DNS zone; the subsequent user-completed checkout and configuration changes are recorded below.

The user subsequently asked the agent to choose the registrar and open checkout for the user to pay. **Vercel was selected.** The existing signed-in Vercel dashboard's Buy dialog returned `convelta.io` at USD 14.99 for the first year and USD 46/year renewal; selecting it opened Billing Information with the user's existing payment/contact details. The user completed the payment and Mox verification. The browser displayed "Your domain is ready", and registrar readback confirmed registration and a writable Vercel zone. Auto-renew is off. No payment information or registrant contact is stored here.

## Prepared domain source

`src/lib/brand.ts` now declares `https://convelta.io` and `https://app.convelta.io`; application metadata uses the configured server origin with the product app origin as its default. `.env.example` documents the exact production canonical origin. The existing strict same-origin check and WhatsApp callback builder already consume `SMARTVOLT_APP_URL`; the production environment now sets `SMARTVOLT_APP_URL=https://app.convelta.io` for the coordinated production deployment, rather than weakening that check or changing credentials/cookies. TypeScript and the production build passed for these source changes.

The marketing source has been updated together: four application entry links, dynamic product-tab links, canonical URL, Open Graph URL/image, JSON-LD, robots and sitemap. JavaScript syntax, exact target origins, local assets and sitemap XML passed checks. That version is prepared for the post-payment cutover and is not evidence of a working registered domain. No dependency installation was needed for these configuration and link changes.

## Current state

| Area | Verified state | Evidence |
| --- | --- | --- |
| Product website | Public and active | Sites project `appgprj_6af580e396588191bac4a46790d07675`, version 1; https://convelta.kierankwok.chatgpt.site/ |
| Application | New production deployment READY | Vercel project `smartvolt-crm` / `prj_gGZ6T5HEMjNAdhcZNX0x6scQEFg0`, deployment `dpl_DuCbqrCMr2e3tn1v9Y9zsSPpGcuS`, source `6106791ddc7af0254cce9d3f7cc93f0b89eb42e5`. Deployment login HTTP 200 and Convelta title verified; application custom-domain HTTPS remains pending public DNS |
| Marketing apex | Hosting binding exists; validation pending | Sites domain `appgdom_6af585dc2f18819198f6137c4eb2b51d`; `convelta.io`; SSL `pending_validation` |
| Application subdomain | Production alias and DNS record saved; public propagation pending | `app.convelta.io` is associated with the correct Vercel project; domain configuration reports `misconfigured: true`, with no public A/CNAME values |
| Registration | Purchased by the user | Registrar `boughtAt: 1794481152000`, `expiresAt: 1826017152000`, `serviceType: zeit.world`, `zone: true`, auto-renew off; checkout success observed |
| DNS | Required apex/app records written and independently read back; www also prepared | Two marketing-apex A records, two Sites ownership/TLS TXT records and the project-specific app CNAME are present. A www Sites binding and its returned CNAME/TXT records were also created; existing system CAA/ALIAS records retained. Public delegation/certificate propagation remains to verify |
| Payment and registrant contact | Checkout completed by the user | Success screen and registry state observed; contact/payment data remain outside source control |

The read-only quote was USD 14.99 for one year, with auto-renew **off** in that quote. It is not a purchase authorization token for later use; obtain a fresh quote immediately before an authorized purchase. Taxes/processing fees may be added at charge time; the team default card is used; domain registrations are immediate and non-refundable. Keep contact data, payment data and signed quote tokens out of source control. Reuse the existing buying authorization; obtain only missing purchase choices/contact information. Do not substitute the historic incorporation contact for the user's intended registrar contact.

Billing: https://vercel.com/kieran97125s-projects/~/settings/billing

Domain management: https://vercel.com/kieran97125s-projects/~/domains

Terms: https://vercel.com/legal/terms

## Provider-returned DNS plan

These values were returned by the selected Sites and Vercel projects. Refresh them before applying after registration. Write at the **authoritative** DNS provider and preserve unrelated records. A Vercel account binding is not an authoritative DNS zone.

| Host, relative to `convelta.io` | Type | Value | Source |
| --- | --- | --- | --- |
| `@` | A | `162.159.143.30` | Sites apex proxy target |
| `@` | A | `172.66.3.26` | Sites apex proxy target |
| `_openai-site-verification` | TXT | `openai-site-verification=BOLpLArutVojAFosxZ6PDULrLk5cNuqA4GjyxF_1Emw` | Sites ownership record |
| `_cf-custom-hostname` | TXT | `09dd2c81-8913-4b33-b546-d0947dd76adc` | Sites custom-hostname validation |
| `app` | CNAME | `0d94e34febd9fc41.vercel-dns-017.com.` | Project-specific highest-ranked Vercel recommendation |

Do not point the marketing apex to Vercel's generic application A record. Do not create a `www` binding or redirect merely by assuming it follows the apex; add and verify it explicitly if required.

## Remaining system cards

| Card | State | Completion evidence |
| --- | --- | --- |
| `brand-domain-registration` | Registered; contact-verification lifecycle separate | User completed checkout; successful registry readback; any registrar verification email remains subject to the registrar lifecycle |
| `brand-domain-code` | App released; website version 2 saved for final activation | App source `6106791`, production `dpl_DuCbqrCMr2e3tn1v9Y9zsSPpGcuS` READY. Exact source CI runs `43205005485` and `43205005535` succeeded. Public website version 1 remains live; saved version 2 / source `1d552c5242751cebe45be15f2eb88824f3bae944` contains all new links |
| `brand-domain-dns` | Records saved; public delegation propagating | Exact existing Sites/app bindings retained and required records independently read back; public authoritative resolution remains to verify |
| `brand-domain-https` | Blocked on DNS | Sites domain and SSL active; application DNS verification clean; trusted HTTPS on both origins |
| `brand-domain-app-origin` | Blocked on HTTPS | Canonical application origin, same-origin writes, login/session handling and webhook URL acceptance verified together |
| `brand-domain-marketing-cutover` | Saved website version 2; blocked on public DNS/HTTPS | Marketing CTAs, canonical, Open Graph, robots and sitemap use verified production origins; public/mobile links checked |
| `brand-domain-commercial-launch` | Separate | Current product privacy/service disclosures, finalized offer/pricing, live channel acceptance and selected advertising/tracking configuration verified |

## Activation order

1. Complete registration once using current user-designated contact details. Reconcile any timed-out order before another charge. Record order state without storing private contact or quote tokens here.
2. Establish the actual authoritative DNS zone. Refresh the two hosting bindings and their required validation records. Apply only the necessary records and read them back independently.
3. Verify Sites status **and** SSL are active, and confirm the Vercel application origin serves the intended product through trusted HTTPS.
4. Before directing users to the new application origin, coordinate the production `SMARTVOLT_APP_URL`, deployment and domain access. `src/lib/saas/http.ts` uses this value for its strict origin check, while `src/lib/whatsapp/server.ts` uses it for provider callback URLs. A DNS-only alias can render a page but still reject legitimate writes. Do not broaden the origin check to arbitrary hosts or `*.convelta.io`.
5. Inspect the dedicated hosted Auth configuration before changing relevant site/redirect settings. Current application login uses email/password and cookie sessions; no generic OAuth callback route is present to invent or rename. Keep old-domain sessions and access behavior explicit during transition. Reconcile configured provider webhook callbacks separately; a hostname change does not prove inbound/outbound delivery.
6. Verify login, company selection, session refresh/signout and an authorized private write/reload on the new origin, plus anonymous and foreign-origin denial. Use disposable authorized data for a write acceptance; do not introduce customer records into a demo.
7. Update the marketing site's app CTAs, canonical/OG metadata, robots and sitemap together, then verify public desktop/mobile navigation. Keep the existing website/application origins available until cutover acceptance is recorded. No advertising campaign or pixel was enabled by this work.

## Product Learning Sync checked

Canonical protocol, index and checkpoint were read. Considered `entries/2026-08-10-platform-app-identity-icon-contract.md` and `entries/2026-08-05-production-auth-callback-email-contract.md`; retained the existing neutral identity and canonical-origin acceptance principles. Existing identity review remains on canonical [draft PR #88](https://github.com/kieran97125/leadhub-source-os/pull/88). This continuation records deployment facts and outstanding work; it does not introduce a new Core/Enterprise classification, adopt client implementations or claim a merged checkpoint review. No client data, credentials or configuration cross the product boundary.

## Release acceptance and remaining external propagation

Exact app source passed both hosted workflows, including the existing unit/database and browser acceptance gates. Local typecheck/build and website URL/asset/XML/JavaScript checks also passed. The new production deployment returned login HTTP 200 with the Convelta title; its error/fatal runtime scan returned no logs. The production canonical origin is `https://app.convelta.io`.

At 2026-11-12 19:08 HKT, Vercel public domain configuration still reported the parent `.io` nameservers, no public application A/CNAME and `misconfigured: true`; Sites apex SSL remained `pending_validation`. A new-domain fetch failed while the deployment URL succeeded. These are explicitly different results; neither the hosting alias nor a writable DNS zone is represented as public-domain completion. No unchanged failing fetch is retried until the DNS/certificate state changes.

Final website activation uses already-saved Sites version `appgprj_6af580e396588191bac4a46790d07675~appgver_9db74ca2b5e08191929cdd49caeb9807` (version 2). Verify domain SSL, application hostname and that no newer website release would be overwritten before deploying that version. No additional purchase, credential change, broad origin allowance or access-policy change is needed.

## Temporary deployment follow-through

Temporary task `Automation_0e2f5795083881918066e0402cde937e` / Convelta 網域啟用 retains the authorized post-DNS completion. It checks at most hourly for up to 24 occurrences, performs only the existing saved-version activation after public domain checks, preserves newer releases, notifies only material changes/success and disables itself after completion. It stops with a concrete blocker report after 2026-11-13 19:00 HKT if activation is still unresolved. No further purchase, access-policy change or credentials are authorized by this task.
