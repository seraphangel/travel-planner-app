# Agentic Layer — Travel Planner App

## Risk Levels & Actions

### Low Risk — Auto-executed
- `generate_recommendations` — call OpenAI, parse JSON, write to `plan_recommendations`
- `generate_itinerary` — call OpenAI, parse JSON, write to `itinerary_days`
- `tag_recommendation_category` — classify free text into 6 categories
- `score_recommendation_confidence` — assign 0–1 confidence per item

### Medium Risk — Created, user confirms before applying
- `regenerate_itinerary_day` — user requests a day to be rewritten; draft shown before save
- `update_plan_status` — move plan from `draft` to `published`

### High Risk — Always requires explicit approval
- `initiate_checkout` — creates a Stripe session and redirects user (involves charge)
  - Logged: `action = 'checkout.initiated'`, `risk_level = 'high'`
- `unlock_plan` — sets `is_unlocked = true` after webhook confirms payment
  - Logged: `action = 'plan.unlocked'`, `risk_level = 'high'`

### Critical — Human only
- Issue refunds (Stripe dashboard only, no app-side refund action in v1)
- Delete a user account or all their plans
- Any legal or data-removal requests (GDPR)

## Named Tools (v1)
- `openai_chat_completion` — structured prompt → JSON plan
- `stripe_create_checkout_session` — server-side only
- `stripe_verify_webhook` — validates Stripe signature before any DB write
- `supabase_db_write` — all DB mutations via server API routes

## Audit Log Fields
`action`, `entity_type`, `entity_id`, `user_id`, `detail (jsonb)`, `risk_level`, `created_at`

## v1 vs Later
| v1 | Later |
|---|---|
| Single OpenAI call, no web search | Agent with Tavily search for live data |
| No booking actions | Amadeus flight booking (critical risk, human approval) |
| Manual review of low-confidence items | Auto-flag queue for admin review |
