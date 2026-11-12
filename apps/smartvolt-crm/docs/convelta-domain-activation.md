# Convelta domain activation

Verified 2026-11-12, Hong Kong time. The user has authorized the Convelta website and `convelta.io`. This record distinguishes the hosting setup from registration and production activation. The initial verification found no purchase or DNS zone; the subsequent user-completed checkout and configuration changes are recorded below.

The user subsequently asked the agent to choose the registrar and open checkout for the user to pay. **Vercel was selected.** The existing signed-in Vercel dashboard's Buy dialog returned `convelta.io` at USD 14.99 for the first year and USD 46/year renewal; selecting it opened Billing Information with the user's existing payment/contact details. The user completed the payment and Mox verification. The browser displayed "Your domain is ready", and registrar readback confirmed registration and a writable Vercel zone. Auto-renew is off. No payment information or registrant contact is stored here.

## Released domain source

`src/lib/brand.ts` now declares `https://convelta.io` and `https://app.convelta.io`; application metadata uses the configured server origin with the product app origin as its default. `.env.example` documents the exact production canonical origin. The existing strict same-origin check and WhatsApp callback builder already consume `SMARTVOLT_APP_URL`; the production environment now sets `SMARTVOLT_APP_URL=https://app.convelta.io` for the coordinated production deployment, rather than weakening that check or changing credentials/cookies. TypeScript and the production build passed for these source changes.

The marketing source has been updated together: four application entry links, dynamic product-tab links, canonical URL, Open Graph URL/image, JSON-LD, robots and sitemap. JavaScript syntax, exact target origins, local assets and sitemap XML passed checks. Version 2 is now publicly deployed and the official domain was opened and verified in the browser. No dependency installation was needed for these configuration and link changes.

## Current state

| Area | Verified state | Evidence |
| --- | --- | --- |
| Product website | Version 2 live on the official domain | https://convelta.io/; Sites project `appgprj_6af580e396588191bac4a46790d07675`, source `1d552c5242751cebe45be15f2eb88824f3bae944`, successful publication `appgdep_6af59f031c5c819183d9f06122d5188e` |
| Application | New production deployment READY | Vercel project `smartvolt-crm` / `prj_gGZ6T5HEMjNAdhcZNX0x6scQEFg0`, deployment `dpl_DuCbqrCMr2e3tn1v9Y9zsSPpGcuS`, source `6106791ddc7af0254cce9d3f7cc93f0b89eb42e5`. Official https://app.convelta.io/login and CRM preview both returned HTTP 200 with the Convelta title |
| Marketing apex and www | Active with trusted HTTPS | Both convelta.io and www.convelta.io returned Sites status active / SSL active; official apex render and canonical verified in the browser |
| Application subdomain | Public DNS and HTTPS verified | Vercel reports ns1/ns2.vercel-dns.com, the exact configured app CNAME and misconfigured false; official login and preview HTTP 200 |
| Registration | Purchased by the user | Registrar `boughtAt: 1794481152000`, `expiresAt: 1826017152000`, `serviceType: zeit.world`, `zone: true`, auto-renew off; checkout success observed |
| DNS | Required apex/app records written and independently read back; www also prepared | Two marketing-apex A records, two Sites ownership/TLS TXT records and the project-specific app CNAME are present. A www Sites binding and its returned CNAME/TXT records were also created; existing system CAA/ALIAS records retained. Public Vercel nameservers, app CNAME and active certificates were subsequently verified |
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
| `brand-domain-code` | Completed | App source `6106791`, production `dpl_DuCbqrCMr2e3tn1v9Y9zsSPpGcuS` READY. Exact source CI runs `43205005485` and `43205005535` succeeded. Website version 2 / source `1d552c5242751cebe45be15f2eb88824f3bae944` published successfully |
| `brand-domain-dns` | Completed | Required records independently read back; public Vercel nameservers and app CNAME verified with misconfigured false |
| `brand-domain-https` | Completed | Apex/www Sites status and SSL active; official app login and preview HTTP 200 over verified HTTPS |
| `brand-domain-app-origin` | Domain cutover completed; existing authenticated Owner/provider acceptance separate | Production APP_URL uses the new origin; official login/preview HTTP 200 and anonymous private GET 401. Existing strict origin and callback builders retained; no claim of a new real-provider or authenticated private-write acceptance |
| `brand-domain-marketing-cutover` | Completed | Version 2 published; official browser render and canonical https://convelta.io/ verified, four new app links and zero legacy app links confirmed. Clicking Booking changed the demo destination to https://app.convelta.io/preview/pos |
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

## Release acceptance and resolved propagation

Exact app source passed both hosted workflows, including the existing unit/database and browser acceptance gates. Local typecheck/build and website URL/asset/XML/JavaScript checks also passed. The new production deployment returned login HTTP 200 with the Convelta title; its error/fatal runtime scan returned no logs. The production canonical origin is `https://app.convelta.io`.

At 2026-11-12 19:08 HKT, Vercel public domain configuration still reported the parent `.io` nameservers, no public application A/CNAME and `misconfigured: true`; Sites apex SSL remained `pending_validation`. A new-domain fetch failed while the deployment URL succeeded. These are explicitly different results; neither the hosting alias nor a writable DNS zone is represented as public-domain completion. No unchanged failing fetch is retried until the DNS/certificate state changes.

The successful final website publication used Sites version `appgprj_6af580e396588191bac4a46790d07675~appgver_9db74ca2b5e08191929cdd49caeb9807` (version 2). Domain SSL, application hostname and saved source were verified before publication. No additional purchase, credential change, broad origin allowance or access-policy change is needed.

## Temporary deployment follow-through

Temporary task `Automation_0e2f5795083881918066e0402cde937e` / Convelta 網域啟用 was disabled once propagation completed during the interactive task. All domain/website activation was finished in this session; no follow-up deployment remains scheduled. The original bounded task retained the authorized post-DNS completion. It checks at most hourly for up to 24 occurrences, performs only the existing saved-version activation after public domain checks, preserves newer releases, notifies only material changes/success and disables itself after completion. It stops with a concrete blocker report after 2026-11-13 19:00 HKT if activation is still unresolved. No further purchase, access-policy change or credentials are authorized by this task.

At 2026-11-12 19:13-19:17 HKT, propagation completed. Apex and www status/SSL are active, app DNS reports misconfigured false, official app login and CRM preview return HTTP 200, and the private company workspace GET returns 401 anonymously. The official website was opened and retained as the user-facing browser deliverable. Its title, headline, canonical, four new application links, zero old app links and dynamic Booking demo target were verified from the rendered DOM. Publication appgdep_6af59f031c5c819183d9f06122d5188e succeeded. The earlier pending observations above are historical only.

Live anonymous POST probes from the executor could not establish an outbound connection (curl status 000); they are not recorded as passed requests. Existing strict-origin logic was unchanged and the exact-source hosted browser gate passed. Public custom-domain login/preview and anonymous private GET were verified through the Vercel connector, and the website was verified in the connected browser.
