# Data Model — Travel Planner App

## destinations
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid nullable | set at lock-down sprint |
| city | text | |
| country | text | |
| region | text | |
| created_at | timestamptz | |

## travel_plans
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid nullable | set at lock-down sprint |
| destination_id | uuid FK → destinations | |
| title | text | auto-generated |
| origin_country | text | |
| trip_purpose | text | `holiday` / `business` |
| budget_range | text | e.g. `$2000-$3500` |
| start_date | date | |
| end_date | date | |
| duration_days | int | |
| status | text | `draft` / `published` |
| is_unlocked | boolean | set true after payment |
| created_at | timestamptz | |

## plan_recommendations
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid nullable | |
| travel_plan_id | uuid FK | |
| category | text | `places_to_visit`, `places_to_eat`, `places_to_stay`, `flights`, `local_transport`, `safety_health` |
| name | text | |
| description | text | |
| location | text | |
| price_range | text | |
| rating | numeric | |
| recommendation_value | text | **AI field** |
| recommendation_source | text | e.g. `openai-gpt-4o` |
| recommendation_confidence | numeric | 0–1 |
| recommendation_review_status | text | `unreviewed` / `approved` / `rejected` |
| created_at | timestamptz | |

## itinerary_days
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid nullable | |
| travel_plan_id | uuid FK | |
| day_number | int | |
| day_date | date | |
| morning_activity | text | **AI field** |
| afternoon_activity | text | **AI field** |
| evening_activity | text | **AI field** |
| meals | text | **AI field** |
| transport_notes | text | **AI field** |
| notes | text | |
| itinerary_value | text | full day summary AI field |
| itinerary_source | text | |
| itinerary_confidence | numeric | |
| itinerary_review_status | text | `unreviewed` / `approved` / `rejected` |
| created_at | timestamptz | |

## subscriptions
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid nullable | |
| travel_plan_id | uuid FK | |
| stripe_session_id | text | |
| stripe_customer_id | text | |
| stripe_subscription_id | text | for recurring later |
| plan_type | text | `one_time` / `subscription` |
| status | text | `pending` / `paid` / `failed` |
| amount_cents | int | |
| currency | text | |
| paid_at | timestamptz | |
| created_at | timestamptz | |

## audit_logs
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid nullable | |
| action | text | e.g. `plan.created`, `payment.confirmed` |
| entity_type | text | |
| entity_id | uuid | |
| detail | jsonb | |
| risk_level | text | `low` / `medium` / `high` / `critical` |
| created_at | timestamptz | |

## RLS Notes
- v1: all tables have permissive read + write policies (demo-first)
- Lock-down sprint: owner-scoped policies (`auth.uid() = user_id`) replace v1 policies on all tables
