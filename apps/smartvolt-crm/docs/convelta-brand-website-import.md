# Brand website knowledge import

Company managers can open BOT / brand knowledge, enter a public HTTPS website,
scan relevant same-site pages, inspect exact extracted text and explicitly add
selected items as knowledge drafts. Existing approval and expiry rules determine
whether C and staff reply assistance can retrieve them. Scanning never approves
knowledge, changes company identity, sends messages or makes business outcomes.

Cheerio 1.2.0 parses HTML and handles response/meta character encodings;
ipaddr.js 2.5.0 classifies IPv4/IPv6 destinations; robots-parser 3.0.1 interprets
robots rules. These three pinned dependencies have distinct server-only roles.
Existing React, Lucide, namespaced CSS, Zod, PGlite and Playwright cover the UI,
contracts and verification. No external scraping account, model API, credential
or paid subscription is required. This is source extraction, with subsequent
knowledge-grounded AI use; it does not fabricate a generated brand assessment.

The crawler follows prioritized brand/about, services/products, contact/location,
FAQ and policy links, restricted to the same hostname or its www alias. It reads
at most eight pages and 12,000 characters per page. Each 5,000-character knowledge
chunk retains its exact source URL, retrieval timestamp, content hash and visible
truncation flag. Public contact/address/opening-hour facts are extracted from the
HTML and named business metadata. Source information is immutable through manual
article edits. Existing approved knowledge remains unchanged; identical source
chunks are skipped on rescan. Changed content becomes a separate reviewable draft.

The Node transport permits only public HTTPS destinations on the default port.
It checks all DNS answers and pins the actual socket lookup to a checked address,
retaining hostname TLS verification. Redirects repeat destination and robots
checks, remain within the site boundary and stop after three hops. Cookies,
authorization and browser execution are absent. Response type, size, total time,
encoding and page limits are bounded. Scripts/forms/navigation are removed;
website text remains untrusted data. A source cannot issue application commands.

One private RLS table persists scan checkpoints and immutable terminal evidence.
Browser roles have no table or RPC grants. Server and invoker routines require
active manager membership, purchased CRM and a company-owned brand. A leased
single-page worker reads its authoritative checkpoint under the claim lock.
Expired leases can resume, stale results cannot replace newer progress, and
company admission limits bound scan volume. Partial coverage and failed pages
remain visible. Closing the page pauses dispatch after the active page; returning
can resume it. This is not an offline recurring crawler.

Selected server-owned candidates append atomically to the existing workspace
through its audited commit path. A company-wide queue serializes import with
ordinary edits and returns the updated state without discarding pending changes.
Unknown responses freeze the original UUID for reconciliation rather than sending
a fresh import. Revision conflicts, scope changes and the 100-article cap fail
visibly. A manager can edit and approve the new drafts in the usual knowledge UI.

JavaScript-only/login/CAPTCHA content, images/OCR, PDFs, external subdomains and
automatic periodic rescans are outside this bounded website import. The interface
reports unavailable/limited content rather than claiming full-site understanding.

## Acceptance

Local typecheck, lint, production build and 255 unit/database tests pass on the
initial candidate. Focused contracts cover private/mixed DNS answers, redirects,
Chinese extraction, prices, contact fields, text limits, robots, partial coverage,
manager/product/brand authorization, leases, atomic drafts, preserved POS,
idempotent replay, repeat-scan deduplication and browser-denied privileges.
Desktop/mobile acceptance covers source review, draft import, concurrent edits,
unknown-response recovery, accessibility and viewport containment. Hosted exact
source browser and public-website transport acceptance remain release gates.

Local public-domain DNS returns EAI_AGAIN, so it does not establish live crawling.
The hosted gate reads the public Convelta homepage with the production transport
without company records, credentials or knowledge writes. No authenticated Owner
import or customer-data acceptance is claimed by this synthetic/read-only gate.

## Product Learning Sync checked

The canonical protocol, index and main checkpoint were read before implementation.
Relevant entries considered: 2026-07-16-alyssa-crm-operations-extraction,
2026-07-17-alyssa-crm-regression-acceptance,
2026-07-29-connector-readiness-and-identity-boundary,
2026-08-10-permission-aware-aggregate-brand-scope,
2026-11-11-source-linked-work-graph-completeness and
2026-10-06-report-description-density. Retain explicit source scope, freshness,
partial coverage, recoverable checkpoints and truthful readiness. Provider-specific
indexes/spatial workspaces stay outside this feature. No client data, runtime,
identity, prices, domains, tokens, mappings or implementation was imported.
Canonical consumption is recorded through the existing private reviewed proposal.
