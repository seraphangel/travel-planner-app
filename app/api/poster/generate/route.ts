import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { isAdminEmail } from "@/lib/permissions";
import { POSTER_ADDON_GENERATIONS } from "@/lib/types";

export const maxDuration = 180;

/**
 * POST /api/poster/generate
 * Body: { planId: string, photo: string (data URL) }
 *
 * AI seamless poster: blends the user's photo into a destination scene via
 * gpt-image-1. Paid add-on — requires a paid poster_addon purchase for the
 * plan; each purchase includes POSTER_ADDON_GENERATIONS generations.
 * The photo is forwarded to OpenAI for this one request and never stored.
 */
export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "AI poster generation isn't configured yet — the site owner needs to add an OpenAI key." },
      { status: 503 },
    );
  }

  const supabase = await createClient();

  let body: { planId?: string; photo?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const planId = String(body.planId ?? "");
  const photo = String(body.photo ?? "");
  if (!planId) return NextResponse.json({ error: "planId is required" }, { status: 400 });
  const photoMatch = photo.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!photoMatch) {
    return NextResponse.json({ error: "photo must be a PNG, JPEG or WebP data URL" }, { status: 400 });
  }
  if (photo.length > 14_000_000) {
    return NextResponse.json({ error: "Photo is too large — please use an image under 10MB" }, { status: 400 });
  }

  const { data: plan, error } = await supabase
    .from("travel_plans")
    .select("*, destinations(*)")
    .eq("id", planId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admin = isAdminEmail(user?.email);

  const { count: usedCount } = await supabase
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("entity_id", planId)
    .eq("action", "poster.ai_generated");
  const used = usedCount ?? 0;

  // Entitlement: paid poster_addon purchases for this plan, minus prior runs.
  // Admins bypass the purchase requirement and generation cap for testing.
  let allowance = Infinity;
  if (!admin) {
    const { count: purchases } = await supabase
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("travel_plan_id", planId)
      .eq("plan_type", "poster_addon")
      .eq("status", "paid");
    if (!purchases) {
      return NextResponse.json(
        { error: "The AI poster is a paid add-on — purchase it to generate.", code: "addon_required" },
        { status: 403 },
      );
    }
    allowance = purchases * POSTER_ADDON_GENERATIONS;
    if (used >= allowance) {
      return NextResponse.json(
        {
          error: `You've used all ${allowance} included generations. Purchase the add-on again for ${POSTER_ADDON_GENERATIONS} more.`,
          code: "generations_exhausted",
        },
        { status: 403 },
      );
    }
  }

  const city = plan.destinations?.city ?? plan.title;
  const country = plan.destinations?.country ?? "";

  const { data: recs } = await supabase
    .from("plan_recommendations")
    .select("name")
    .eq("travel_plan_id", planId)
    .eq("category", "places_to_visit")
    .limit(4);
  const highlights = (recs ?? []).map((r) => r.name);
  const mainSpot = highlights[0] ?? `the most iconic landmark of ${city}`;

  const prompt =
    `Transform this into a vibrant, professionally designed travel poster. ` +
    `Keep the person from the photo as the foreground centerpiece, cut out cleanly and seamlessly blended into the scene with matching light and color grading. ` +
    `Behind them, a rich collage of ${city}, ${country}: ${mainSpot} as the dominant backdrop` +
    (highlights.length > 1 ? `, with ${highlights.slice(1).join(", ")} woven around the edges. ` : `. `) +
    `Golden-hour lighting, saturated warm colors, subtle film grain, layered depth. ` +
    `Elegant serif text at the bottom reading "${city.toUpperCase()}" with "${plan.duration_days ?? ""} days" beneath it. Portrait travel-poster composition.`;

  try {
    const imageBytes = Buffer.from(photoMatch[2], "base64");
    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("image", new Blob([new Uint8Array(imageBytes)], { type: photoMatch[1] }), "photo.png");
    form.append("prompt", prompt);
    form.append("size", "1024x1536");

    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
      signal: AbortSignal.timeout(150_000),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`OpenAI image edit failed (${res.status}): ${errBody.slice(0, 180)}`);
    }
    const data = await res.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error("OpenAI returned no image");

    await writeAuditLog(supabase, {
      action: "poster.ai_generated",
      entity_type: "travel_plan",
      entity_id: planId,
      user_id: user?.id ?? null,
      detail: {
        usage: data.usage ?? null,
        generation: used + 1,
        allowance: admin ? "admin_unlimited" : allowance,
      },
      risk_level: "medium",
    });

    return NextResponse.json({
      image: `data:image/png;base64,${b64}`,
      remaining: admin ? null : allowance - used - 1,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed";
    return NextResponse.json(
      { error: `AI poster generation failed: ${message.slice(0, 200)}` },
      { status: 502 },
    );
  }
}
