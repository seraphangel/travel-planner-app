import { getCurrency } from "@/lib/currencies";
import type { DaySchedule, ScheduleBlock } from "@/lib/schedule";

const KIND_ICON: Record<ScheduleBlock["kind"], string> = {
  sight: "📍",
  breakfast: "☕",
  lunch: "🍽️",
  dinner: "🍽️",
  evening: "🌙",
  other: "🔹",
};

const MODE_ICON: Record<string, string> = {
  train: "🚆",
  metro: "🚇",
  subway: "🚇",
  bus: "🚌",
  walk: "🚶",
  taxi: "🚕",
  rideshare: "🚕",
  ferry: "⛴️",
  tram: "🚊",
};

function money(n: number | undefined, symbol: string): string | null {
  if (!n || n <= 0) return null;
  return `${symbol}${Math.round(n).toLocaleString("en-US")}`;
}

function fmtDuration(mins: number): string {
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${m}m` : `${h} h`;
  }
  return `${mins} min`;
}

/** Rich timeline for one enriched day: timed blocks, transit, itemized costs. */
export default function DayTimeline({ schedule }: { schedule: DaySchedule }) {
  const symbol = getCurrency(schedule.cur).symbol;

  return (
    <div>
      <p className="mt-1 text-sm text-slate-500">
        ⏰ Start {schedule.start}
        {schedule.area ? ` · ${schedule.area}` : ""}
        {schedule.weather_note ? ` · ${schedule.weather_note}` : ""}
      </p>

      <div className="mt-4 space-y-4">
        {schedule.blocks.map((b, i) => (
          <div key={i} className="flex gap-3 sm:gap-4">
            <div className="w-12 shrink-0 text-right sm:w-14">
              <p className="text-sm font-semibold">{b.t}</p>
              <p className="text-xs text-slate-400">{fmtDuration(b.dur)}</p>
            </div>
            <div className="min-w-0 flex-1 border-l-2 border-slate-100 pb-1 pl-3 sm:pl-4">
              <p className="font-medium">
                <span aria-hidden>{KIND_ICON[b.kind]}</span>{" "}
                {b.kind === "breakfast" || b.kind === "lunch" || b.kind === "dinner"
                  ? `${b.kind[0].toUpperCase()}${b.kind.slice(1)} — ${b.title}`
                  : b.title}
              </p>
              {b.desc && <p className="mt-0.5 text-sm text-slate-600">{b.desc}</p>}
              {(b.why_time || b.open_note) && (
                <p className="mt-1 text-xs text-slate-500">
                  {b.why_time}
                  {b.why_time && b.open_note ? " · " : ""}
                  {b.open_note}
                </p>
              )}

              {b.transit && b.transit.route && (
                <p className="mt-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                  <span aria-hidden>{MODE_ICON[b.transit.mode.toLowerCase()] ?? "🧭"}</span>{" "}
                  {b.transit.route}
                  {b.transit.mins ? ` · ${b.transit.mins} min` : ""}
                  {money(b.transit.cost, symbol) ? ` · ${money(b.transit.cost, symbol)}` : " · free"}
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                {money(b.costs?.entry, symbol) && (
                  <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-teal-700">
                    🎟️ Entry {money(b.costs?.entry, symbol)}
                  </span>
                )}
                {money(b.costs?.food, symbol) && (
                  <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-amber-700">
                    🍽️ ~{money(b.costs?.food, symbol)}/person
                  </span>
                )}
                {b.costs?.entry === undefined && b.kind === "sight" && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-500">Free entry</span>
                )}
                {b.book?.required && (
                  <span className="rounded-full bg-red-50 px-2.5 py-0.5 font-medium text-red-700">
                    🎫 Book ahead
                    {b.book.url ? (
                      <>
                        {" · "}
                        <a href={b.book.url} target="_blank" rel="noopener noreferrer" className="underline">
                          reserve
                        </a>
                      </>
                    ) : null}
                  </span>
                )}
                {b.map && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.map)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal-700 underline"
                  >
                    Map ↗
                  </a>
                )}
              </div>

              {b.alt && (
                <p className="mt-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                  <span className="font-medium text-slate-700">
                    {b.alt.tier === "upscale" ? "💎 Upscale option" : "💰 Budget option"}:
                  </span>{" "}
                  {b.alt.title}
                  {money(b.alt.food, symbol) ? ` · ~${money(b.alt.food, symbol)}/person` : ""}
                  {b.alt.desc ? ` — ${b.alt.desc}` : ""}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs">
        <span className="text-slate-500">Day total</span>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-600">
          🚇 Transport {money(schedule.totals.transport, symbol) ?? `${symbol}0`}
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-600">
          🍽️ Meals {money(schedule.totals.meals, symbol) ?? `${symbol}0`}
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-600">
          🎟️ Tickets {money(schedule.totals.tickets, symbol) ?? `${symbol}0`}
        </span>
        <span className="ml-auto font-semibold text-slate-700">
          ≈ {money(schedule.totals.total, symbol) ?? `${symbol}0`}/person
        </span>
      </div>
      {schedule.checked_on && (
        <p className="mt-2 text-[11px] text-slate-400">
          Prices and hours checked via live web search on {schedule.checked_on} — verify before booking.
        </p>
      )}
    </div>
  );
}
