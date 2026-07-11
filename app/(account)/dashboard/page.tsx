import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Subscription, TravelPlan } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/dashboard")}`);

  const [{ data: plans }, { data: subs }] = await Promise.all([
    supabase
      .from("travel_plans")
      .select("*, destinations(*)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const myPlans = (plans ?? []) as TravelPlan[];
  const mySubs = (subs ?? []) as Subscription[];
  const subByPlan = new Map(mySubs.map((s) => [s.travel_plan_id, s]));

  return (
    <main>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My plans</h1>
          <p className="mt-1 text-slate-600">{user.email}</p>
        </div>
        <Link
          href="/plans/new"
          className="rounded-xl bg-teal-600 px-5 py-2.5 font-semibold text-white hover:bg-teal-700"
        >
          Create a Plan
        </Link>
      </div>

      {myPlans.length === 0 ? (
        <div className="mt-10 rounded-xl border border-slate-200 bg-white p-10 text-center">
          <div className="text-3xl" aria-hidden>🌍</div>
          <h2 className="mt-3 text-xl font-semibold">No plans yet</h2>
          <p className="mt-2 text-slate-600">
            Create your first trip and it will show up here.
          </p>
          <Link
            href="/plans/new"
            className="mt-4 inline-block rounded-lg bg-teal-600 px-5 py-2.5 font-semibold text-white hover:bg-teal-700"
          >
            Create a Plan
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          {myPlans.map((plan) => {
            const sub = subByPlan.get(plan.id);
            return (
              <Link
                key={plan.id}
                href={`/plans/${plan.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5 hover:border-teal-400 hover:shadow-sm transition"
              >
                <div>
                  <h2 className="font-semibold">{plan.title}</h2>
                  <p className="text-sm text-slate-500">
                    {plan.destinations
                      ? `${plan.destinations.city}, ${plan.destinations.country}`
                      : "—"}{" "}
                    · {plan.duration_days} days
                    {plan.start_date ? ` · from ${plan.start_date}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {plan.is_unlocked ? (
                    <span className="rounded-full bg-teal-50 px-3 py-1 font-medium text-teal-700">
                      🔓 Unlocked{sub?.paid_at ? ` · paid ${sub.paid_at.slice(0, 10)}` : ""}
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">
                      🔒 Preview — day 1 only
                    </span>
                  )}
                  {sub?.status === "pending" && (
                    <span className="rounded-full bg-amber-50 px-3 py-1 font-medium text-amber-700">
                      Payment pending
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
