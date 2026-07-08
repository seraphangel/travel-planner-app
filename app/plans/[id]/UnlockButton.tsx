"use client";

import { useState } from "react";

export default function UnlockButton({ planId }: { planId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Could not start checkout");
      }
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start checkout");
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        onClick={startCheckout}
        disabled={busy}
        className="mt-2 rounded-lg bg-teal-600 px-5 py-2.5 font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
      >
        {busy ? "Opening checkout…" : "Unlock Full Plan — $19"}
      </button>
      {error && (
        <p role="alert" className="mt-2 max-w-60 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
