"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavUser = { email: string } | null;

const LINKS = (user: NavUser, isAdmin: boolean) => [
  { href: "/", label: "Explore", icon: "🗺️" },
  { href: "/plans/new", label: "Create a Plan", icon: "✨" },
  ...(user ? [{ href: "/dashboard", label: "My Plans", icon: "🧳" }] : []),
  ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: "📊" }] : []),
];

function NavLinks({
  user,
  isAdmin,
  onNavigate,
}: {
  user: NavUser;
  isAdmin: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-1">
      {LINKS(user, isAdmin).map((link) => {
        const active =
          link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              active
                ? "bg-teal-50 text-teal-800"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <span aria-hidden>{link.icon}</span>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

function UserSection({ user, onNavigate }: { user: NavUser; onNavigate?: () => void }) {
  if (!user) {
    return (
      <Link
        href="/login"
        onClick={onNavigate}
        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      >
        <span aria-hidden>👤</span> Sign in
      </Link>
    );
  }
  return (
    <div className="px-3 py-2">
      <p className="truncate text-xs text-slate-400" title={user.email}>
        {user.email}
      </p>
      <form action="/auth/signout" method="post">
        <button className="mt-1 text-sm font-medium text-slate-600 hover:text-slate-900">
          Sign out
        </button>
      </form>
    </div>
  );
}

export default function AppNav({
  user,
  isAdmin,
}: {
  user: NavUser;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer on navigation and lock body scroll while it's open.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-slate-200 bg-white lg:flex">
        <Link href="/" className="px-5 py-5 text-lg font-bold tracking-tight">
          🧭 Wayfare
        </Link>
        <div className="flex-1 overflow-y-auto px-3">
          <NavLinks user={user} isAdmin={isAdmin} />
        </div>
        <div className="border-t border-slate-100 px-3 py-3">
          <UserSection user={user} />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <Link href="/" className="text-lg font-bold tracking-tight">
          🧭 Wayfare
        </Link>
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
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
            <div className="flex-1 overflow-y-auto px-3">
              <NavLinks user={user} isAdmin={isAdmin} onNavigate={() => setOpen(false)} />
            </div>
            <div className="border-t border-slate-100 px-3 py-3">
              <UserSection user={user} onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
