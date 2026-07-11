import type { SupabaseClient } from "@supabase/supabase-js";
import {
  RECOMMENDATION_CATEGORIES,
  type RecommendationCategory,
} from "@/lib/types";

export type GenerationInput = {
  city: string;
  country: string;
  origin_country: string;
  trip_purpose: string;
  budget_range: string | null;
  duration_days: number;
  start_date: string | null; // ISO date of day 1
};

export type GeneratedRecommendation = {
  category: RecommendationCategory;
  name: string;
  description: string;
  location?: string;
  price_range?: string;
  rating?: number;
  value: string;
  confidence: number;
};

export type GeneratedDay = {
  day_number: number;
  morning: string;
  afternoon: string;
  evening: string;
  meals: string;
  transport: string;
  summary: string;
  confidence: number;
};

export type GeneratedContent = {
  recommendations: GeneratedRecommendation[];
  itinerary: GeneratedDay[];
  source: string;
};

/**
 * Generate the full plan content (6 recommendation categories + day-by-day
 * itinerary). Uses OpenAI when OPENAI_API_KEY is configured; otherwise falls
 * back to a deterministic template engine so the core flow works with the AI
 * switched off (docs/ARCHITECTURE.md layer plan). If the key IS set and the
 * call fails, we throw — the caller shows an error banner with a retry, and
 * the plan record still exists.
 */
export async function generatePlanContent(
  input: GenerationInput,
): Promise<GeneratedContent> {
  if (process.env.OPENAI_API_KEY) {
    return await generateWithOpenAI(input);
  }
  return generateFromTemplates(input);
}

/**
 * Generate a fresh draft for ONE itinerary day. Medium-risk action per
 * docs/AGENTIC_LAYER.md — callers must show the draft to the user for
 * confirmation before persisting it.
 */
export async function generateSingleDay(
  input: GenerationInput,
  dayNumber: number,
  opts?: { forceTemplate?: boolean },
): Promise<GeneratedDay> {
  if (!opts?.forceTemplate && process.env.OPENAI_API_KEY) {
    return await generateDayWithOpenAI(input, dayNumber);
  }
  const day = generateFromTemplates(input).itinerary.find(
    (d) => d.day_number === dayNumber,
  );
  if (!day) throw new Error(`Day ${dayNumber} is outside this trip`);
  return day;
}

// ─── OpenAI path ─────────────────────────────────────────────────────────────

const PROMPT_SCHEMA = `{
  "recommendations": {
    "places_to_visit": [{"name": "", "description": "", "location": "", "price_range": "", "rating": 0, "value": "", "confidence": 0}],
    "places_to_eat": [{"name": "", "description": "", "location": "", "price_range": "", "rating": 0, "value": "", "confidence": 0}],
    "places_to_stay": [{"name": "", "description": "", "location": "", "price_range": "", "rating": 0, "value": "", "confidence": 0}],
    "flights": [{"name": "", "description": "", "price_range": "", "value": "", "confidence": 0}],
    "local_transport": [{"name": "", "description": "", "price_range": "", "value": "", "confidence": 0}],
    "safety_health": [{"name": "", "description": "", "value": "", "confidence": 0}]
  },
  "itinerary": [{"day": 1, "morning": "", "afternoon": "", "evening": "", "meals": "", "transport": "", "summary": "", "confidence": 0}]
}`;

