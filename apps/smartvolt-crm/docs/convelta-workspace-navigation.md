# Company workspace navigation and blue identity

## Product behavior

Authenticated company pages share one persistent company layout, identity header,
account menu and purchased-product switch. CRM keeps the same seven destinations
across the unified inbox, customer directory, Flow Studio, AI assistant, BOT and
knowledge, broadcasts and company settings. Each module owns only its work area.
The three temporary top links and the old company toolbar are removed from this
layout. Save failures retain retry and export recovery actions.

POS remains an independently purchased product with its own operations navigation.
Both products share the identity header, and an explicit product switch carries
the selected customer and brand. Existing leaf/API authorization is retained;
the company layout also checks membership. Isolated public previews retain their
own standalone chrome.

Messenger/Instagram and WhatsApp connection/history pages remain available under
company settings. Daily message handling belongs in the unified inbox. No channel
is represented as connected by this navigation change.

## Icons and cache contract

The canonical mark is blue `#2457e7` with a white C and dot. App metadata and the
web manifest request explicit `blue-c-20261113` icon paths. Browser icons have
rounded corners; installation and Apple icons have full blue backgrounds for
platform masking. The manifest identity/start URL remains unchanged.

The official website receives versioned SVG, 32px PNG and Apple touch links,
plus a conventional `/favicon.ico`. All four existing HTML pages receive those
head links. The current deployed source was compared byte-for-byte with its
source ZIP before editing; inquiry form code, API handlers, packages and hosting
configuration are preserved. A fresh deployment lease is required before publish
to avoid replacing work from another conversation.

## Acceptance

Source `618c79c730d56919d9834bcf8b92fcd34ae78ee1` passes type checking, lint,
all 201 unit/PostgreSQL tests, the production build, all 73 browser tests and four
production cold-load/refresh checks in [CI 43375638079](https://github.com/kieran97125/growthos-crm/actions/runs/43375638079).
The original CRM regression also passes in [CI 43375638120](https://github.com/kieran97125/growthos-crm/actions/runs/43375638120).
Exact desktop/mobile inbox and Flow screenshots and the POS-only screenshot were
visually reviewed. No package or lockfile changes are needed.

New browser coverage composes the production shared chrome with actual native
inbox/customer/AI and Flow/BOT/broadcast/POS components in browser-only synthetic
fixtures, at desktop and mobile sizes. It checks stable navigation, exactly one
header, active destinations, real module rendering, overflow and accessibility.
It separately fetches real Next metadata icons and verifies blue image pixels.
No fixture route or authentication bypass is added to the application. These
fixtures do not certify an authenticated live provider or a real booking.

Production `dpl_4YApfjA4DMFJeyCGnNU2HHdzoGjK` is READY at app.convelta.io from
that exact tested Git source. Live login, manifest, all three versioned PNG icons
and Apple icon return 200. Anonymous inbox/customer/AI-with-company/POS-ledger
APIs return 401; the fixture URL returns 404. The unscoped AI status endpoint
returns only `company_required`, without company data. Initial deployment-scoped
error/fatal scans are empty. The signed-out protected company entry resolves to
the login page; no new authenticated Owner write is claimed.

Official website `dpl_9ecQExn9nD8dosMAqeVCWtUVo9XR` is READY at convelta.io.
All four pages advertise the new versioned SVG/PNG/Apple URLs; all icons and the
ICO fallback return 200. The inquiry form remains in live HTML, the admin API
remains 401 anonymously, seven existing intake tests pass, and original API/form
source hashes are retained in the deployment. The complete source ZIP was updated
in place with a cache-contract release note. Website error/fatal scan is empty.

## Product Learning

Product Learning Sync checked: canonical protocol, index and checkpoint, plus
`2026-08-10-platform-app-identity-icon-contract.md`,
`2026-07-29-connector-readiness-and-identity-boundary.md`, and
`2026-08-10-permission-aware-aggregate-brand-scope.md`.
Adopt only platform icon delivery, explicit connector readiness and permission
aware company/product scope. No client data, identities, domains, prices or
credentials are imported. Canonical checkpoint review remains in draft PR #88.

The company system card `workspace-navigation-identity` tracks this release;
existing provider, catalog and live acceptance cards remain independent.
