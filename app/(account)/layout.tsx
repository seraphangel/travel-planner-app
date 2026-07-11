import { createClient } from "@/lib/supabase/server";
import AccountNav from "./AccountNav";

// Shell for signed-in account pages (plan library, profile, billing, admin):
// left sidebar on desktop, horizontal tabs on mobile. Pages inside handle
// their own auth redirects.
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const isAdmin = Boolean(
    user?.email && adminEmails.includes(user.email.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="lg:flex lg:gap-8">
        <AccountNav isAdmin={isAdmin} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
