"use client";
// The Dice tab: tap dice into a pool (2d6 + 1d8 + 3), pick advantage for a d20, roll with the 3D dice.
// Rolls go to the table log while a session is running (they count in the stats), otherwise they're just yours.
import Link from "next/link";
import { useState, useTransition } from "react";
import { freeRoll, type QuickRoll } from "../session/actions";
import { useDice } from "../components/dice/dice-provider";

const SIDES = [4, 6, 8, 10, 12, 20, 100] as const;
const QUICK: [string, string][] = [["1d20", "d20"], ["1d20 adv", "d20 advantage"], ["1d20 dis", "d20 disadvantage"], ["2d6", "2d6"], ["4d6kh3", "Ability score (4d6, best 3)"], ["1d100", "Percent"]];
type Mode = "normal" | "adv" | "dis";
type Hist = QuickRoll & { at: number; who: string };

/** A die drawn the way it looks on the table (rough shape per die type). */
function DieShape({ sides, className = "" }: { sides: number; className?: string }) {
  const shape: Record<number, string> = {
    4: "M12 3 21 19H3z", 6: "M5 5h14v14H5z", 8: "M12 2 21 12 12 22 3 12z", 10: "M12 2 21 10 12 22 3 10z",
    12: "M12 2.5 20.5 8.7 17.3 19H6.7L3.5 8.7z", 20: "M12 2.5 20.5 7.5v9L12 21.5 3.5 16.5v-9z", 100: "M12 2 21 10 12 22 3 10z",
  };
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" aria-hidden><path d={shape[sides]} /></svg>;
}

