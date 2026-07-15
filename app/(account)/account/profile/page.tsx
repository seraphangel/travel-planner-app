import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/permissions";
import EmailForm from "./EmailForm";
import PasswordForm from "./PasswordForm";
import DeleteAccount from "./DeleteAccount";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/account/profile")}`);
  const admin = isAdminEmail(user.email);

  const { count: planCount } = await supabase
    .from("travel_plans")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  return (
    <main>
      <h1 className="text-3xl font-bold tracking-tight">Profile</h1>

      {admin && (
        <p className="mt-3 inline-block rounded-full bg-teal-50 px-3 py-1 text-sm font-medium text-teal-700">
          ⭐ Admin account — unlimited plans and free AI posters
        </p>
      )}

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold">Account details</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3 text-sm">
          <div>
            <dt className="text-slate-500">Email</dt>
            <dd className="mt-0.5 font-medium">{user.email}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Member since</dt>
            <dd className="mt-0.5 font-medium">
              {new Date(user.created_at).toISOString().slice(0, 10)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Plans created</dt>
            <dd className="mt-0.5 font-medium">{planCount ?? 0}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold">Change email</h2>
        <EmailForm currentEmail={user.email ?? ""} />
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold">Change password</h2>
        <PasswordForm />
      </section>

      <DeleteAccount />
    </main>
  );
}
