import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { UNLOCK_PRICE_CENTS, isDemoPlan } from "@/lib/types";

/**
 * POST /api/checkout
 * Body: { planId: string }
 * Creates a $19 one-time Stripe Checkout session to unlock a plan.
 */
export async function POST(request: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Payments aren't configured yet — the site owner needs to add Stripe keys." },
      { status: 503 },
    );
  }

  let planId: string | undefined;
  try {
    ({ planId } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!planId) return NextResponse.json({ error: "planId is required" }, { status: 400 });

  const supabase = await createClient();
  const { data: plan, error } = await supabase
    .from("travel_plans")
    .select("id, title, is_unlocked, user_id")
    .eq("id", planId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  if (plan.is_unlocked || isDemoPlan(plan.id)) {
    return NextResponse.json({ error: "This plan is already unlocked" }, { status: 400 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? plan.user_id ?? null;

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    new URL(request.url).origin;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: UNLOCK_PRICE_CENTS,
            product_data: {
              name: `Unlock full plan: ${plan.title}`,
              description: "Complete day-by-day itinerary and all recommendations",
            },
          },
          quantity: 1,
        },
      ],
      metadata: { travel_plan_id: plan.id, user_id: userId ?? "" },
      customer_email: user?.email,
      success_url: `${appUrl}/plans/${plan.id}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/plans/${plan.id}?canceled=1`,
    });

    await supabase.from("subscriptions").insert({
      travel_plan_id: plan.id,
      user_id: userId,
      stripe_session_id: session.id,
      plan_type: "one_time",
      status: "pending",
      amount_cents: UNLOCK_PRICE_CENTS,
      currency: "usd",
    });

    await writeAuditLog(supabase, {
      action: "checkout.initiated",
      entity_type: "travel_plan",
      entity_id: plan.id,
      user_id: userId,
      detail: { stripe_session_id: session.id, amount_cents: UNLOCK_PRICE_CENTS },
      risk_level: "high",
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("checkout session creation failed", e);
    return NextResponse.json(
      { error: "Could not start checkout — please try again." },
      { status: 502 },
    );
  }
}
