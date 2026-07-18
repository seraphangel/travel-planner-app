"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegenerateButton({
  planId,
  label = "Regenerate",
}: {
  planId: string;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function regenerate() {
    setBusy(true);
    setError(null);
    try {
      // Kick off (or restart) the resumable generation pipeline; the plan
      // page's progress component drives the remaining steps after refresh.
      const res = await fetch("/api/plans/generate-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, restart: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      router.replace(`/plans/${planId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-block">
      <button
        onClick={regenerate}
        disabled={busy}
        className="mt-4 rounded-lg bg-teal-600 px-5 py-2.5 font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
      >
        {busy ? "Generating… (can take a minute)" : label}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
