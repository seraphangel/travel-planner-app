/**
 * Rich day-schedule storage.
 *
 * The enriched itinerary (timed blocks, transit steps, itemized costs) is
 * stored as JSON in itinerary_days.notes — an existing, previously unused
 * text column — because schema changes are blocked until the Supabase
 * service-role key exists. EVERY read/write of the rich schedule goes
 * through this file, so the future migration to a proper jsonb column is a
 * one-file change plus one SQL statement.
 */

export type TransitStep = {
  mode: string; // "train" | "bus" | "walk" | "taxi" | "ferry" ...
  route: string; // "Nishitetsu line, Tenjin → Dazaifu (change at Futsukaichi)"
  mins: number;
  cost: number; // in the plan's currency, 0 if free/walking
};

export type MealAlt = {
  title: string;
  desc?: string;
  food: number; // per-person cost in the plan's currency
  tier: "budget" | "upscale";
  cuisine?: string; // e.g. "Ramen", "Italian", "Café"
};

export type ScheduleBlock = {
  t: string; // start time "09:15"
  dur: number; // minutes needed
  kind: "sight" | "breakfast" | "lunch" | "dinner" | "evening" | "other";
  title: string;
  desc: string;
  cuisine?: string; // meal blocks: cuisine/food type served, e.g. "Sushi"
  why_time?: string; // "before 10:30 — tour groups arrive late morning"
  open_note?: string; // "closed Mondays; last entry 16:30"
  transit?: TransitStep; // how to get here from the previous stop (required on every stop)
  costs?: { transport?: number; entry?: number; food?: number };
  alt?: MealAlt; // budget-or-upscale alternative for meal blocks
  book?: { required: boolean; url?: string };
  map?: string; // Google Maps search query
  sources?: string[]; // URLs the facts were checked against
};

export type DaySchedule = {
  v: 1;
  start: string; // recommended day start "08:00"
  area?: string; // neighborhood focus
  weather_note?: string;
  blocks: ScheduleBlock[];
  totals: { transport: number; meals: number; tickets: number; other: number; total: number };
  cur: string; // currency code e.g. "JPY"
  checked_on?: string; // ISO date the research was performed
};

export function parseSchedule(notes: string | null | undefined): DaySchedule | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes);
    if (parsed && parsed.v === 1 && Array.isArray(parsed.blocks)) return parsed as DaySchedule;
    return null;
  } catch {
    return null;
  }
}

export function serializeSchedule(schedule: DaySchedule): string {
  return JSON.stringify(schedule);
}

/** Normalize a place title for duplicate comparison across days. */
export function normalizePlace(title: string): string {
  return title
    .toLowerCase()
    .replace(/\([^)]*\)/g, "") // drop parentheticals like "(main branch)"
    .replace(/\b(the|a|restaurant|cafe|café|bar|main branch|hakata|station)\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

/**
 * Named places a schedule commits to (sights, meal venues, evening spots).
 * Used to prevent the same place being suggested on multiple days.
 */
export function placeTitlesFrom(schedule: DaySchedule): string[] {
  return schedule.blocks
    .filter((b) => b.kind !== "other" && b.title)
    .map((b) => b.title.trim());
}

/**
 * Derive the legacy 3-block text columns from a rich schedule so every
 * existing surface (posters, previews, old plan layout, day-regen preview)
 * keeps working on enriched days.
 */
export function legacyFieldsFromSchedule(s: DaySchedule): {
  morning_activity: string;
  afternoon_activity: string;
  evening_activity: string;
  meals: string;
  transport_notes: string;
} {
  const inWindow = (from: number, to: number) =>
    s.blocks.filter((b) => {
      const h = Number(b.t.split(":")[0] ?? 0);
      return b.kind !== "breakfast" && b.kind !== "lunch" && b.kind !== "dinner" && h >= from && h < to;
    });
  const line = (blocks: ScheduleBlock[]) =>
    blocks.map((b) => b.title).slice(0, 2).join("; ") || "—";

  const mealNames = s.blocks
    .filter((b) => ["breakfast", "lunch", "dinner"].includes(b.kind))
    .map((b) => `${b.kind[0].toUpperCase()}${b.kind.slice(1)}: ${b.title}`)
    .join(" · ");

  const transits = s.blocks.filter((b) => b.transit && b.transit.mode !== "walk");
  const transportLine =
    transits.length > 0
      ? transits.map((b) => `${b.transit!.route} (${b.transit!.mins} min)`).slice(0, 2).join("; ")
      : "Mostly on foot";

  return {
    morning_activity: line(inWindow(0, 12)),
    afternoon_activity: line(inWindow(12, 18)),
    evening_activity: line(inWindow(18, 24)) !== "—"
      ? line(inWindow(18, 24))
      : line(s.blocks.filter((b) => b.kind === "evening")),
    meals: mealNames || "—",
    transport_notes: transportLine,
  };
}
