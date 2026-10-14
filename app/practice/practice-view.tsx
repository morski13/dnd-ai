"use client";
// "How would I do against…?" Pick your character, add monsters from the library, and the app plays the fight
// thousands of times in your browser, using your character's real dice so far (or the sheet if they're new).
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { analyze, type Analysis } from "@/lib/encounter/analyze";
import type { CharacterForSim, MonsterStats } from "@/lib/encounter/build";
import { luckFrom, luckLabel, type RollHistory } from "@/lib/encounter/luck";
import type { SpellInfo } from "@/lib/rules";
import { SrdSearch } from "../fights/[id]/parts/add-monsters";
import { ResultCard } from "../fights/[id]/parts/result-card";
import { SimOptions } from "../fights/[id]/parts/sim-options";

type Foe = { key: string; stats: MonsterStats; count: number };

export function PracticeView({ characters, library, history }: {
  characters: CharacterForSim[]; library: SpellInfo[]; history: Record<string, RollHistory>;
}) {
  const [picked, setPicked] = useState<string[]>(characters.map((c) => c.id));
  const [foes, setFoes] = useState<Foe[]>([]);
  const [fresh, setFresh] = useState(true);
  const [real, setReal] = useState(true);
  const [runs, setRuns] = useState(2000);
  const [result, setResult] = useState<{ key: string; analysis: Analysis | null } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const team = useMemo(() => characters.filter((c) => picked.includes(c.id)), [characters, picked]);
  const key = JSON.stringify({ picked, foes: foes.map((f) => [f.key, f.count]), fresh, real, runs });

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const analysis = team.length && foes.length ? analyze({
        characters: team, library, fresh, history: real ? history : undefined,
        entries: foes.map((f) => ({ id: f.key, stats: f.stats, count: f.count, side: "enemy" as const })),
      }, runs) : null;
      setResult({ key, analysis });
    }, 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [key, team, foes, library, fresh, real, runs, history]);

  if (!characters.length) {
    return (
      <>
        <Link href="/" className="text-sm text-muted">← Home</Link>
        <h1 className="mt-2 font-heading text-3xl font-bold">Practice fight</h1>
        <p className="mt-4 rounded-2xl border border-dashed border-line p-5 text-sm text-muted">You don&apos;t have a character in this campaign yet. <Link href="/characters" className="text-accent underline">Find or make one</Link>.</p>
      </>
    );
  }
  const level = Math.max(1, ...team.map((c) => c.class_levels.reduce((a, x) => a + x.level, 0)));
  return (
    <>
      <Link href="/" className="text-sm text-muted">← Home</Link>
      <h1 className="mt-2 font-heading text-3xl font-bold">Practice fight</h1>
      <p className="mt-1 text-sm text-soft">How would you do? Nothing here is saved or shown to anyone.</p>

      <div className="mt-4">
        <ResultCard analysis={result?.analysis ?? null} calculating={result?.key !== key} hasEnemies={foes.length > 0} hasParty={team.length > 0} />
        <SimOptions real={real} onReal={setReal} runs={runs} onRuns={setRuns}
          who={team.map((c) => ({ name: c.name.split(" ")[0], label: luckLabel(luckFrom(history[c.id])) }))} />
      </div>

      <section className="mt-6">
        <p className="text-xs uppercase tracking-[0.12em] text-muted">You</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {characters.map((c) => {
            const on = picked.includes(c.id);
            return (
              <button key={c.id} type="button" aria-pressed={on} onClick={() => setPicked(on ? picked.filter((x) => x !== c.id) : [...picked, c.id])}
                className={`h-11 rounded-xl border px-3 text-sm ${on ? "border-accent-strong bg-accent-surface font-bold" : "border-line text-muted line-through"}`}>
                {c.name.split(" ")[0]} <span className="font-normal text-muted">L{c.class_levels.reduce((a, x) => a + x.level, 0)}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 grid grid-cols-2 rounded-xl bg-surface p-1">
          {[{ v: true, l: "Fresh (full HP & slots)" }, { v: false, l: "As you are now" }].map((o) => (
            <button key={String(o.v)} type="button" onClick={() => setFresh(o.v)}
              className={`h-10 rounded-lg text-sm ${fresh === o.v ? "bg-bg font-bold" : "text-muted"}`}>{o.l}</button>
          ))}
        </div>
      </section>

      {foes.length > 0 && (
        <section className="mt-6">
          <p className="text-xs uppercase tracking-[0.12em] text-muted">Against</p>
          <ul className="mt-2 flex flex-col gap-2">
            {foes.map((f) => (
              <li key={f.key} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
                <div className="min-w-0 flex-1"><p className="truncate font-bold">{f.stats.name}</p><p className="text-xs text-muted">{f.stats.cr ? `CR ${f.stats.cr} · ` : ""}AC {f.stats.ac} · HP {f.stats.hp}</p></div>
                <button type="button" aria-label="One fewer" onClick={() => setFoes(f.count <= 1 ? foes.filter((x) => x.key !== f.key) : foes.map((x) => (x.key === f.key ? { ...x, count: x.count - 1 } : x)))} className="h-11 w-11 rounded-l-xl border border-line text-lg">−</button>
                <span className="-mx-3 flex h-11 w-10 items-center justify-center border-y border-line font-bold">{f.count}</span>
                <button type="button" aria-label="One more" onClick={() => setFoes(foes.map((x) => (x.key === f.key ? { ...x, count: Math.min(20, x.count + 1) } : x)))} className="h-11 w-11 rounded-r-xl border border-line text-lg">+</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6 rounded-2xl border border-line bg-surface-2 p-4">
        <p className="font-semibold">Add a monster</p>
        <SrdSearch partyLevel={level} onAdd={(stats) => {
          const existing = foes.find((f) => f.stats.name === stats.name);
          setFoes(existing ? foes.map((f) => (f === existing ? { ...f, count: f.count + 1 } : f)) : [...foes, { key: crypto.randomUUID().slice(0, 8), stats, count: 1 }]);
        }} />
        <p className="mt-3 text-[11px] text-muted">Monster stat blocks: SRD 5.2.1 by Wizards of the Coast LLC, CC-BY-4.0.</p>
      </section>
    </>
  );
}
