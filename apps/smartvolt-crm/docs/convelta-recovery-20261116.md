# Convelta recovery and production acceptance — 2026-11-16

Latest checked: 2026-11-17 00:00 HKT. Website chat and source qualification are complete; actual WhatsApp/Meta activation remains incomplete.

## Released results

- Application source: `1dc6e13ac2f160c7611cdecf978ba639b35cd7d1`; production `dpl_CbFkKh5v1y7mKorc6o8m9TDqUtLQ`, READY with `app.convelta.io` retained. This adds provider-setup credential UX and reliable native qualification to the earlier Flow runtime. The dedicated Meta App Secret remains Production-only; no secret value is recorded.
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

[SmartVolt workflow 43898606069](https://github.com/kieran97125/growthos-crm/actions/runs/43898606069) and [original CRM workflow 43898607185](https://github.com/kieran97125/growthos-crm/actions/runs/43898607185) both succeeded on released source `1dc6e13`.

- 515 program/database tests; 2 durable Workflow tests.
- 226 browser tests: 182 main cases (8 campaign, 20 coaching, 33 intelligence/voice, 121 remaining) plus 44 inbox-expansion cases. Four first-paint cases are separate.
- Native PostgreSQL operations/concurrency passed. An earlier candidate's native qualifier parsed incomplete pipe output; the helper now waits for child-process stdio closure. Assertions, isolation guards and timeouts remain unchanged. This is test-harness evidence, not real provider traffic.
- The provider setup uses API-credential autocomplete hints and an Owner-only verification-code show/hide control. Initial load remains masked; a controller regression verifies code retrieval/remasking creates no connection or send. No dependency, schema, access grant or server-token exposure was added.
- Local TypeScript, changed-file lint and 20 Meta protocol/database cases passed. The earlier scoped-Flow repair retained its 24/24 focused studio qualification and real Owner trial; the Flow implementation is unchanged by this follow-up.
- Native production readback confirms the Page ID field stays empty and the code returns to password masking. Both provider credential fields are visibly empty. The automation still receives a redacted code and an empty virtual clipboard, so code transfer remains a manual handoff.
- Initial production error/fatal grouped scan for the new deployment is empty. This is a bounded observation, not a reliability guarantee.

Post-migration advisories were inspected. RLS-without-policy notices are expected for server-only tables with all browser grants denied. Existing website-enquiry definer/Auth warnings remain separate; performance INFO includes three website-chat foreign-key covering-index opportunities, with no measured latency claim. No unrelated protections were weakened or broad grants added.

## Remaining real provider boundary

The account owner completed native Meta password reauthentication. The dedicated App Secret was transferred directly to the existing application's Production-only Vercel Secret setting; metadata-only readback confirmed sensitive storage and Production as its sole target. The configuration-only deployment `dpl_8sR4Enk6uPUJEC69uMBN8K8EXCFV` was followed by the fully qualified setup-UI release above. No key value is present in source, command output, screenshots or this receipt.

Messenger and Instagram use cases are saved in the same dedicated App. This is configuration, not a Page/account grant or completed provider connection. Native WhatsApp token generation and Page connection reached the existing administrator's account-switch step; no asset selection or token generation completed. Controls in those native Facebook popup windows repeatedly timed out. No replacement App or private-phone migration was made.

The first callback verification failed after the protected code was returned as a redacted literal. That literal was cleared. The updated show/hide control works, but protected-value reads still return redacted text and keyboard/page-copy attempts do not populate the automation clipboard. No verified callback is claimed. The current handoff retains the company's protected setup page and the Meta Messenger callback form, with the canonical callback URL filled and the verification field empty, for the owner to copy directly using the page controls.

The App remains unpublished. The native publication checklist requires a public privacy-policy URL; the 2026-11-12 draft is unapproved and predates current Meta, media, voice and website-chat capabilities. Public business contact, actual retention/deletion/request handling and processor disclosures still need concrete decisions and implementation before publication. The native WhatsApp business-verification page still reports “In review”; no approval or account-unlock result is inferred.

Independent readback after the latest deployment still shows zero company WhatsApp connections and zero Meta connections. Owned Page/Instagram linkage, the intended registered business number, scoped provider credentials, webhook/account subscriptions and actual inbound → deliberate manual reply → delivery receipt remain pending. Private media, source-triggered Flow and voice quality retain their own real-provider acceptance cards. No customer send occurred.

The repaired company Flow cannot be published without a connected brand channel. Configuration and simulation are verified; provider execution remains pending. General company API/Webhooks/n8n/Make and online payment remain at the user's previously deferred scope. Cards preserve completed website chat, the new setup release and concrete provider blockers; `meta-privacy-policy` now tracks the missing public-policy/publication work.

## Product learning boundary

Product Learning Sync checked against the canonical private protocol, current index and checkpoint. Considered: 2026-07-17 regression acceptance; 2026-07-26 sending authority; 2026-07-29 connector readiness/identity; 2026-08-10 permission-aware scope; 2026-10-06 description density; 2026-11-16 complete operational reads/durable capture. Existing neutral scope, truthful-readiness and acceptance contracts are retained. Adoption of new pilot implementation/classification remains deferred. The canonical checkpoint proposal remains the existing reviewed change in private PR #88. No pilot implementation, data, credentials, identity, price or client hardcoding was imported.

