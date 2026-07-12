import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  CATEGORY_META,
  POSTER_ADDON_PRICE_CENTS,
  RECOMMENDATION_CATEGORIES,
  isDemoPlan,
  type ItineraryDay,
  type PlanRecommendation,
  type TravelPlan,
} from "@/lib/types";
import { verifyCheckoutAndUnlock } from "@/lib/unlock";
import { canEditPlan } from "@/lib/permissions";
import UnlockButton from "./UnlockButton";
import RegenerateButton from "./RegenerateButton";
import RegenerateDayButton from "./RegenerateDayButton";
import EditPlanDates from "./EditPlanDates";
import TripPoster from "./TripPoster";

export const dynamic = "force-dynamic";

export default async function PlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  // Non-UUID ids would fail the Postgres uuid cast with a 500; treat as 404.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    notFound();
  }

  // Returning from Stripe Checkout: verify the session server-side and
  // unlock, then clean the URL. Complements the webhook (which may lag or be
  // unconfigured in local dev).
  const sessionId = typeof sp.session_id === "string" ? sp.session_id : null;
  if (sessionId) {
    const result = await verifyCheckoutAndUnlock(sessionId);
    const flag = !result.ok
      ? "payment_error=1"
      : result.product === "poster_addon"
        ? "addon_paid=1"
        : "paid=1";
    redirect(`/plans/${id}?${flag}`);
  }

  const supabase = await createClient();
  const { data: plan, error: planError } = await supabase
    .from("travel_plans")
    .select("*, destinations(*)")
    .eq("id", id)
    .maybeSingle();

  if (planError) throw new Error(planError.message);
  if (!plan) notFound();
  const p = plan as TravelPlan;

  const [{ data: recs }, { data: days }] = await Promise.all([
    supabase
      .from("plan_recommendations")
      .select("*")
      .eq("travel_plan_id", id)
      .order("rating", { ascending: false, nullsFirst: false }),
    supabase
      .from("itinerary_days")
      .select("*")
      .eq("travel_plan_id", id)
      .order("day_number", { ascending: true }),
  ]);

  const recommendations = (recs ?? []) as PlanRecommendation[];
  const itinerary = (days ?? []) as ItineraryDay[];
  const unlocked = p.is_unlocked || isDemoPlan(p.id);
  const isEmpty = recommendations.length === 0 && itinerary.length === 0;
  // Content produced by the no-AI template engine can be upgraded in place
  // once an AI key is configured.
  const isTemplateContent =
    !isEmpty &&
    !isDemoPlan(p.id) &&
    recommendations.every((r) => r.recommendation_source?.startsWith("template")) &&
    itinerary.every((d) => d.itinerary_source?.startsWith("template"));
  const aiConfigured = Boolean(process.env.OPENAI_API_KEY);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const canEdit = canEditPlan(p, user?.id);

  const { count: addonPurchases } = await supabase
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("travel_plan_id", p.id)
    .eq("plan_type", "poster_addon")
    .eq("status", "paid");
  const aiEntitled = (addonPurchases ?? 0) > 0;
  const totalDays = p.duration_days ?? itinerary.length;
  const visibleDays = unlocked ? itinerary : itinerary.filter((d) => d.day_number === 1);
  const lockedDayNumbers = unlocked
    ? []
    : itinerary.filter((d) => d.day_number > 1).map((d) => d.day_number);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      {/* Payment status banners */}
      {sp.paid === "1" && (
        <div role="status" className="mb-6 rounded-lg border border-teal-300 bg-teal-50 p-4 text-teal-800">
          🎉 <strong>Plan unlocked!</strong> Your payment was confirmed — the full itinerary is now visible and will stay unlocked on any device.
        </div>
      )}
      {sp.addon_paid === "1" && (
        <div role="status" className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-800">
          ✨ <strong>AI Poster add-on purchased!</strong> Scroll down to the Trip
          poster section, add your photo, and generate your seamless poster.
        </div>
      )}
      {sp.payment_error === "1" && (
        <div role="alert" className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">
          <strong>Payment failed.</strong> Your card was not charged or the payment could not be verified. Please try again.
        </div>
      )}
      {sp.canceled === "1" && (
        <div role="status" className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-800">
          Checkout canceled — your plan is still here. Unlock whenever you&apos;re ready.
        </div>
      )}
      {isTemplateContent && (
        <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-indigo-900">
          <div>
            <strong>This plan was built without AI.</strong>{" "}
            {aiConfigured
              ? "AI generation is now available — regenerate to get real named places, restaurants, hotels and flight guidance."
              : "It uses general templates, not specific venues. Once the site owner adds an OpenAI key, regenerate it to get real named places."}
          </div>
          {aiConfigured && <RegenerateButton planId={p.id} label="Regenerate with AI" />}
        </div>
      )}
      {sp.generation_error === "1" && (
        <div role="alert" className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">
          <strong>Plan generation failed — please try again.</strong> Your trip was saved; hit Regenerate below to retry.
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm text-slate-500">
            <Link href="/" className="hover:text-teal-700">Plans</Link>
            {" / "}
            {p.destinations ? `${p.destinations.city}, ${p.destinations.country}` : "Trip"}
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{p.title}</h1>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-white border border-slate-200 px-3 py-1">📍 {p.destinations ? `${p.destinations.city}, ${p.destinations.country}` : "—"}</span>
            <span className="rounded-full bg-white border border-slate-200 px-3 py-1">🛫 from {p.origin_country}</span>
            <span className="rounded-full bg-white border border-slate-200 px-3 py-1">🗓️ {totalDays} days{p.start_date ? ` · from ${p.start_date}` : ""}</span>
            {p.budget_range && <span className="rounded-full bg-white border border-slate-200 px-3 py-1">💰 {p.budget_range}</span>}
            <span className="rounded-full bg-white border border-slate-200 px-3 py-1 capitalize">🎯 {p.trip_purpose}</span>
          </div>
          {canEdit && (
            <div className="mt-3">
              <EditPlanDates planId={p.id} startDate={p.start_date} endDate={p.end_date} />
            </div>
          )}
        </div>
        {!unlocked && !isEmpty && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
            <div className="text-sm text-slate-500">Day 1 free preview</div>
            <UnlockButton planId={p.id} />
            <div className="mt-1 text-xs text-slate-400">One-time $19 · Stripe secure checkout</div>
          </div>
        )}
      </div>

      {/* Empty state: plan exists but nothing generated */}
      {isEmpty ? (
        <div className="mt-10 rounded-xl border border-slate-200 bg-white p-10 text-center">
          <div className="text-3xl" aria-hidden>🗺️</div>
          <h2 className="mt-3 text-xl font-semibold">No recommendations yet</h2>
          <p className="mt-2 text-slate-600">
            This plan hasn&apos;t been generated yet, or generation failed.
          </p>
          <RegenerateButton planId={p.id} label="Generate plan" />
        </div>
      ) : (
        <>
          {/* Recommendations */}
          <section className="mt-10" aria-labelledby="recs-heading">
            <h2 id="recs-heading" className="text-2xl font-bold">Destination research</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {RECOMMENDATION_CATEGORIES.map((category) => {
                const items = recommendations.filter((r) => r.category === category);
                const meta = CATEGORY_META[category];
                return (
                  <div key={category} className="rounded-xl border border-slate-200 bg-white p-5">
                    <h3 className="font-semibold flex items-center gap-2">
                      <span aria-hidden>{meta.icon}</span> {meta.label}
                    </h3>
                    {items.length === 0 ? (
                      <p className="mt-3 text-sm text-slate-400 italic">
                        No {meta.label.toLowerCase()} recommendations yet for this plan.
                      </p>
                    ) : (
                      <ul className="mt-3 space-y-3">
                        {items.map((r) => (
                          <li key={r.id} className="border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="font-medium">{r.name}</span>
                              <span className="shrink-0 text-xs text-slate-500">
                                {r.rating != null && <span aria-label={`rated ${r.rating} out of 5`}>★ {Number(r.rating).toFixed(1)}</span>}
                                {r.price_range && <span className="ml-2">{r.price_range}</span>}
                              </span>
                            </div>
                            {r.description && <p className="mt-1 text-sm text-slate-600">{r.description}</p>}
                            {(r.recommendation_confidence ?? 1) < 0.7 && (
                              <p className="mt-1 text-xs text-amber-600">⚠️ AI-generated — verify before booking</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Itinerary */}
          <section className="mt-10" aria-labelledby="itinerary-heading">
            <div className="flex items-center justify-between">
              <h2 id="itinerary-heading" className="text-2xl font-bold">Day-by-day itinerary</h2>
              {itinerary.length === 0 && <RegenerateButton planId={p.id} label="Generate itinerary" />}
            </div>
            <div className="mt-4 space-y-4">
              {itinerary.length === 0 && (
                <p className="rounded-xl border border-slate-200 bg-white p-6 text-slate-500">
                  No itinerary days yet for this plan.
                </p>
              )}
              {visibleDays.map((d) => (
                <article key={d.id} className="rounded-xl border border-slate-200 bg-white p-5">
                  <header className="flex items-baseline justify-between">
                    <h3 className="font-semibold text-lg">
                      Day {d.day_number}
                      {d.itinerary_value ? ` — ${d.itinerary_value}` : ""}
                    </h3>
                    {d.day_date && <span className="text-sm text-slate-500">{d.day_date}</span>}
                  </header>
                  <dl className="mt-3 grid gap-3 sm:grid-cols-3 text-sm">
                    <div><dt className="font-medium text-slate-500">🌅 Morning</dt><dd className="mt-0.5">{d.morning_activity ?? "—"}</dd></div>
                    <div><dt className="font-medium text-slate-500">☀️ Afternoon</dt><dd className="mt-0.5">{d.afternoon_activity ?? "—"}</dd></div>
                    <div><dt className="font-medium text-slate-500">🌙 Evening</dt><dd className="mt-0.5">{d.evening_activity ?? "—"}</dd></div>
                  </dl>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 text-sm text-slate-600">
                    {d.meals && <p>🍽️ {d.meals}</p>}
                    {d.transport_notes && <p>🚉 {d.transport_notes}</p>}
                  </div>
                  {(d.itinerary_confidence ?? 1) < 0.7 && (
                    <p className="mt-2 text-xs text-amber-600">⚠️ AI-generated — verify before booking</p>
                  )}
                  {canEdit && <RegenerateDayButton planId={p.id} dayNumber={d.day_number} />}
                </article>
              ))}

              {/* Locked days — content is withheld server-side, not just blurred */}
              {lockedDayNumbers.length > 0 && (
                <div className="relative">
                  <div className="space-y-4 blur-sm select-none pointer-events-none" aria-hidden>
                    {lockedDayNumbers.map((n) => (
                      <div key={n} className="rounded-xl border border-slate-200 bg-white p-5">
                        <h3 className="font-semibold text-lg">Day {n} — ████████████</h3>
                        <div className="mt-3 grid gap-3 sm:grid-cols-3 text-sm text-slate-400">
                          <p>██████████████████</p><p>████████████████</p><p>██████████████</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="rounded-xl border border-slate-200 bg-white/95 p-6 text-center shadow-lg">
                      <div className="text-2xl" aria-hidden>🔒</div>
                      <h3 className="mt-1 font-semibold">
                        {lockedDayNumbers.length} more {lockedDayNumbers.length === 1 ? "day is" : "days are"} locked
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">Unlock the complete {totalDays}-day plan.</p>
                      <UnlockButton planId={p.id} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <TripPoster
            planId={p.id}
            tier={unlocked ? "premium" : "free"}
            aiEntitled={aiEntitled}
            aiPriceLabel={`$${(POSTER_ADDON_PRICE_CENTS / 100).toFixed(2)}`}
            title={p.title}
            destination={
              p.destinations
                ? `${p.destinations.city}, ${p.destinations.country}`
                : p.title
            }
            city={p.destinations?.city ?? p.title}
            dates={
              p.start_date && p.end_date
                ? `${p.start_date} → ${p.end_date}`
                : "Dates TBD"
            }
            days={totalDays}
            purpose={p.trip_purpose}
            highlights={recommendations
              .filter((r) => r.category === "places_to_visit")
              .slice(0, 5)
              .map((r) => r.name)}
          />
        </>
      )}
    </main>
  );
}
