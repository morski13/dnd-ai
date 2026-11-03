"use client";
// Tap the right side for the next slide, the left side to go back (like a story); swipe or the arrow keys
// work too. Each slide has Share. Used by Campaign Wrapped and Session Wrapped: a slide can bring its own
// body (the vote, the DM's teaser), and then the tap zones step aside so its buttons work.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Slide } from "@/lib/stats/wrapped";
import { ShareButton, type Card } from "../../components/share-card";

export type StorySlide = Slide & { kind?: string; color?: string; portrait?: string | null; mine?: boolean };

export function WrappedStory<S extends StorySlide>({ slides, campaign, body, card }: {
  slides: S[]; campaign: string;
  /** A slide's own content instead of the big number (interactive slides). */
  body?: (s: S) => ReactNode | undefined;
  /** The share picture for a slide; null = no Share on it. */
  card?: (s: S) => Card | null;
}) {
  const [i, setI] = useState(0);
  const at = Math.min(i, slides.length - 1);
  const s = slides[at];
  const prev = () => setI((n) => Math.max(0, n - 1));
  const next = () => setI((n) => Math.min(slides.length - 1, n + 1));
  const touch = useRef<number | null>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea, [contenteditable]")) return;
      if (e.key === "ArrowRight") setI((n) => Math.min(slides.length - 1, n + 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [slides.length]);
  if (!s) return null;
  const own = body?.(s);
  const share = card ? card(s) : { kicker: s.kicker, big: s.big, title: s.title, sub: s.sub, emoji: s.emoji, name: s.who ?? undefined, campaign, portrait: s.portrait ?? null };

  return (
    <div className="mt-4" onTouchStart={(e) => { touch.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => {
        const x0 = touch.current; touch.current = null;
        const dx = x0 == null ? 0 : (e.changedTouches[0]?.clientX ?? x0) - x0;
        if (Math.abs(dx) > 60) { if (dx < 0) next(); else prev(); }
      }}>
      <div className="flex gap-1" aria-hidden>
        {slides.map((x, j) => <span key={x.id} className={`h-1 flex-1 rounded-full ${j <= at ? "bg-accent" : "bg-line"}`} />)}
      </div>
      <section key={s.id} className="animate-rise relative mt-3 flex min-h-[max(24rem,min(34rem,calc(100svh-15rem)))] flex-col justify-between gap-4 overflow-hidden rounded-3xl border border-accent-line bg-gradient-to-b from-accent-surface to-bg p-5 sm:p-6"
        style={s.color ? { borderColor: s.color } : undefined} aria-live="polite" aria-roledescription="slide" aria-label={`${at + 1} of ${slides.length}`}>
        {own === undefined && <>
          <button type="button" aria-label="Previous" onClick={prev} className="absolute inset-y-0 left-0 w-1/3" />
          <button type="button" aria-label="Next" onClick={next} className="absolute inset-y-0 right-0 w-2/3" />
        </>}
        <div className="pointer-events-none flex items-start justify-between gap-3">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-accent">{s.kicker}</p>
          {s.portrait && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.portrait} alt="" className="h-16 w-16 shrink-0 rounded-full border-2 object-cover" style={{ borderColor: s.color ?? "var(--color-accent-line)" }} />
          )}
        </div>
        {own !== undefined ? <div className="min-h-0 flex-1">{own}</div> : (
          <div className="pointer-events-none">
            <p className="text-6xl" aria-hidden>{s.emoji}</p>
            <p className="mt-2 font-heading text-7xl font-bold leading-none [overflow-wrap:anywhere]">{s.big}</p>
            <p className="mt-3 font-heading text-2xl font-bold text-accent [overflow-wrap:anywhere]">
              {s.color && <span aria-hidden className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: s.color }} />}{s.title}
            </p>
            {s.sub && <p className="mt-2 text-soft">{s.sub}</p>}
          </div>
        )}
        <p className="pointer-events-none text-sm text-muted">{campaign} · {at + 1} / {slides.length}</p>
      </section>
      <div className="mt-3 flex items-center justify-between gap-2">
        <button type="button" onClick={prev} disabled={at === 0} className="h-11 rounded-xl border border-line px-4 text-sm font-semibold text-soft disabled:opacity-40">Back</button>
        {share ? <ShareButton card={share} label="Share this slide" /> : <span />}
        <button type="button" onClick={next} disabled={at === slides.length - 1} className="h-11 rounded-xl bg-accent px-4 text-sm font-bold text-accent-text disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}
