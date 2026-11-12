# Convelta product identity

Decision: 2026-11-12, Hong Kong time. The user selected **Convelta** for the product. **SmartVolt International Limited／智威特國際有限公司** remains its operator. The product covers communications, CRM, booking and POS with AI assistance. Public SmartVolt material focuses on business software; unrelated consumer projects are outside this brand's marketing.

Customer-facing names, metadata, export filenames and the shared vector icon derive from `src/lib/brand.ts`. Existing credentials, database/schema names, tenant identities, auth cookies, preview storage keys, project directories and callback URLs do not change as part of the display-name update. Existing tooling is sufficient; no dependency is added.

## Rollout cards

| Card | State | Completion condition |
| --- | --- | --- |
| `brand-app-identity` | Released and verified | Runtime `411423c5b333682b175ff8c37cff608f0afcd8a8`; READY deployment `dpl_B8eyT7DmxXWDwdTsNep5s5izjqxz` at https://smartvolthk.com. 151 tests and 48 browser checks passed; actual screenshots, live names/titles and metadata/icon reads verified. |
| `brand-facebook-name` | Completed | The user completed authentication. Settings and public Page `61596722780516` both display Convelta on 2026-11-12. |
| `brand-social-handles` | Pending | Select and verify a consistent public handle; complete Convelta Instagram registration and link the company-owned Page. Passwords and terms remain with the user where required. |
| `brand-domain` | Completed | convelta.io purchased on Vercel; public DNS, apex/www SSL and official app HTTPS verified. App production `dpl_DuCbqrCMr2e3tn1v9Y9zsSPpGcuS` READY with the new origin; official login/preview HTTP 200. Website version 2 published and rendered links verified. See [activation record](convelta-domain-activation.md). |
| `brand-product-site` | Publicly deployed on convelta.io | https://convelta.io/ — Site `appgprj_6af580e396588191bac4a46790d07675`, source `1d552c5242751cebe45be15f2eb88824f3bae944`, version 2, successful publish `appgdep_6af59f031c5c819183d9f06122d5188e`. Official render, canonical, four application links, zero old app links and dynamic Booking demo destination verified. www SSL is also active. No advertising pixel or paid campaign activated. |

## Domain lookup

Vercel registry lookup on 2026-11-12 found all three domains available. Prices are USD for the stated term, can change and are not a purchase or reservation.

| Domain | Registration | Renewal | Role |
| --- | --- | --- | --- |
| `convelta.io` | $14.99 / 1 year | $46 / 1 year | Selected and registered primary product domain; checkout displayed USD 14.99 first year / USD 46 renewal. Auto-renew is off. |
| `convelta.ai` | $160 / 2 years | $160 / 2 years | Historical alternative lookup; not selected for purchase. |
| `convelta.com` | $12.03 / 1 year | $12.03 / 1 year | Historical alternative lookup; not selected for purchase. |

Product Learning Sync checked: canonical protocol, index and checkpoint, including the already-adopted `entries/2026-08-10-platform-app-identity-icon-contract.md`. Canonical checkpoint review: [draft PR #88](https://github.com/kieran97125/leadhub-source-os/pull/88). This display-name change does not adopt client records, settings or identity.
