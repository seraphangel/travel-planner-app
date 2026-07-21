import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canEditPlan, isAdminEmail } from "@/lib/permissions";
import { generateSingleDay, type GenerationInput } from "@/lib/generation";
import { composeDaysChunk } from "@/lib/enriched";
import type { ResearchResult } from "@/lib/research";
import { writeAuditLog } from "@/lib/audit";
import { currencyFromBudgetString } from "@/lib/currencies";
import { countPlanAudits, dayRegenLimit } from "@/lib/limits";
import { isDemoPlan } from "@/lib/types";
import {
  legacyFieldsFromSchedule,
  parseSchedule,
  placeTitlesFrom,
  serializeSchedule,
} from "@/lib/schedule";

export const maxDuration = 120;

const RESEARCH_CATEGORY = "_research";

/**
 * POST /api/itinerary/regenerate-day
 * Medium-risk action (docs/AGENTIC_LAYER.md): the draft is returned for the
 * user to review and is only persisted on an explicit confirm call.
 *
 * Draft:   { planId, dayNumber }                → { draft }
 * Confirm: { planId, dayNumber, apply, draft }  → { ok: true }
 *
 * When the plan has stored web-research (enriched plans), the new day is
 * composed in the SAME enriched format as the rest of the plan (timed blocks,
 * per-stop directions, cuisine, itemized costs, meal alternatives). Older
 * plans with no research fall back to the simple morning/afternoon/evening
 * format so the button still works everywhere.
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const planId = String(body.planId ?? "");
  const dayNumber = Number(body.dayNumber);
  if (!planId || !Number.isInteger(dayNumber) || dayNumber < 1) {
    return NextResponse.json({ error: "planId and dayNumber are required" }, { status: 400 });
  }

  const { data: plan, error } = await supabase
    .from("travel_plans")
    .select("*, destinations(*)")
    .eq("id", planId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  if (dayNumber > (plan.duration_days ?? 0)) {
    return NextResponse.json({ error: "That day is outside this trip" }, { status: 400 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!canEditPlan(plan, user?.id)) {
    return NextResponse.json({ error: "You don't have permission to edit this plan" }, { status: 403 });
  }

  // ── Confirm: persist a previously returned draft ──────────────────────────
  if (body.apply === true) {
    const draft = body.draft as Record<string, unknown> | undefined;
    if (!draft) return NextResponse.json({ error: "draft is required to apply" }, { status: 400 });

    // Enriched draft carries a full schedule; simple draft has text fields.
    const draftSchedule = draft.schedule
      ? parseSchedule(typeof draft.schedule === "string" ? draft.schedule : JSON.stringify(draft.schedule))
      : null;

    let fields: Record<string, unknown>;
    if (draftSchedule) {
      const legacy = legacyFieldsFromSchedule(draftSchedule);
      fields = {
        notes: serializeSchedule(draftSchedule),
        ...legacy,
        itinerary_value: String(draft.summary ?? ""),
        itinerary_source: String(draft.source ?? "openai-enriched"),
        itinerary_confidence: 0.85,
        itinerary_review_status: "approved",
      };
    } else {
      fields = {
        // Simple draft: clear any rich schedule so the day renders the draft.
        notes: null,
        morning_activity: String(draft.morning ?? ""),
        afternoon_activity: String(draft.afternoon ?? ""),
        evening_activity: String(draft.evening ?? ""),
        meals: String(draft.meals ?? ""),
        transport_notes: String(draft.transport ?? ""),
        itinerary_value: String(draft.summary ?? ""),
        itinerary_source: String(draft.source ?? "unknown"),
        itinerary_confidence: Number(draft.confidence ?? 0.5),
        itinerary_review_status: Number(draft.confidence ?? 0) >= 0.7 ? "approved" : "unreviewed",
      };
    }

    const { data: existing } = await supabase
      .from("itinerary_days")
      .select("id")
      .eq("travel_plan_id", plan.id)
      .eq("day_number", dayNumber)
      .maybeSingle();

    if (existing) {
      const { error: upErr } = await supabase.from("itinerary_days").update(fields).eq("id", existing.id);
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    } else {
      const { error: insErr } = await supabase.from("itinerary_days").insert({
        travel_plan_id: plan.id,
        user_id: plan.user_id,
        day_number: dayNumber,
        day_date: plan.start_date
          ? new Date(new Date(plan.start_date + "T00:00:00Z").getTime() + (dayNumber - 1) * 86_400_000)
              .toISOString()
              .slice(0, 10)
          : null,
        ...fields,
      });
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    await writeAuditLog(supabase, {
      action: "itinerary_day.regenerated",
      entity_type: "travel_plan",
      entity_id: plan.id,
      user_id: user?.id ?? null,
      detail: { day_number: dayNumber, source: fields.itinerary_source, enriched: !!draftSchedule },
      risk_level: "medium",
    });
    return NextResponse.json({ ok: true });
  }

  // ── Draft: generate but do NOT save ───────────────────────────────────────
  // Cost cap: each draft is a paid AI call. Limits scale with plan status
  // (locked vs unlocked); admins bypass for testing.
  const admin = isAdminEmail(user?.email);
  const unlocked = plan.is_unlocked || isDemoPlan(plan.id);
  const limit = dayRegenLimit(unlocked);
  const used = await countPlanAudits(supabase, plan.id, "itinerary_day.draft_created");
  if (!admin && used >= limit) {
    return NextResponse.json(
      {
        error: unlocked
          ? `This plan has used all ${limit} included day regenerations.`
          : `Free plans include ${limit} day regenerations — unlock the full plan for ${dayRegenLimit(true)}.`,
        code: "regen_limit_reached",
      },
      { status: 403 },
    );
  }

  // Places used on the OTHER days of this plan, so the new day doesn't repeat them.
  const { data: otherDays } = await supabase
    .from("itinerary_days")
    .select("notes")
    .eq("travel_plan_id", plan.id)
    .neq("day_number", dayNumber);
  const avoidPlaces: string[] = [];
  for (const d of otherDays ?? []) {
    const s = parseSchedule(d.notes);
    if (s) avoidPlaces.push(...placeTitlesFrom(s));
  }

  const input: GenerationInput = {
    city: plan.destinations?.city ?? plan.title,
    country: plan.destinations?.country ?? "",
    origin_country: plan.origin_country,
    trip_purpose: plan.trip_purpose,
    budget_range: plan.budget_range,
    currency: currencyFromBudgetString(plan.budget_range),
    duration_days: plan.duration_days ?? dayNumber,
    start_date: plan.start_date,
    avoidPlaces,
  };

  // Enriched path: reuse the stored web-research to compose one day in the
  // full enriched format, matching the rest of the plan.
  const { data: researchRow } = await supabase
    .from("plan_recommendations")
    .select("description")
    .eq("travel_plan_id", plan.id)
    .eq("category", RESEARCH_CATEGORY)
    .maybeSingle();

  try {
    if (process.env.OPENAI_API_KEY && researchRow?.description) {
      const research = JSON.parse(researchRow.description) as ResearchResult;
      const { days } = await composeDaysChunk(input, research, dayNumber, dayNumber, avoidPlaces);
      if (days.length === 0) throw new Error("No day produced");
      const { schedule, summary } = days[0];

      await writeAuditLog(supabase, {
        action: "itinerary_day.draft_created",
        entity_type: "travel_plan",
        entity_id: plan.id,
        user_id: user?.id ?? null,
        detail: { day_number: dayNumber, source: "openai-enriched", enriched: true },
        risk_level: "low",
      });

      return NextResponse.json({
        draft: { schedule, summary, source: "openai-enriched" },
        remaining: admin ? null : Math.max(0, limit - used - 1),
      });
    }

    // Fallback: simple format (no research / no AI key).
    const day = await generateSingleDay(input, dayNumber);
    const source = process.env.OPENAI_API_KEY
      ? `openai-${process.env.OPENAI_MODEL ?? "gpt-4o"}`
      : "template-v1";

    await writeAuditLog(supabase, {
      action: "itinerary_day.draft_created",
      entity_type: "travel_plan",
      entity_id: plan.id,
      user_id: user?.id ?? null,
      detail: { day_number: dayNumber, source, enriched: false },
      risk_level: "low",
    });

    return NextResponse.json({
      draft: { ...day, source },
      remaining: admin ? null : Math.max(0, limit - used - 1),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed";
    return NextResponse.json(
      { error: `Couldn't generate a new draft for day ${dayNumber}: ${message.slice(0, 160)}` },
      { status: 502 },
    );
  }
}
