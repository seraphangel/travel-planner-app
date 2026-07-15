"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function EmailForm({ currentEmail }: { currentEmail: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    if (!email || !email.includes("@")) {
      setError("Enter a valid email address");
      return;
    }
    if (email.toLowerCase() === currentEmail.toLowerCase()) {
      setError("That's already your email address");
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.updateUser({ email });
      if (error) throw error;
      // With "Secure email change" on (Supabase default), the email doesn't
      // change until a confirmation link is clicked. With it off, it changes
      // immediately. Detect which happened and message accordingly.
      if (data.user?.email?.toLowerCase() === email.toLowerCase()) {
        setMessage(`Email updated to ${email} ✓`);
        router.refresh();
      } else {
        setMessage(
          `A confirmation link has been sent to ${email}. Click it to finish changing your email.`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update email");
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200";

  return (
    <form onSubmit={onSubmit} className="mt-4 max-w-sm space-y-4">
      {message && (
        <p role="status" className="rounded-lg border border-teal-300 bg-teal-50 p-3 text-sm text-teal-800">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      <div>
        <label htmlFor="new-email" className="text-sm font-medium">New email address</label>
        <input
          id="new-email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={currentEmail}
          className={inputClass}
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
      >
        {busy ? "Updating…" : "Update email"}
      </button>
    </form>
  );
}
