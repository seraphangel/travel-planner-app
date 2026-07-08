# Intelligence Layer — Travel Planner App

## Messy Input
User provides: free-text destination, origin country, rough date range, budget range (or none), trip purpose. No structure guaranteed.

## Auto-Structured Schema (sent to OpenAI, stored in DB)
```json
{
  "destination": "Tokyo, Japan",
  "origin_country": "United Kingdom",
  "trip_purpose": "holiday",
  "duration_days": 7,
  "budget_range": "$2000-$3500",
  "recommendations": {
    "places_to_visit": [{"name": "", "description": "", "price_range": "", "rating": 0}],
    "places_to_eat": [{"name": "", "description": "", "price_range": ""}],
    "places_to_stay": [{"name": "", "description": "", "price_range": ""}],
    "flights": [{"route": "", "airline": "", "approx_cost": "", "duration": ""}],
    "local_transport": [{"mode": "", "description": "", "approx_cost": ""}],
    "safety_health": [{"concern": "", "advice": ""}]
  },
  "itinerary": [
    {"day": 1, "morning": "", "afternoon": "", "evening": "", "meals": "", "transport": ""}
  ]
}
```

## Events to Track
- `plan.created` — destination, duration, purpose, budget
- `plan.unlocked` — after payment
- `recommendation.viewed` — category clicked
- `itinerary_day.viewed` — day number

## Scoring Rules (v1 — rule-based)
- Confidence score set by prompt engineering (ask model to rate each item 0–1)
- Items with confidence < 0.7 flagged `review_status = 'unreviewed'` and shown with a "AI-generated — verify before booking" disclaimer
- Items ≥ 0.85 shown without caveat

## What Gets Ranked
- Recommendations sorted by `rating` desc within each category
- Itinerary days ordered by `day_number` asc

## v1 vs Later
| v1 | Later |
|---|---|
| GPT-4o one-shot generation | Multi-step agent with web search (Perplexity / Tavily) for real-time prices |
| Rule-based confidence scoring | Fine-tuned scoring from user feedback signals |
| Static recommendations | Live flight/hotel API enrichment |
