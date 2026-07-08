# Wayfare — AI Travel Planner

Enter a destination, dates, budget and purpose; Wayfare researches the
destination (places, food, hotels, flights, transport, safety), builds a
day-by-day itinerary, and stores it as a shareable plan. Day 1 is a free
preview; a one-time $19 Stripe payment unlocks the full plan.

Product docs live in [`/docs`](docs) — PRD, architecture, data model, tasks,
test plan.

## Stack

Next.js 15 (App Router) · Supabase (Postgres + Auth + RLS) · Stripe Checkout ·
OpenAI GPT-4o (optional, with a built-in template fallback) · Tailwind v4 ·
Vercel.

## Local setup (<10 minutes)

```bash
npm install
npx vercel link --yes --project travel-planner-app
npx vercel env pull .env.local
npm run dev          # http://localhost:3000
```

The Supabase schema + seed data are in `supabase/migrations/0001_init.sql`
(already applied to the provisioned project). Schema changes go in NEW
numbered migration files — never edit `0001`.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ (set) | Database + auth |
| `NEXT_PUBLIC_APP_URL` | ✅ (set) | Absolute URLs for Stripe redirects |
| `STRIPE_SECRET_KEY` | for payments | Creates $19 Checkout sessions |
| `STRIPE_WEBHOOK_SECRET` | for payments | Verifies `/api/webhooks/stripe` |
| `OPENAI_API_KEY` | optional | Real AI generation (`gpt-4o`); without it a deterministic template engine is used and items carry a "verify before booking" flag |
| `OPENAI_MODEL` | optional | Override the model (default `gpt-4o`) |
| `SUPABASE_SERVICE_ROLE_KEY` | before RLS lockdown | Webhook/admin DB access that bypasses RLS |
| `ADMIN_EMAILS` | optional | Comma-separated emails allowed on `/admin` |
| `RESEND_API_KEY` / `RECEIPT_FROM_EMAIL` | optional | Payment receipt emails |

Add server-side vars with `npx vercel env add NAME production` (and
`preview`/`development`), then redeploy.

### Enabling payments

1. Add `STRIPE_SECRET_KEY` (test key is fine) to Vercel env.
2. In the Stripe dashboard create a webhook endpoint for
   `https://<your-domain>/api/webhooks/stripe` with the
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired` events,
   and add its signing secret as `STRIPE_WEBHOOK_SECRET`.
3. Local dev: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.

The success-URL path also verifies the session directly with Stripe, so
unlocks work even before the webhook is configured.

### RLS lockdown (Sprint 3 migration)

`supabase/migrations/0002_lockdown_rls.sql` replaces the permissive demo
policies with owner-scoped ones (`auth.uid() = user_id`) and adds the
`is_demo` flag. Apply it in the Supabase SQL editor **only after**
`SUPABASE_SERVICE_ROLE_KEY` is set in Vercel — see the header comment in the
file.

## Deploying

Deploy by git only: `git push` to `main` → Vercel auto-deploys. Never run
`vercel deploy` with local files.

## Testing

Follow `docs/TEST_PLAN.md`. Quick smoke test: homepage shows 3 demo plans →
open one → all 6 categories + itinerary render → sign up → create a plan →
day 1 visible, rest locked → Unlock (Stripe test card `4242 4242 4242 4242`)
→ full plan visible, `travel_plans.is_unlocked = true`, `subscriptions.status
= 'paid'`, audit rows `plan.created` / `checkout.initiated` / `plan.unlocked`.
