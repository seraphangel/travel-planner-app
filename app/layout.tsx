import type { Metadata } from "next";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import AppNav from "./AppNav";

export const metadata: Metadata = {
  title: "Wayfare — AI Travel Planner",
  description:
    "Research a destination, get a day-by-day itinerary with recommendations for places, food, hotels, flights, transport and safety — in one click.",
};

export default async function RootLayout({
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
    <html lang="en">
      <body className="antialiased bg-slate-50 text-slate-900 min-h-screen">
        <AppNav user={user?.email ? { email: user.email } : null} isAdmin={isAdmin} />
        <div className="flex min-h-screen flex-col lg:pl-60">
          <div className="flex-1">{children}</div>
          <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
            Wayfare · AI-generated travel plans — verify details before booking
          </footer>
        </div>
      </body>
    </html>
  );
}
