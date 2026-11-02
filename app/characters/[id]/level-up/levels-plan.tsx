"use client";
// "Level up to N": several levels in one go, or planned ahead and saved. Each level picks its class
// (multiclassing when the scores allow it) and its choices; the sheet after the last level is shown on top.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { LevelChar } from "@/lib/levelup/engine";
import { classLine, planSteps, recommendSteps, resizeSteps, type LevelStep, type SavedMulti } from "@/lib/levelup/multi";
import { recommend } from "@/lib/levelup/recommend";
import type { Answers, RulesData, SpellLite } from "@/lib/levelup/types";
import { ABILITIES, profBonus, totalLevel } from "@/lib/rules";
import { useDice } from "../../../components/dice/dice-provider";
import { clearLevelPlan, confirmLevels, saveLevelsPlan } from "./actions";
import { LevelCards, PickAllButton, stepMissing } from "./level-cards";
import { UndoLevelUp } from "./undo";

const mod = (s: number) => Math.floor((s - 10) / 2);
const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** Pick how far to go: the next level opens the usual level-up, more opens the planner. */
export function TargetLevel({ characterId, current, to }: { characterId: string; current: number; to: number }) {
  const router = useRouter();
  if (current >= 20) return null;
  return (
    <label className="mt-3 flex min-h-11 flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-soft">
      <span>Level up to</span>
      <select value={to} onChange={(e) => router.push(`/characters/${characterId}/level-up${Number(e.target.value) > current + 1 ? `?to=${e.target.value}` : ""}`)}
        className="h-10 rounded-lg border border-line bg-bg px-2 font-bold text-text" aria-label="Level up to">
        {Array.from({ length: 20 - current }, (_, i) => current + 1 + i).map((n) => <option key={n} value={n}>{n}{n === current + 1 ? " (next)" : ""}</option>)}
      </select>
      <span className="text-xs text-muted">{to > current + 1 ? `${to - current} levels at once` : "Going up more? Pick a higher level."}</span>
    </label>
  );
}

