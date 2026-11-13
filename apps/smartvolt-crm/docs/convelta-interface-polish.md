# Convelta floating C and interface finish

The user asked for an actual floating C entry, a more distinctive professional
interface and substantially less explanatory copy. The company-level C provider
now owns one fixed circular launcher outside the header and page content. It
opens a floating companion panel; the product logo resumes normal navigation.
The panel preserves the existing company/actor/product conversation and unsent
composer across module navigation. Escape closes it and restores launcher focus.
CRM mobile navigation and POS checkout have separate clearance. The mobile full
workroom composer also reserves the launcher's space.

C now uses a sculpted blue mark, segmented directions, concise numbered prompt
cards, refined history, source disclosures and an anchored composer. A company
without actionable observations has no permanently empty third column. Source
details remain available on demand. Setup observations state the empty condition
without inventing conversion data. App-wide navigation, primary and secondary
controls share a blue/ink visual system; Inbox, Customers, Flow, BOT, Broadcast and
reply testing retain task names and remove redundant feature pitches.

Normal AI answers default to three short paragraphs / 220 Chinese characters,
with one useful follow-up at most. Campaign introductions stay below 100 Chinese
characters and avoid repeating the structured plan. This changes instructions,
not the validated output schema, evidence requirements or action permissions.
Errors, operational states, confirmations and source quotations remain visible
where needed. No schema, model, purchased access or provider activation changes.

## Tooling and verification

Existing React, Lucide, Streamdown and namespaced CSS cover the work without an
additional UI library. Installed Next lazy-loading documentation was checked;
the common C surface stays lazy while complete styles remain render blocking.
The React accessibility, component and TypeScript checklist was reviewed.

Local typecheck, lint, 221 unit/PostgreSQL tests and production build pass. Browser
acceptance verifies one fixed launcher outside the header on each CRM module and
POS, desktop/mobile edge clearance, an in-viewport companion composer, unsent
cross-page memory and Escape focus restoration. It captures welcome, floating
panel, campaign, Inbox, Flow and POS states, with existing accessibility, source,
tag-confirmation, quota/replay and first-paint checks retained. Hosted browser
results and exact deployment are recorded after acceptance; local Chromium is
unavailable because this host denies its socket setup.

## Product Learning Sync checked

The canonical protocol, learning index, checkpoint and relevant entries were
read before implementation:

- `entries/2026-07-16-alyssa-crm-operations-extraction.md`: adopted neutral shared
  workflow continuity and task-focused operations.
- `entries/2026-08-10-platform-app-identity-icon-contract.md`: adopted consistent
  application identity; kept the branded logo distinct from the floating tool.
- `entries/2026-08-10-permission-aware-aggregate-brand-scope.md`: retained real
  company/product/brand scope while simplifying presentation.
- `entries/2026-09-01-app-owned-destructive-action-lifecycle.md`: retained existing
  explicit confirmation and app-owned mutation flow; no destructive work added.

No client identity, data, prices, tokens or runtime were imported. The canonical
checkpoint is updated through the existing reviewed draft PR #88. Company system
card `convelta-interface-polish` tracks implementation and release acceptance.

## Released runtime — 2026-11-13

Source `3ee3b55caa253466ffa8a6b2ff6dbe49bf30cecb` is READY as production
`dpl_BAmQk9B6yjUeRAxE6L1WjyGq79r7`, aliased to https://app.convelta.io.
The source tree was published through the connected GitHub API and its tree SHA
was checked against the frozen local commit. No unrelated working files changed.

The expanded welcome/panel accessibility checks caught inactive category text
at 4.43:1 against its tinted background. Its text is now darker; the checks remain
required. Mobile acceptance also requires the entire third shortcut to be in
view, and screenshot capture waits for the opening transition to settle.

Production reads confirmed the fixed launcher, full-height compact panel,
readable prompt numbers and ink navigation in the actual delivered stylesheet.
Login returns 200, anonymous C/inbox/AI reads 401, foreign-origin C mutation 403
and a non-shipped fixture URL 404. A valid same-origin anonymous command returns
401; an invalid empty command returns 400 before authorization, as designed.
Initial deployment-scoped error/fatal logs are empty. The connected local-browser
inspection timed out; this release uses hosted exact-source component screenshots
and interaction checks plus direct production asset/boundary verification. It
does not claim another authenticated Owner/model-write acceptance.

Final runtime `052922f6931a8e53de7e9aee5b8b8172414cfb19` also preserves legacy
destructive-action colors by excluding those controls from neutral secondary
button styling. It is READY as `dpl_FcXd1yXHdMQ9x8c7bydKvyVRgfDC` at the same
production origin, with the exclusions verified in the actual stylesheet and
an empty deployment-scoped error/fatal scan.

