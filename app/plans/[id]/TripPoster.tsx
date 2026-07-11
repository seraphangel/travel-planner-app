"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  title: string;
  destination: string;
  dates: string;
  days: number;
  purpose: string;
  highlights: string[];
};

const W = 1080;
const H = 1350; // 4:5 — prints and shares well

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
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

// The poster is composed entirely in the browser with <canvas> — the
// uploaded photo never leaves the user's device.
export default function TripPoster(props: Props) {
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0f766e");
    bg.addColorStop(0.55, "#115e59");
    bg.addColorStop(1, "#0f172a");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Decorative rings
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 2;
    for (const r of [420, 520, 620]) {
      ctx.beginPath();
      ctx.arc(W / 2, 330, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Photo (circle) or placeholder
    const cx = W / 2;
    const cy = 330;
    const radius = 190;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (photo) {
      const scale = Math.max((radius * 2) / photo.width, (radius * 2) / photo.height);
      const pw = photo.width * scale;
      const ph = photo.height * scale;
      ctx.drawImage(photo, cx - pw / 2, cy - ph / 2, pw, ph);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.font = "160px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🧳", cx, cy + 12);
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
    ctx.stroke();

    // Eyebrow
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#5eead4";
    ctx.font = "600 34px system-ui";
    ctx.fillText("UPCOMING TRIP", cx, 610);

    // Title
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 92px Georgia, serif";
    const titleLines = wrapText(ctx, props.title, 920);
    let y = 710;
    for (const line of titleLines.slice(0, 3)) {
      ctx.fillText(line, cx, y);
      y += 100;
    }

    // Destination + dates
    ctx.fillStyle = "#99f6e4";
    ctx.font = "48px system-ui";
    ctx.fillText(`📍 ${props.destination}`, cx, y + 10);
    y += 80;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "38px system-ui";
    ctx.fillText(
      `${props.dates} · ${props.days} days · ${props.purpose}`,
      cx,
      y,
    );
    y += 90;

    // Highlights
    if (props.highlights.length > 0) {
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 200, y - 40);
      ctx.lineTo(cx + 200, y - 40);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = "36px system-ui";
      for (const h of props.highlights.slice(0, 3)) {
        const text = `★ ${h}`;
        ctx.fillText(
          ctx.measureText(text).width > 960 ? text.slice(0, 58) + "…" : text,
          cx,
          y + 20,
        );
        y += 62;
      }
    }

    // Footer brand
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "600 32px system-ui";
    ctx.fillText("🧭 Wayfare — plan a whole trip in one click", cx, H - 60);
  }, [photo, props]);

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
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              className="w-full max-w-sm rounded-lg border border-slate-200 shadow-sm"
              aria-label="Trip poster preview"
            />
            <div className="max-w-sm space-y-4">
              <div>
                <label htmlFor="poster-photo" className="text-sm font-medium">
                  Add your photo (optional)
                </label>
                <input
                  id="poster-photo"
                  type="file"
                  accept="image/*"
                  onChange={onPhotoChange}
                  className="mt-1 block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-teal-700 hover:file:bg-teal-100"
                />
                <p className="mt-2 text-xs text-slate-400">
                  Your photo stays on your device — the poster is created
                  entirely in your browser and never uploaded.
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
