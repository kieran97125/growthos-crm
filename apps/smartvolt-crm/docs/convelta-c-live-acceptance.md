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
and no charge for the rejected schema. Authenticated production acceptance is recorded below.

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

## Accepted production result

Runtime `4c92426d42aae8c0dc0c4d7e0ffdc9fd5a560941` is READY as
`dpl_852axnimDSYoySjUXQvMKRy6SQ9X` at https://app.convelta.io. Both source
workflows pass: [Convelta](https://github.com/kieran97125/growthos-crm/actions/runs/43408816470)
and [original CRM](https://github.com/kieran97125/growthos-crm/actions/runs/43408816391).
The exact runtime passes typecheck, lint, build, 221 unit/PostgreSQL checks,
83 browser checks and four production initial-paint/refresh checks.

The actual Owner request completed at 18:27:41 HKT on 2026-11-13, using
5,914 input and 2,071 output tokens. It produced a business demonstration plan
with 11 verified facts, including four approved company knowledge articles.
A second campaign request and a configuration-only follow-up also completed.
The configuration answer cites the actual saved Flow and BOT facts. Eight quoted
passages across the two campaign answers were independently rechecked against
the approved articles and all match exactly. Both internal briefs remain drafts;
the native saved-brief view and database independently confirm persistence.
No provider message, booking, transaction or customer record was created by acceptance.

Native navigation from C to the customer directory and its C side panel
preserved an unsent composer. The temporary test text was cleared. The final
saved-brief screen was visually checked. The initial production error/fatal scan
is empty. Company system cards record C and navigation as complete; offline
observations, populated-company latency, real channel/customer acceptance and
round-two journeys remain separate pending work. Canonical checkpoint evidence
is retained in the existing private review proposal #88.

The same thread was also checked through native Flow navigation: both the
conversation and an unsent composer survived opening C beside the real editor.
After clearing the test input and refreshing the AI page, the saved
`IG／FB 查詢管理產品示範` brief could be opened again from activity history.

One mixed configuration/knowledge answer was rejected by evidence validation;
it was not accepted as an assistant answer or used for any action. The focused
configuration follow-up then succeeded without relaxing validation. The
`copilot-answer-quality` card tracks evaluation, clearer safe diagnostics,
known usage retention on rejected answers, and bounded repair design. Null token
fields on a rejected answer do not establish zero provider cost. C is not
represented as infallible or an offline autonomous operator.
