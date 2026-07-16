import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canEditPlan } from "@/lib/permissions";
import { generateSingleDay, type GenerationInput } from "@/lib/generation";
import { writeAuditLog } from "@/lib/audit";
import { currencyFromBudgetString } from "@/lib/currencies";

export const maxDuration = 120;

const MAX_DURATION_DAYS = 30;

function dateAt(startISO: string, offsetDays: number): string {
  const d = new Date(startISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/**
 * POST /api/plans/update
 * Body: { planId, start_date, end_date }
 * Changes a plan's dates. Existing itinerary days are re-dated in place;
 * shrinking the trip deletes trailing days; extending it appends freshly
 * generated days (template fallback if the AI call fails, so extending
 * never breaks the plan).
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const planId = String(body.planId ?? "");
  const startDate = String(body.start_date ?? "");
  const endDate = String(body.end_date ?? "");
  if (!planId) return NextResponse.json({ error: "planId is required" }, { status: 400 });

  const start = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json({ error: "Valid start and end dates are required" }, { status: 400 });
  }
  const newDuration = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (newDuration < 1) return NextResponse.json({ error: "End date must be on or after the start date" }, { status: 400 });
  if (newDuration > MAX_DURATION_DAYS) {
    return NextResponse.json({ error: `Trips are limited to ${MAX_DURATION_DAYS} days` }, { status: 400 });
  }

  const { data: plan, error } = await supabase
    .from("travel_plans")
    .select("*, destinations(*)")
    .eq("id", planId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!canEditPlan(plan, user?.id)) {
    return NextResponse.json({ error: "You don't have permission to edit this plan" }, { status: 403 });
  }

  const oldDuration = plan.duration_days ?? newDuration;

  const { error: updateError } = await supabase
    .from("travel_plans")
    .update({ start_date: startDate, end_date: endDate, duration_days: newDuration })
    .eq("id", plan.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Re-date kept days, drop days beyond the new duration.
  const { data: days } = await supabase
    .from("itinerary_days")
    .select("id, day_number")
    .eq("travel_plan_id", plan.id)
    .order("day_number");
  for (const d of days ?? []) {
    if (d.day_number > newDuration) {
      await supabase.from("itinerary_days").delete().eq("id", d.id);
    } else {
      await supabase
        .from("itinerary_days")
        .update({ day_date: dateAt(startDate, d.day_number - 1) })
        .eq("id", d.id);
    }
  }

  // Extend: append generated days for the new range.
  const haveDays = new Set((days ?? []).map((d) => d.day_number));
  let appended = 0;
  if (newDuration > oldDuration || (days ?? []).length < newDuration) {
    const input: GenerationInput = {
      city: plan.destinations?.city ?? plan.title,
      country: plan.destinations?.country ?? "",
      origin_country: plan.origin_country,
      trip_purpose: plan.trip_purpose,
      budget_range: plan.budget_range,
      currency: currencyFromBudgetString(plan.budget_range),
      duration_days: newDuration,
      start_date: startDate,
    };
    for (let n = 1; n <= newDuration; n++) {
      if (haveDays.has(n)) continue;
      let day;
      let source = process.env.OPENAI_API_KEY
        ? `openai-${process.env.OPENAI_MODEL ?? "gpt-4o"}`
        : "template-v1";
      try {
        day = await generateSingleDay(input, n);
      } catch {
        // AI unavailable — degrade to the template engine rather than
        // leaving a hole in the itinerary.
        day = await generateSingleDay(input, n, { forceTemplate: true });
        source = "template-v1";
      }
      await supabase.from("itinerary_days").insert({
        travel_plan_id: plan.id,
        user_id: plan.user_id,
        day_number: n,
        day_date: dateAt(startDate, n - 1),
        morning_activity: day.morning,
        afternoon_activity: day.afternoon,
        evening_activity: day.evening,
        meals: day.meals,
        transport_notes: day.transport,
        itinerary_value: day.summary,
        itinerary_source: source,
        itinerary_confidence: day.confidence,
        itinerary_review_status: day.confidence >= 0.7 ? "approved" : "unreviewed",
      });
      appended++;
    }
  }

  await writeAuditLog(supabase, {
    action: "plan.updated",
    entity_type: "travel_plan",
    entity_id: plan.id,
    user_id: user?.id ?? null,
    detail: { start_date: startDate, end_date: endDate, duration_days: newDuration, days_appended: appended },
    risk_level: "low",
  });

  return NextResponse.json({ ok: true, duration_days: newDuration, days_appended: appended });
}
