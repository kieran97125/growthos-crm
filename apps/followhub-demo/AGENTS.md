## KiesTECH delivery boundary — 2026-11-11

KiesTECH is an independently deployed, customized CRM for one client company per installation. It is **not** the SmartVolt multi-company SaaS. Multiple staff, brands and branches within one client remain valid; do not add SaaS company signup/switching, subscriptions or shared cross-client runtime dependencies without a new user direction.

Product decision and POS reuse boundaries: `../../docs/KIESTECH_CUSTOM_CRM_POS_20261111.md`. SmartVolt's internal POS interaction/domain patterns may inform an optional KiesTECH POS module. Its company Auth, provisioning, SaaS persistence and credentials must not become KiesTECH dependencies. A third-party POS connector requires separate provider evidence and acceptance.

The current app remains a synthetic browser-local demo with no Supabase, real WhatsApp transport or POS connection. Keep these current facts separate from the planned custom delivery architecture. A design/card is not a delivered integration.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
