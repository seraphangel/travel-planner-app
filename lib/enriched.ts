import type { GenerationInput, GeneratedRecommendation } from "@/lib/generation";
import { RECOMMENDATION_CATEGORIES, type RecommendationCategory } from "@/lib/types";
import { DEFAULT_CURRENCY } from "@/lib/currencies";
import type { DaySchedule, ScheduleBlock } from "@/lib/schedule";
import type { ResearchResult } from "@/lib/research";

/**
 * Phase 2 of the enriched pipeline: compose structured content from the
 * research notes (no web search here — bounded cost, reliable JSON).
 * Days are composed in chunks so a 30-day trip never overflows the model's
 * output ceiling.
 */

export const DAYS_PER_CHUNK = 5;

type Usage = { prompt_tokens: number; completion_tokens: number };

async function chatJSON(system: string, user: string, maxTokens: number): Promise<{ parsed: Record<string, unknown>; usage?: Usage }> {
  const model = process.env.OPENAI_MODEL ?? "gpt-4o";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      temperature: 0.6,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(110_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI compose failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Compose returned empty response");
  return {
    parsed: JSON.parse(content),
    usage: data.usage
      ? { prompt_tokens: Number(data.usage.prompt_tokens ?? 0), completion_tokens: Number(data.usage.completion_tokens ?? 0) }
      : undefined,
  };
}

function tripContext(input: GenerationInput, research: ResearchResult): string {
  const cur = input.currency ?? DEFAULT_CURRENCY;
  return (
    `TRIP: ${input.duration_days}-day ${input.trip_purpose} in ${input.city}, ${input.country}; traveller from ${input.origin_country}; ` +
    `budget ${input.budget_range ?? "flexible"}; currency ${cur.code} (${cur.symbol})${input.start_date ? `; starts ${input.start_date}` : ""}.\n\n` +
    `RESEARCH NOTES (verified ${research.searched_at} via live web search — treat as the source of truth; do not contradict them):\n${research.notes}`
  );
}

// ── Recommendations ──────────────────────────────────────────────────────────

export async function composeRecommendations(
  input: GenerationInput,
  research: ResearchResult,
): Promise<{ recommendations: GeneratedRecommendation[]; usage?: Usage }> {
  const cur = input.currency ?? DEFAULT_CURRENCY;
  const system =
    `You turn verified research notes into travel recommendations. Respond ONLY with JSON: ` +
    `{"recommendations": {"places_to_visit": [...], "places_to_eat": [...], "places_to_stay": [...], "flights": [...], "local_transport": [...], "safety_health": [...]}} ` +
    `where each item is {"name","description","location","price_range","rating",0-5,"value","confidence",0-1}. ` +
    `4-6 items per category, REAL named places only, all prices in ${cur.code} with the ${cur.symbol} symbol. ` +
    `Set confidence 0.9+ only for facts present in the research notes; anything from general knowledge gets <=0.7.`;
  const { parsed, usage } = await chatJSON(system, tripContext(input, research), 6000);

  const recommendations: GeneratedRecommendation[] = [];
  const recRoot = (parsed.recommendations ?? parsed) as Record<string, unknown>;
  for (const category of RECOMMENDATION_CATEGORIES) {
    const items = recRoot[category];
    if (!Array.isArray(items)) continue;
    for (const item of items as Record<string, unknown>[]) {
      if (!item?.name) continue;
      recommendations.push({
        category: category as RecommendationCategory,
        name: String(item.name),
        description: String(item.description ?? ""),
        location: item.location ? String(item.location) : undefined,
        price_range: item.price_range ? String(item.price_range) : undefined,
        rating: Number.isFinite(Number(item.rating)) ? Math.min(5, Math.max(0, Number(item.rating))) : undefined,
        value: String(item.value ?? item.description ?? "").slice(0, 500),
        confidence: Number.isFinite(Number(item.confidence)) ? Math.min(1, Math.max(0, Number(item.confidence))) : 0.7,
      });
    }
  }
  if (recommendations.length === 0) throw new Error("Compose produced no recommendations");
  return { recommendations, usage };
}

// ── Day chunks ───────────────────────────────────────────────────────────────

const DAY_SCHEMA = `{"days":[{"day":1,"summary":"","start":"08:30","area":"","weather_note":"","blocks":[
{"t":"08:30","dur":45,"kind":"breakfast","title":"","desc":"","costs":{"food":0}},
{"t":"09:30","dur":120,"kind":"sight","title":"","desc":"","why_time":"","open_note":"","transit":{"mode":"train","route":"","mins":0,"cost":0},"costs":{"transport":0,"entry":0},"book":{"required":false,"url":""},"map":"","sources":[""]}
]}]}`;

export async function composeDaysChunk(
  input: GenerationInput,
  research: ResearchResult,
  fromDay: number,
  toDay: number,
  previousAreas: string[],
): Promise<{ days: { n: number; schedule: DaySchedule; summary: string }[]; usage?: Usage }> {
  const cur = input.currency ?? DEFAULT_CURRENCY;
  const system =
    `You build detailed daily itineraries from verified research notes. Respond ONLY with JSON matching:\n${DAY_SCHEMA}\n` +
    `Rules:\n` +
    `- Produce EXACTLY days ${fromDay} through ${toDay} (numbered), each with 5-8 blocks in chronological order.\n` +
    `- Every day includes: a recommended start time, breakfast AND lunch AND dinner blocks (kind breakfast/lunch/dinner) at real named places with per-person food cost, and one "evening" block with a non-dinner option (night view, cruise, show, market, onsen, bar street) including its cost.\n` +
    `- kind "sight" blocks: real named places; dur = realistic minutes needed; why_time = when to go and why (crowds/light/heat); open_note = opening hours and weekly closing day if known.\n` +
    `- transit on every block that moves location: mode, concrete route (line/bus number, stations), minutes, cost in ${cur.code}. Group each day by area to minimize backtracking.\n` +
    `- costs: numbers in ${cur.code} (no symbols, no strings). Omit fields that are zero.\n` +
    `- book.required true only when advance booking is genuinely needed; include the official url from the research notes when available.\n` +
    `- map: a Google Maps search string for the place.\n` +
    `- sources: source domains/URLs from the research notes backing the facts.\n` +
    `- Respect weekly closing days from the notes when placing sights on dated days${input.start_date ? ` (day 1 = ${input.start_date})` : ""}.\n` +
    `- Do not repeat places already used on previous days (areas covered so far: ${previousAreas.join(", ") || "none"}).` +
    (fromDay === 1 ? `\n- Day 1 must account for arrival logistics; ` : "") +
    (toDay === input.duration_days ? `\n- The final day must account for checkout and departure.` : "");

  const expected = toDay - fromDay + 1;
  const dayList = Array.from({ length: expected }, (_, i) => fromDay + i).join(", ");
  const baseUser =
    `REQUIRED: the "days" array must contain EXACTLY ${expected} fully-detailed entries, one for each of day ${dayList}. Never stop early.\n\n` +
    tripContext(input, research) +
    `\n\nCompose days ${fromDay}-${toDay} now.`;

  let { parsed, usage } = await chatJSON(system, baseUser, 15000);
  let days = buildDays(parsed, fromDay, toDay, cur.code, research.searched_at, input.city);

  // The model occasionally abbreviates long ranges — one automatic retry with
  // a sterner instruction before surfacing an error to the user.
  if (days.length !== expected) {
    ({ parsed, usage } = await chatJSON(
      system,
      `YOUR PREVIOUS ATTEMPT FAILED: it returned too few days. This time return EXACTLY ${expected} complete day objects (days ${dayList}), each with 5-8 blocks. Do not summarize or stop early.\n\n` +
        baseUser,
      15000,
    ));
    days = buildDays(parsed, fromDay, toDay, cur.code, research.searched_at, input.city);
  }

  if (days.length !== expected) {
    throw new Error(`Compose returned ${days.length} days for range ${fromDay}-${toDay}`);
  }
  return { days, usage };
}

function buildDays(
  parsed: Record<string, unknown>,
  fromDay: number,
  toDay: number,
  curCode: string,
  checkedOn: string,
  city: string,
): { n: number; schedule: DaySchedule; summary: string }[] {
  const rawDays = Array.isArray(parsed.days) ? (parsed.days as Record<string, unknown>[]) : [];
  const days: { n: number; schedule: DaySchedule; summary: string }[] = [];
  for (const raw of rawDays) {
    const n = Number(raw.day);
    if (!Number.isInteger(n) || n < fromDay || n > toDay) continue;
    const blocks: ScheduleBlock[] = (Array.isArray(raw.blocks) ? raw.blocks : [])
      .map((b: Record<string, unknown>) => ({
        t: String(b.t ?? "09:00"),
        dur: Math.max(0, Number(b.dur ?? 60)) || 60,
        kind: (["sight", "breakfast", "lunch", "dinner", "evening", "other"].includes(String(b.kind))
          ? String(b.kind)
          : "other") as ScheduleBlock["kind"],
        title: String(b.title ?? "").slice(0, 160),
        desc: String(b.desc ?? "").slice(0, 500),
        why_time: b.why_time ? String(b.why_time).slice(0, 250) : undefined,
        open_note: b.open_note ? String(b.open_note).slice(0, 200) : undefined,
        transit: b.transit && typeof b.transit === "object"
          ? {
              mode: String((b.transit as Record<string, unknown>).mode ?? "walk"),
              route: String((b.transit as Record<string, unknown>).route ?? ""),
              mins: Math.max(0, Number((b.transit as Record<string, unknown>).mins ?? 0)) || 0,
              cost: Math.max(0, Number((b.transit as Record<string, unknown>).cost ?? 0)) || 0,
            }
          : undefined,
        costs: b.costs && typeof b.costs === "object"
          ? {
              transport: numOrUndef((b.costs as Record<string, unknown>).transport),
              entry: numOrUndef((b.costs as Record<string, unknown>).entry),
              food: numOrUndef((b.costs as Record<string, unknown>).food),
            }
          : undefined,
        book: b.book && typeof b.book === "object" && (b.book as Record<string, unknown>).required
          ? { required: true, url: String((b.book as Record<string, unknown>).url ?? "") || undefined }
          : undefined,
        map: b.map ? String(b.map).slice(0, 160) : undefined,
        sources: Array.isArray(b.sources) ? (b.sources as unknown[]).map(String).slice(0, 4) : undefined,
      }))
      .filter((b: ScheduleBlock) => b.title);
    if (blocks.length === 0) continue;

    const totals = { transport: 0, meals: 0, tickets: 0, other: 0, total: 0 };
    for (const b of blocks) {
      totals.transport += (b.transit?.cost ?? 0) + (b.costs?.transport ?? 0);
      totals.meals += b.costs?.food ?? 0;
      totals.tickets += b.costs?.entry ?? 0;
    }
    totals.total = Math.round(totals.transport + totals.meals + totals.tickets + totals.other);
    totals.transport = Math.round(totals.transport);
    totals.meals = Math.round(totals.meals);
    totals.tickets = Math.round(totals.tickets);

    days.push({
      n,
      schedule: {
        v: 1,
        start: String(raw.start ?? "09:00"),
        area: raw.area ? String(raw.area) : undefined,
        weather_note: raw.weather_note ? String(raw.weather_note).slice(0, 200) : undefined,
        blocks,
        totals,
        cur: curCode,
        checked_on: checkedOn,
      },
      summary: String(raw.summary ?? `Day ${n} in ${city}`).slice(0, 160),
    });
  }
  return days;
}

function numOrUndef(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
