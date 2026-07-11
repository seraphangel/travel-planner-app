import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Admin access: signed-in users whose email is listed in ADMIN_EMAILS
// (comma-separated, set in Vercel env). Data reads use the service client so
// this page keeps working after the 0002 RLS lockdown is applied.
export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/admin")}`);

  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const isAdmin =
    adminEmails.length > 0 && adminEmails.includes((user.email ?? "").toLowerCase());

  if (!isAdmin) {
    return (
      <main className="py-16 text-center">
        <h1 className="text-2xl font-bold">Admin access required</h1>
        <p className="mt-2 text-slate-600">
          {adminEmails.length === 0
            ? "No admins are configured. Set ADMIN_EMAILS in the Vercel environment (comma-separated) to enable this page."
            : "Your account is not on the admin list."}
        </p>
      </main>
    );
  }

  const db = createServiceClient();
  const [plans, unlocked, subsPaid, signups, logs] = await Promise.all([
    db.from("travel_plans").select("id", { count: "exact", head: true }),
    db.from("travel_plans").select("id", { count: "exact", head: true }).eq("is_unlocked", true),
    db.from("subscriptions").select("amount_cents").eq("status", "paid"),
    db.from("travel_plans").select("user_id").not("user_id", "is", null),
    db.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(25),
  ]);

  const revenueCents = (subsPaid.data ?? []).reduce((sum, s) => sum + (s.amount_cents ?? 0), 0);
  const uniqueUsers = new Set((signups.data ?? []).map((r) => r.user_id)).size;

  const stats: [string, string][] = [
    ["Total plans", String(plans.count ?? 0)],
    ["Unlocked plans", String(unlocked.count ?? 0)],
    ["Users with plans", String(uniqueUsers)],
    ["Revenue", `$${(revenueCents / 100).toFixed(2)}`],
  ];

  const riskColor: Record<string, string> = {
    low: "bg-slate-100 text-slate-600",
    medium: "bg-amber-50 text-amber-700",
    high: "bg-orange-50 text-orange-700",
    critical: "bg-red-50 text-red-700",
  };

  return (
    <main>
      <h1 className="text-3xl font-bold tracking-tight">Admin</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="text-sm text-slate-500">{label}</div>
            <div className="mt-1 text-2xl font-bold">{value}</div>
          </div>
        ))}
      </div>

      <h2 className="mt-10 text-xl font-bold">Recent audit log</h2>
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">Risk</th>
            </tr>
          </thead>
          <tbody>
            {(logs.data ?? []).map((log) => (
              <tr key={log.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">
                  {String(log.created_at).slice(0, 19).replace("T", " ")}
                </td>
                <td className="px-4 py-2.5 font-medium">{log.action}</td>
                <td className="px-4 py-2.5 text-slate-500">
                  {log.entity_type}{log.entity_id ? ` · ${String(log.entity_id).slice(0, 8)}…` : ""}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${riskColor[log.risk_level] ?? riskColor.low}`}>
                    {log.risk_level}
                  </span>
                </td>
              </tr>
            ))}
            {(logs.data ?? []).length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">No audit entries yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