export function LevelsPlanner({ characterId, name, start, data, spells, to, multiclass, defaultHp, saved }: {
  characterId: string; name: string; start: LevelChar; data: RulesData; spells: SpellLite[]; to: number; multiclass: boolean;
  defaultHp: "average" | "roll"; saved: SavedMulti | null;
}) {
  const router = useRouter();
  const dice = useDice();
  const current = totalLevel(start.class_levels);
  const count = Math.max(1, Math.min(20, to) - current);
  const mainClass = [...start.class_levels].sort((a, b) => b.level - a.level)[0]?.class ?? "";
  const [steps, setSteps] = useState<LevelStep[]>(() => resizeSteps(saved?.ups ?? [], count, mainClass));
  const [hp, setHp] = useState<"average" | "roll">(saved?.hp ?? defaultHp);
  const [savedAt, setSavedAt] = useState<string | null>(saved?.savedAt ?? null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ levels: { className: string; level: number; total: number; summary: string[] }[]; rolls: { die: number; value: number }[] } | null>(null);
  const [pending, start2] = useTransition();

  const results = useMemo(() => planSteps(start, steps, data, spells, { multiclass }), [start, steps, data, spells, multiclass]);
  const todo = results.flatMap((r) => stepMissing(r, "all"));
  const fin = results.length ? results[results.length - 1].after : start;
  const scores = fin.ability_scores as Record<string, number>;
  const cleaned = () => results.map((r) => ({ cls: r.cls, answers: r.answers }));
  const setStep = (i: number, p: Partial<LevelStep>) => { setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x))); };

  function confirm() {
    setError(null);
    start2(async () => {
      const r = await confirmLevels(characterId, cleaned(), hp);
      if ("error" in r) return setError(r.error);
      const dies = new Set(r.rolls.map((x) => x.die));
      if (r.rolls.length && dies.size === 1 && r.rolls.length <= 10) {
        const vals = r.rolls.map((x) => x.value);
        await dice.show({ expression: `${vals.length}d${r.rolls[0].die}`, dice: vals, diceAll: vals, total: vals.reduce((a, b) => a + b, 0), label: "Hit points", tone: "heal" }, { force: true });
      }
      setDone(r);
      router.refresh();
    });
  }
  function save() {
    setError(null);
    start2(async () => { const r = await saveLevelsPlan(characterId, current + count, cleaned(), hp); if ("error" in r) setError(r.error); else setSavedAt(r.savedAt); });
  }
  function forget() {
    start2(async () => { const r = await clearLevelPlan(characterId); if (r && "error" in r) setError(r.error); else setSavedAt(null); });
  }

  if (done) {
    const last = done.levels[done.levels.length - 1];
    return (
      <section className="mt-4" aria-live="polite">
        <p className="text-sm uppercase tracking-[0.12em] text-accent">Level up!</p>
        <h1 className="mt-1 font-heading text-3xl font-bold">Level {last.total}</h1>
        {done.rolls.length > 0 && <p className="mt-1 text-sm text-soft">Hit dice rolled: {done.rolls.map((x) => `d${x.die} ${x.value}`).join(", ")}</p>}
        <ol className="mt-4 space-y-3">
          {done.levels.map((l) => (
            <li key={l.total} className="rounded-2xl border border-success-line bg-success-bg p-4 text-[15px]">
              <p className="font-bold">Level {l.total} · {l.className} {l.level}</p>
              <ul className="mt-1 space-y-1">{l.summary.slice(1).map((s) => <li key={s} className="text-soft">✓ {s}</li>)}</ul>
            </li>
          ))}
        </ol>
        <Link href={`/characters/${characterId}`} className="mt-5 flex h-14 items-center justify-center rounded-2xl bg-accent font-heading text-xl font-bold text-accent-text">Go to the sheet</Link>
        <div className="mt-3"><UndoLevelUp characterId={characterId} label={`${last.className} ${last.level}`} /></div>
        <p className="mt-2 text-xs text-muted">Undo takes off one level at a time; the level history below the level-up lets you go back further.</p>
      </section>
    );
  }

  return (
    <>
      <header className="mt-2">
        <h1 className="font-heading text-3xl font-bold">Level up: {current} → {current + count}</h1>
        <p className="text-soft">{name} · {classLine(start)}</p>
        <TargetLevel characterId={characterId} current={current} to={current + count} />
      </header>

      <section className="mt-4 rounded-2xl border border-accent-line bg-accent-surface p-4" aria-label="At the last level">
        <p className="text-xs uppercase tracking-[0.12em] text-muted">At level {current + count}</p>
        <p className="mt-0.5 font-heading text-xl font-bold">{classLine(fin)}</p>
        <p className="text-sm text-soft">Proficiency +{profBonus(current + count)} · Max HP {start.hp_max ?? 0} → {hp === "roll" ? "rolled" : `${fin.hp_max ?? 0} (average)`}</p>
        <div className="mt-2 grid grid-cols-6 gap-1 text-center">
          {ABILITIES.map((a) => {
            const was = (start.ability_scores as Record<string, number>)[a] ?? 10, now = scores[a] ?? 10;
            return (
              <div key={a} className="rounded-lg bg-bg py-1"><p className="text-[11px] text-muted">{a}</p>
                <p className={`text-sm font-bold ${now !== was ? "text-success" : ""}`}>{now}</p><p className="text-[11px] text-muted">{sign(mod(now))}</p></div>
            );
          })}
        </div>
      </section>

      <section className="mt-4" aria-label="Hit points">
        <p className="text-sm font-semibold">Hit points for each new level</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {([["average", "Take the average", "No risk"], ["roll", "Roll them", "The app rolls each hit die"]] as const).map(([m, t, s]) => (
            <button key={m} type="button" aria-pressed={hp === m} onClick={() => setHp(m)}
              className={`rounded-xl border px-3 py-2 text-left ${hp === m ? "border-accent-strong bg-accent-surface" : "border-line bg-surface"}`}>
              <span className="block font-bold">{t}</span><span className="block text-xs text-muted">{s}</span>
            </button>
          ))}
        </div>
      </section>

      {todo.length > 0 && <PickAllButton onClick={() => setSteps(recommendSteps(start, cleaned(), data, spells, { multiclass }, (plan, a, c) => recommend(plan, a, c, data)))} />}
      <LevelCards results={results} show="all" onClass={(i, cls) => setStep(i, { cls, answers: { picks: {}, hp: "average" } })}
        onAnswers={(i, a: Answers) => setStep(i, { answers: a })}
        onPick={(i) => { const r = results[i]; if (r.plan) setStep(i, { answers: recommend(r.plan, r.answers, r.before, data) }); }} />

      <section className="mt-8 rounded-2xl border border-line bg-surface p-4" aria-label="Plan ahead">
        <h2 className="font-bold">Plan ahead</h2>
        <p className="text-sm text-muted">Not levelling up yet? Save these levels now; next time they&apos;re already filled in.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={save} disabled={pending} className="h-10 rounded-xl border border-line px-3 text-sm font-semibold text-soft">Save plan for later</button>
          {savedAt && <button type="button" onClick={forget} disabled={pending} className="h-10 px-2 text-sm text-muted underline">Forget the plan</button>}
        </div>
        {savedAt && <p className="mt-2 text-xs text-success" role="status">✓ Plan saved {new Date(savedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</p>}
      </section>

      <div className="dock z-10 border-t border-line bg-surface-2/95 backdrop-blur" role="region" aria-label="Level-up status">
        <div className="mx-auto max-w-md px-5 py-3">
          {error && <p className="mb-2 text-sm text-danger" role="alert">{error}</p>}
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-sm text-muted">{todo.length ? <>{todo.length} to do. <span className="text-soft">{todo[0]}</span></> : "All set!"}</p>
            <button type="button" onClick={confirm} disabled={todo.length > 0 || pending}
              className="h-12 shrink-0 rounded-xl bg-accent px-4 font-bold text-accent-text disabled:opacity-40">{pending ? "Saving…" : `Level up to ${current + count}`}</button>
          </div>
        </div>
      </div>
    </>
  );
}