export function DiceRoller({ characters, isDm, live }: { characters: { id: string; name: string }[]; isDm: boolean; live: { session: number | null; combat: boolean } }) {
  const dice = useDice();
  const [pool, setPool] = useState<Record<number, number>>({ 20: 1 });
  const [modifier, setModifier] = useState(0);
  const [mode, setMode] = useState<Mode>("normal");
  const [who, setWho] = useState<string | null>(characters[0]?.id ?? null);
  const [label, setLabel] = useState("");
  const [hidden, setHidden] = useState(false);
  const [history, setHistory] = useState<Hist[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const parts = SIDES.filter((s) => (pool[s] ?? 0) > 0).map((s) => `${pool[s]}d${s}`);
  const onlyD20 = parts.length === 1 && pool[20] === 1;
  const expr = parts.length ? `${parts.join("+")}${modifier ? (modifier > 0 ? `+${modifier}` : `${modifier}`) : ""}${onlyD20 && mode !== "normal" ? ` ${mode}` : ""}` : "";
  const add = (s: number, by: number) => setPool((p) => ({ ...p, [s]: Math.max(0, Math.min(20, (p[s] ?? 0) + by)) }));
  const name = (id: string | null) => characters.find((c) => c.id === id)?.name ?? (isDm ? "DM" : "You");

  function go(e: string, what = label) {
    if (!e) return;
    setError(null);
    start(async () => {
      const r = await freeRoll(e, what, who, isDm && hidden);
      if ("error" in r) return setError(r.error);
      await dice.show({ ...r, label: r.label });
      setHistory((h) => [{ ...r, at: Date.now(), who: name(who) }, ...h].slice(0, 30));
    });
  }

  const last = history[0];
  return (
    <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div>
        <p className={`rounded-xl px-3 py-2 text-sm ${live.session ? "border border-success-line bg-success-bg text-success" : "bg-surface text-muted"}`} role="status">
          {live.session ? `Session ${live.session} is live${live.combat ? " (in a fight)" : ""}: your rolls go to the table log and the stats.` : "No session running: rolls are just for you (they don't count in the stats)."}
        </p>

        {(characters.length > 0 || isDm) && (
          <div className="mt-4">
            <p className="text-xs uppercase tracking-[0.12em] text-muted">Rolling as</p>
            <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Rolling as">
              {characters.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={who === c.id} onClick={() => setWho(c.id)}
                  className={`h-10 rounded-full border px-3 text-sm ${who === c.id ? "border-accent bg-accent-surface font-bold text-accent" : "border-line text-soft"}`}>{c.name}</button>
              ))}
              <button type="button" role="radio" aria-checked={who === null} onClick={() => setWho(null)}
                className={`h-10 rounded-full border px-3 text-sm ${who === null ? "border-accent bg-accent-surface font-bold text-accent" : "border-line text-soft"}`}>{isDm ? "DM" : "No character"}</button>
            </div>
          </div>
        )}

        <section aria-label="Dice" className="mt-5">
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {SIDES.map((s) => {
              const n = pool[s] ?? 0;
              return (
                <div key={s} className={`relative flex flex-col items-center rounded-2xl border ${n ? "border-accent-strong bg-accent-surface" : "border-line bg-surface"}`}>
                  <button type="button" onClick={() => add(s, 1)} aria-label={`Add a d${s}${n ? ` (${n} now)` : ""}`} className="flex w-full flex-col items-center px-1 pt-3 pb-1">
                    <DieShape sides={s} className={`h-10 w-10 ${n ? "text-accent" : "text-soft"}`} />
                    <span className="mt-1 font-heading text-lg font-bold">d{s}</span>
                  </button>
                  {n > 0 && <span className="absolute top-1.5 right-2 rounded-full bg-accent px-1.5 text-xs font-bold text-accent-text">{n}</span>}
                  <button type="button" onClick={() => add(s, -1)} disabled={!n} aria-label={`Remove a d${s}`}
                    className="h-9 w-full rounded-b-2xl text-sm text-muted disabled:opacity-0">−</button>
                </div>
              );
            })}
            <div className="flex flex-col items-center justify-between rounded-2xl border border-line bg-surface p-1">
              <span className="pt-2 text-xs text-muted">Bonus</span>
              <span className="font-heading text-xl font-bold" aria-live="polite">{modifier >= 0 ? `+${modifier}` : modifier}</span>
              <span className="flex w-full">
                <button type="button" onClick={() => setModifier((m) => Math.max(-20, m - 1))} aria-label="Lower the bonus" className="h-9 flex-1 text-lg text-soft">−</button>
                <button type="button" onClick={() => setModifier((m) => Math.min(30, m + 1))} aria-label="Raise the bonus" className="h-9 flex-1 text-lg text-soft">+</button>
              </span>
            </div>
          </div>

          <div className={`mt-3 grid grid-cols-3 rounded-xl bg-surface p-1 ${onlyD20 ? "" : "opacity-50"}`} role="radiogroup" aria-label="Advantage">
            {([["dis", "Disadvantage"], ["normal", "Normal"], ["adv", "Advantage"]] as const).map(([m, l]) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} disabled={!onlyD20} onClick={() => setMode(m)}
                className={`h-10 rounded-lg text-sm ${mode === m && onlyD20 ? "bg-accent font-bold text-accent-text" : "text-muted"}`}>{l}</button>
            ))}
          </div>
          {!onlyD20 && <p className="mt-1 text-xs text-muted">Advantage works with a single d20.</p>}

          <input value={label} onChange={(e) => setLabel(e.target.value.slice(0, 60))} placeholder="What for? (optional, e.g. Perception)" aria-label="What for?"
            className="mt-3 h-11 w-full rounded-xl border border-line bg-bg px-3 text-[15px] outline-none focus:border-accent" />
          {isDm && (
            <label className="mt-2 flex min-h-11 items-center gap-2 text-sm text-soft">
              <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} className="h-5 w-5 accent-accent" /> Secret roll (players see “rolled in secret”)
            </label>
          )}

          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => { setPool({}); setModifier(0); setMode("normal"); }} className="h-14 rounded-2xl border border-line px-4 text-soft">Clear</button>
            <button type="button" onClick={() => go(expr)} disabled={!expr || pending}
              className="h-14 flex-1 rounded-2xl bg-accent font-heading text-xl font-bold text-accent-text disabled:opacity-40">
              {pending ? "Rolling…" : expr ? `Roll ${expr}` : "Tap dice to add them"}
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
        </section>

        <section aria-label="Quick rolls" className="mt-6">
          <p className="text-xs uppercase tracking-[0.12em] text-muted">One tap</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {QUICK.map(([e, l]) => (
              <button key={e} type="button" disabled={pending} onClick={() => go(e, label || l)}
                className="min-h-12 rounded-xl border border-line bg-surface px-3 text-left text-sm"><span className="block font-semibold">{e}</span><span className="block text-xs text-muted">{l}</span></button>
            ))}
          </div>
        </section>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
        <section aria-label="Last roll" className="rounded-2xl border border-line bg-surface p-4 text-center">
          {last ? (
            <>
              <p className="text-xs uppercase tracking-[0.12em] text-muted">{last.who} · {last.label}</p>
              <p key={last.at} className={`mt-1 font-heading text-6xl font-bold ${last.isCrit ? "animate-pop text-accent" : last.isFumble ? "animate-shake text-danger" : "animate-pop"}`}>{last.total}</p>
              <p className="mt-1 text-sm text-muted">{last.expression} ({last.diceAll.join(", ")}){last.modifier ? ` ${last.modifier > 0 ? "+" : ""}${last.modifier}` : ""}{last.isCrit ? " · natural 20!" : last.isFumble ? " · natural 1" : ""}</p>
            </>
          ) : <p className="py-6 text-sm text-muted">Your rolls show up here.</p>}
        </section>
        {history.length > 1 && (
          <section aria-label="Earlier rolls">
            <p className="text-xs uppercase tracking-[0.12em] text-muted">Earlier</p>
            <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-surface">
              {history.slice(1, 12).map((h) => (
                <li key={h.at} className="flex items-baseline gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-soft">{h.who} · {h.label} <span className="text-xs text-muted">{h.expression}</span></span>
                  <span className={`font-bold ${h.isCrit ? "text-accent" : h.isFumble ? "text-danger" : ""}`}>{h.total}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <Link href="/dice" className="flex min-h-12 items-center justify-between rounded-2xl border border-line bg-surface px-4 text-sm">
          <span><span className="block font-semibold">Dice workshop</span><span className="block text-xs text-muted">Colors, patterns, pictures and how they roll</span></span>
          <span className="text-accent" aria-hidden>→</span>
        </Link>
      </aside>
    </div>
  );
}
