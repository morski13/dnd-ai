"use client";
// Build a fight: pick the party, add monsters / NPCs, see the rating update live, save.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { analyze, type Analysis } from "@/lib/encounter/analyze";
import type { CharacterForSim, MonsterStats } from "@/lib/encounter/build";
import { luckFrom, luckLabel, type RollHistory } from "@/lib/encounter/luck";
import type { SpellInfo } from "@/lib/rules";
import type { FightData, SavedEntry } from "@/lib/fights-data";
import { deleteFight, saveFight } from "../actions";
import { AddMonsters } from "./parts/add-monsters";
import { ResultCard } from "./parts/result-card";
import { SimOptions } from "./parts/sim-options";

export function FightBuilder({ fight, characters, library, campaignMonsters, history }: {
  fight: { id: string; name: string; data: FightData };
  history: Record<string, RollHistory>;
  characters: CharacterForSim[];
  library: SpellInfo[];
  campaignMonsters: { id: string; name: string; stats: MonsterStats }[];
}) {
  const [name, setName] = useState(fight.name);
  const [data, setData] = useState<FightData>(fight.data);
  const [result, setResult] = useState<{ key: string; analysis: Analysis | null } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [real, setReal] = useState(true);      // use each character's real dice (personal simulation)
  const [runs, setRuns] = useState(2000);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const included = useMemo(
    () => characters.filter((c) => data.characterIds === null || data.characterIds.includes(c.id)),
    [characters, data.characterIds]
  );

  // Recalculate (debounced) whenever the fight changes.
  const inputKey = useMemo(
    () => JSON.stringify({ c: included.map((c) => c.id), e: data.entries, f: data.fresh, real, runs }),
    [included, data.entries, data.fresh, real, runs]
  );
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const analysis = analyze({
        characters: included, library, fresh: data.fresh, history: real ? history : undefined,
        entries: data.entries.filter((e) => e.count > 0).map((e) => ({ id: e.id, stats: e.stats, count: e.count, side: e.side })),
      }, runs);
      setResult({ key: inputKey, analysis });
    }, 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [inputKey, included, library, data.entries, data.fresh, real, runs, history]);
  const analysis = result?.analysis ?? null;
  const calculating = result?.key !== inputKey;

  function change(next: Partial<FightData>) {
    setData((d) => ({ ...d, ...next }));
    setDirty(true);
    setSaved(null);
  }
  function setEntry(id: string, patch: Partial<SavedEntry> | null) {
    change({ entries: patch === null ? data.entries.filter((e) => e.id !== id) : data.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  }
  function addEntry(e: Omit<SavedEntry, "id">) {
    const existing = data.entries.find((x) => x.source === e.source && x.ref === e.ref && x.side === e.side && e.source !== "custom");
    if (existing) return setEntry(existing.id, { count: existing.count + 1 });
    change({ entries: [...data.entries, { ...e, id: crypto.randomUUID().slice(0, 8) }] });
  }
  function toggleCharacter(id: string) {
    const current = data.characterIds ?? characters.map((c) => c.id);
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    change({ characterIds: next.length === characters.length ? null : next });
  }

  function save() {
    setError(null);
    start(async () => {
      const summary = analysis ? {
        tier: analysis.tier, pWin: analysis.summary.pWin, pAnyDown: analysis.summary.pAnyDown,
        pDeath: analysis.summary.pDeath, avgRounds: analysis.summary.avgRounds, xp: analysis.xp.enemyXp,
      } : null;
      const res = await saveFight(fight.id, name, data, summary);
      if ("error" in res) setError(res.error);
      else { setDirty(false); setSaved("Saved"); }
    });
  }

  const enemies = data.entries.filter((e) => e.side === "enemy");
  const allies = data.entries.filter((e) => e.side === "ally");

  return (
    <>
      <Link href="/fights" className="text-sm text-muted">← All fights</Link>
      <input
        value={name}
        onChange={(e) => { setName(e.target.value); setDirty(true); setSaved(null); }}
        aria-label="Fight name"
        className="mt-2 w-full rounded-xl border border-transparent bg-transparent font-heading text-3xl font-bold outline-none focus:border-line"
      />

      {/* phones and tablets: the result on top. Laptops: party and enemies on the left, the result stays in view on the right */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-8">
      <div className="mt-4 lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1 lg:mt-0 lg:max-h-[calc(100dvh-8.5rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
        <ResultCard analysis={analysis} calculating={calculating} hasEnemies={enemies.some((e) => e.count > 0)} hasParty={included.length > 0} />
        <SimOptions real={real} onReal={setReal} runs={runs} onRuns={setRuns}
          who={included.map((c) => ({ name: c.name.split(" ")[0], label: luckLabel(luckFrom(history[c.id])) }))} />
      </div>

      <div className="lg:col-start-1 lg:row-start-1">
      {/* Party */}
      <section className="mt-6 lg:mt-4">
        <p className="text-xs uppercase tracking-[0.12em] text-muted">Party</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {characters.map((c) => {
            const on = data.characterIds === null || data.characterIds.includes(c.id);
            const lvl = c.class_levels.reduce((a, x) => a + x.level, 0);
            return (
              <button key={c.id} type="button" onClick={() => toggleCharacter(c.id)}
                className={`h-11 rounded-xl border px-3 text-sm ${on ? "border-accent-strong bg-accent-surface font-bold" : "border-line text-muted line-through"}`}>
                {c.name.split(" ")[0]} <span className="font-normal text-muted">L{lvl}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 grid grid-cols-2 rounded-xl bg-surface p-1">
          {[{ v: true, l: "Fresh (full HP & slots)" }, { v: false, l: "As they are now" }].map((o) => (
            <button key={String(o.v)} type="button" onClick={() => change({ fresh: o.v })}
              className={`h-10 rounded-lg text-sm ${data.fresh === o.v ? "bg-bg font-bold" : "text-muted"}`}>{o.l}</button>
          ))}
        </div>
      </section>

      {/* Monsters & NPCs */}
      {[{ title: "Enemies", list: enemies }, { title: "Allies (NPCs on the party's side)", list: allies }].map(({ title, list }) =>
        list.length > 0 && (
          <section key={title} className="mt-6">
            <p className="text-xs uppercase tracking-[0.12em] text-muted">{title}</p>
            <ul className="mt-2 flex flex-col gap-2">
              {list.map((e) => (
                <li key={e.id} className="rounded-2xl border border-line bg-surface p-3">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{e.stats.name}</p>
                      <p className="text-xs text-muted">
                        {e.stats.cr ? `CR ${e.stats.cr} · ` : ""}AC {e.stats.ac} · HP {e.stats.hp}
                        {e.source === "custom" ? " · custom" : ""}
                      </p>
                    </div>
                    <div className="flex items-center">
                      <button type="button" aria-label="One fewer" onClick={() => setEntry(e.id, e.count <= 1 ? null : { count: e.count - 1 })}
                        className="h-11 w-11 rounded-l-xl border border-line text-lg">−</button>
                      <span className="flex h-11 w-10 items-center justify-center border-y border-line font-bold">{e.count}</span>
                      <button type="button" aria-label="One more" onClick={() => setEntry(e.id, { count: Math.min(20, e.count + 1) })}
                        className="h-11 w-11 rounded-r-xl border border-line text-lg">+</button>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => setEntry(e.id, { side: e.side === "enemy" ? "ally" : "enemy" })}
                      className="h-9 rounded-lg border border-line px-3 text-xs text-soft">
                      {e.side === "enemy" ? "Make ally" : "Make enemy"}
                    </button>
                    <button type="button" onClick={() => setEntry(e.id, null)} className="h-9 rounded-lg px-3 text-xs text-muted">Remove</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )
      )}

      <section className="mt-6">
        <AddMonsters
          campaignMonsters={campaignMonsters}
          partyLevel={Math.max(1, ...included.map((c) => c.class_levels.reduce((a, x) => a + x.level, 0)))}
          onAdd={addEntry}
        />
      </section>

      <button type="button" onClick={() => { if (confirm("Delete this fight?")) start(async () => { await deleteFight(fight.id); }); }}
        className="mt-8 h-11 w-full rounded-xl border border-danger-line text-sm text-danger">Delete fight</button>
      </div>
      </div>

      {/* Save bar */}
      <div className="dock z-10 border-t border-line bg-surface-2/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3 px-5 py-3">
          <p className="min-w-0 flex-1 truncate text-sm text-muted">
            {error ? <span className="text-danger">{error}</span> : saved ? "✓ Saved. Start it from Session mode." : dirty ? "Unsaved changes" : "Saved"}
          </p>
          <button type="button" onClick={save} disabled={pending || !dirty}
            className="h-12 rounded-xl bg-accent px-6 font-bold text-accent-text disabled:opacity-50">
            {pending ? "Saving…" : "Save fight"}
          </button>
        </div>
      </div>
    </>
  );
}
