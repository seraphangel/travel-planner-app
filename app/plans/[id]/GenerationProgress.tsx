"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const STAGE_LABEL: Record<string, string> = {
  research: "Researching your destination — live web search for current prices, hours and closures",
  recommendations: "Curating recommendations from the research",
  days: "Building your day-by-day itinerary",
  done: "Finishing up",
};

/**
 * Drives the resumable generation state machine: calls /api/plans/generate-step
 * until the plan is published, showing stage + progress. Survives reloads —
 * state lives in the DB, this component just keeps stepping.
 */
export default function GenerationProgress({
  planId,
  initialStatus,
}: {
  planId: string;
  initialStatus: string;
}) {
  const router = useRouter();
  const [stage, setStage] = useState(
    initialStatus === "enrich:researched" ? "recommendations" : initialStatus.startsWith("enrich:days") ? "days" : "research",
  );
  const [done, setDone] = useState(() => {
    const m = initialStatus.match(/^enrich:days:(\d+)$/);
    return m ? Number(m[1]) : 0;
  });
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  const step = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setError(null);
    try {
      for (let i = 0; i < 20; i++) {
        const res = await fetch("/api/plans/generate-step", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Generation step failed");
        setStage(data.stage ?? "days");
        setDone(data.done ?? 0);
        setTotal(data.total ?? 0);
        if (!data.next) {
          router.refresh();
          return;
        }
      }
      throw new Error("Generation is taking longer than expected — click retry to continue.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      running.current = false;
    }
  }, [planId, router]);

  useEffect(() => {
    step();
  }, [step]);

  const stages: [string, string][] = [
    ["research", "Live research"],
    ["recommendations", "Recommendations"],
    ["days", "Daily itinerary"],
  ];
  const stageIndex = stages.findIndex(([k]) => k === stage);
  const pct =
    stage === "research" ? 8 : stage === "recommendations" ? 22 : total > 0 ? 30 + Math.round((done / total) * 68) : 30;

  return (
    <div className="mt-10 rounded-xl border border-slate-200 bg-white p-8">
      <div className="flex items-center gap-3">
        {!error && (
          <span
            aria-hidden
            className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-teal-600 border-t-transparent"
          />
        )}
        <h2 className="text-xl font-semibold">
          {error ? "Generation paused" : "Creating your researched travel plan…"}
        </h2>
      </div>

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-teal-600 transition-all duration-700"
          style={{ width: `${error ? pct : Math.max(pct, 8)}%` }}
        />
      </div>

      <ol className="mt-5 space-y-2 text-sm">
        {stages.map(([key, label], i) => (
          <li key={key} className="flex items-center gap-2">
            <span aria-hidden>
              {i < stageIndex || stage === "done" ? "✅" : i === stageIndex ? "⏳" : "○"}
            </span>
            <span className={i === stageIndex ? "font-medium" : "text-slate-500"}>
              {label}
              {key === "days" && total > 0 && stageIndex >= 2 ? ` — day ${Math.min(done + 1, total)} of ${total}` : ""}
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-4 text-xs text-slate-500" role="status">
        {error ? (
          <span className="text-red-600">{error}</span>
        ) : (
          STAGE_LABEL[stage] ?? "Working…"
        )}
      </p>
      <p className="mt-1 text-xs text-slate-400">
        This takes a couple of minutes for longer trips. You can leave and come
        back — progress is saved.
      </p>

      {error && (
        <button
          onClick={step}
          className="mt-4 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
        >
          Retry from where it stopped
        </button>
      )}
    </div>
  );
}
