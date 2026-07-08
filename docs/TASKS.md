# Tasks — Travel Planner App

## Gantt Overview
```
Sprint 1 (Days 1-2): DB + seed + research engine + plan viewer
Sprint 2 (Days 3-4): Plan creation form + payment + v1 functional ✅
Sprint 3 (Days 5-6): Auth + lock-down RLS
Sprint 4 (Day 7):    Admin, polish, deploy
```

---

## Sprint 1 — DB, Seed Data & Core Engine
**Goal:** Database live, demo plans visible to anonymous visitors, research engine working end-to-end.

- [ ] Run migration SQL in Supabase (all tables + RLS v1 policies)
- [ ] Verify seed data appears in Supabase table editor
- [ ] Build `/plans/[id]` page — renders all 6 recommendation categories + itinerary days from DB
- [ ] All 5 states: loading skeleton, empty (no recommendations yet), partial (some categories), error banner, ready
- [ ] Build `POST /api/plans/generate` — calls OpenAI, parses structured JSON, writes to `plan_recommendations` + `itinerary_days`
- [ ] Homepage `/` — lists 3 demo plans with destination, duration, purpose; search/create CTA
- [ ] Test: visit `/plans/[seed-id]` anonymously → full plan renders without login

**Definition of Done:** Three demo plans render at `/plans/[id]` for anonymous visitors. The generate API creates a new plan with real DB rows. No login wall.

---

## Sprint 2 — Plan Creation Form + Stripe Payment ✅ v1 functional
**Goal:** A user can create a plan, see a preview, pay, and view the full unlocked plan.

- [ ] Build plan creation form: destination, origin country, start/end dates, budget range, trip purpose
- [ ] Form submits → `POST /api/plans/create` → generates plan → redirects to `/plans/[id]`
- [ ] `/plans/[id]` preview mode: day 1 visible, days 2+ blurred with "Unlock Full Plan" button
- [ ] `POST /api/checkout` — creates Stripe Checkout session for plan unlock ($19 one-time)
- [ ] `/api/webhooks/stripe` — verifies Stripe signature, sets `is_unlocked = true`, inserts `subscription` row, writes audit log
- [ ] Post-payment: plan page auto-refreshes, all days visible
- [ ] Error states: payment failed banner, webhook retry handling
- [ ] Test end-to-end: create plan → preview → pay (Stripe test card) → full plan visible → DB row confirms `is_unlocked = true`

**Definition of Done:** Full success scenario in PRD passes with a Stripe test card. Data persists across browser sessions.

---

## Sprint 3 — Auth + Lock It Down
**Goal:** Users own their plans; data isolated by owner.

- [ ] Enable Supabase Auth (email/password + Google OAuth)
- [ ] Sign-up and login pages; post-auth redirect
- [ ] Set `user_id` on `travel_plans` and `subscriptions` at creation time
- [ ] Replace v1 RLS policies with `auth.uid() = user_id` owner-scoped policies on all tables
- [ ] User dashboard `/dashboard` — lists my plans, shows subscription status
- [ ] Gate plan creation behind auth: anonymous user hits create → redirected to sign-up
- [ ] Demo seed plans remain publicly viewable (special `is_demo = true` flag bypasses RLS)
- [ ] Test: user A cannot access user B's plan URL

**Definition of Done:** Two test accounts cannot see each other's plans. Unauthenticated create → redirects to sign-up. Demo plans still visible.

---

## Sprint 4 — Admin, Polish & Production Deploy
**Goal:** App is production-ready, observable, and documented.

- [ ] Admin page `/admin` (service-role gated): total plans, signups, revenue, recent audit logs
- [ ] Plan editing: change dates, regenerate a single itinerary day
- [ ] Payment receipt email via Resend after webhook confirms
- [ ] Error monitoring: Sentry integration
- [ ] Accessibility pass (keyboard nav, contrast, alt text)
- [ ] Custom domain, Vercel production env vars set
- [ ] README: local setup, env var list, deploy steps
- [ ] Final end-to-end test on production URL

**Definition of Done:** App live on production domain. Success scenario passes on prod. README allows a new developer to run locally in under 10 minutes.
