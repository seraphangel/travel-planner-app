"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Account-area navigation: sidebar on desktop, horizontal tabs on mobile.
export default function AccountNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const links = [
    { href: "/dashboard", label: "Plan Library", icon: "🧳" },
    { href: "/account/profile", label: "Profile", icon: "👤" },
    { href: "/account/billing", label: "Billing", icon: "💳" },
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: "📊" }] : []),
  ];

  const itemClass = (active: boolean) =>
    `flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium whitespace-nowrap transition ${
      active
        ? "bg-teal-50 text-teal-800"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
    }`;

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-52 shrink-0 lg:block" aria-label="Account navigation">
        <nav className="sticky top-20 flex flex-col gap-1">
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            My Account
          </p>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={pathname.startsWith(l.href) ? "page" : undefined}
              className={itemClass(pathname.startsWith(l.href))}
            >
              <span aria-hidden>{l.icon}</span> {l.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Mobile horizontal tabs */}
      <nav
        aria-label="Account navigation"
        className="-mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 pb-2 lg:hidden"
      >
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={pathname.startsWith(l.href) ? "page" : undefined}
            className={itemClass(pathname.startsWith(l.href))}
          >
            <span aria-hidden>{l.icon}</span> {l.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
