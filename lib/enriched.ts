import type { GenerationInput, GeneratedRecommendation } from "@/lib/generation";
import { RECOMMENDATION_CATEGORIES, type RecommendationCategory } from "@/lib/types";
import { DEFAULT_CURRENCY } from "@/lib/currencies";
import { normalizePlace, type DaySchedule, type ScheduleBlock } from "@/lib/schedule";
import type { ResearchResult } from "@/lib/research";

/**
 * Phase 2 of the enriched pipeline: compose structured content from the
 * research notes (no web search here — bounded cost, reliable JSON).
 * Days are composed in chunks so a 30-day trip never overflows the model's
 * output ceiling.
 */

// Kept small so a single step — including its no-repeat retries — always
// completes within the serverless function time limit.
export const DAYS_PER_CHUNK = 3;

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
    `4-6 items per category, REAL named places only, every place UNIQUE (never list the same place twice), all prices in ${cur.code} with the ${cur.symbol} symbol. ` +
    `For places_to_eat specifically: SPAN THE PRICE RANGE — include at least two budget options (${cur.symbol}, cheap eats / street food / local diners) AND at least one upscale option (${cur.symbol}${cur.symbol}${cur.symbol}, fine dining / famous specialty), and note the tier in each description. ` +
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
{"t":"08:30","dur":45,"kind":"breakfast","title":"","cuisine":"","desc":"","transit":{"mode":"walk","route":"","mins":0,"cost":0},"costs":{"food":0},"alt":{"title":"","cuisine":"","desc":"","food":0,"tier":"upscale"}},
{"t":"09:30","dur":120,"kind":"sight","title":"","desc":"","why_time":"","open_note":"","transit":{"mode":"train","route":"","mins":0,"cost":0},"costs":{"transport":0,"entry":0},"book":{"required":false,"url":""},"map":"","sources":[""]}
]}]}`;

export async function composeDaysChunk(
  input: GenerationInput,
  research: ResearchResult,
  fromDay: number,
  toDay: number,
  usedPlaces: string[],
): Promise<{ days: { n: number; schedule: DaySchedule; summary: string }[]; usedPlaces: string[]; usage?: Usage }> {
  const cur = input.currency ?? DEFAULT_CURRENCY;
  const baseSystem =
    `You build detailed daily itineraries from verified research notes. Respond ONLY with JSON matching:\n${DAY_SCHEMA}\n` +
    `Rules:\n` +
    `- Produce EXACTLY days ${fromDay} through ${toDay} (numbered), each with 5-8 blocks in chronological order.\n` +
    `- Every day includes: a recommended start time, breakfast AND lunch AND dinner blocks (kind breakfast/lunch/dinner) at real named places with per-person food cost, and one "evening" block with a non-dinner option (night view, cruise, show, market, onsen, bar street) including its cost.\n` +
    `- For EVERY meal block (breakfast/lunch/dinner): set "cuisine" to the food type served (e.g. "Ramen", "Sushi", "Yakitori", "Italian", "Café", "Seafood"). The "title" is the primary pick with its costs.food, AND "alt" is a real alternative at a DIFFERENT price tier (also with its own "cuisine"): if the primary is affordable, alt.tier="upscale" (a nicer splurge); if the primary is high-end, alt.tier="budget" (a cheaper local option). alt.food is that option's per-person cost. Never leave alt or cuisine empty on a meal.\n` +
    `- kind "sight" blocks: real named places; dur = realistic minutes needed; why_time = when to go and why (crowds/light/heat); open_note = opening hours and weekly closing day if known.\n` +
    `- DIRECTIONS ARE MANDATORY ON EVERY BLOCK — sights AND restaurants AND evening spots, with no exceptions. Fill "transit" for each: mode, a concrete route (specific line/bus number and the boarding + alighting stations, or "walk from <previous place>" when on foot), minutes, and cost in ${cur.code} (0 for walking). The very first block of a day gives directions from the traveller's accommodation/arrival point. A block without usable directions is invalid. Group each day by area to minimize backtracking.\n` +
    `- costs: numbers in ${cur.code} (no symbols, no strings). Omit fields that are zero.\n` +
    `- book.required true only when advance booking is genuinely needed; include the official url from the research notes when available.\n` +
    `- map: a Google Maps search string for the place.\n` +
    `- sources: source domains/URLs from the research notes backing the facts.\n` +
    `- Respect weekly closing days from the notes when placing sights on dated days${input.start_date ? ` (day 1 = ${input.start_date})` : ""}.\n` +
    `- NO REPEATS: every sight, restaurant and evening venue across the ENTIRE trip must be UNIQUE. Never suggest a place — as a primary OR an alt — that appears in the "already used" list below, and never reuse a place across the days in this batch. A city has many options; a repeated place reads as lazy and is unacceptable.` +
    (fromDay === 1 ? `\n- Day 1 must account for arrival logistics; ` : "") +
    (toDay === input.duration_days ? `\n- The final day must account for checkout and departure.` : "") +
    (input.duration_days > 6
      ? `\n- This is a LONG trip: to keep every place unique, widen the net beyond headline sights — include day trips to nearby towns/nature, distinct neighborhoods, markets, gardens, museums, cafes, viewpoints and seasonal spots. There are always enough distinct options; never fall back to repeating an earlier place.`
      : "");

  const expected = toDay - fromDay + 1;
  const dayList = Array.from({ length: expected }, (_, i) => fromDay + i).join(", ");
  const usedList = usedPlaces.length
    ? `ALREADY USED on earlier days — do NOT suggest any of these again:\n${usedPlaces.map((p) => `- ${p}`).join("\n")}\n\n`
    : "";
  const baseUser =
    `REQUIRED: the "days" array must contain EXACTLY ${expected} fully-detailed entries, one for each of day ${dayList}. Never stop early.\n\n` +
    usedList +
    tripContext(input, research) +
    `\n\nCompose days ${fromDay}-${toDay} now, with all-unique places and budget/upscale meal alternatives.`;

  const seen = new Set(usedPlaces.map(normalizePlace));

  // Up to 2 attempts (fix wrong day count OR duplicates) to stay within the
  // function time budget; the final dedup pass below guarantees no repeat
  // ever reaches the user even if the second attempt still has one.
  let days: { n: number; schedule: DaySchedule; summary: string }[] = [];
  let usage: Usage | undefined;
  let system = baseSystem;
  let user = baseUser;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await chatJSON(system, user, 15000);
    usage = result.usage;
    days = buildDays(result.parsed, fromDay, toDay, cur.code, research.searched_at, input.city);

    const problems: string[] = [];
    if (days.length !== expected) {
      problems.push(`Return EXACTLY ${expected} day objects (days ${dayList}); you returned ${days.length}.`);
    }
    const dupes = findDuplicates(days, seen);
    if (dupes.length) {
      problems.push(`These places are repeats and must be replaced with different real places: ${dupes.join(", ")}.`);
    }
    const incomplete = findIncompleteBlocks(days);
    if (incomplete.length) {
      problems.push(
        `These stops are missing required directions or meal cuisine — add them: ${incomplete.slice(0, 8).join("; ")}.`,
      );
    }
    if (problems.length === 0) break;

    system = baseSystem;
    user =
      `YOUR PREVIOUS ATTEMPT HAD PROBLEMS:\n${problems.map((p) => `- ${p}`).join("\n")}\n` +
      `Regenerate the full batch fixing these. Keep every place unique across the whole trip.\n\n` +
      baseUser;
  }

  // Accept the valid CONTIGUOUS run starting at fromDay, even if short. On a
  // long single-city trip the no-repeat constraint can exhaust obvious places
  // and the model returns fewer days than asked — the step runner then just
  // advances by however many we got and continues, so a plan never gets stuck.
  // (0 days is a genuine failure and is surfaced as retryable by the caller.)
  days.sort((a, b) => a.n - b.n);
  const contiguous: typeof days = [];
  let expect = fromDay;
  for (const d of days) {
    if (d.n === expect) {
      contiguous.push(d);
      expect++;
    } else if (d.n > expect) {
      break;
    }
  }
  days = contiguous;

  // Final safety net: drop any repeated attraction/evening spot so a stubborn
  // model can never surface a duplicate sight to the user. Meal blocks are
  // kept even if repeated (dropping one would break the 3-meals-a-day
  // structure) — retries handle the rare meal repeat.
  const newTitles: string[] = [];
  for (const d of days) {
    d.schedule.blocks = d.schedule.blocks.filter((b) => {
      if (b.kind !== "sight" && b.kind !== "evening") return true;
      const key = normalizePlace(b.title);
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      newTitles.push(b.title.trim());
      return true;
    });
    recomputeTotals(d.schedule);
  }

  return { days, usedPlaces: newTitles, usage };
}

