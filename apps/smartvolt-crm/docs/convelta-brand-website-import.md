# Brand website FAQ

The brand knowledge workspace opens directly to a single-column FAQ library.
Managers paste a website and scan once; completed source-backed questions and
answers are saved and available to C immediately. No preview selection, draft
import or per-article approval step remains. Clicking a question opens its answer;
editing asks only for the question and answer. Search and manual FAQ creation
share the same screen. Infrequent source/date/truncation detail appears on demand.
BOT settings and the conversation playground remain in the separate settings tab.

## Source extraction and publication

Cheerio 1.2.0, ipaddr.js 2.5.0 and robots-parser 3.0.1 retain their existing roles.
No new dependency, scraping account, model credential or paid generation call is
needed. FAQPage metadata, semantic question/heading sections and discovered
contact/address/opening-hour facts produce bounded questions with source answers.
Presentation question labels never create business facts. Answers preserve source
text, prices and qualifications; source scripts are never executed. Unreadable
pages fail visibly, rather than creating plausible answers. Long answers split at
bounded text sections and retain truncation detail.

The public HTTPS transport still validates every DNS answer, pins socket lookup,
retains hostname TLS, rechecks same-site redirects and obeys robots rules. It sends
no cookies or authorization. Limits remain eight pages, 12,000 source characters
per page and bounded response/time budgets; at most 60 FAQ candidates are saved
per scan and the company knowledge store retains its 100-article limit. Login,
interactive-only content, PDF/OCR and periodic background scans remain outside
this website extractor.

## Saved state and update behavior

A private service-only RLS table checkpoints leased scan steps. Returning to an
unfinished FAQ scan resumes it; a completed FAQ scan publishes automatically.
Legacy raw-page previews are kept intact until a new scan is requested. The
company mutation queue serializes publication with ordinary edits. The scan UUID
is the publication command UUID; same-store duplicate requests share a promise,
and lost HTTP responses reconcile the same command without duplicate publication.

Existing saved website sources can be reprocessed into the new FAQ format without
refetching. Such jobs retain their original page retrieval dates and a derivedFrom
source-job identifier; they do not claim a fresh website crawl. They use the same
manager-scoped lease, atomic publication and immutable receipt path.

Server-owned FAQ candidates are published atomically through the existing audited
workspace path. Existing manager membership, purchased CRM and brand scope checks
remain. All new FAQ records are usable immediately and have no automatic expiry;
source retrieval dates stay visible in details. Internal legacy status fields are
retained for compatibility with existing retrieval and disabled knowledge.

A stable URL/question source key updates the same unedited FAQ when website text
changes, preserving the article identity. Staff-modified questions or answers are
compared with immutable earlier scan candidates and retained on rescan. Identical
source content is skipped. Untouched legacy page dumps are replaced only when
the same source URL actually has new FAQ coverage; manually edited legacy records
survive. Existing source snapshots and terminal import receipts stay immutable.
No customer, booking, payment, outbound message or automation is created by scans.

## Acceptance

Local source/parser and PostgreSQL coverage verifies exact multilingual FAQ
answers, contact facts without invented hours, destination/robots boundaries,
manager/product/brand isolation, leases, immediate availability, atomic POS
preservation, unknown-response replay, source refresh with stable identity,
manual edit retention and legacy source preservation. Desktop/mobile acceptance
covers one-click publication, question expansion, source links, two-field edits,
concurrent ordinary changes, reload persistence, resumed publication, visible
source failure, accessibility and viewport containment. The public-site smoke
reads the real public Convelta website without writing company records. Hosted
exact-source browser/build gates and production acceptance are release gates;
final evidence is recorded in PR #7 and the company release/FAQ system cards.

## Product Learning Sync checked

Canonical protocol, index and checkpoint were read before implementation.
Entries considered: 2026-10-06-report-description-density,
2026-10-06-optional-operator-settings and
2026-11-11-source-linked-work-graph-completeness. Adopt neutral task-focused
presentation, optional source detail and durable source-aware updates. The user's
current instruction explicitly supersedes the earlier approval UX. Provider
indexes and spatial workspace implementation remain outside this feature. No
client identity, implementation, runtime, data, prices, domains or credentials
were imported. Consumption is recorded in the existing private review proposal.
