"use client";
// Tap the right side for the next slide, the left side to go back (like a story). Each slide has Share.
import { useState } from "react";
import type { Slide } from "@/lib/stats/wrapped";
import { ShareButton } from "../../components/share-card";

export function WrappedStory({ slides, campaign }: { slides: Slide[]; campaign: string }) {
  const [i, setI] = useState(0);
  const s = slides[i];
  return (
    <div className="mt-4">
      <div className="flex gap-1" aria-hidden>
        {slides.map((x, j) => <span key={x.id} className={`h-1 flex-1 rounded-full ${j <= i ? "bg-accent" : "bg-line"}`} />)}
      </div>
      <section key={s.id} className="animate-rise relative mt-3 flex aspect-[4/5] flex-col justify-between overflow-hidden rounded-3xl border border-accent-line bg-gradient-to-b from-accent-surface to-bg p-6" aria-live="polite">
        <button type="button" aria-label="Previous" onClick={() => setI(Math.max(0, i - 1))} className="absolute inset-y-0 left-0 w-1/3" />
        <button type="button" aria-label="Next" onClick={() => setI(Math.min(slides.length - 1, i + 1))} className="absolute inset-y-0 right-0 w-2/3" />
        <p className="pointer-events-none text-sm font-bold uppercase tracking-[0.14em] text-accent">{s.kicker}</p>
        <div className="pointer-events-none">
          <p className="text-6xl" aria-hidden>{s.emoji}</p>
          <p className="mt-2 font-heading text-7xl font-bold leading-none [overflow-wrap:anywhere]">{s.big}</p>
          <p className="mt-3 font-heading text-2xl font-bold text-accent">{s.title}</p>
          {s.sub && <p className="mt-2 text-soft">{s.sub}</p>}
        </div>
        <p className="pointer-events-none text-sm text-muted">{campaign} · {i + 1} / {slides.length}</p>
      </section>
      <div className="mt-3 flex items-center justify-between gap-2">
        <button type="button" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0} className="h-11 rounded-xl border border-line px-4 text-sm font-semibold text-soft disabled:opacity-40">Back</button>
        <ShareButton card={{ kicker: s.kicker, big: s.big, title: s.title, sub: s.sub, emoji: s.emoji, name: s.who ?? undefined, campaign }} label="Share this slide" />
        <button type="button" onClick={() => setI(Math.min(slides.length - 1, i + 1))} disabled={i === slides.length - 1} className="h-11 rounded-xl bg-accent px-4 text-sm font-bold text-accent-text disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}
