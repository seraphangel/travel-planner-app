"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const BUDGET_OPTIONS = [
  "",
  "$500-$1000",
  "$1000-$2000",
  "$2000-$3500",
  "$3500-$5000",
  "$5000+",
];

export default function NewPlanPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const today = new Date().toISOString().slice(0, 10);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setApiError(null);

    const form = new FormData(e.currentTarget);
    const values = {
      destination: String(form.get("destination") ?? "").trim(),
      origin_country: String(form.get("origin_country") ?? "").trim(),
      start_date: String(form.get("start_date") ?? ""),
      end_date: String(form.get("end_date") ?? ""),
      budget_range: String(form.get("budget_range") ?? ""),
      trip_purpose: String(form.get("trip_purpose") ?? "holiday"),
    };

    // Inline validation — no API call on invalid input (docs/TEST_PLAN.md)
    const errors: Record<string, string> = {};
    if (!values.destination) errors.destination = "Enter a destination, e.g. “Tokyo, Japan”";
    if (!values.origin_country) errors.origin_country = "Enter the country you're travelling from";
    if (!values.start_date) errors.start_date = "Pick a start date";
    if (!values.end_date) errors.end_date = "Pick an end date";
    if (values.start_date && values.end_date && values.end_date < values.start_date) {
      errors.end_date = "End date must be on or after the start date";
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setBusy(true);
    try {
      const res = await fetch("/api/plans/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.id) throw new Error(data.error ?? "Could not create the plan");
      router.push(`/plans/${data.id}${data.generationFailed ? "?generation_error=1" : ""}`);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Could not create the plan");
      setBusy(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200";

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Create a travel plan</h1>
      <p className="mt-2 text-slate-600">
        Tell us about your trip — we&apos;ll research the destination and build
        a full day-by-day itinerary. Day 1 is free to preview.
      </p>

      {apiError && (
        <div role="alert" className="mt-6 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">
          {apiError}
        </div>
      )}

      <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
        <div>
          <label htmlFor="destination" className="font-medium">Destination</label>
          <input id="destination" name="destination" type="text" placeholder="Tokyo, Japan"
            className={inputClass} aria-invalid={!!fieldErrors.destination} />
          {fieldErrors.destination && <p role="alert" className="mt-1 text-sm text-red-600">{fieldErrors.destination}</p>}
        </div>

        <div>
          <label htmlFor="origin_country" className="font-medium">Travelling from</label>
          <input id="origin_country" name="origin_country" type="text" placeholder="United Kingdom"
            className={inputClass} aria-invalid={!!fieldErrors.origin_country} />
          {fieldErrors.origin_country && <p role="alert" className="mt-1 text-sm text-red-600">{fieldErrors.origin_country}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="start_date" className="font-medium">Start date</label>
            <input id="start_date" name="start_date" type="date" min={today}
              className={inputClass} aria-invalid={!!fieldErrors.start_date} />
            {fieldErrors.start_date && <p role="alert" className="mt-1 text-sm text-red-600">{fieldErrors.start_date}</p>}
          </div>
          <div>
            <label htmlFor="end_date" className="font-medium">End date</label>
            <input id="end_date" name="end_date" type="date" min={today}
              className={inputClass} aria-invalid={!!fieldErrors.end_date} />
            {fieldErrors.end_date && <p role="alert" className="mt-1 text-sm text-red-600">{fieldErrors.end_date}</p>}
          </div>
        </div>

        <div>
          <label htmlFor="budget_range" className="font-medium">Budget (optional)</label>
          <select id="budget_range" name="budget_range" className={inputClass} defaultValue="">
            {BUDGET_OPTIONS.map((b) => (
              <option key={b} value={b}>{b === "" ? "Flexible / not sure" : b}</option>
            ))}
          </select>
        </div>

        <fieldset>
          <legend className="font-medium">Trip purpose</legend>
          <div className="mt-2 flex gap-3">
            {["holiday", "business"].map((p) => (
              <label key={p} className="flex-1 cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-3 text-center capitalize has-checked:border-teal-500 has-checked:bg-teal-50 has-checked:font-semibold">
                <input type="radio" name="trip_purpose" value={p} defaultChecked={p === "holiday"} className="sr-only" />
                {p === "holiday" ? "🏖️ Holiday" : "💼 Business"}
              </label>
            ))}
          </div>
        </fieldset>

        <button type="submit" disabled={busy}
          className="w-full rounded-xl bg-teal-600 px-6 py-3.5 font-semibold text-white hover:bg-teal-700 disabled:opacity-60">
          {busy ? "Generating your plan… this can take a minute ✨" : "Generate my plan"}
        </button>
        {busy && (
          <p role="status" className="text-center text-sm text-slate-500">
            Researching your destination and building the itinerary — don&apos;t close this tab.
          </p>
        )}
      </form>
    </main>
  );
}
