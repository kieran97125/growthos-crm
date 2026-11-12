# Convelta product identity

Decision: 2026-11-12, Hong Kong time. The user selected **Convelta** for the product. **SmartVolt International Limited／智威特國際有限公司** remains its operator. The product covers communications, CRM, booking and POS with AI assistance. Public SmartVolt material focuses on business software; unrelated consumer projects are outside this brand's marketing.

Customer-facing names, metadata, export filenames and the shared vector icon derive from `src/lib/brand.ts`. Existing credentials, database/schema names, tenant identities, auth cookies, preview storage keys, project directories and callback URLs do not change as part of the display-name update. Existing tooling is sufficient; no dependency is added.

## Rollout cards

| Card | State | Completion condition |
| --- | --- | --- |
| `brand-app-identity` | Released and verified | Runtime `411423c5b333682b175ff8c37cff608f0afcd8a8`; READY deployment `dpl_B8eyT7DmxXWDwdTsNep5s5izjqxz` at https://smartvolthk.com. 151 tests and 48 browser checks passed; actual screenshots, live names/titles and metadata/icon reads verified. |
| `brand-facebook-name` | Completed | The user completed authentication. Settings and public Page `61596722780516` both display Convelta on 2026-11-12. |
| `brand-company-account` | Completed | The user's dedicated company account, workspace name and existing brand display name now read Convelta. The operator performed one locked, revision-checked transaction, retained the previous workspace version and recorded an operator command. Readback verified unchanged operational payload, stable brand identity and active peer CRM/POS purchases. No private company or user identifiers are included here. |
| `brand-social-handles` | Pending | Select and verify a consistent public handle; complete Convelta Instagram registration and link the company-owned Page. Passwords and terms remain with the user where required. |
| `brand-messenger-instagram-inbox` | Implementation prepared; provider activation blocked | Tenant-isolated Messenger/Instagram inbox, signed webhooks, encrypted Page credentials and durable manual sending are implemented. The user’s cloud Meta sign-in is waiting at a CAPTCHA; App Secret, Page authorization, subscriptions and actual inbound/outbound verification remain pending. A brand Instagram account still needs creation and Page linkage. See [activation record](convelta-meta-inbox.md). |
| `brand-domain` | Completed | convelta.io purchased on Vercel; public DNS, apex/www SSL and official app HTTPS verified. App production `dpl_DuCbqrCMr2e3tn1v9Y9zsSPpGcuS` READY with the new origin; official login/preview HTTP 200. Website version 2 published and rendered links verified. See [activation record](convelta-domain-activation.md). |
| `brand-product-site` | Public static build on Vercel | https://convelta.io/ — source `567d467993dfabb7aa6d3472a9c09d2d8309d966`, successful publish `appgdep_6af5b16f6e7c8191becf90a5347e257c`. Bright yellow `#FFE600` with ink `#171918`; AI applications and custom solutions added. All three full product screenshots removed; product tabs use abstract workflow artwork and demonstration inquiries. Anonymous browser/Facebook/WhatsApp requests to apex and www each returned HTTP 200 with the new theme. Following the user’s supplied chatgpt.site block page, production hosting was moved to Vercel project `convelta-website`, READY deployment `dpl_EpK258EUsjruyQMbgAtfB6Ve1SUT`. Apex/www DNS configuration is valid and anonymous HTTPS responses now carry x-vercel-id; www redirects to apex. No paid campaign or pixel activated. |

## Domain lookup

Vercel registry lookup on 2026-11-12 found all three domains available. Prices are USD for the stated term, can change and are not a purchase or reservation.

| Domain | Registration | Renewal | Role |
| --- | --- | --- | --- |
| `convelta.io` | $14.99 / 1 year | $46 / 1 year | Selected and registered primary product domain; checkout displayed USD 14.99 first year / USD 46 renewal. Auto-renew is off. |
| `convelta.ai` | $160 / 2 years | $160 / 2 years | Historical alternative lookup; not selected for purchase. |
| `convelta.com` | $12.03 / 1 year | $12.03 / 1 year | Historical alternative lookup; not selected for purchase. |

Product Learning Sync checked: canonical protocol, index and checkpoint, including the already-adopted `entries/2026-08-10-platform-app-identity-icon-contract.md`. Canonical checkpoint review: [draft PR #88](https://github.com/kieran97125/leadhub-source-os/pull/88). This display-name change does not adopt client records, settings or identity.

Product Learning Sync checked for the company-account and social-inbox request: canonical protocol, index and checkpoint were read again, together with `entries/2026-07-16-alyssa-crm-operations-extraction.md`, `entries/2026-07-26-whatsapp-broadcast-operations-boundary.md` and `entries/2026-07-29-connector-readiness-and-identity-boundary.md`. Existing identity isolation and truthful activation-state boundaries are retained. The original provider implementation now follows those neutral isolation and truthful-readiness boundaries. Provider permissions, live sends and AI automation are not yet activated. No pilot credentials or customer data were imported. See the current activation record below.
