"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (!email || !password) {
      setError("Email and password are required");
      return;
    }
    if (mode === "signup" && password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setBusy(true);
    const supabase = createClient();
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          setNotice(
            "Check your email for a confirmation link, then sign in to continue.",
          );
          setBusy(false);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.push(next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authentication failed");
      setBusy(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200";

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight">
        {mode === "signup" ? "Create your account" : "Welcome back"}
      </h1>
      <p className="mt-2 text-slate-600">
        {mode === "signup"
          ? "Sign up to own your plans and revisit them from any device."
          : "Sign in to see your plans."}
      </p>

      {error && (
        <div role="alert" className="mt-6 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="mt-6 rounded-lg border border-teal-300 bg-teal-50 p-4 text-teal-800">
          {notice}
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-8 space-y-5">
        <div>
          <label htmlFor="email" className="font-medium">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" className={inputClass} />
        </div>
        <div>
          <label htmlFor="password" className="font-medium">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            className={inputClass}
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-teal-600 px-6 py-3 font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
        >
          {busy ? "One moment…" : mode === "signup" ? "Sign up" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-sm text-slate-600">
        {mode === "signup" ? (
          <>Already have an account?{" "}
            <Link className="text-teal-700 underline" href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>
          </>
        ) : (
          <>New here?{" "}
            <Link className="text-teal-700 underline" href={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link>
          </>
        )}
      </p>
    </main>
  );
}