[Final Convelta CI](https://github.com/kieran97125/growthos-crm/actions/runs/43419403377)
passes typecheck, lint, 221 unit/PostgreSQL tests, production build, all 84 browser
checks and four production cold-load/refresh checks.
[Original CRM regression](https://github.com/kieran97125/growthos-crm/actions/runs/43419403372)
also passes. Welcome and floating-panel checks cover desktop/mobile contrast,
the entire third shortcut, composer visibility, fixed positioning, cross-page
unsent content and Escape focus restoration. Hosted screenshots were visually
reviewed. The company interface card is complete; existing offline observations,
production performance measurement and channel/journey execution cards retain
their separate status.

## Draggable companion correction

The user clarified that a floating C must move to a chosen position. Pointer
capture now supports mouse, pen and touch dragging, with separate movement
thresholds and suppression of the drag's generated click. A cancelled gesture
returns to its starting position. Ordinary click/tap, Enter and Space keep their
existing open/close behavior. Arrow keys move C, Shift increases the step, and
Home restores the default. Dragging suppresses proactive interruptions.

Coordinates are bounded by the visible viewport, safe areas, company header,
mobile navigation and POS footer clearance. Positions stay free in the interior
and gently snap near an edge. Versioned local preferences contain only normalized
coordinates, scoped by company, actor and desktop/mobile layout; no operational
record or model memory is changed. Reload and module navigation retain placement.
Rotation and the visual viewport reproject coordinates without overwriting the
other layout's preference. Storage failure preserves usable dragging.

The companion follows the selected side, with desktop side placement where space
allows and a readable mobile panel. Moving C away from the mobile workroom
composer returns the reserved input space. Drag frames update presentation styles
through animation frames without per-frame React/business-context state. Existing
React and native Pointer Events cover this focused control; an additional drag
library would add no required capability.

Five geometry/persistence tests cover bounds, normalization, corrupt preferences,
edge behavior and companion fit. Browser checks add actual mouse and emulated
touch dragging, cancellation, click separation, reload/navigation retention,
keyboard reset, orientation changes and screenshots. Existing C evidence/action,
accessibility and initial-paint checks remain required. This is emulated touch
acceptance, not a claim of physical iPhone/Safari qualification.

Product Learning Sync checked again against the canonical protocol, learning
index and checkpoint. `entries/2026-11-10-spatial-work-graph-readability.md` was
considered for bounded coordinates, click-through prevention, keyboard access and
presentation updates; its spatial graph remains an Enterprise Extension and is
not adopted into Core. `entries/2026-08-10-platform-app-identity-icon-contract.md`
retains the existing Convelta identity contract. No graph code, client identity,
data, credentials or artwork is imported. Existing canonical review PR #88 and
company card `c-draggable-placement` track this correction.

Hosted touch acceptance exposed two real interaction defects before release:
a half-pixel coordinate could restore one CSS pixel away, and a tap immediately
after a captured drag could lose the browser's compatibility click. Persistence
now normalizes displayed pixels, with 50 consecutive save/restore round trips
covered. Captured pointer completion explicitly activates an in-bounds tap,
suppresses compatibility clicks and retains native keyboard activation. The
original assertions remain in place, including the moved control's hit target;
synthetic-only pointer event receipts accompany touch acceptance.


### Drag correction release acceptance — 2026-11-13

Runtime `fb21d79b96230973a4131ccc909ae4cb7ca21fae` is READY as production
`dpl_AMgESoE8TduxsHnumDPXrdz4WfmB` at https://app.convelta.io. Exact-source
[Convelta CI](https://github.com/kieran97125/growthos-crm/actions/runs/43428458789)
passes typecheck, lint, 226 unit/PostgreSQL tests, production build, all 86 browser
checks and four production load/refresh checks. The
[original CRM regression](https://github.com/kieran97125/growthos-crm/actions/runs/43428458904)
also passes. Desktop/mobile repositioned-C screenshots were visually reviewed
from the accepted artifact (SHA-256
`a923c640b9284efa23bbf607e12579825e98c44c2250ded2cb06099cccde4bd1`).
The original touch hit-target and immediate post-drag tap assertions pass.

Actual production styles include bounded, touch-enabled positioning, drag
feedback and responsive companion placement. Login returns 200, the private C
read returns 401 and the unshipped acceptance fixture returns 404. Initial
production deployment error/fatal logs are empty. Hosted acceptance uses synthetic
data; it does not claim another authenticated model or business-record write.
Company card `c-draggable-placement` is complete, and the learning checkpoint
correction remains reviewable in canonical draft PR #88.