async function generateWithOpenAI(
  input: GenerationInput,
): Promise<GeneratedContent> {
  const model = process.env.OPENAI_MODEL ?? "gpt-4o";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content:
            "You are an expert travel planner with deep destination knowledge. Respond ONLY with valid JSON matching exactly this schema (4-6 items per recommendation category, one itinerary entry per day):\n" +
            PROMPT_SCHEMA +
            "\nHard rules:\n" +
            "- Every recommendation must be a REAL, specific, named place that exists: actual attractions, actual restaurants (with neighborhood), actual hotels. Never output generic filler like 'signature landmark', 'local market' or 'boutique hotel' without a proper name.\n" +
            "- flights: name real airlines that fly the route, typical routing (direct or via which hub), approximate current round-trip cost and flight time.\n" +
            "- local_transport: the city's actual systems, passes and typical fares (e.g. Suica/Pasmo, T-casual, Oyster).\n" +
            "- itinerary entries must reference the named places from your recommendations, in a geographically sensible order.\n" +
            "- price_range: a realistic figure or range in USD (or $ / $$ / $$$ for restaurants). rating: 0-5, your honest quality estimate.\n" +
            "- confidence: 0-1 per item — how certain you are the place is still operating and details are accurate. Use lower values for prices and schedules, which change.",
        },
        {
          role: "user",
          content: `Plan a trip:\n- Destination: ${input.city}, ${input.country}\n- Origin: ${input.origin_country}\n- Duration: ${input.duration_days} days\n- Budget: ${input.budget_range ?? "flexible"}\n- Purpose: ${input.trip_purpose}${input.start_date ? `\n- Travel dates: starting ${input.start_date} (consider the season)` : ""}\nInclude realistic flight guidance from ${input.origin_country} and the city's real local transport options.`,
        },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI request failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned an empty response");
  const parsed = JSON.parse(content);

  const recommendations: GeneratedRecommendation[] = [];
  for (const category of RECOMMENDATION_CATEGORIES) {
    const items = parsed.recommendations?.[category];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!item?.name && !item?.concern && !item?.route && !item?.mode) continue;
      recommendations.push({
        category,
        name: String(item.name ?? item.concern ?? item.route ?? item.mode ?? "Recommendation"),
        description: String(item.description ?? item.advice ?? ""),
        location: item.location ? String(item.location) : undefined,
        price_range: item.price_range
          ? String(item.price_range)
          : item.approx_cost
            ? String(item.approx_cost)
            : undefined,
        rating: clampNumber(item.rating, 0, 5),
        value: String(item.value ?? item.description ?? "").slice(0, 500),
        confidence: clampNumber(item.confidence, 0, 1) ?? 0.75,
      });
    }
  }

  const itinerary: GeneratedDay[] = [];
  if (Array.isArray(parsed.itinerary)) {
    for (const day of parsed.itinerary) {
      const n = Number(day?.day);
      if (!Number.isInteger(n) || n < 1 || n > input.duration_days) continue;
      itinerary.push({
        day_number: n,
        morning: String(day.morning ?? ""),
        afternoon: String(day.afternoon ?? ""),
        evening: String(day.evening ?? ""),
        meals: String(day.meals ?? ""),
        transport: String(day.transport ?? ""),
        summary: String(day.summary ?? `Day ${n} in ${input.city}`),
        confidence: clampNumber(day.confidence, 0, 1) ?? 0.75,
      });
    }
  }

  if (recommendations.length === 0 || itinerary.length === 0) {
    throw new Error("OpenAI response missing recommendations or itinerary");
  }
  // Model sometimes returns fewer days than requested — pad from templates so
  // every plan has exactly duration_days days.
  const have = new Set(itinerary.map((d) => d.day_number));
  const fallback = generateFromTemplates(input);
  for (const day of fallback.itinerary) {
    if (!have.has(day.day_number)) itinerary.push(day);
  }
  itinerary.sort((a, b) => a.day_number - b.day_number);

  return { recommendations, itinerary, source: `openai-${model}` };
}

async function generateDayWithOpenAI(
  input: GenerationInput,
  dayNumber: number,
): Promise<GeneratedDay> {
  const model = process.env.OPENAI_MODEL ?? "gpt-4o";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      temperature: 0.8,
      messages: [
        {
          role: "system",
          content:
            'You are an expert travel planner. Respond ONLY with valid JSON: {"morning": "", "afternoon": "", "evening": "", "meals": "", "transport": "", "summary": "", "confidence": 0}\n' +
            "Every activity must reference REAL, specific, named places that exist — never generic filler. confidence is 0-1: how certain you are the places are still operating.",
        },
        {
          role: "user",
          content: `Plan day ${dayNumber} of a ${input.duration_days}-day ${input.trip_purpose} trip to ${input.city}, ${input.country} (traveller from ${input.origin_country}, budget ${input.budget_range ?? "flexible"}). Propose a DIFFERENT angle on the city than a typical itinerary would have for this day — this is a regeneration, so avoid the most obvious picks.`,
        },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI request failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned an empty response");
  const day = JSON.parse(content);
  return {
    day_number: dayNumber,
    morning: String(day.morning ?? ""),
    afternoon: String(day.afternoon ?? ""),
    evening: String(day.evening ?? ""),
    meals: String(day.meals ?? ""),
    transport: String(day.transport ?? ""),
    summary: String(day.summary ?? `Day ${dayNumber} in ${input.city}`),
    confidence: clampNumber(day.confidence, 0, 1) ?? 0.75,
  };
}

function clampNumber(v: unknown, min: number, max: number): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
}

// ─── Template fallback (AI switched off) ────────────────────────────────────

