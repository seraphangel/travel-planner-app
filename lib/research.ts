import type { GenerationInput } from "@/lib/generation";
import { DEFAULT_CURRENCY } from "@/lib/currencies";

/**
 * Live destination research via OpenAI's Responses API with the web_search
 * tool. Phase 1 of the enriched pipeline: gather CURRENT facts (hours,
 * prices, fares, closures, events) with source URLs; phase 2 (compose)
 * builds the itinerary from these notes without searching.
 */

export type ResearchResult = {
  notes: string; // dense factual notes the compose phase consumes
  sources: string[]; // URLs cited by the model
  searched_at: string; // ISO date
  searches: number; // web_search calls used
  usage?: { input_tokens: number; output_tokens: number };
};

type ResponsesOutputItem = {
  type: string;
  content?: { type: string; text?: string; annotations?: { type: string; url?: string }[] }[];
};

async function callResponses(body: Record<string, unknown>) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(110_000),
  });
  return res;
}

export async function researchDestination(input: GenerationInput): Promise<ResearchResult> {
  const cur = input.currency ?? DEFAULT_CURRENCY;
  const model = process.env.OPENAI_MODEL ?? "gpt-4o";

  const prompt =
    `Research CURRENT, verifiable facts for a ${input.duration_days}-day ${input.trip_purpose} trip to ${input.city}, ${input.country} ` +
    `(traveller from ${input.origin_country}${input.start_date ? `, travelling from ${input.start_date}` : ""}, budget ${input.budget_range ?? "flexible"}).\n\n` +
    `Use web search (at most 8 focused searches) to verify, as of today:\n` +
    `1. Top attractions: current opening hours, weekly closing days, entrance prices, whether advance booking is required (and the official booking site).\n` +
    `2. Local transport: current fares for metro/bus/train, day-pass or IC-card prices and whether a pass beats single tickets, airport-to-city options with prices and journey times, typical taxi/ride-hailing base fares.\n` +
    `3. Food: well-reviewed places currently OPERATING for breakfast, lunch and dinner near the main sight areas, with typical per-person prices; any famous spots that have closed.\n` +
    `4. Events, festivals, closures or construction during the travel dates; seasonal notes (weather, crowds).\n\n` +
    `Output compact factual notes grouped under headings ATTRACTIONS / TRANSPORT / FOOD / EVENTS+SEASON. ` +
    `For each fact include the price in ${cur.code} (convert if the source quotes another currency, noting the original), and the source domain. ` +
    `Prefer official sites. Flag anything you could not verify as UNVERIFIED. No itinerary yet — facts only.`;

  const body = {
    model,
    tools: [{ type: "web_search" }],
    input: prompt,
    max_output_tokens: 4000,
  };

  let res = await callResponses(body);
  if (res.status === 400) {
    // Older accounts expose the tool under its preview name.
    const errText = await res.text().catch(() => "");
    if (errText.includes("web_search")) {
      res = await callResponses({ ...body, tools: [{ type: "web_search_preview" }] });
    } else {
      throw new Error(`OpenAI research failed (400): ${errText.slice(0, 200)}`);
    }
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI research failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const output: ResponsesOutputItem[] = Array.isArray(data.output) ? data.output : [];

  const searches = output.filter((o) => o.type === "web_search_call").length;
  let notes = "";
  const sources = new Set<string>();
  for (const item of output) {
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (part.type === "output_text" && part.text) {
        notes += part.text + "\n";
        for (const a of part.annotations ?? []) {
          if (a.type === "url_citation" && a.url) sources.add(a.url);
        }
      }
    }
  }
  if (!notes.trim()) throw new Error("Research returned no notes");

  return {
    notes: notes.trim(),
    sources: [...sources].slice(0, 40),
    searched_at: new Date().toISOString().slice(0, 10),
    searches,
    usage: data.usage
      ? {
          input_tokens: Number(data.usage.input_tokens ?? 0),
          output_tokens: Number(data.usage.output_tokens ?? 0),
        }
      : undefined,
  };
}
