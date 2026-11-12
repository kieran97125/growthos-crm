# Convelta product identity

Decision: 2026-11-12, Hong Kong time. The user selected **Convelta** for the product. **SmartVolt International Limited／智威特國際有限公司** remains its operator. The product covers communications, CRM, booking and POS with AI assistance. Public SmartVolt material focuses on business software; unrelated consumer projects are outside this brand's marketing.

Customer-facing names, metadata, export filenames and the shared vector icon derive from `src/lib/brand.ts`. Existing credentials, database/schema names, tenant identities, auth cookies, preview storage keys, project directories and callback URLs do not change as part of the display-name update. Existing tooling is sufficient; no dependency is added.

## Rollout cards

| Card | State | Completion condition |
| --- | --- | --- |
| `brand-app-identity` | Implemented; release verification pending | Login, CRM/POS, page titles, manifest, browser and Apple icons show Convelta; desktop/mobile checks and deployed readbacks pass. |
| `brand-facebook-name` | Owner authentication pending | Existing Page `61596722780516` has a prepared SmartVolt 智威特 → Convelta name request. User enters the Facebook password and submits; Meta approval must then be read back. |
| `brand-social-handles` | Pending | Select and verify a consistent public handle; complete Convelta Instagram registration and link the company-owned Page. Passwords and terms remain with the user where required. |
| `brand-domain` | Quote prepared; not purchased | User chooses the exact domain, term and spend; confirm registration, DNS and HTTPS after purchase. |
| `brand-product-site` | Planned | Product-branded sales site links to the same-brand app and names SmartVolt as operator; final public domain, pricing, legal content and launch scope must be resolved. |

## Domain lookup

Vercel registry lookup on 2026-11-12 found all three domains available. Prices are USD for the stated term, can change and are not a purchase or reservation.

| Domain | Registration | Renewal | Role |
| --- | --- | --- | --- |
| `convelta.io` | $14.99 / 1 year | $46 / 1 year | Recommended primary product domain; pending user choice. |
| `convelta.ai` | $160 / 2 years | $160 / 2 years | Optional brand protection or alternative primary; pending user choice. |
| `convelta.com` | $12.03 / 1 year | $12.03 / 1 year | Optional alternative; pending user choice. |

Product Learning Sync checked: canonical protocol, index and checkpoint, including the already-adopted `entries/2026-08-10-platform-app-identity-icon-contract.md`. Canonical checkpoint review: [draft PR #88](https://github.com/kieran97125/leadhub-source-os/pull/88). This display-name change does not adopt client records, settings or identity.
