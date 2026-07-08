# Product Requirements — Travel Planner App

## Problem
Travelers waste hours across dozens of tabs researching destinations, building itineraries, and comparing flights and hotels. There is no single tool that researches, structures, and plans a full trip in one workflow — and charges for that value.

## Target Users
- Individuals planning personal holidays
- Business travelers organizing their own trips
- Travel agents building itineraries for clients

## Core Objects
| Object | Purpose |
|---|---|
| `destination` | City/country being visited |
| `travel_plan` | The master trip record (owner, dates, budget, purpose) |
| `plan_recommendation` | A single AI-generated recommendation (place, food, hotel, flight, transport, safety) |
| `itinerary_day` | One day's schedule within a plan |
| `subscription` | Payment record linking a user to an unlocked plan |
| `audit_log` | Record of every significant action |

## MVP Must-Haves (v1)
- [ ] Destination research: AI generates recommendations in 6 categories (places, food, hotels, flights, transport, safety)
- [ ] Itinerary generator: day-by-day plan for user-specified trip duration
- [ ] Plan viewer: full plan page, no login required for demo plans
- [ ] Plan creation form: destination, origin country, dates, budget, purpose
- [ ] Preview + paywall: first day free, remaining days locked behind payment
- [ ] Stripe Checkout: one-time payment to unlock a full plan
- [ ] Webhook confirms payment → plan unlocked in DB
- [ ] User sign-up to own and revisit plans

## Non-Goals (v1)
- Flight or hotel booking integrations
- Group / multi-traveler planning
- Mobile app
- PDF export
- Admin analytics dashboard

## Definition of Done
**Pass:** An anonymous visitor opens the app, enters "Tokyo" + "7 days" + origin "UK" + budget "$2500", clicks Generate, sees a structured plan with all 6 recommendation categories and a 7-day itinerary, clicks "Unlock Full Plan", completes Stripe Checkout, and the full plan is immediately visible. All data persists in the database. A second browser session shows the same unlocked plan.

**Fail:** Any step above breaks, shows stale/demo-only data, or the payment does not persist the unlock.
