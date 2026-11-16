# Convelta recovery and production acceptance — 2026-11-16

Latest checked: 2026-11-16 22:56 HKT. This record supersedes the earlier missing website schema and invalid draft-graph status. It does not certify WhatsApp/Meta activation.

## Released results

- Application source: `6179801442e10a1049746ff07085a2e43a1517cc`; production `dpl_CFKL39RU3qW5W14WNBeqLbC52Epi`, READY with `app.convelta.io` retained.
- Website production: `dpl_BPPS7VVdZVKRP1evRVamzhEtKV1p`, READY with `convelta.io` and `www.convelta.io` retained. Qualified preview `dpl_8YwHuPhby1Jo6nKAJE9dVwDd6VVd`. Only homepage source changed; all 38 other deployment-source files were reused unchanged by SHA-1. The existing source archive was updated in place.
- Native website migration succeeded. Exact source file `20261115164148_convelta_website_chat.sql` is unchanged; native migration history records `20261116143007_convelta_website_chat`. This is an explicit history/source mapping, not an invented original installation date.
- Full catalog verification: all 50 expected functions installed with exact source MD5, invoker semantics, no anon/authenticated execution and service execution present; all 17 expected tables installed with RLS and no browser grants. Private attachment bucket remains private.
- Exact existing rollback-only hosted acceptance: fixture, social, Flow, media and website-chat all PASS (5/5); synthetic company/Auth rows both zero after rollback. This is functional persistence evidence, separate from provider transport and concurrency qualification.

## Real website conversation acceptance

The company's public website was verified through its real homepage ownership marker, then the scoped chat configuration was enabled through the authenticated settings UI. The public iframe submitted a clearly labelled synthetic acceptance message. The company's website inbox received it; the Owner manually replied through the ordinary composer; the public visitor log displayed that exact reply. Reloading the public page restored the same conversation and both messages.

Independent database readback found exactly one labelled test conversation with two messages: one inbound and one outbound. No customer was implicitly linked. The test conversation was closed through the ordinary staff control and its closed/unlinked state was read back. The two-message evidence is retained and clearly labelled; no customer contact, broadcast, provider send or real appointment was created.

The native viewport override did not produce the requested mobile width (the DOM still reported the normal desktop width). No native mobile acceptance is claimed. Hosted mobile cases passed as part of the exact-source browser suite.

## Flow repair and truthful simulation

The existing draft incorrectly connected a terminal FAQ-send node to a human-handoff node while describing that FAQ-send node as draft preparation. The configuration was repaired through the existing scoped revision/audit commit. New inquiries go to human review; staff can use C to prepare and check drafts before manual sending. No automatic send node remains in this company draft. The workspace reached revision 7, with draft v2 and one saved Flow version; previous workspace state remains in version history.

A live trial also exposed a separate display defect: arbitrary company-member UUIDs fell through to a hard-coded fictional colleague. The simulator now resolves names from the scoped company team and uses a neutral fallback when the member is absent. Both callers pass the existing scoped team; no new API, package or permission was introduced. A regression checks correct resolution and unknown-member fallback. Production reload and trial confirmed the actual selected company member instead of a demo name.

## Exact-source qualification

[SmartVolt workflow 43888564209](https://github.com/kieran97125/growthos-crm/actions/runs/43888564209) and [original CRM workflow 43888564169](https://github.com/kieran97125/growthos-crm/actions/runs/43888564169) both succeeded on `6179801`.

- 515 program/database tests; 2 durable Workflow tests.
- 225 browser tests: 181 main cases (8 campaign, 20 coaching, 33 intelligence/voice, 120 remaining) plus 44 inbox-expansion cases. Four first-paint cases are counted separately.
- Native PostgreSQL operations/concurrency job passed; it is not substituted for actual provider acceptance.
- Local focused studio suite: 24/24; TypeScript passed. Component review retained existing hooks, event handlers, scope, accessibility and package boundaries.
- Initial bounded production runtime scans for each new deployment returned no error/fatal groups. This is a short observation, not a reliability guarantee.

Post-migration advisories were inspected. RLS-without-policy notices are expected for server-only tables with all browser grants denied. Existing website-enquiry definer/Auth warnings remain separate; performance INFO includes three website-chat foreign-key covering-index opportunities, with no measured latency claim. No unrelated protections were weakened or broad grants added.

## Remaining real provider boundary

The actual company has zero WhatsApp connections, zero Messenger/Instagram connections and zero provider messages. Its production App ID matches the existing SmartVolt CRM Meta App; the App Secret is absent. The existing Meta App is not published and currently lists only the WhatsApp use case. The native Meta secret-display action requires the account owner to re-enter the Facebook password; that original dialog is preserved for handoff. No password was requested in chat, changed, entered or bypassed. Messenger/Instagram use cases, permission/publication requirements, provider credentials, company Webhooks, real inbound/manual reply/receipts, private media and source-triggered Flow still require provider acceptance.

The repaired company Flow cannot be published without a connected brand channel. Its configuration and simulation are verified; real provider execution remains pending. General company API/Webhooks/n8n/Make and online payment remain at the user's previously deferred scope.

System cards now record website-chat-widget complete, Flow configuration repaired with provider execution pending, and WA/Meta real acceptance blocked by the concrete connection/authentication prerequisites. Earlier historical card text is retained beneath the latest findings.

## Product learning boundary

Product Learning Sync checked against the canonical private protocol, current index and checkpoint. Considered: 2026-07-17 regression acceptance; 2026-07-26 sending authority; 2026-07-29 connector readiness/identity; 2026-08-10 permission-aware scope; 2026-10-06 description density; 2026-11-16 complete operational reads/durable capture. Existing neutral scope, truthful-readiness and acceptance contracts are retained. New source implementation/classification is deferred. The canonical checkpoint proposal remains the existing reviewed change in private PR #88. No pilot implementation, data, credentials, identity, price or client hardcoding was imported.

