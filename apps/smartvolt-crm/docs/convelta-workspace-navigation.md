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

Local type checking, lint, 198 existing unit/PostgreSQL tests and the production
build pass. Three focused navigation/icon tests also pass. Hosted browser gates
and deployment verification are pending for this source candidate.

New browser coverage composes the production shared chrome with actual native
inbox/customer/AI and Flow/BOT/broadcast/POS components in browser-only synthetic
fixtures, at desktop and mobile sizes. It checks stable navigation, exactly one
header, active destinations, real module rendering, overflow and accessibility.
It separately fetches real Next metadata icons and verifies blue image pixels.
No fixture route or authentication bypass is added to the application. These
fixtures do not certify an authenticated live provider or a real booking.

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
