"use client";
// Shareable stat cards: a 1080×1350 picture made on the phone (the table's theme colours, the number, the title,
// the campaign), sent through the phone's share sheet, or downloaded where sharing files isn't possible.
import { useState } from "react";
import { APP_NAME } from "@/lib/brand";

export type Card = { kicker: string; big: string; title: string; sub?: string; name?: string; campaign: string; emoji?: string; portrait?: string | null };

const cssVar = (n: string, fallback: string) => {
  try { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fallback; } catch { return fallback; }
};
const fontOf = (n: string, fallback: string) => {
  const v = cssVar(n, "");
  return v ? v.split(",")[0].replace(/['"]/g, "").trim() : fallback;
};

/** Lines that fit `max` pixels wide. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(/\s+/)) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > max && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

export async function drawCard(card: Card): Promise<Blob> {
  const W = 1080, H = 1350, P = 96;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  const bg = cssVar("--color-bg", "#15130f"), surface = cssVar("--color-accent-surface", "#2a2017"), accent = cssVar("--color-accent", "#e0913a");
  const text = cssVar("--color-text", "#efe7da"), soft = cssVar("--color-soft", "#cbbfad"), line = cssVar("--color-accent-line", "#5a4024");
  const head = fontOf("--font-spectral", "Georgia"), body = fontOf("--font-manrope", "system-ui");
  await document.fonts?.ready?.catch?.(() => undefined);

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, surface); g.addColorStop(1, bg);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = line; ctx.lineWidth = 6; ctx.strokeRect(40, 40, W - 80, H - 80);

  let y = 190;
  ctx.fillStyle = accent; ctx.font = `700 40px ${body}`; ctx.textBaseline = "alphabetic";
  ctx.fillText(card.kicker.toUpperCase(), P, y);

  if (card.portrait) {
    try {
      const img = new Image(); img.src = card.portrait; await img.decode();
      ctx.save(); ctx.beginPath(); ctx.arc(W - P - 90, 160, 90, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(img, W - P - 180, 70, 180, 180); ctx.restore();
    } catch { /* no picture */ }
  }

  y += 70;
  if (card.emoji) { ctx.font = `140px ${body}`; ctx.fillText(card.emoji, P, y + 130); y += 170; }
  ctx.fillStyle = text;
  ctx.font = card.big.length > 6 ? `700 ${Math.max(110, 260 - (card.big.length - 6) * 22)}px ${head}` : `700 260px ${head}`; ctx.fillText(card.big, P, y + 230); y += 340;
  ctx.fillStyle = accent; ctx.font = `700 76px ${head}`;
  for (const l of wrap(ctx, card.title, W - 2 * P).slice(0, 3)) { ctx.fillText(l, P, y); y += 90; }
  if (card.sub) { ctx.fillStyle = soft; ctx.font = `400 44px ${body}`; y += 10; for (const l of wrap(ctx, card.sub, W - 2 * P).slice(0, 4)) { ctx.fillText(l, P, y); y += 60; } }
  if (card.name) { ctx.fillStyle = text; ctx.font = `700 64px ${head}`; ctx.fillText(card.name, P, H - 230); }
  ctx.fillStyle = soft; ctx.font = `400 40px ${body}`; ctx.fillText(card.campaign, P, H - 165);
  ctx.fillStyle = accent; ctx.font = `700 32px ${body}`; ctx.fillText(APP_NAME, P, H - 95);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't make the picture."))), "image/png"));
}

/** Share through the phone's share sheet; download when files can't be shared. */
export async function shareCard(card: Card): Promise<"shared" | "downloaded" | "cancelled"> {
  const blob = await drawCard(card);
  const name = `${(card.name ?? card.title).replace(/[^\w-]+/g, "-").toLowerCase()}.png`;
  const file = new File([blob], name, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title: card.title, text: `${card.title}: ${card.big}` }); return "shared"; }
    catch (e) { if ((e as Error).name === "AbortError") return "cancelled"; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "downloaded";
}

export function ShareButton({ card, label = "Share", className = "" }: { card: Card; label?: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" disabled={busy} aria-label={`Share: ${card.title}`}
        onClick={async (e) => { e.preventDefault(); e.stopPropagation(); setBusy(true); try { const r = await shareCard(card); setNote(r === "downloaded" ? "Saved the picture" : null); } catch { setNote("Couldn't make it"); } setBusy(false); }}
        className={`inline-flex min-h-9 items-center gap-1 rounded-lg border border-accent-line px-2.5 text-xs font-bold text-accent ${className}`}>
        <span aria-hidden>↗</span>{busy ? "…" : label}</button>
      {note && <span className="text-[11px] text-muted">{note}</span>}
    </span>
  );
}
