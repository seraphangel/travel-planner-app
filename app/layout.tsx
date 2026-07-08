import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";

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

  return (
    <html lang="en">
      <body className="antialiased bg-slate-50 text-slate-900 min-h-screen flex flex-col">
        <header className="border-b border-slate-200 bg-white">
          <nav
            className="mx-auto max-w-5xl px-4 py-3 flex items-center gap-6"
            aria-label="Main navigation"
          >
            <Link href="/" className="font-bold text-lg tracking-tight">
              🧭 Wayfare
            </Link>
            <div className="ml-auto flex items-center gap-4 text-sm">
              <Link href="/" className="hover:text-teal-700">
                Explore
              </Link>
              {user ? (
                <>
                  <Link href="/dashboard" className="hover:text-teal-700">
                    My Plans
                  </Link>
                  <form action="/auth/signout" method="post">
                    <button className="text-slate-500 hover:text-slate-800">
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <Link href="/login" className="hover:text-teal-700">
                  Sign in
                </Link>
              )}
              <Link
                href="/plans/new"
                className="rounded-lg bg-teal-600 px-3.5 py-1.5 font-medium text-white hover:bg-teal-700"
              >
                Create a Plan
              </Link>
            </div>
          </nav>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
          Wayfare · AI-generated travel plans — verify details before booking
        </footer>
      </body>
    </html>
  );
}
