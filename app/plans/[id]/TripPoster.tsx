"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
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
    img.crossOrigin = "anonymous"; // Wikimedia serves CORS headers — keeps the canvas exportable
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

/**
 * Collage trip poster, composed entirely in the browser:
 * - hero photo of the main location as the full-bleed background
 * - tilted polaroid photos of other destination spots
 * - the user's photo as the foreground centerpiece (never uploaded)
 * Destination photos are fetched from Wikimedia's public API.
 */
export default function TripPoster(props: Props) {
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [hero, setHero] = useState<CollageImage | null>(null);
  const [tiles, setTiles] = useState<CollageImage[]>([]);
  const [loading, setLoading] = useState(false);
  const fetched = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Fetch destination photography once, when the poster is opened.
  useEffect(() => {
    if (!open || fetched.current) return;
    fetched.current = true;
    (async () => {
      setLoading(true);
      const seen = new Set<string>();
      const mainTerm = props.highlights[0]
        ? `${props.highlights[0]} ${props.city}`
        : props.destination;

      const heroUrl =
        (await wikiImageUrl(mainTerm)) ?? (await wikiImageUrl(props.city));
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
          setTiles([...collected]); // progressive redraw
        }
      }
      setLoading(false);
    })();
  }, [open, props]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    // ── Background: hero photo of the main location, saturated ──
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

    // Legibility gradients (top + bottom)
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
    // Warm corner glow for vibrancy
    const glow = ctx.createRadialGradient(W, 0, 50, W, 0, 700);
    glow.addColorStop(0, "rgba(251,191,36,0.28)");
    glow.addColorStop(1, "rgba(251,191,36,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // ── Polaroid collage tiles ──
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

    // ── User photo — foreground centerpiece ──
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

    // ── Text block ──
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
  }, [photo, hero, tiles, props]);

  useEffect(() => {
    if (open) draw();
  }, [open, draw]);

  function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => setPhoto(img);
      img.src = String(reader.result);
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
                  Your photo stays on your device — the poster is composed
                  entirely in your browser. Destination photos are sourced live
                  from Wikimedia.
                </p>
              </div>
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
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
