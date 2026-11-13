# Convelta inbox translation

Product Learning Sync checked (2026-11-14 HKT). Considered canonical entries
`2026-07-29-connector-readiness-and-identity-boundary.md` and
`2026-10-06-optional-operator-settings.md`: visible capability errors, server-side
scope checks and compact optional actions. This is an original Convelta
implementation; no pilot data, provider identities or client code was imported.

## Operator experience

- Incoming text shows a local Chinese / English / mixed-language indicator and
  two compact translation actions. Original text stays visible; the translation
  can be collapsed. Attachments are not described as translated.
- Reply composers translate to Hong Kong Traditional Chinese or English. Applying
  a completed translation retains an undo action. A changed draft, disabled
  composer or excessive channel length shows the result separately instead of
  silently replacing the latest text. Switching threads unmounts the action.
- The unified inbox, WhatsApp inbox, Meta inbox and local conversation UI share
  the same components. AI-generated reply drafts can also be translated before
  copying or inserting. Public demo controls explain that sign-in is required.
- Only an explicit existing send action sends a customer message. Translation
  has no provider dispatch integration and does not alter customer, booking,
  lifecycle, POS or brand knowledge records.

## Server and data boundaries

`POST /api/translate` enforces origin, streaming body size, a strict request
schema, authenticated active CRM membership and a writer role. Incoming content
is resolved in SQL by company, brand, channel, thread and exact incoming message
ID. The browser cannot submit replacement incoming text. Studio mode accepts
only a staff-authored draft in a valid company brand.

The existing AI SDK and configured AI Gateway model provide on-demand semantic
translation, without another dependency or credential. Text is untrusted data,
not an instruction. URLs, email addresses and numeric tokens are masked, restored
exactly once and verified; missing, duplicated or newly introduced protected
content fails closed. Names, tone and uncertainty are preserved by the prompt;
semantic fidelity still depends on the model and users can edit drafts.

`sv_ai_requests.feature='translation'` shares the existing company HKT daily
quota and active-request lock with replies and C. Receipts capture model, actor,
product, source, target, source hash, tokens and terminal outcome. They are
immutable and service-only. Raw draft input is not duplicated in receipt
metadata. Identical actor-owned translations share a running reservation or
completed result. Network loss reuses the same UUID. A stale running request
becomes an interrupted receipt after 90 seconds; a further explicit retry may
start a new request. The model call has no automatic retry and a 35-second
limit inside a 60-second route.

Unrelated thread or workspace activity does not invalidate a source translation.
Changed original text, revoked scope or owner suspension prevents a result from
being applied. Reply and translation completion functions cannot finish each
other's receipts.

## Verification

Installed migration: `20261113202249_convelta_inbox_translation.sql`; source and database SQL MD5 `871cb99b05417f3da34748b1df20b617`.

- Local typecheck, lint, full unit/database suite and production build.
- Focused desktop/mobile browser acceptance: inline originals and translations,
  accessibility, draft undo, typing race, thread switch, response loss, quota,
  channel size and viewer restrictions.
- Full existing browser regression and initial paint gates.
- Native PostgreSQL concurrent translation deduplication and final shared quota
  reservation, alongside existing routing concurrency checks.
- Release deployment, installed SQL checksum and authenticated real model
  translation readback are recorded below after acceptance.

Real external channel receive/send acceptance remains on its existing channel
cards; these translation checks do not declare those connections operational.
