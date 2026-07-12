import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import {
  POSTER_ADDON_PRICE_CENTS,
  UNLOCK_PRICE_CENTS,
  isDemoPlan,
} from "@/lib/types";

/**
 * POST /api/checkout
 * Body: { planId: string, product?: "unlock" | "poster_addon" }
 * - unlock (default): $19 one-time payment that unlocks the full plan
 * - poster_addon: AI seamless poster add-on for an already-unlocked plan
 */
export async function POST(request: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Payments aren't configured yet — the site owner needs to add Stripe keys." },
      { status: 503 },
    );
  }

  let planId: string | undefined;
  let product = "unlock";
  try {
    const body = await request.json();
    planId = body.planId;
    if (body.product === "poster_addon") product = "poster_addon";
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
  const unlocked = plan.is_unlocked || isDemoPlan(plan.id);
  if (product === "unlock" && unlocked) {
    return NextResponse.json({ error: "This plan is already unlocked" }, { status: 400 });
  }
  if (product === "poster_addon" && !unlocked) {
    return NextResponse.json(
      { error: "Unlock the full plan first — the AI poster is an add-on for unlocked plans" },
      { status: 400 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? plan.user_id ?? null;

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    new URL(request.url).origin;

  const amount = product === "poster_addon" ? POSTER_ADDON_PRICE_CENTS : UNLOCK_PRICE_CENTS;
  const productName =
    product === "poster_addon"
      ? `AI Seamless Poster add-on: ${plan.title}`
      : `Unlock full plan: ${plan.title}`;
  const productDescription =
    product === "poster_addon"
      ? "AI-generated poster blending your photo into the destination (3 generations)"
      : "Complete day-by-day itinerary and all recommendations";

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: amount,
            product_data: { name: productName, description: productDescription },
          },
          quantity: 1,
        },
      ],
      metadata: { travel_plan_id: plan.id, user_id: userId ?? "", product },
      customer_email: user?.email,
      success_url: `${appUrl}/plans/${plan.id}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/plans/${plan.id}?canceled=1`,
    });

    await supabase.from("subscriptions").insert({
      travel_plan_id: plan.id,
      user_id: userId,
      stripe_session_id: session.id,
      plan_type: product === "poster_addon" ? "poster_addon" : "one_time",
      status: "pending",
      amount_cents: amount,
      currency: "usd",
    });

    await writeAuditLog(supabase, {
      action: "checkout.initiated",
      entity_type: "travel_plan",
      entity_id: plan.id,
      user_id: userId,
      detail: { stripe_session_id: session.id, amount_cents: amount, product },
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
