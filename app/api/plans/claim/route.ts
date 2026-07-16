import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { isAdminEmail } from "@/lib/permissions";
import { isDemoPlan } from "@/lib/types";

/**
 * POST /api/plans/claim   Body: { planId }
 * Admin-only: reassigns a plan (and its child rows) to the signed-in admin's
 * account. Exists because ownership is keyed to the auth user id, so plans
 * created under an earlier account don't follow an email to a new one.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  let planId: string | undefined;
  try {
    ({ planId } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!planId) return NextResponse.json({ error: "planId is required" }, { status: 400 });
  if (isDemoPlan(planId)) {
    return NextResponse.json({ error: "Demo plans can't be claimed" }, { status: 400 });
  }

  const { data: plan, error } = await supabase
    .from("travel_plans")
    .select("id, user_id, destination_id, title")
    .eq("id", planId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  if (plan.user_id === user.id) {
    return NextResponse.json({ error: "You already own this plan" }, { status: 400 });
  }

  const previousOwner = plan.user_id;
  const { error: upErr } = await supabase
    .from("travel_plans")
    .update({ user_id: user.id })
    .eq("id", plan.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  await supabase.from("plan_recommendations").update({ user_id: user.id }).eq("travel_plan_id", plan.id);
  await supabase.from("itinerary_days").update({ user_id: user.id }).eq("travel_plan_id", plan.id);
  if (plan.destination_id) {
    await supabase.from("destinations").update({ user_id: user.id }).eq("id", plan.destination_id);
  }

  await writeAuditLog(supabase, {
    action: "plan.claimed",
    entity_type: "travel_plan",
    entity_id: plan.id,
    user_id: user.id,
    detail: { title: plan.title, previous_owner: previousOwner, claimed_by: user.email },
    risk_level: "medium",
  });

  return NextResponse.json({ ok: true });
}
