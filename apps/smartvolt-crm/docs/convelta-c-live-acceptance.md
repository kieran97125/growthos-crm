# C production acceptance recovery

The round-three runtime `4d9f13cc09209b960d9ecbf8632e554e28500669`
passed 220 unit/database, 83 browser and four initial-paint checks and was
released as `dpl_DzKHQYSctUdEeQfXo66vVEgLkLXJ`. Authenticated production
acceptance then exposed a provider boundary that mocked model output did not
exercise. The first C activity-plan request on 2026-11-13 at 18:16 HKT failed
with HTTP 400 before generation. Both OpenAI and Azure reported that the
structured response schema omitted `evidence` from `required`.

The installed AI SDK converts Zod 4 schemas in input mode. A default empty
evidence array therefore made the wire field optional. Evidence is now an
explicit required array, including when it is empty. No quote, price, URL,
company, actor or product validation is relaxed. A regression checks the actual
SDK-produced JSON Schema recursively, including nullable campaign objects and
closed object properties. It fails on the original schema and passes on the fix.

The failed production receipt is retained. It created no customer, booking,
transaction, provider message or campaign execution. Gateway reported no usage
and no charge for the rejected schema. A successful real C response and durable
draft acceptance are still required before marking live activation complete.

Product Learning Sync checked: canonical protocol, index, main checkpoint and
the existing review proposal #88 were read. Entries considered:
`2026-07-16-alyssa-crm-operations-extraction.md`,
`2026-07-26-whatsapp-broadcast-operations-boundary.md`,
`2026-07-28-marketing-command-center-data-source-boundary.md`,
`2026-08-05-shared-cost-kpi-projection.md`,
`2026-08-10-permission-aware-aggregate-brand-scope.md`, and
`2026-11-11-account-owned-report-segments.md`. Only neutral evidence and runtime
acceptance principles are used. No client records, identity, prices, domains,
credentials or implementation are imported.
