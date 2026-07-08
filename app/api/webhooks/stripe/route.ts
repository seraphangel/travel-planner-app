import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { constructWebhookEvent } from "@/lib/stripe";
import { unlockPlanFromSession } from "@/lib/unlock";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";

/**
 * POST /api/webhooks/stripe
 * Verifies the Stripe signature, then unlocks the plan on successful
 * checkout. Idempotent — Stripe retries and the success-URL verification
 * path can both fire for the same session.
 */
export async function POST(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(payload, signature);
  } catch (e) {
    await writeAuditLog(createServiceClient(), {
      action: "webhook.invalid_signature",
      entity_type: "stripe_event",
      detail: { message: e instanceof Error ? e.message : "unknown" },
      risk_level: "high",
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      const result = await unlockPlanFromSession(session);
      if (!result.ok && result.reason) {
        console.error("webhook unlock skipped:", result.reason);
      }
      break;
    }
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      const supabase = createServiceClient();
      await supabase
        .from("subscriptions")
        .update({ status: "failed" })
        .eq("stripe_session_id", session.id)
        .neq("status", "paid");
      await writeAuditLog(supabase, {
        action: "payment.failed",
        entity_type: "travel_plan",
        entity_id: session.metadata?.travel_plan_id ?? undefined,
        detail: { stripe_session_id: session.id, event: event.type },
        risk_level: "medium",
      });
      break;
    }
    default:
      break; // acknowledge everything else
  }

  return NextResponse.json({ received: true });
}
