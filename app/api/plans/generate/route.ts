import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generatePlanContent, persistGeneration } from "@/lib/generation";
import { writeAuditLog } from "@/lib/audit";

export const maxDuration = 120;

/**
 * POST /api/plans/generate
 * Body: { planId: string }
 * (Re)generates recommendations + itinerary for an existing plan.
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  let planId: string | undefined;
  try {
    ({ planId } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!planId || typeof planId !== "string") {
    return NextResponse.json({ error: "planId is required" }, { status: 400 });
  }

  const { data: plan, error } = await supabase
    .from("travel_plans")
    .select("*, destinations(*)")
    .eq("id", planId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  try {
    const content = await generatePlanContent({
      city: plan.destinations?.city ?? plan.title,
      country: plan.destinations?.country ?? "",
      origin_country: plan.origin_country,
      trip_purpose: plan.trip_purpose,
      budget_range: plan.budget_range,
      duration_days: plan.duration_days ?? 5,
      start_date: plan.start_date,
    });

    await persistGeneration(supabase, plan, content);
    await supabase
      .from("travel_plans")
      .update({ status: "published" })
      .eq("id", plan.id);

    await writeAuditLog(supabase, {
      action: "plan.generated",
      entity_type: "travel_plan",
      entity_id: plan.id,
      user_id: plan.user_id,
      detail: {
        source: content.source,
        recommendations: content.recommendations.length,
        days: content.itinerary.length,
        usage: content.usage ?? null,
        padded_days: content.padded_days ?? 0,
      },
      risk_level: "low",
    });

    return NextResponse.json({ ok: true, source: content.source });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed";
    await writeAuditLog(supabase, {
      action: "plan.generation_failed",
      entity_type: "travel_plan",
      entity_id: plan.id,
      user_id: plan.user_id,
      detail: { message },
      risk_level: "medium",
    });
    return NextResponse.json(
      { error: "Plan generation failed — please try again." },
      { status: 502 },
    );
  }
}