function findDuplicates(
  days: { schedule: DaySchedule }[],
  priorSeen: Set<string>,
): string[] {
  const dupes: string[] = [];
  const local = new Set(priorSeen);
  for (const d of days) {
    for (const b of d.schedule.blocks) {
      if (b.kind === "other" || !b.title) continue;
      const key = normalizePlace(b.title);
      if (!key) continue;
      if (local.has(key)) dupes.push(b.title.trim());
      else local.add(key);
    }
  }
  return [...new Set(dupes)];
}

// Every stop must carry usable directions; every meal must state its cuisine.
function findIncompleteBlocks(days: { n: number; schedule: DaySchedule }[]): string[] {
  const missing: string[] = [];
  for (const d of days) {
    for (const b of d.schedule.blocks) {
      if (b.kind === "other" || !b.title) continue;
      if (!b.transit || !b.transit.route.trim()) {
        missing.push(`Day ${d.n} "${b.title}" (no directions)`);
      }
      if (["breakfast", "lunch", "dinner"].includes(b.kind) && !b.cuisine?.trim()) {
        missing.push(`Day ${d.n} "${b.title}" (no cuisine)`);
      }
    }
  }
  return missing;
}

function recomputeTotals(s: DaySchedule) {
  const totals = { transport: 0, meals: 0, tickets: 0, other: 0, total: 0 };
  for (const b of s.blocks) {
    totals.transport += (b.transit?.cost ?? 0) + (b.costs?.transport ?? 0);
    totals.meals += b.costs?.food ?? 0;
    totals.tickets += b.costs?.entry ?? 0;
  }
  totals.transport = Math.round(totals.transport);
  totals.meals = Math.round(totals.meals);
  totals.tickets = Math.round(totals.tickets);
  totals.total = totals.transport + totals.meals + totals.tickets + totals.other;
  s.totals = totals;
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
        cuisine: b.cuisine ? String(b.cuisine).slice(0, 60) : undefined,
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
        alt: b.alt && typeof b.alt === "object" && (b.alt as Record<string, unknown>).title
          ? {
              title: String((b.alt as Record<string, unknown>).title).slice(0, 160),
              cuisine: (b.alt as Record<string, unknown>).cuisine ? String((b.alt as Record<string, unknown>).cuisine).slice(0, 60) : undefined,
              desc: (b.alt as Record<string, unknown>).desc ? String((b.alt as Record<string, unknown>).desc).slice(0, 300) : undefined,
              food: Math.max(0, Number((b.alt as Record<string, unknown>).food ?? 0)) || 0,
              tier: (String((b.alt as Record<string, unknown>).tier) === "upscale" ? "upscale" : "budget") as "budget" | "upscale",
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
