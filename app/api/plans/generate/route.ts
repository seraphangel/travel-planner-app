import { NextResponse } from "next/server";

/**
 * Deprecated: full-plan generation moved to /api/plans/generate-step
 * (async, resumable, cost-capped). This endpoint was the old synchronous
 * path and enforced no regeneration limits, so it returns 410 rather than
 * remaining an unmetered side door.
 */
export async function POST() {
  return NextResponse.json(
    { error: "This endpoint has moved. Use POST /api/plans/generate-step { planId, restart: true }." },
    { status: 410 },
  );
}
