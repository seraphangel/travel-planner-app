import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { currencyFromBudgetString } from "@/lib/currencies";
import { generatePlanContent, persistGeneration, type GenerationInput } from "@/lib/generation";
import { researchDestination, type ResearchResult } from "@/lib/research";
import { isAdminEmail } from "@/lib/permissions";
import { isDemoPlan } from "@/lib/types";
import { countPlanAudits, fullRegenLimit } from "@/lib/limits";
import { composeRecommendations, composeDaysChunk, DAYS_PER_CHUNK } from "@/lib/enriched";
import { legacyFieldsFromSchedule, parseSchedule, placeTitlesFrom, serializeSchedule } from "@/lib/schedule";

export const maxDuration = 120;

/**
 * POST /api/plans/generate-step   Body: { planId, restart?: boolean }
 *
 * Client-driven async generation. Each call performs ONE bounded unit of
 * work within the serverless time limit and advances travel_plans.status:
 *
 *   enrich:queued  → live web research           → enrich:researched
 *   enrich:researched → compose recommendations  → enrich:days:0
 *   enrich:days:N  → compose days N+1..N+chunk   → enrich:days:M | published
 *
 * State lives in the DB, so generation is resumable after a closed tab or a
 * failed step (retry re-runs the same step). Without an OpenAI key the
 * template engine runs in a single step, same as the old sync path.
 */

const RESEARCH_CATEGORY = "_research";