function generateFromTemplates(input: GenerationInput): GeneratedContent {
  const { city, country, origin_country, duration_days } = input;
  const budget = input.budget_range ?? "a flexible budget";
  const business = input.trip_purpose === "business";
  const c = 0.6; // below the 0.7 review threshold → UI shows "verify before booking"

  const recommendations: GeneratedRecommendation[] = [
    { category: "places_to_visit", name: `${city} Old Town & Historic Center`, description: `Start with the historic heart of ${city} — the main squares, landmark architecture, and museums cluster here, and most walking tours depart from it.`, location: `Central ${city}`, price_range: "$", rating: 4.6, value: "Best first-day orientation to the city", confidence: c },
    { category: "places_to_visit", name: `${city} Signature Landmark & Viewpoint`, description: `Every visit to ${city} should include its best-known landmark and the highest public viewpoint for a panorama of the city.`, location: city, price_range: "$$", rating: 4.7, value: "The classic photo stop", confidence: c },
    { category: "places_to_visit", name: `Markets & Neighborhood Walks`, description: `Local markets and residential quarters show the everyday side of ${city}; go in the morning when stalls are busiest.`, location: city, price_range: "Free", rating: 4.4, value: "Local culture beyond the sights", confidence: c },
    { category: "places_to_eat", name: `Traditional ${country} Cuisine`, description: `Book one dinner at a well-reviewed traditional restaurant to try ${country}'s signature dishes; ask staff for the regional specialty.`, location: city, price_range: "$$", rating: 4.5, value: "The must-try national dishes", confidence: c },
    { category: "places_to_eat", name: `${city} Street Food & Market Stalls`, description: `Cheapest and often best food in ${city} — follow the queues of locals at lunchtime.`, location: city, price_range: "$", rating: 4.4, value: "Big flavor on a small budget", confidence: c },
    { category: "places_to_eat", name: business ? "Business-Friendly Restaurants" : "Café Culture", description: business ? `Quieter restaurants near the business district of ${city}, suitable for client meetings — reserve ahead.` : `Spend a slow morning in ${city}'s café scene; a good mid-trip recovery ritual.`, location: city, price_range: "$$", rating: 4.3, value: business ? "Reliable for meetings" : "Recharge between sights", confidence: c },
    { category: "places_to_stay", name: `Central ${city} Boutique Hotel`, description: `Staying central in ${city} saves transit time; boutique hotels balance character and comfort within ${budget}.`, location: `Central ${city}`, price_range: "$$", rating: 4.4, value: "Walk to the main sights", confidence: c },
    { category: "places_to_stay", name: `Aparthotel / Serviced Apartment`, description: `For stays of ${duration_days}+ days, a serviced apartment with a kitchen cuts food costs and adds space.`, location: city, price_range: "$$", rating: 4.3, value: "Best value for longer stays", confidence: c },
    { category: "flights", name: `${origin_country} → ${city}`, description: `Compare fares 6–10 weeks out; midweek departures from ${origin_country} are usually cheapest. Check both direct routes and one-stop options via major hubs.`, price_range: "Varies by season", value: "Book midweek, 6–10 weeks ahead", confidence: c },
    { category: "flights", name: "Airport to City Transfer", description: `Research the rail/express-bus link from ${city}'s main airport before landing — almost always cheaper than a taxi and immune to traffic.`, price_range: "$", value: "Skip the taxi queue", confidence: c },
    { category: "local_transport", name: `${city} Public Transit Pass`, description: `A multi-day transit pass typically pays for itself after 3 rides per day; buy at the airport or main station on arrival.`, price_range: "$", value: "Cheapest way around", confidence: c },
    { category: "local_transport", name: "Walking + Ride-hailing Combo", description: `Central ${city} is best on foot; use a ride-hailing app for evenings and cross-town hops.`, price_range: "$", value: "Flexible after dark", confidence: c },
    { category: "safety_health", name: "Travel Insurance & Documents", description: `Confirm passport validity (6+ months), any visa requirements for ${country} from ${origin_country}, and carry travel insurance covering medical care.`, value: "Check entry rules before booking", confidence: c },
    { category: "safety_health", name: `Local Safety Basics in ${city}`, description: `Note the local emergency number, keep valuables zipped in crowded areas, and check your government's current travel advisory for ${country}.`, value: "Standard precautions apply", confidence: c },
  ];

  const itinerary: GeneratedDay[] = [];
  for (let n = 1; n <= duration_days; n++) {
    const last = n === duration_days;
    let day: Omit<GeneratedDay, "day_number" | "confidence">;
    if (n === 1) {
      day = {
        morning: `Arrive in ${city}; transfer from the airport and check in to your hotel`,
        afternoon: `Orientation walk through central ${city} — main square, landmark streets, get your transit pass`,
        evening: `Relaxed welcome dinner near your hotel to beat the jet lag`,
        meals: `Light lunch on arrival; traditional ${country} dinner`,
        transport: `Airport rail/bus link into ${city}, then on foot`,
        summary: `Arrival and orientation day in ${city}`,
      };
    } else if (last && duration_days > 2) {
      day = {
        morning: `Final stroll and souvenir shopping in ${city}`,
        afternoon: `Check out and transfer to the airport`,
        evening: `Depart for ${origin_country}`,
        meals: `Farewell brunch at a local favorite`,
        transport: `Airport transfer — allow extra time at peak hours`,
        summary: `Departure day`,
      };
    } else {
      const themes = business
        ? [
            { morning: `Meetings / work session`, afternoon: `Continue business agenda; catch up on email at a café`, evening: `Client or team dinner at a business-friendly restaurant`, meals: `Working lunch; reserved dinner`, transport: `Ride-hailing between venues`, summary: `Business day in ${city}` },
            { morning: `Morning meetings`, afternoon: `Free afternoon — visit ${city}'s signature landmark`, evening: `Explore a lively neighborhood for dinner`, meals: `Quick lunch; local dinner`, transport: `Public transit day pass`, summary: `Business + sightseeing mix` },
          ]
        : [
            { morning: `Visit ${city}'s signature landmark early to beat the crowds`, afternoon: `Museum or gallery visit; coffee break in a historic café`, evening: `Sunset from the best public viewpoint, then dinner`, meals: `Street-food lunch; traditional dinner`, transport: `Public transit + walking`, summary: `Landmarks and highlights day` },
            { morning: `Morning at the local market while stalls are busiest`, afternoon: `Wander a residential quarter; independent shops and galleries`, evening: `Neighborhood restaurant dinner away from the tourist core`, meals: `Market snacks; local bistro dinner`, transport: `Mostly on foot`, summary: `Local life and markets day` },
            { morning: `Day trip out of ${city} — nearest coastal town, mountains or historic site`, afternoon: `Continue the day trip; picnic or local lunch en route`, evening: `Return to ${city}; easy dinner near the hotel`, meals: `Picnic lunch; casual dinner`, transport: `Regional train or bus`, summary: `Day trip beyond the city` },
            { morning: `Slow morning — café breakfast and a park walk`, afternoon: `Pick your favorite spot so far and go back, or spa/pool time`, evening: `Signature dining experience — book ahead`, meals: `Long brunch; special-occasion dinner`, transport: `Minimal — stay local`, summary: `Rest and highlights revisit` },
          ];
      day = themes[(n - 2) % themes.length];
    }
    itinerary.push({ day_number: n, confidence: c, ...day });
  }

  return { recommendations, itinerary, source: "template-v1" };
}

