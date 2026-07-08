import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";

/**
 * Confirm a Stripe Checkout session is paid and unlock its plan.
 * Idempotent: replaying the same session (webhook retry + success-URL
 * verification racing each other) never double-unlocks or double-inserts.
 */
export async function unlockPlanFromSession(
  session: Stripe.Checkout.Session,
): Promise<{ ok: boolean; planId: string | null; reason?: string }> {
  const planId = session.metadata?.travel_plan_id ?? null;
  if (!planId) return { ok: false, planId: null, reason: "no plan in session metadata" };
  if (session.payment_status !== "paid") {
    return { ok: false, planId, reason: `payment_status=${session.payment_status}` };
  }

  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id, status")
    .eq("stripe_session_id", session.id)
    .maybeSingle();

  if (existing?.status === "paid") {
    return { ok: true, planId }; // already processed
  }

  const { error: unlockError } = await supabase
    .from("travel_plans")
    .update({ is_unlocked: true })
    .eq("id", planId);
  if (unlockError) return { ok: false, planId, reason: unlockError.message };

  const paidFields = {
    status: "paid",
    paid_at: new Date().toISOString(),
    amount_cents: session.amount_total,
    currency: session.currency,
    stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
  };
  if (existing) {
    await supabase.from("subscriptions").update(paidFields).eq("id", existing.id);
  } else {
    await supabase.from("subscriptions").insert({
      travel_plan_id: planId,
      user_id: session.metadata?.user_id || null,
      stripe_session_id: session.id,
      plan_type: "one_time",
      ...paidFields,
    });
  }

  await writeAuditLog(supabase, {
    action: "plan.unlocked",
    entity_type: "travel_plan",
    entity_id: planId,
    user_id: session.metadata?.user_id || null,
    detail: { stripe_session_id: session.id, amount_cents: session.amount_total },
    risk_level: "high",
  });

  await sendReceiptEmail(session, planId);

  return { ok: true, planId };
}

// Payment receipt via Resend — best effort, only when RESEND_API_KEY is set.
async function sendReceiptEmail(session: Stripe.Checkout.Session, planId: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = session.customer_details?.email;
  if (!apiKey || !to) return;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const amount = ((session.amount_total ?? 0) / 100).toFixed(2);
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RECEIPT_FROM_EMAIL ?? "Wayfare <onboarding@resend.dev>",
        to: [to],
        subject: "Your travel plan is unlocked 🎉",
        html: `<p>Thanks for your purchase — your payment of $${amount} was received and your full travel plan is now unlocked.</p><p><a href="${appUrl}/plans/${planId}">View your plan</a></p>`,
      }),
    });
  } catch (e) {
    console.error("receipt email failed", e);
  }
}

/**
 * Success-URL path: the user just returned from Checkout with a session_id.
 * Verify with Stripe directly (covers webhook lag / local dev without
 * webhook forwarding) and unlock if paid.
 */
export async function verifyCheckoutAndUnlock(
  sessionId: string,
): Promise<{ ok: boolean; planId: string | null }> {
  if (!process.env.STRIPE_SECRET_KEY) return { ok: false, planId: null };
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const result = await unlockPlanFromSession(session);
    return { ok: result.ok, planId: result.planId };
  } catch (e) {
    console.error("checkout verification failed", e);
    return { ok: false, planId: null };
  }
}
