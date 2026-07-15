"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  planId: string;
  tier: "free" | "premium"; // free: gradient poster · premium (unlocked plan): photo collage
  aiEntitled: boolean; // paid poster_addon purchase exists for this plan (or admin)
  isAdmin: boolean; // admins generate for free without a purchase
  aiPriceLabel: string;
  title: string;
  destination: string;
  city: string;
  dates: string;
  days: number;
  purpose: string;
  highlights: string[];
};

const W = 1080;
const H = 1350; // 4:5

type CollageImage = { img: HTMLImageElement; caption: string };

async function wikiImageUrl(term: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
        term,
      )}&gsrlimit=1&prop=pageimages&piprop=thumbnail&pithumbsize=1400&format=json&origin=*`,
    );
    const data = await res.json();
    const pages = data?.query?.pages;
    if (!pages) return null;
    const page = Object.values(pages)[0] as { thumbnail?: { source?: string } };
    return page?.thumbnail?.source ?? null;
  } catch {
    return null;
  }
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function coverDraw(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const scale = Math.max(w / img.width, h / img.height);
  const iw = img.width * scale;
  const ih = img.height * scale;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Tiered trip poster:
 * - free: designed gradient poster (no destination photos)
 * - premium (unlocked plan): photo collage — hero location background,
 *   polaroid tiles, user photo centerpiece; imagery from Wikimedia
 * - AI add-on (paid): gpt-image-1 blends the user into the scene seamlessly
 */
export default function TripPoster(props: Props) {
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [hero, setHero] = useState<CollageImage | null>(null);
  const [tiles, setTiles] = useState<CollageImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiImage, setAiImage] = useState<string | null>(null);
  const [aiRemaining, setAiRemaining] = useState<number | null>(null);
  const fetched = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Destination photography — premium tier only.
  useEffect(() => {
    if (!open || props.tier !== "premium" || fetched.current) return;
    fetched.current = true;
    (async () => {
      setLoading(true);
      const seen = new Set<string>();
      const mainTerm = props.highlights[0]
        ? `${props.highlights[0]} ${props.city}`
        : props.destination;
      const heroUrl = (await wikiImageUrl(mainTerm)) ?? (await wikiImageUrl(props.city));
      if (heroUrl) {
        seen.add(heroUrl);
        const img = await loadImage(heroUrl);
        if (img) setHero({ img, caption: props.highlights[0] ?? props.city });
      }
      const tileTerms: { term: string; caption: string }[] = [
        ...props.highlights.slice(1, 5).map((h) => ({ term: `${h} ${props.city}`, caption: h })),
        { term: `${props.city} old town`, caption: `${props.city} old town` },
        { term: `${props.city} cathedral`, caption: `${props.city} landmarks` },
        { term: `${props.city} market`, caption: `${props.city} markets` },
        { term: `${props.city} skyline`, caption: props.destination },
      ];
      const collected: CollageImage[] = [];
      for (const t of tileTerms) {
        if (collected.length >= 4) break;
        const url = await wikiImageUrl(t.term);
        if (!url || seen.has(url)) continue;
        seen.add(url);
        const img = await loadImage(url);
        if (img) {
          collected.push({ img, caption: t.caption });
          setTiles([...collected]);
        }
      }
      setLoading(false);
    })();
  }, [open, props]);

  const drawFree = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      const cx = W / 2;
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#0f766e");
      bg.addColorStop(0.55, "#115e59");
      bg.addColorStop(1, "#0f172a");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 2;
      for (const r of [420, 520, 620]) {
        ctx.beginPath();
        ctx.arc(cx, 330, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      const radius = 190;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, 330, radius, 0, Math.PI * 2);
      ctx.clip();
      if (photo) {
        const scale = Math.max((radius * 2) / photo.width, (radius * 2) / photo.height);
        ctx.drawImage(
          photo,
          cx - (photo.width * scale) / 2,
          330 - (photo.height * scale) / 2,
          photo.width * scale,
          photo.height * scale,
        );
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fillRect(cx - radius, 330 - radius, radius * 2, radius * 2);
        ctx.fillStyle = "rgba(255,255,255,0.65)";
        ctx.font = "160px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🧳", cx, 342);
      }
      ctx.restore();
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(cx, 330, radius + 4, 0, Math.PI * 2);
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#5eead4";
      ctx.font = "600 34px system-ui";
      ctx.fillText("UPCOMING TRIP", cx, 610);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 92px Georgia, serif";
      let y = 710;
      for (const line of wrapText(ctx, props.title, 920).slice(0, 3)) {
        ctx.fillText(line, cx, y);
        y += 100;
      }
      ctx.fillStyle = "#99f6e4";
      ctx.font = "48px system-ui";
      ctx.fillText(`📍 ${props.destination}`, cx, y + 10);
      y += 80;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "38px system-ui";
      ctx.fillText(`${props.dates} · ${props.days} days · ${props.purpose}`, cx, y);
      y += 90;
      if (props.highlights.length > 0) {
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.beginPath();
        ctx.moveTo(cx - 200, y - 40);
        ctx.lineTo(cx + 200, y - 40);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.font = "36px system-ui";
        for (const h of props.highlights.slice(0, 3)) {
          const text = `★ ${h}`;
          ctx.fillText(text.length > 55 ? text.slice(0, 54) + "…" : text, cx, y + 20);
          y += 62;
        }
      }
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "600 32px system-ui";
      ctx.fillText("🧭 Wayfare — plan a whole trip in one click", cx, H - 60);
    },
    [photo, props],
  );

  const drawPremium = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      ctx.filter = "none";
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, W, H);
      if (hero) {
        ctx.filter = "saturate(1.35) contrast(1.06) brightness(0.95)";
        coverDraw(ctx, hero.img, 0, 0, W, H);
        ctx.filter = "none";
      } else {
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, "#0f766e");
        bg.addColorStop(1, "#0f172a");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);
      }
      let g = ctx.createLinearGradient(0, 0, 0, 320);
      g.addColorStop(0, "rgba(2,6,23,0.55)");
      g.addColorStop(1, "rgba(2,6,23,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, 320);
      g = ctx.createLinearGradient(0, H - 560, 0, H);
      g.addColorStop(0, "rgba(2,6,23,0)");
      g.addColorStop(0.55, "rgba(2,6,23,0.72)");
      g.addColorStop(1, "rgba(2,6,23,0.92)");
      ctx.fillStyle = g;
      ctx.fillRect(0, H - 560, W, 560);
      const glow = ctx.createRadialGradient(W, 0, 50, W, 0, 700);
      glow.addColorStop(0, "rgba(251,191,36,0.28)");
      glow.addColorStop(1, "rgba(251,191,36,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      const spots = [
        { x: 130, y: 240, r: -0.09 },
        { x: 950, y: 300, r: 0.08 },
        { x: 120, y: 640, r: 0.07 },
        { x: 960, y: 700, r: -0.07 },
      ];
      tiles.slice(0, 4).forEach((tile, i) => {
        const s = spots[i];
        const tw = 300;
        const th = 340;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.r);
        ctx.shadowColor = "rgba(0,0,0,0.45)";
        ctx.shadowBlur = 28;
        ctx.shadowOffsetY = 10;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.roundRect(-tw / 2, -th / 2, tw, th, 10);
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(-tw / 2 + 14, -th / 2 + 14, tw - 28, th - 78, 6);
        ctx.clip();
        ctx.filter = "saturate(1.3) contrast(1.05)";
        coverDraw(ctx, tile.img, -tw / 2 + 14, -th / 2 + 14, tw - 28, th - 78);
        ctx.filter = "none";
        ctx.restore();
        ctx.fillStyle = "#334155";
        ctx.font = "italic 24px Georgia, serif";
        ctx.textAlign = "center";
        const cap = tile.caption.length > 24 ? tile.caption.slice(0, 23) + "…" : tile.caption;
        ctx.fillText(cap, 0, th / 2 - 26);
        ctx.restore();
      });

      const cx = W / 2;
      const cy = 720;
      const radius = 225;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = 46;
      ctx.shadowOffsetY = 16;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();
      if (photo) {
        ctx.filter = "saturate(1.15) contrast(1.03)";
        const scale = Math.max((radius * 2) / photo.width, (radius * 2) / photo.height);
        ctx.drawImage(
          photo,
          cx - (photo.width * scale) / 2,
          cy - (photo.height * scale) / 2,
          photo.width * scale,
          photo.height * scale,
        );
        ctx.filter = "none";
      } else {
        ctx.fillStyle = "#134e4a";
        ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.font = "170px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🧑‍✈️", cx, cy + 14);
      }
      ctx.restore();

      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#fbbf24";
      ctx.font = "700 34px system-ui";
      ctx.fillText("✈  U P C O M I N G   T R I P  ✈", cx, 1030);
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 18;
      let citySize = 120;
      ctx.font = `bold ${citySize}px Georgia, serif`;
      while (ctx.measureText(props.city.toUpperCase()).width > 960 && citySize > 56) {
        citySize -= 8;
        ctx.font = `bold ${citySize}px Georgia, serif`;
      }
      ctx.fillText(props.city.toUpperCase(), cx, 1145);
      ctx.shadowColor = "transparent";
      ctx.fillStyle = "#99f6e4";
      ctx.font = "42px system-ui";
      ctx.fillText(`${props.dates}  ·  ${props.days} days`, cx, 1215);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "600 28px system-ui";
      ctx.fillText("🧭 Wayfare — plan a whole trip in one click", cx, H - 48);
    },
    [photo, hero, tiles, props],
  );

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    if (props.tier === "premium") drawPremium(ctx);
    else drawFree(ctx);
  }, [props.tier, drawFree, drawPremium]);

  useEffect(() => {
    if (open) draw();
  }, [open, draw]);

  function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      setPhotoDataUrl(dataUrl);
      const img = new Image();
      img.onload = () => setPhoto(img);
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.download = `${props.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-poster.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  }

  async function buyAddon() {
    setAiError(null);
    setAiBusy(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: props.planId, product: "poster_addon" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error ?? "Could not start checkout");
      window.location.href = data.url;
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Could not start checkout");
      setAiBusy(false);
    }
  }

  async function generateAi() {
    if (!photoDataUrl) {
      setAiError("Add your photo first — it becomes the centerpiece of the AI poster.");
      return;
    }
    setAiError(null);
    setAiBusy(true);
    try {
      const res = await fetch("/api/poster/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: props.planId, photo: photoDataUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setAiImage(data.image);
      setAiRemaining(data.remaining ?? null);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <section className="mt-10" aria-labelledby="poster-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="poster-heading" className="text-2xl font-bold">Trip poster</h2>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
          >
            🖼️ Create trip poster
          </button>
        )}
      </div>

      {open && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-col items-start gap-6 lg:flex-row">
            <div className="w-full max-w-sm">
              <canvas
                ref={canvasRef}
                width={W}
                height={H}
                className="w-full rounded-lg border border-slate-200 shadow-sm"
                aria-label="Trip poster preview"
              />
              {loading && (
                <p role="status" className="mt-2 text-xs text-slate-500">
                  Fetching destination photos…
                </p>
              )}
            </div>

            <div className="max-w-sm space-y-4">
              <div>
                <label htmlFor="poster-photo" className="text-sm font-medium">
                  Add your photo — you&apos;re the centerpiece
                </label>
                <input
                  id="poster-photo"
                  type="file"
                  accept="image/*"
                  onChange={onPhotoChange}
                  className="mt-1 block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-teal-700 hover:file:bg-teal-100"
                />
                <p className="mt-2 text-xs text-slate-400">
                  This poster is composed in your browser — your photo isn&apos;t
                  uploaded.
                  {props.tier === "premium" &&
                    " Destination photos are sourced live from Wikimedia."}
                </p>
              </div>

              {props.tier === "free" && (
                <p className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900">
                  🔒 <strong>Unlock the full plan</strong> to upgrade this poster
                  to a photo collage of {props.city}&apos;s top spots.
                </p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={download}
                  className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
                >
                  ⬇️ Download poster
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-slate-800"
                >
                  Close
                </button>
              </div>

              {/* AI seamless poster add-on — premium plans only */}
              {props.tier === "premium" && (
                <div className="rounded-xl border-2 border-amber-200 bg-amber-50/60 p-4">
                  <h3 className="font-semibold text-amber-900">
                    ✨ AI Seamless Poster{" "}
                    {!props.aiEntitled && (
                      <span className="text-amber-700">— {props.aiPriceLabel}</span>
                    )}
                  </h3>
                  <p className="mt-1 text-xs text-amber-800">
                    Our AI cuts you out of your photo and blends you into a
                    cinematic {props.city} scene — one seamless artwork, no
                    circles or frames.
                  </p>
                  {!props.aiEntitled ? (
                    <button
                      onClick={buyAddon}
                      disabled={aiBusy}
                      className="mt-3 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
                    >
                      {aiBusy ? "Opening checkout…" : `Get AI Poster — ${props.aiPriceLabel}`}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={generateAi}
                        disabled={aiBusy}
                        className="mt-3 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
                      >
                        {aiBusy ? "Generating… (about a minute) ✨" : "Generate AI poster"}
                      </button>
                      {props.isAdmin ? (
                        <p className="mt-1 text-xs font-medium text-amber-700">
                          Admin — unlimited free generations
                        </p>
                      ) : (
                        aiRemaining != null && (
                          <p className="mt-1 text-xs text-amber-700">
                            {aiRemaining} generation{aiRemaining === 1 ? "" : "s"} remaining
                          </p>
                        )
                      )}
                      <p className="mt-2 text-xs text-amber-700">
                        For this feature your photo is sent securely to OpenAI to
                        create the artwork — it isn&apos;t stored.
                      </p>
                    </>
                  )}
                  {aiError && (
                    <p role="alert" className="mt-2 text-xs text-red-600">
                      {aiError}
                    </p>
                  )}
                  {aiImage && (
                    <div className="mt-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={aiImage}
                        alt="AI-generated trip poster"
                        className="w-full rounded-lg border border-amber-200 shadow-sm"
                      />
                      <a
                        href={aiImage}
                        download={`${props.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-ai-poster.png`}
                        className="mt-2 inline-block rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
                      >
                        ⬇️ Download AI poster
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
