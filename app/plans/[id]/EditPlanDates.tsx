"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function EditPlanDates({
  planId,
  startDate,
  endDate,
}: {
  planId: string;
  startDate: string | null;
  endDate: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const start_date = String(form.get("start_date") ?? "");
    const end_date = String(form.get("end_date") ?? "");
    if (!start_date || !end_date) {
      setError("Both dates are required");
      return;
    }
    if (end_date < start_date) {
      setError("End date must be on or after the start date");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/plans/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, start_date, end_date }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not update the plan");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the plan");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
      >
        ✏️ Edit dates
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
    >
      <div>
        <label htmlFor="edit_start" className="block text-xs font-medium text-slate-500">
          Start date
        </label>
        <input
          id="edit_start"
          name="start_date"
          type="date"
          defaultValue={startDate ?? ""}
          className="mt-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </div>
      <div>
        <label htmlFor="edit_end" className="block text-xs font-medium text-slate-500">
          End date
        </label>
        <input
          id="edit_end"
          name="end_date"
          type="date"
          defaultValue={endDate ?? ""}
          className="mt-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
      >
        {busy ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-slate-800"
      >
        Cancel
      </button>
      <p className="w-full text-xs text-slate-400">
        Shortening the trip removes trailing days; extending it generates new ones.
      </p>
      {error && (
        <p role="alert" className="w-full text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}
