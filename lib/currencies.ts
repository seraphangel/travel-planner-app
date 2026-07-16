/**
 * Currencies supported by the plan-creation form. The choice drives the
 * budget brackets shown to the user and the currency the AI is instructed
 * to quote prices in. It is embedded in the stored budget_range string
 * (e.g. "€1,800-€3,200") and recovered via currencyFromBudgetString — the
 * schema has no currency column until the RLS-lockdown migration era.
 *
 * `rate` is an approximate USD multiplier used ONLY to derive sensibly
 * sized budget brackets (rounded to friendly numbers) — it is not a live FX
 * rate and is never used for payment conversion. Payments remain USD.
 * Rates snapshotted 2026-07.
 */
export type Currency = {
  code: string;
  symbol: string;
  name: string;
  rate: number; // approx units per 1 USD, for bracket sizing only
};

export const CURRENCIES: Currency[] = [
  { code: "USD", symbol: "$", name: "US Dollar", rate: 1 },
  { code: "EUR", symbol: "€", name: "Euro", rate: 0.92 },
  { code: "GBP", symbol: "£", name: "British Pound", rate: 0.78 },
  { code: "JPY", symbol: "¥", name: "Japanese Yen", rate: 155 },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar", rate: 1.33 },
  { code: "AUD", symbol: "A$", name: "Australian Dollar", rate: 1.5 },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar", rate: 1.36 },
  { code: "INR", symbol: "₹", name: "Indian Rupee", rate: 84 },
  { code: "KRW", symbol: "₩", name: "South Korean Won", rate: 1350 },
  { code: "CNY", symbol: "CN¥", name: "Chinese Yuan", rate: 7.2 },
  { code: "THB", symbol: "฿", name: "Thai Baht", rate: 35 },
  { code: "MYR", symbol: "RM", name: "Malaysian Ringgit", rate: 4.4 },
];

export const DEFAULT_CURRENCY = CURRENCIES[0];

export function getCurrency(code: string | null | undefined): Currency {
  return CURRENCIES.find((c) => c.code === code) ?? DEFAULT_CURRENCY;
}

// Round to a friendly number: 2 significant digits (1,842 -> 1,800).
function nice(n: number): number {
  if (n <= 0) return 0;
  const magnitude = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / magnitude) * magnitude;
}

const USD_BRACKETS: [number, number | null][] = [
  [500, 1000],
  [1000, 2000],
  [2000, 3500],
  [3500, 5000],
  [5000, null],
];

/** Budget dropdown options for a currency, e.g. "€1,800-€3,200" / "€4,600+". */
export function budgetOptions(code: string): string[] {
  const c = getCurrency(code);
  return USD_BRACKETS.map(([lo, hi]) => {
    const l = `${c.symbol}${nice(lo * c.rate).toLocaleString("en-US")}`;
    return hi === null
      ? `${l}+`
      : `${l}-${c.symbol}${nice(hi * c.rate).toLocaleString("en-US")}`;
  });
}

/**
 * Recover the currency from a stored budget_range string by its symbol.
 * Multi-char symbols are checked first so "S$1,300" resolves to SGD, not USD.
 */
export function currencyFromBudgetString(
  budget: string | null | undefined,
): Currency {
  if (!budget) return DEFAULT_CURRENCY;
  const bySymbolLength = [...CURRENCIES].sort(
    (a, b) => b.symbol.length - a.symbol.length,
  );
  for (const c of bySymbolLength) {
    if (budget.includes(c.symbol)) return c;
  }
  return DEFAULT_CURRENCY;
}
