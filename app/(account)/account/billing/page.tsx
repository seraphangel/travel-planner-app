import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PurchaseRow = {
  id: string;
  travel_plan_id: string;
  status: string;
  amount_cents: number | null;
  currency: string | null;
  paid_at: string | null;
  created_at: string;
  travel_plans: { title: string } | null;
};

export default async function BillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/account/billing")}`);

  const { data } = await supabase
    .from("subscriptions")
    .select("id, travel_plan_id, status, amount_cents, currency, paid_at, created_at, travel_plans(title)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  const purchases = (data ?? []) as unknown as PurchaseRow[];

  const statusBadge: Record<string, string> = {
    paid: "bg-teal-50 text-teal-700",
    pending: "bg-amber-50 text-amber-700",
    failed: "bg-red-50 text-red-700",
  };

  return (
    <main>
      <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
      <p className="mt-2 text-slate-600">
        Plan unlocks are one-time $19 purchases via Stripe. Receipts are
        emailed after payment.
      </p>

      {purchases.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-10 text-center">
          <div className="text-3xl" aria-hidden>💳</div>
          <h2 className="mt-3 text-xl font-semibold">No purchases yet</h2>
          <p className="mt-2 text-slate-600">
            When you unlock a plan, the payment will show up here.
          </p>
          <Link
            href="/dashboard"
            className="mt-4 inline-block rounded-lg bg-teal-600 px-5 py-2.5 font-semibold text-white hover:bg-teal-700"
          >
            View my plans
          </Link>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5">
                    <Link href={`/plans/${p.travel_plan_id}`} className="font-medium text-teal-700 hover:underline">
                      {p.travel_plans?.title ?? "Travel plan"}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    {p.amount_cents != null
                      ? `$${(p.amount_cents / 100).toFixed(2)} ${(p.currency ?? "usd").toUpperCase()}`
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${statusBadge[p.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">
                    {(p.paid_at ?? p.created_at).slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
