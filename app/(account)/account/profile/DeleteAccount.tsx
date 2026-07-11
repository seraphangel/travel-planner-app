"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteAccount() {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not delete the account");
      router.push("/?account_deleted=1");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the account");
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-red-200 bg-white p-6">
      <h2 className="font-semibold text-red-800">Danger zone</h2>
      <p className="mt-2 text-sm text-slate-600">
        Deleting your account permanently removes all of your travel plans and
        itineraries. This cannot be undone. Payments are not automatically
        refunded — contact support for refund requests.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder='Type "DELETE" to confirm'
          aria-label="Type DELETE to confirm account deletion"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-200"
        />
        <button
          onClick={onDelete}
          disabled={busy || confirm !== "DELETE"}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? "Deleting…" : "Delete my account"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
    </section>
  );
}
