# Architecture — Travel Planner App

## Stack
- **Frontend:** Next.js 14 (App Router) on Vercel
- **Database + Auth:** Supabase (Postgres + RLS + Supabase Auth)
- **AI:** OpenAI GPT-4o via server-side API route (key never in client)
- **Payments:** Stripe Checkout + Webhooks
- **Email:** Resend (transactional receipts)

## What to Build Now vs Later
| Now | Later |
|---|---|
| Destination research + itinerary generation | Flight/hotel booking APIs |
| One-time plan unlock payment | Recurring subscription tier |
| Auth + plan ownership | Group trip planning |
| Public plan viewer | Mobile app, PDF export |

## Key User Action — Step by Step
1. **User fills form** (destination, origin, dates, budget, purpose) → POST to `/api/plans/create`
2. **Server calls OpenAI** with structured prompt → receives JSON with 6 recommendation categories + daily itinerary
3. **Server writes to DB:** inserts `travel_plan`, `plan_recommendations` (each with `source`, `confidence`, `review_status`), `itinerary_days`
4. **Redirect to** `/plans/[id]` — day 1 visible; remaining days blurred with "Unlock" CTA
5. **User clicks Unlock** → POST to `/api/checkout` → Stripe Checkout session created → user pays
6. **Stripe webhook** hits `/api/webhooks/stripe` → verifies signature → sets `travel_plans.is_unlocked = true` + inserts `subscription` row
7. **Plan page refreshes** — full itinerary now visible

## Layer Plan
1. **Data first:** All tables, constraints, RLS policies — truth lives in Postgres
2. **App logic:** Form → API routes → DB reads/writes — core works without AI (falls back to empty recommendations)
3. **Intelligence on top:** OpenAI call enriches the plan; if it fails, user sees an error and can retry — the plan record still exists
