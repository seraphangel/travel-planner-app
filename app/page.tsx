import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { TravelPlan } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const { data: plans, error } = await supabase
    .from("travel_plans")
    .select("*, destinations(*)")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(12);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <section className="text-center py-10">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          Plan a whole trip in one click
        </h1>
        <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
          Tell us where you&apos;re going and Wayfare researches the
          destination, builds a day-by-day itinerary, and recommends places,
          food, hotels, flights, transport and safety tips — all in one plan.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/plans/new"
            className="rounded-xl bg-teal-600 px-6 py-3 text-white font-semibold hover:bg-teal-700 shadow-sm"
          >
            Create a Plan
          </Link>
          <a
            href="#demo-plans"
            className="rounded-xl border border-slate-300 bg-white px-6 py-3 font-semibold hover:bg-slate-100"
          >
            See example plans
          </a>
        </div>
        <p className="mt-3 text-sm text-slate-500">
          First day free · unlock the full plan for $19
        </p>
      </section>

      <section id="demo-plans" className="py-8">
        <h2 className="text-2xl font-bold mb-6">Example plans</h2>
        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700"
          >
            Couldn&apos;t load plans: {error.message}. Please refresh.
          </div>
        ) : !plans || plans.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">
            No plans yet — be the first to{" "}
            <Link href="/plans/new" className="text-teal-700 underline">
              create one
            </Link>
            .
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(plans as TravelPlan[]).map((plan) => (
              <Link
                key={plan.id}
                href={`/plans/${plan.id}`}
                className="group rounded-xl border border-slate-200 bg-white p-5 hover:border-teal-400 hover:shadow-md transition"
              >
                <div className="text-sm text-slate-500">
                  {plan.destinations
                    ? `${plan.destinations.city}, ${plan.destinations.country}`
                    : "Destination"}
                </div>
                <h3 className="mt-1 font-semibold text-lg group-hover:text-teal-700">
                  {plan.title}
                </h3>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1">
                    {plan.duration_days ?? "?"} days
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 capitalize">
                    {plan.trip_purpose}
                  </span>
                  {plan.budget_range && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1">
                      {plan.budget_range}
                    </span>
                  )}
                  {plan.is_unlocked && (
                    <span className="rounded-full bg-teal-50 text-teal-700 px-2.5 py-1">
                      Full plan
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="py-10 grid gap-6 sm:grid-cols-3 text-sm">
        {[
          ["🔎", "Researched for you", "Six categories per destination: places to visit, eat, stay, flights, local transport, and safety."],
          ["🗓️", "Day-by-day itinerary", "Morning, afternoon and evening for every day of your trip, with meals and transport notes."],
          ["🔓", "Pay once per plan", "Preview day one free. Unlock the complete plan with a one-time $19 payment."],
        ].map(([icon, title, body]) => (
          <div key={title} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="text-2xl" aria-hidden>{icon}</div>
            <h3 className="mt-2 font-semibold">{title}</h3>
            <p className="mt-1 text-slate-600">{body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
