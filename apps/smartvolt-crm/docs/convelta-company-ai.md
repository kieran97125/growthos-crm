# Company-grounded AI connection

The user explicitly requested a working AI connection, independently of Meta channel review. This phase implements a live staff assistant: server-owned knowledge and conversation context → structured model answer → checked citations → editable reply draft, summary, tentative intent and next action. Only the existing manual provider send operation transmits customer messages.

## Entry points and data ownership

`/company/[companyId]/crm/ai` is an authenticated company AI workroom with an independent test query, knowledge inventory, actual verification state and Hong Kong daily usage. The main product toolbar and AI settings link to it. The social inbox includes the same assistant beside the thread's operational handover. The existing AI BOT lab and conversation assistant call the company service.

The API accepts only company/brand identity, a request UUID and a playground message or stored conversation/thread reference. It does not accept caller-supplied knowledge, bot policy, actor, transcript or recipient. The server checks active company membership and CRM access; viewers cannot spend model usage. Only the company Owner can enable or pause AI. Model choice is server configuration, never a browser field.

Knowledge remains in the existing company workspace and knowledge editor. Retrieval admits only the same company and brand, approved status and an actual, non-expired calendar date. Complete articles are selected within a 16,000-character budget. Conversation history is bounded and excludes internal notes. Only the selected facts, customer text/name and reply preferences reach the model; the full company payload, phones, tokens and private identifiers are not sent.

## Model and answer contract

The live catalog checked on 2026-11-12 confirms `openai/gpt-5.4-mini`, structured output, reasoning controls and OpenAI/Azure endpoints reporting zero data retention and no training. Existing AI SDK 7.0.166 calls it through Vercel AI Gateway with Vercel OIDC; no new key or provider dependency is created. The model is selected for conversational latency and structured drafts. SDK retries are zero, generation has a 35-second deadline and 3,200-token output bound. Provider routing is limited to the verified OpenAI/Azure endpoints.

The model must provide exact source quotes and source IDs. The application checks those quotes against the selected knowledge, source revision, price evidence, links, human-handoff requests, allowed topics and booking-confirmation language. Missing or invalid evidence yields a human handoff. Live output always remains a staff draft, including when a configured bot mode is bounded/after-hours. Intent is explicitly a tentative AI judgment. Knowledge/conversation changes during generation discard the stale draft.

## Durable usage and replay

Additive migration `20261112143002_convelta_company_ai` installs company settings, platform verification state and request receipts. It was created with the Supabase CLI; the original file was aligned to the authoritative hosted version without changing SQL bytes. All tables use RLS and explicit service-only privileges, including revocation of hosted default ALL grants. Browser table/RPC access, service DELETE and TRUNCATE are denied. RPCs are security invoker with an empty search path.

The database revalidates active membership, CRM entitlement, company/brand/source identity and source revisions under locks. Each request UUID can dispatch once; actor and context hashes must match on replay. Terminal receipts are immutable. Quota admission serializes at company scope and counts failed/ambiguous admitted requests conservatively. The initial company allowance is 30 requests per Hong Kong day; only the operator changes that limit. Unknown token usage stays null. Client input is locked while a test request is unresolved, and retries reconcile the same UUID rather than silently generating again. No automatic credit purchase or top-up is enabled.

## Explicit live verification

`npm run ai:verify` is an operator-only smoke command, separate from normal build and CI. A basic deployment probe sends only public synthetic text. With the protected `SMARTVOLT_AI_VERIFICATION_COMPANY_ID` configuration, it instead validates the explicitly selected company, reads approved knowledge, claims a synthetic playground request, calls the actual model, checks evidence and persists its terminal receipt. It never creates a customer or sends a provider message. Only successful grounded verification marks platform status ready; failures persist an actionable category. Filtered diagnostics redact credentials and URLs.

The initial cloud probe exposed a package-module mismatch in the smoke script; it was corrected to an async entry point. The next actual provider call did not succeed and was classified as unavailable; the final staged verification includes filtered diagnostic categories. Deployment readiness alone is not a successful AI-connection claim. Gateway usage reporting returned HTTP 403 and no local authenticated Vercel CLI exists, so billing-report access was not assumed or broadened.

The Convelta company receives five approved articles based on its current public website: services, custom integration, AI assistance, quotation/demo inquiries and channel activation. They are installed through the existing revision-checked workspace command, not a raw payload overwrite. No prices, offers or channel approvals are invented. Its customer/message collections remain empty; the connection check is explicitly a playground request.

## Validation and remaining scope

Local unit/database checks cover authority injection, cross-tenant scope, role/product restrictions, expired knowledge, exact evidence, invented prices/links/bookings, native AI SDK structured output, immutable receipts, replay, revision changes, concurrent quota admission and Hong Kong day boundaries. Browser-only fixtures exercise the real workroom on desktop/mobile, accessibility, no overflow, lost-response reconciliation, locked inputs, billing feedback and viewer restrictions. Fixtures contain no credentials and make no provider request.

No package was added: installed AI SDK, Supabase, Zod, Lucide, PGlite, Playwright, axe and Next tooling are used. Channel authorization and actual inbound/outbound acceptance remain tracked separately. Automatic replies and tool actions are not activated by this phase.

Product Learning Sync checked: canonical private protocol, index and checkpoint were read. Considered `entries/2026-07-16-alyssa-crm-operations-extraction.md` (neutral CRM context/ownership), `entries/2026-07-26-whatsapp-broadcast-operations-boundary.md` (independent execution and consent boundary) and `entries/2026-07-29-connector-readiness-and-identity-boundary.md` (truthful readiness and server authorization). Only those neutral principles are adopted; no Alyssa runtime, client identity, records, prices, domains, tokens or legal information is imported. The canonical review checkpoint is updated through existing draft PR #88.

## Verified model-access blocker

The staged diagnostic returned HTTP 403 from AI Gateway: the team's free tier does not have access to the selected model and purchased credits are required. This is distinct from a missing API key, an empty balance or Meta verification. The service exposes `paid_credits_required` with an actionable message, never a simulated answer. No credits, subscription, auto-top-up, paid data control or broader connector permission was purchased/enabled. A later successful staff request records real readiness automatically after funding.

The first complete integration candidate passed CI type/lint/build, 184 unit/database checks and all 63 browser checks. The explicit provider-access response remains the authoritative activation state until a successful live grounded request is observed.

## Post-funding commissioning

The account owner completed the one-time purchase. The cloud dashboard then showed $15 credit. The first company probe stopped before dispatch because this specially provisioned workspace had approved articles but no brand assistant or flow. An original assist-mode brand profile and unpublished inquiry → grounded draft → staff-review flow were added through the revision-checked workspace command (revision 2 → 3). The complete document passes the application's real schema; its five articles and empty customer/message collections are preserved. No demo/customer history or published automation was introduced.

The subsequent actual model request was independently observed in Gateway Logs: OpenAI, HTTP 200, 1,284 input tokens, 647 billed output/reasoning tokens, 5.17 seconds. Application answer verification still rejected that result, so deployment success and a successful provider response were not claimed as a usable grounded draft. Internal validation now reports category-only reasons (model handoff, low confidence, quote/source mismatch and policy checks) without logging the customer's text or raw model output. The operator probe preserves known token counts even when answer checks fail and uses a distinct `answer_verification_failed` state. The structured-output schema explicitly requires exact source IDs and unchanged continuous quotes. All existing quote, price, booking, topic and human-handoff rules remain in force.

Product Learning Sync checked again before this commissioning release: the canonical protocol, index, checkpoint and the same three entries listed above were read fresh. The reviewed checkpoint and private system card retain the actual live acceptance outcome.
