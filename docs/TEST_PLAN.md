# Test Plan — Travel Planner App

## Core Success Scenario (manual, run after Sprint 2)

1. Open the app homepage in an incognito browser — confirm 3 demo plans are visible, no login prompt
2. Click a demo plan → confirm all 6 recommendation categories render + multiple itinerary days
3. Click "Create a Plan"
4. Fill form: Destination = "Barcelona", Origin = "United States", Dates = 5 days from today, Budget = "$2000-$3000", Purpose = "holiday"
5. Click Generate — confirm loading state shows, then redirects to `/plans/[new-id]`
6. Confirm Day 1 itinerary is visible; Days 2–5 are blurred with "Unlock Full Plan" CTA
7. Click "Unlock Full Plan" → confirm Stripe Checkout opens with correct amount ($19)
8. Enter Stripe test card `4242 4242 4242 4242`, any future expiry, any CVC
9. Complete payment → confirm redirect back to plan page
10. Confirm all 5 days now visible, no blur
11. Open Supabase table editor: confirm `travel_plans.is_unlocked = true` and a `subscriptions` row with `status = 'paid'`
12. Open a new incognito window, navigate to same `/plans/[id]` — confirm plan is still fully visible (persisted)
13. Check `audit_logs`: confirm rows for `plan.created`, `checkout.initiated`, `plan.unlocked`

## Empty State Tests
- Navigate to `/plans/[non-existent-id]` → expect "Plan not found" message, not a blank page or 500
- Submit create form with no destination → expect inline validation error, no API call
- Simulate OpenAI timeout (kill key temporarily): expect "Plan generation failed — please try again" banner; plan record still exists in DB

## Payment Error Tests
- Use Stripe test card `4000 0000 0000 0002` (card declined) → confirm error shown in Stripe Checkout, user returned to plan page with "Payment failed" banner
- Replay webhook with invalid signature → confirm 400 response, no DB change, audit log entry

## Auth Tests (Sprint 3)
- User A creates and pays for a plan; copy plan URL; log in as User B → expect 403 / redirect
- Anonymous user clicks "Create a Plan" → redirects to sign-up
- After sign-up, user returned to create flow without repeating form

## Regression Checklist
- [ ] Demo plans still load for anonymous visitors after auth is added
- [ ] Stripe webhook idempotent: replaying the same event does not double-unlock or double-insert
- [ ] No API keys visible in browser Network tab or page source