function buildInput(plan: {
  title: string;
  origin_country: string;
  trip_purpose: string;
  budget_range: string | null;
  duration_days: number | null;
  start_date: string | null;
  destinations?: { city: string; country: string } | null;
}): GenerationInput {
  return {
    city: plan.destinations?.city ?? plan.title,
    country: plan.destinations?.country ?? "",
    origin_country: plan.origin_country,
    trip_purpose: plan.trip_purpose,
    budget_range: plan.budget_range,
    duration_days: plan.duration_days ?? 5,
    start_date: plan.start_date,
    currency: currencyFromBudgetString(plan.budget_range),
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();

  let planId = "";
  let restart = false;
  try {
    const body = await request.json();
    planId = String(body.planId ?? "");
    restart = body.restart === true;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!planId) return NextResponse.json({ error: "planId is required" }, { status: 400 });

  const { data: plan, error } = await supabase
    .from("travel_plans")
    .select("*, destinations(*)")
    .eq("id", planId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  const totalDays = plan.duration_days ?? 5;
  const input = buildInput(plan);

  if (restart) {
    // Cost cap: a full regeneration runs the research pipeline (~$0.20-0.30).
    // plan.generated is audited once per completed generation, including the
    // first, so the limit covers total runs. Admins bypass for testing.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!isAdminEmail(user?.email)) {
      const unlocked = plan.is_unlocked || isDemoPlan(plan.id);
      const limit = fullRegenLimit(unlocked);
      const used = await countPlanAudits(supabase, plan.id, "plan.generated");
      if (used >= limit) {
        return NextResponse.json(
          {
            error: unlocked
              ? `This plan has used all ${limit} included generations.`
              : `Free plans include ${limit} full generations — unlock the plan for ${fullRegenLimit(true)}.`,
            code: "regen_limit_reached",
          },
          { status: 403 },
        );
      }
    }
    await supabase.from("plan_recommendations").delete().eq("travel_plan_id", plan.id);
    await supabase.from("itinerary_days").delete().eq("travel_plan_id", plan.id);
    await supabase.from("travel_plans").update({ status: "enrich:queued" }).eq("id", plan.id);
    plan.status = "enrich:queued";
    if (process.env.OPENAI_API_KEY) {
      // Return immediately — the plan page's progress component runs the steps.
      return NextResponse.json({
        status: "enrich:queued",
        stage: "research",
        done: 0,
        total: totalDays,
        next: true,
      });
    }
  }

  // ── No AI key: single-step template generation (legacy behavior) ──────────
  if (!process.env.OPENAI_API_KEY) {
    try {
      const content = await generatePlanContent(input);
      await persistGeneration(supabase, plan, content);
      await supabase.from("travel_plans").update({ status: "published" }).eq("id", plan.id);
      await writeAuditLog(supabase, {
        action: "plan.generated",
        entity_type: "travel_plan",
        entity_id: plan.id,
        user_id: plan.user_id,
        detail: { source: content.source, days: content.itinerary.length },
        risk_level: "low",
      });
      return NextResponse.json({ status: "published", stage: "done", done: totalDays, total: totalDays, next: false });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Generation failed";
      return NextResponse.json({ error: message.slice(0, 200) }, { status: 502 });
    }
  }

  const status: string = plan.status ?? "enrich:queued";

  // A plan that isn't mid-generation has nothing to do here. Only the
  // restart path (cost-capped above) resets status to enrich:queued, so this
  // is also what prevents re-running the paid pipeline on a published plan by
  // calling the endpoint directly.
  if (!status.startsWith("enrich:")) {
    return NextResponse.json({ status, stage: "done", done: totalDays, total: totalDays, next: false });
  }

  try {
    // ── Step 1: live web research ────────────────────────────────────────────
    if (status === "enrich:queued") {
      const research = await researchDestination(input);
      await supabase.from("plan_recommendations").delete().eq("travel_plan_id", plan.id).eq("category", RESEARCH_CATEGORY);
      const { error: insErr } = await supabase.from("plan_recommendations").insert({
        travel_plan_id: plan.id,
        user_id: plan.user_id,
        category: RESEARCH_CATEGORY,
        name: "research_notes",
        description: JSON.stringify(research),
        recommendation_source: "openai-web-search",
        recommendation_confidence: 1,
        recommendation_review_status: "approved",
      });
      if (insErr) throw new Error(insErr.message);
      await supabase.from("travel_plans").update({ status: "enrich:researched" }).eq("id", plan.id);
      await writeAuditLog(supabase, {
        action: "plan.enrich_step",
        entity_type: "travel_plan",
        entity_id: plan.id,
        user_id: plan.user_id,
        detail: { step: "research", searches: research.searches, sources: research.sources.length, usage: research.usage ?? null },
        risk_level: "low",
      });
      return NextResponse.json({ status: "enrich:researched", stage: "recommendations", done: 0, total: totalDays, next: true });
    }

    // Later steps need the stored research.
    const { data: researchRow } = await supabase
      .from("plan_recommendations")
      .select("description")
      .eq("travel_plan_id", plan.id)
      .eq("category", RESEARCH_CATEGORY)
      .maybeSingle();
    if (!researchRow?.description) {
      // Research vanished (e.g. legacy plan) — restart from the top.
      await supabase.from("travel_plans").update({ status: "enrich:queued" }).eq("id", plan.id);
      return NextResponse.json({ status: "enrich:queued", stage: "research", done: 0, total: totalDays, next: true });
    }
    const research = JSON.parse(researchRow.description) as ResearchResult;

    // ── Step 2: recommendations ──────────────────────────────────────────────
    if (status === "enrich:researched") {
      const { recommendations, usage } = await composeRecommendations(input, research);
      await supabase.from("plan_recommendations").delete().eq("travel_plan_id", plan.id).neq("category", RESEARCH_CATEGORY);
      const { error: insErr } = await supabase.from("plan_recommendations").insert(
        recommendations.map((r) => ({
          travel_plan_id: plan.id,
          user_id: plan.user_id,
          category: r.category,
          name: r.name,
          description: r.description,
          location: r.location ?? null,
          price_range: r.price_range ?? null,
          rating: r.rating ?? null,
          recommendation_value: r.value,
          recommendation_source: "openai-enriched",
          recommendation_confidence: r.confidence,
          recommendation_review_status: r.confidence >= 0.7 ? "approved" : "unreviewed",
        })),
      );
      if (insErr) throw new Error(insErr.message);
      await supabase.from("travel_plans").update({ status: "enrich:days:0" }).eq("id", plan.id);
      await writeAuditLog(supabase, {
        action: "plan.enrich_step",
        entity_type: "travel_plan",
        entity_id: plan.id,
        user_id: plan.user_id,
        detail: { step: "recommendations", count: recommendations.length, usage: usage ?? null },
        risk_level: "low",
      });
      return NextResponse.json({ status: "enrich:days:0", stage: "days", done: 0, total: totalDays, next: true });
    }

    // ── Step 3+: day chunks ──────────────────────────────────────────────────
    const daysMatch = status.match(/^enrich:days:(\d+)$/);
    if (daysMatch) {
      const doneSoFar = Number(daysMatch[1]);
      const fromDay = doneSoFar + 1;
      const toDay = Math.min(doneSoFar + DAYS_PER_CHUNK, totalDays);
      if (fromDay > totalDays) {
        await supabase.from("travel_plans").update({ status: "published" }).eq("id", plan.id);
        return NextResponse.json({ status: "published", stage: "done", done: totalDays, total: totalDays, next: false });
      }

      // Gather the actual named places used on all prior days so this chunk
      // can avoid repeating any of them (the root cause of duplicate suggestions).
      const { data: prevDays } = await supabase
        .from("itinerary_days")
        .select("notes")
        .eq("travel_plan_id", plan.id)
        .lte("day_number", doneSoFar);
      const usedPlaces: string[] = [];
      for (const d of prevDays ?? []) {
        const s = parseSchedule(d.notes);
        if (s) usedPlaces.push(...placeTitlesFrom(s));
      }

      const { days, usage } = await composeDaysChunk(input, research, fromDay, toDay, usedPlaces);

      await supabase
        .from("itinerary_days")
        .delete()
        .eq("travel_plan_id", plan.id)
        .gte("day_number", fromDay)
        .lte("day_number", toDay);

      const start = plan.start_date ? new Date(plan.start_date + "T00:00:00Z") : null;
      const { error: insErr } = await supabase.from("itinerary_days").insert(
        days.map(({ n, schedule, summary }) => {
          const legacy = legacyFieldsFromSchedule(schedule);
          let day_date: string | null = null;
          if (start) {
            const dt = new Date(start);
            dt.setUTCDate(dt.getUTCDate() + n - 1);
            day_date = dt.toISOString().slice(0, 10);
          }
          return {
            travel_plan_id: plan.id,
            user_id: plan.user_id,
            day_number: n,
            day_date,
            ...legacy,
            notes: serializeSchedule(schedule),
            itinerary_value: summary,
            itinerary_source: "openai-enriched",
            itinerary_confidence: 0.85,
            itinerary_review_status: "approved",
          };
        }),
      );
      if (insErr) throw new Error(insErr.message);

      const finished = toDay >= totalDays;
      await supabase
        .from("travel_plans")
        .update({ status: finished ? "published" : `enrich:days:${toDay}` })
        .eq("id", plan.id);
      await writeAuditLog(supabase, {
        action: finished ? "plan.generated" : "plan.enrich_step",
        entity_type: "travel_plan",
        entity_id: plan.id,
        user_id: plan.user_id,
        detail: finished
          ? { source: "openai-enriched", days: totalDays, researched: research.searched_at, usage: usage ?? null }
          : { step: `days ${fromDay}-${toDay}`, usage: usage ?? null },
        risk_level: "low",
      });
      return NextResponse.json({
        status: finished ? "published" : `enrich:days:${toDay}`,
        stage: finished ? "done" : "days",
        done: toDay,
        total: totalDays,
        next: !finished,
      });
    }

    // Already published or unknown state — nothing to do.
    return NextResponse.json({ status, stage: "done", done: totalDays, total: totalDays, next: false });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation step failed";
    await writeAuditLog(supabase, {
      action: "plan.enrich_step_failed",
      entity_type: "travel_plan",
      entity_id: plan.id,
      user_id: plan.user_id,
      detail: { status, message: message.slice(0, 300) },
      risk_level: "medium",
    });
    // Status is left unchanged so a retry re-runs this same step.
    return NextResponse.json({ error: message.slice(0, 200), status, retryable: true }, { status: 502 });
  }
}