// ─── Persistence ─────────────────────────────────────────────────────────────

/**
 * Replace a plan's generated content with fresh rows. Deletes prior
 * recommendations/days first so retries and regenerations stay idempotent.
 */
export async function persistGeneration(
  supabase: SupabaseClient,
  plan: {
    id: string;
    user_id: string | null;
    start_date: string | null;
  },
  content: GeneratedContent,
) {
  await supabase.from("plan_recommendations").delete().eq("travel_plan_id", plan.id);
  await supabase.from("itinerary_days").delete().eq("travel_plan_id", plan.id);

  const recRows = content.recommendations.map((r) => ({
    travel_plan_id: plan.id,
    user_id: plan.user_id,
    category: r.category,
    name: r.name,
    description: r.description,
    location: r.location ?? null,
    price_range: r.price_range ?? null,
    rating: r.rating ?? null,
    recommendation_value: r.value,
    recommendation_source: content.source,
    recommendation_confidence: r.confidence,
    recommendation_review_status: r.confidence >= 0.7 ? "approved" : "unreviewed",
  }));

  const start = plan.start_date ? new Date(plan.start_date + "T00:00:00Z") : null;
  const dayRows = content.itinerary.map((d) => {
    let day_date: string | null = null;
    if (start) {
      const dt = new Date(start);
      dt.setUTCDate(dt.getUTCDate() + d.day_number - 1);
      day_date = dt.toISOString().slice(0, 10);
    }
    return {
      travel_plan_id: plan.id,
      user_id: plan.user_id,
      day_number: d.day_number,
      day_date,
      morning_activity: d.morning,
      afternoon_activity: d.afternoon,
      evening_activity: d.evening,
      meals: d.meals,
      transport_notes: d.transport,
      itinerary_value: d.summary,
      itinerary_source: content.source,
      itinerary_confidence: d.confidence,
      itinerary_review_status: d.confidence >= 0.7 ? "approved" : "unreviewed",
    };
  });

  const { error: recError } = await supabase.from("plan_recommendations").insert(recRows);
  if (recError) throw new Error(`Failed to save recommendations: ${recError.message}`);
  const { error: dayError } = await supabase.from("itinerary_days").insert(dayRows);
  if (dayError) throw new Error(`Failed to save itinerary: ${dayError.message}`);
}
