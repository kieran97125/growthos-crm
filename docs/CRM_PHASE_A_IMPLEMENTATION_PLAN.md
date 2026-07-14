# CRM Phase A — Conversation Workflow Foundation

## Goal

Bring the safest and most useful Alyssa CRM conversation workflow into standalone Growth OS CRM without enabling real WhatsApp sending, external AI, or schema changes.

## Deliverables

1. Conversation-first lead detail layout
2. Conversation panel using existing internal CRM interactions
3. Editable reply composer
4. Quick Reply insertion
5. Local/rule-based AI Assist draft insertion
6. Manual WhatsApp open action
7. Disabled future send button with clear safety copy
8. Existing booking/contact/outcome actions preserved
9. Existing CRM write feature flag preserved

## Non-goals

- No Meta WhatsApp Cloud API
- No webhook endpoint
- No send-message endpoint
- No external AI API
- No auto-send
- No migrations
- No `.env` changes
- No raw source snapshot payload display

## Acceptance criteria

- Lead detail feels conversation-first rather than form-detail-first
- Quick Replies and AI Assist both write into the same editable composer
- Composer content can be copied or used to open manual WhatsApp
- Send remains visibly disabled
- Existing read-only mode and action guards remain intact
- Build passes
