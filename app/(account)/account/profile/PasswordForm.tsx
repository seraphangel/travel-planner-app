"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function PasswordForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setDone(false);
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      (e.target as HTMLFormElement).reset?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update password");
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200";

  return (
    <form onSubmit={onSubmit} className="mt-4 max-w-sm space-y-4">
      {done && (
        <p role="status" className="rounded-lg border border-teal-300 bg-teal-50 p-3 text-sm text-teal-800">
          Password updated ✓
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      <div>
        <label htmlFor="password" className="text-sm font-medium">New password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" className={inputClass} />
      </div>
      <div>
        <label htmlFor="confirm" className="text-sm font-medium">Confirm new password</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" className={inputClass} />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
      >
        {busy ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
