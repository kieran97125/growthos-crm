# Convelta domain activation

Verified 2026-11-12, Hong Kong time. The user has authorized the Convelta website and `convelta.io`. This record distinguishes the hosting setup from registration and production activation. No domain purchase, registrar-contact submission, successful DNS write or application-origin change was performed in this continuation.

The user subsequently asked the agent to choose the registrar and open checkout for the user to pay. **Vercel was selected.** The existing signed-in Vercel dashboard's Buy dialog returned `convelta.io` at USD 14.99 for the first year and USD 46/year renewal; selecting it opened Billing Information with the user's existing payment/contact details. The checkout was retained for the user; no final payment was submitted by the agent. This supersedes the earlier unsuccessful billing-page inspection without claiming purchase or enabling renewal.

## Prepared domain source

`src/lib/brand.ts` now declares `https://convelta.io` and `https://app.convelta.io`; application metadata uses the configured server origin with the product app origin as its default. `.env.example` documents the exact production canonical origin. The existing strict same-origin check and WhatsApp callback builder already consume `SMARTVOLT_APP_URL`; the production environment will be changed together with the verified domain deployment, rather than weakening that check or changing credentials/cookies. TypeScript and the production build passed for these source changes.

The marketing source has been updated together: four application entry links, dynamic product-tab links, canonical URL, Open Graph URL/image, JSON-LD, robots and sitemap. JavaScript syntax, exact target origins, local assets and sitemap XML passed checks. That version is prepared for the post-payment cutover and is not evidence of a working registered domain. No dependency installation was needed for these configuration and link changes.

## Current state

| Area | Verified state | Evidence |
| --- | --- | --- |
| Product website | Public and active | Sites project `appgprj_6af580e396588191bac4a46790d07675`, version 1; https://convelta.kierankwok.chatgpt.site/ |
| Application | Production READY | Vercel project `smartvolt-crm` / `prj_gGZ6T5HEMjNAdhcZNX0x6scQEFg0`, deployment `dpl_B8eyT7DmxXWDwdTsNep5s5izjqxz`; existing https://smartvolthk.com |
| Marketing apex | Hosting binding exists; validation pending | Sites domain `appgdom_6af585dc2f18819198f6137c4eb2b51d`; `convelta.io`; SSL `pending_validation` |
| Application subdomain | Hosting binding exists; DNS absent | `app.convelta.io` is associated with the correct Vercel project; domain configuration reports `misconfigured: true`, with no public A/CNAME values |
| Registration | Not purchased | Registrar quote reports available; account domain has `boughtAt: null`, no expiry, `serviceType: na` and `zone: false`. Account/project `verified: true` does not prove registry ownership or working DNS |
| DNS | Not writable yet | No existing records. One attempted ownership TXT preparation returned `400 invalid_zone`; no successful write occurred. Do not repeatedly submit records until registration and authoritative DNS are established |
| Payment and registrant contact | User checkout opened | Vercel's Buy dialog reached Billing Information with existing payment/contact information. The user is completing checkout; registration/order completion has not been observed |

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
| `brand-domain-registration` | User checkout opened; payment pending | Intended contact reviewed by the user; successful single purchase order and registry readback; required email verification |
| `brand-domain-code` | Prepared; typecheck/build and website link checks passed | Product origins, metadata and environment example updated; matching app and marketing sources saved before coordinated production activation |
| `brand-domain-dns` | Blocked on registration and authoritative zone | Exact existing Sites/app bindings retained, current required records written once and independently resolved |
| `brand-domain-https` | Blocked on DNS | Sites domain and SSL active; application DNS verification clean; trusted HTTPS on both origins |
| `brand-domain-app-origin` | Blocked on HTTPS | Canonical application origin, same-origin writes, login/session handling and webhook URL acceptance verified together |
| `brand-domain-marketing-cutover` | Blocked on application acceptance | Marketing CTAs, canonical, Open Graph, robots and sitemap use verified production origins; public/mobile links checked |
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
