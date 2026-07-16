"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Admin-only: reassign this plan to the signed-in admin's account.
export default function ClaimPlanButton({ planId }: { planId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function claim() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/plans/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not claim the plan");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not claim the plan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-block">
      <button
        onClick={claim}
        disabled={busy}
        title="Admin: assign this plan to my account"
        className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-800 hover:bg-teal-100 disabled:opacity-60"
      >
        {busy ? "Claiming…" : "⭐ Claim this plan"}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
