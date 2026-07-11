"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavUser = { email: string } | null;

// Global top navigation: main touchpoints only. Account-area links (plan
// library, profile, billing) live in the account sidebar, not here.
export default function AppNav({ user }: { user: NavUser }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const links = [
    { href: "/", label: "Explore" },
    ...(user ? [{ href: "/dashboard", label: "My Account" }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <nav
        aria-label="Main navigation"
        className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3"
      >
        <Link href="/" className="text-lg font-bold tracking-tight">
          🧭 Wayfare
        </Link>

        {/* Desktop links */}
        <div className="ml-auto hidden items-center gap-5 text-sm lg:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={pathname === l.href ? "page" : undefined}
              className={
                (l.href === "/" ? pathname === "/" : pathname.startsWith(l.href))
                  ? "font-semibold text-teal-700"
                  : "text-slate-600 hover:text-teal-700"
              }
            >
              {l.label}
            </Link>
          ))}
          {user ? (
            <form action="/auth/signout" method="post">
              <button className="text-slate-500 hover:text-slate-800">Sign out</button>
            </form>
          ) : (
            <Link href="/login" className="text-slate-600 hover:text-teal-700">
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

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="ml-auto rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </nav>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between px-4 py-4">
              <span className="text-lg font-bold tracking-tight">🧭 Wayfare</span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto px-3">
              <Link href="/" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
                🗺️ Explore
              </Link>
              <Link href="/plans/new" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
                ✨ Create a Plan
              </Link>
              {user && (
                <Link href="/dashboard" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
                  👤 My Account
                </Link>
              )}
            </div>
            <div className="border-t border-slate-100 px-3 py-3">
              {user ? (
                <div className="px-3 py-1">
                  <p className="truncate text-xs text-slate-400" title={user.email}>{user.email}</p>
                  <form action="/auth/signout" method="post">
                    <button className="mt-1 text-sm font-medium text-slate-600 hover:text-slate-900">Sign out</button>
                  </form>
                </div>
              ) : (
                <Link href="/login" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
                  👤 Sign in
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
