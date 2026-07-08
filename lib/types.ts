export const RECOMMENDATION_CATEGORIES = [
  "places_to_visit",
  "places_to_eat",
  "places_to_stay",
  "flights",
  "local_transport",
  "safety_health",
] as const;

export type RecommendationCategory =
  (typeof RECOMMENDATION_CATEGORIES)[number];

export const CATEGORY_META: Record<
  RecommendationCategory,
  { label: string; icon: string }
> = {
  places_to_visit: { label: "Places to Visit", icon: "🏛️" },
  places_to_eat: { label: "Places to Eat", icon: "🍜" },
  places_to_stay: { label: "Places to Stay", icon: "🏨" },
  flights: { label: "Flights", icon: "✈️" },
  local_transport: { label: "Local Transport", icon: "🚇" },
  safety_health: { label: "Safety & Health", icon: "🩺" },
};

export type Destination = {
  id: string;
  city: string;
  country: string;
  region: string | null;
};

export type TravelPlan = {
  id: string;
  user_id: string | null;
  destination_id: string | null;
  title: string;
  origin_country: string;
  trip_purpose: string;
  budget_range: string | null;
  start_date: string | null;
  end_date: string | null;
  duration_days: number | null;
  status: string;
  is_unlocked: boolean;
  created_at: string;
  destinations?: Destination | null;
};

export type PlanRecommendation = {
  id: string;
  travel_plan_id: string;
  category: RecommendationCategory;
  name: string;
  description: string | null;
  location: string | null;
  price_range: string | null;
  rating: number | null;
  recommendation_value: string | null;
  recommendation_source: string | null;
  recommendation_confidence: number | null;
  recommendation_review_status: string | null;
};

export type ItineraryDay = {
  id: string;
  travel_plan_id: string;
  day_number: number;
  day_date: string | null;
  morning_activity: string | null;
  afternoon_activity: string | null;
  evening_activity: string | null;
  meals: string | null;
  transport_notes: string | null;
  notes: string | null;
  itinerary_value: string | null;
  itinerary_source: string | null;
  itinerary_confidence: number | null;
  itinerary_review_status: string | null;
};

export type Subscription = {
  id: string;
  user_id: string | null;
  travel_plan_id: string;
  stripe_session_id: string | null;
  plan_type: string;
  status: string;
  amount_cents: number | null;
  currency: string | null;
  paid_at: string | null;
  created_at: string;
};

// Seed rows from 0001_init.sql — always publicly viewable, fully unlocked demos.
export const DEMO_PLAN_IDS = [
  "b1000000-0000-0000-0000-000000000001",
  "b1000000-0000-0000-0000-000000000002",
  "b1000000-0000-0000-0000-000000000003",
];

export function isDemoPlan(planId: string): boolean {
  return DEMO_PLAN_IDS.includes(planId);
}

export const UNLOCK_PRICE_CENTS = 1900; // $19 one-time, per PRD
