import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generatePlanContent, persistGeneration } from "@/lib/generation";
import { writeAuditLog } from "@/lib/audit";

export const maxDuration = 120;

const PURPOSES = ["holiday", "business"];
const MAX_DURATION_DAYS = 30;

/**
 * POST /api/plans/create
 * Body: { destination, origin_country, start_date, end_date, budget_range?, trip_purpose }
 * Creates destination + travel_plan rows, then generates the plan content.
 * If generation fails the plan record still exists (retry from the plan page).
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const destinationRaw = String(body.destination ?? "").trim();
  const origin = String(body.origin_country ?? "").trim();
  const startDate = String(body.start_date ?? "").trim();
  const endDate = String(body.end_date ?? "").trim();
  const budget = String(body.budget_range ?? "").trim() || null;
  const purpose = String(body.trip_purpose ?? "holiday").trim();

  if (!destinationRaw) return NextResponse.json({ error: "Destination is required" }, { status: 400 });
  if (!origin) return NextResponse.json({ error: "Origin country is required" }, { status: 400 });
  if (!PURPOSES.includes(purpose)) return NextResponse.json({ error: "Invalid trip purpose" }, { status: 400 });

  const start = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json({ error: "Valid start and end dates are required" }, { status: 400 });
  }
  const durationDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (durationDays < 1) return NextResponse.json({ error: "End date must be on or after the start date" }, { status: 400 });
  if (durationDays > MAX_DURATION_DAYS) {
    return NextResponse.json({ error: `Trips are limited to ${MAX_DURATION_DAYS} days` }, { status: 400 });
  }

  // "Tokyo, Japan" → city + country; bare "Tokyo" → country mirrors city
  const [cityPart, ...countryParts] = destinationRaw.split(",");
  const city = cityPart.trim();
  const country = countryParts.join(",").trim() || city;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: destination, error: destError } = await supabase
    .from("destinations")
    .insert({ city, country, user_id: user?.id ?? null })
    .select()
    .single();
  if (destError) return NextResponse.json({ error: destError.message }, { status: 500 });

  const title =
    purpose === "business"
      ? `${city} Business Trip`
      : `${durationDays} Days in ${city}`;

  const { data: plan, error: planError } = await supabase
    .from("travel_plans")
    .insert({
      user_id: user?.id ?? null,
      destination_id: destination.id,
      title,
      origin_country: origin,
      trip_purpose: purpose,
      budget_range: budget,
      start_date: startDate,
      end_date: endDate,
      duration_days: durationDays,
      status: "draft",
      is_unlocked: false,
    })
    .select()
    .single();
  if (planError) return NextResponse.json({ error: planError.message }, { status: 500 });

  await writeAuditLog(supabase, {
    action: "plan.created",
    entity_type: "travel_plan",
    entity_id: plan.id,
    user_id: user?.id ?? null,
    detail: { destination: `${city}, ${country}`, duration_days: durationDays, purpose, budget },
    risk_level: "low",
  });

  try {
    const content = await generatePlanContent({
      city,
      country,
      origin_country: origin,
      trip_purpose: purpose,
      budget_range: budget,
      duration_days: durationDays,
      start_date: startDate,
    });
    await persistGeneration(supabase, plan, content);
    await supabase.from("travel_plans").update({ status: "published" }).eq("id", plan.id);
    return NextResponse.json({ id: plan.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed";
    await writeAuditLog(supabase, {
      action: "plan.generation_failed",
      entity_type: "travel_plan",
      entity_id: plan.id,
      user_id: user?.id ?? null,
      detail: { message },
      risk_level: "medium",
    });
    // Plan record survives; the plan page offers a retry.
    return NextResponse.json({ id: plan.id, generationFailed: true });
  }
}
