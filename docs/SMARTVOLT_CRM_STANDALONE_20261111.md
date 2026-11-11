# SmartVolt CRM: standalone SaaS decision — 2026-11-11

The user's latest direction replaces the previous platform-app dependency for SmartVolt CRM.

| Area | Decision |
| --- | --- |
| Product | One standalone CRM SaaS; company customers sign in directly |
| Reference | KiesTECH interaction design and functional modules |
| App | `apps/smartvolt-crm`, independently installed, built and deployed |
| Identity | Dedicated Auth and stored company memberships; no Growth OS session or module entitlements |
| Tenant | Company → brands → staff, customer records, conversations, Flow, AI BOT, broadcasts |
| Isolation | Company authorization on every request; company document validation; private database grants and RLS |
| Distribution | One product for many companies, each with a private workspace |
| Dependencies | No GrowthRadar, LaunchHub, CreativeLab or platform launcher runtime requirement |
| Integrations | Optional company-owned channel adapters; never mandatory other-product dependencies |
| Operations | SaaS owner provisions companies and manages subscription access; company roles control daily work |

The app is a separate deployment package within the existing source repository. It can be extracted into its own repository without importing root application code. KiesTECH's existing package is unchanged.

This change delivers the independent app, company/auth/persistence boundary, preview and tests. Dedicated hosted activation, live messaging/model execution, invitations, payments and scale read models remain explicit system cards. No external customer system was modified.
