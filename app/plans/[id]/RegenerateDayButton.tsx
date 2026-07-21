"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DayTimeline from "./DayTimeline";
import type { DaySchedule } from "@/lib/schedule";

type SimpleDraft = {
  morning: string;
  afternoon: string;
  evening: string;
  meals: string;
  transport: string;
  summary: string;
  confidence: number;
  source: string;
};
type EnrichedDraft = { schedule: DaySchedule; summary: string; source: string };
type Draft = (SimpleDraft | EnrichedDraft) & { source: string };

function isEnriched(d: Draft): d is EnrichedDraft & { source: string } {
  return "schedule" in d && !!(d as EnrichedDraft).schedule;
}

// Medium-risk agent action: the regenerated day is shown as a draft and only
// saved when the user explicitly applies it (docs/AGENTIC_LAYER.md).
export default function RegenerateDayButton({
  planId,
  dayNumber,
}: {
  planId: string;
  dayNumber: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"draft" | "apply" | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  async function call(payload: Record<string, unknown>) {
    const res = await fetch("/api/itinerary/regenerate-day", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, dayNumber, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Request failed");
    return data;
  }

  async function getDraft() {
    setBusy("draft");
    setError(null);
    try {
      const data = await call({});
      setDraft(data.draft);
      if (typeof data.remaining === "number") setRemaining(data.remaining);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate a draft");
    } finally {
      setBusy(null);
    }
  }

  async function applyDraft() {
    if (!draft) return;
    setBusy("apply");
    setError(null);
    try {
      await call({ apply: true, draft });
      setDraft(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not apply the draft");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-3">
      {!draft && (
        <button
          onClick={getDraft}
          disabled={busy !== null}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
        >
          {busy === "draft" ? "Drafting a new day…" : "↻ Regenerate this day"}
        </button>
      )}

      {draft && (
        <div className="rounded-xl border-2 border-dashed border-teal-300 bg-teal-50/50 p-4">
          <div className="flex items-baseline justify-between">
            <h4 className="font-semibold text-teal-900">
              Draft replacement — Day {dayNumber}
              {draft.summary ? ` — ${draft.summary}` : ""}
            </h4>
            <span className="text-xs text-slate-500">
              not saved yet
              {remaining != null ? ` · ${remaining} regeneration${remaining === 1 ? "" : "s"} left` : ""}
            </span>
          </div>

          <div className="mt-2 rounded-lg bg-white p-3">
            {isEnriched(draft) ? (
              <DayTimeline schedule={draft.schedule} />
            ) : (
              <>
                <dl className="grid gap-2 sm:grid-cols-3 text-sm">
                  <div><dt className="font-medium text-slate-500">🌅 Morning</dt><dd>{draft.morning}</dd></div>
                  <div><dt className="font-medium text-slate-500">☀️ Afternoon</dt><dd>{draft.afternoon}</dd></div>
                  <div><dt className="font-medium text-slate-500">🌙 Evening</dt><dd>{draft.evening}</dd></div>
                </dl>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 text-sm text-slate-600">
                  {draft.meals && <p>🍽️ {draft.meals}</p>}
                  {draft.transport && <p>🚉 {draft.transport}</p>}
                </div>
                {draft.confidence < 0.7 && (
                  <p className="mt-2 text-xs text-amber-600">⚠️ AI-generated — verify before booking</p>
                )}
              </>
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <button
              onClick={applyDraft}
              disabled={busy !== null}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
            >
              {busy === "apply" ? "Applying…" : "Apply draft"}
            </button>
            <button
              onClick={() => setDraft(null)}
              disabled={busy !== null}
              className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-slate-800"
            >
              Discard
            </button>
            <button
              onClick={getDraft}
              disabled={busy !== null}
              className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-slate-800"
            >
              Try another
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
