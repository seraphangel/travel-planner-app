import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";

/**
 * POST /api/account/delete   Body: { confirm: "DELETE" }
 *
 * Self-serve account deletion (owner-approved deviation from the v1
 * human-only policy in docs/SECURITY.md, 2026-07-12):
 * - deletes the user's plans, recommendations, itinerary days, destinations
 * - anonymizes subscription rows (financial records are retained without a
 *   user link; the Stripe side is the system of record)
 * - deletes the auth user when SUPABASE_SERVICE_ROLE_KEY is configured;
 *   otherwise flags it for manual removal in the Supabase dashboard
 * - never triggers refunds (Stripe dashboard only, per docs/AGENTIC_LAYER.md)
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (body.confirm !== "DELETE") {
    return NextResponse.json(
      { error: 'Type "DELETE" to confirm account deletion' },
      { status: 400 },
    );
  }

  const { data: plans } = await supabase
    .from("travel_plans")
    .select("id")
    .eq("user_id", user.id);
  const planIds = (plans ?? []).map((p) => p.id);

  if (planIds.length > 0) {
    await supabase.from("plan_recommendations").delete().in("travel_plan_id", planIds);
    await supabase.from("itinerary_days").delete().in("travel_plan_id", planIds);
  }
  await supabase.from("subscriptions").update({ user_id: null }).eq("user_id", user.id);
  await supabase.from("travel_plans").delete().eq("user_id", user.id);
  await supabase.from("destinations").delete().eq("user_id", user.id);

  await writeAuditLog(supabase, {
    action: "account.deleted",
    entity_type: "user",
    entity_id: user.id,
    user_id: user.id,
    detail: { email: user.email, plans_deleted: planIds.length },
    risk_level: "critical",
  });

  // Remove the auth user itself — needs the service-role key.
  let authDeleted = false;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createServiceClient();
    const { error } = await admin.auth.admin.deleteUser(user.id);
    authDeleted = !error;
  }
  if (!authDeleted) {
    await writeAuditLog(supabase, {
      action: "account.auth_deletion_pending",
      entity_type: "user",
      entity_id: user.id,
      user_id: user.id,
      detail: {
        email: user.email,
        note: "Remove this user in Supabase dashboard (no SUPABASE_SERVICE_ROLE_KEY configured)",
      },
      risk_level: "critical",
    });
  }

  await supabase.auth.signOut();
  return NextResponse.json({ ok: true, authDeleted });
}
