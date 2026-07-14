# LeadOps CRM Schema Proposal

This is a planning document only. No migration has been applied.

LaunchHub should stay responsible for public lead capture, form submission, landing page attribution, source snapshots, consent proof, and campaign performance reporting. The CRM layer should be portable into a future GrowthOS app without hardcoding a single beauty brand or workspace name.

## Canonical CRM Identity

The CRM should match a customer case by:

```text
brand_slug + normalized_phone
```

Do not use `form_token` as the customer identity. A customer may submit more than one form, enter through a landing page, click a WhatsApp ad, or be imported manually. The CRM identity should stay stable across those entry points.

## Source Types

The CRM domain can normalize incoming leads into these source types:

- `landing_form`
- `whatsapp_ad`
- `whatsapp_direct`
- `manual`
- `import`
- `unknown`

Raw attribution fields should remain in LaunchHub/Supabase. CRM screens can display simplified labels while keeping the original UTM, click ID, CTWA, and audit data available for reporting.

## Optional CTWA Fields

WhatsApp ad cases may include these nullable fields:

- `ctwa_source_id`
- `ctwa_source_url`
- `ctwa_referral_headline`
- `ctwa_referral_body`
- `campaign_id`
- `adset_id`
- `ad_id`
- `phone_number_id`
- `whatsapp_business_account_id`

These fields should be optional because not every WhatsApp or landing page lead will have CTWA metadata.

## Proposed Tables

Future CRM persistence may use tables like:

- `crm_contacts`
- `crm_lead_cases`
- `crm_lead_events`
- `crm_interactions`
- `crm_bookings`
- `crm_status_history`
- `crm_follow_up_tasks`
- `crm_quick_replies`
- `crm_ai_suggestions`
- `brand_knowledge_items`

## Proposed Responsibilities

`crm_contacts` stores brand-scoped customer identity and reusable contact details.

`crm_lead_cases` stores the current operational case for a customer/brand, including assigned CS, CRM status, next follow-up, and active source summary.

`crm_lead_events` stores immutable operational events such as status changes, follow-up attempts, booking changes, and outcome updates.

`crm_interactions` stores WhatsApp, phone, email, and manual interaction records.

`crm_bookings` stores CRM-side booking confirmation state and can write outcomes back to the shared LaunchHub booking/lead base.

`crm_status_history` keeps a timeline of status pipeline changes such as `new`, `contacting`, `booked`, `confirmed`, `showed`, `paid`, `no_show`, `lost`, and `invalid`.

`crm_follow_up_tasks` stores reminders, next actions, and CS ownership.

`crm_quick_replies` stores brand-approved response snippets.

`crm_ai_suggestions` stores generated reply suggestions and review state.

`brand_knowledge_items` stores reusable brand, treatment, pricing, FAQ, and policy knowledge that can support CS replies and AI suggestions.

## Save / Write Boundary

Current LaunchHub CRM screens are read-only. Future writes should be explicit CRM actions and should not change public lead submission semantics, source snapshot capture, payment semantics, consent validation, or Google Sheets sync.

When CRM outcomes are written back, LaunchHub should continue to calculate campaign performance from shared lead, booking, payment, and event records instead of treating CRM data as a separate island.
