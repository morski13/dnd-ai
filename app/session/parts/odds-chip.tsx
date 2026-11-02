"use client";
// DM only, during a fight: "Odds right now" (win, someone drops, someone dies), simulated from the fight as it is.
// (On the phone itself: the build can't ship a web worker yet, so the work is split up and runs after each paint.)
// Tap it for changes that would make it fairer, each with its new odds. Nothing changes until the DM taps one.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { Fairer, Odds, OddsInput } from "@/lib/encounter/live";
import { applyFairer, fightOddsInput } from "../odds-actions";

type Result = { now: Odds | null; options: Fairer[] | null; ms: number };
const pct = (x: number) => `${Math.round(x * 100)}%`;
/** Let the screen paint first, then do the work (keeps taps and scrolling smooth). */
const later = <T,>(fn: () => T) => new Promise<T>((res) => setTimeout(() => res(fn()), 0));

export function OddsChip({ combatId, version }: { combatId: string; version: string }) {
  const router = useRouter();
  const [res, setRes] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const input = useRef<OddsInput | null>(null);
  const ask = useRef(0);

  // after every HP change, turn or roll: load the fight as it is and play it 500 times (about 150 ms on a phone)
  useEffect(() => {
    const id = ++ask.current;
    const t = setTimeout(async () => {
      const got = await fightOddsInput(combatId).catch(() => ({ error: "Couldn't load the fight." }));
      if (id !== ask.current) return;
      if ("error" in got) { setError(got.error); return; }
      setError(null);
      input.current = got;
      const { odds } = await import("@/lib/encounter/live");
      const t0 = performance.now();
      const now = await later(() => odds(got));
      if (id === ask.current) setRes({ now, options: null, ms: Math.round(performance.now() - t0) });
    }, 400);
    return () => clearTimeout(t);
  }, [combatId, version]);

  // the "fairer" changes play the fight again for each one: only when the DM opens the panel
  useEffect(() => {
    if (!open || !res?.now || res.options || !input.current) return;
    const id = ask.current;
    (async () => {
      const { fairer } = await import("@/lib/encounter/live");
      const options = await later(() => fairer(input.current!, res.now!));
      if (id === ask.current) setRes((r) => (r ? { ...r, options } : r));
    })();
  }, [open, res]);

  if (error) return null;
  const now = res?.now;
  const tone = !now ? "border-line text-muted" : now.pWin >= 0.85 ? "border-success-line text-success" : now.pWin >= 0.6 ? "border-accent-line text-accent" : "border-danger-line text-danger";
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className={`flex min-h-10 w-full items-center gap-2 rounded-xl border bg-surface px-3 py-1.5 text-left text-sm ${tone}`}>
        <span aria-hidden>📊</span>
        {now ? <span className="min-w-0 flex-1"><b>Odds right now:</b> win {pct(now.pWin)} · someone drops {pct(now.pDown)} · death {pct(now.pDeath)}</span>
          : <span className="min-w-0 flex-1">Working out the odds…</span>}
        <span className="shrink-0 text-xs text-muted">DM only</span>
      </button>
      {open && now && (
        <div className="mt-2 rounded-xl border border-line bg-surface p-3 text-sm">
          <p className="text-soft">Played 500 times from the fight as it is now (HP, slots, uses, the table&apos;s real dice){res?.ms ? `, in ${res.ms} ms` : ""}.</p>
          <p className="mt-2 font-semibold">{!res!.options ? "Working out what would make it fairer…" : res!.options.length ? "What would make it fairer" : "Nothing to change: it looks fair."}</p>
          <ul className="mt-1 flex flex-col gap-1.5">
            {(res!.options ?? []).map((o) => (
              <li key={o.id} className="flex items-center gap-2 rounded-lg bg-bg px-3 py-2">
                <span className="min-w-0 flex-1"><b>{o.label}</b><span className="block text-xs text-muted">win {pct(o.odds.pWin)} · drops {pct(o.odds.pDown)} · death {pct(o.odds.pDeath)}</span></span>
                <button type="button" disabled={pending} onClick={() => start(async () => { const r = await applyFairer(combatId, o.change); if ("error" in r) setError(r.error); else { setOpen(false); router.refresh(); } })}
                  className="h-9 shrink-0 rounded-lg border border-accent-line px-3 text-xs font-bold text-accent">Do it</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
