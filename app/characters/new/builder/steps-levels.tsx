"use client";
// Builder step: levels 2 to N, after the scores and level 1 are done. Each level: which class goes up
// (multiclassing when the scores, raised by earlier Ability Score Improvements, allow it), what it gives,
// and its choices. Spells come on the next step.
import type { BuildPlan } from "@/lib/builder/levels";
import { classLine } from "@/lib/levelup/multi";
import type { Answers } from "@/lib/levelup/types";
import { ABILITIES, profBonus } from "@/lib/rules";
import { LevelCards, PickAllButton } from "../../[id]/level-up/level-cards";
import { StepTitle, sign, mod } from "./ui";
import type { StepProps } from "./steps-who";

export type CardsProps = {
  plan: BuildPlan | null; onClass: (i: number, cls: string) => void; onAnswers: (i: number, a: Answers) => void;
  onPick: (i: number, only?: "spells" | "features") => void; onPickAll: (only?: "spells" | "features") => void;
};

export function LevelsStep({ d, set, plan, onClass, onAnswers, onPick, onPickAll }: StepProps & CardsProps) {
  if (!plan) return <div className="h-40 animate-pulse rounded-2xl bg-surface" aria-label="Loading" />;
  const f = plan.final;
  const scores = f.ability_scores as Record<string, number>;
  return (
    <div>
      <StepTitle title={`Levels 2 to ${d.targetLevel}`} help="Tap a level to open it. Each one can go to your class or, if your scores allow it, start a new class. Your spells come next." />

      <section className="mt-4 rounded-2xl border border-accent-line bg-accent-surface p-4" aria-label="At the last level">
        <p className="text-xs uppercase tracking-[0.12em] text-muted">At level {d.targetLevel}</p>
        <p className="mt-0.5 font-heading text-xl font-bold">{classLine(f)}</p>
        <p className="text-sm text-soft">Proficiency +{profBonus(d.targetLevel)} · {d.upHp === "roll" ? `HP ${(plan.steps[0]?.before.hp_max ?? 0)} + rolls` : `HP ${f.hp_max ?? 0} (average)`}</p>
        <div className="mt-2 grid grid-cols-6 gap-1 text-center">
          {ABILITIES.map((a) => (
            <div key={a} className="rounded-lg bg-bg py-1"><p className="text-[11px] text-muted">{a}</p><p className="text-sm font-bold">{scores[a] ?? 10}</p><p className="text-[11px] text-muted">{sign(mod(scores[a] ?? 10))}</p></div>
          ))}
        </div>
      </section>

      <section className="mt-4" aria-label="Hit points">
        <p className="text-sm font-semibold">Hit points for levels 2–{d.targetLevel}</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {([["average", "Take the average", "No risk"], ["roll", "Roll them", "The app rolls each hit die when you save"]] as const).map(([m, t, s]) => (
            <button key={m} type="button" aria-pressed={d.upHp === m} onClick={() => set({ upHp: m })}
              className={`rounded-xl border px-3 py-2 text-left ${d.upHp === m ? "border-accent-strong bg-accent-surface" : "border-line bg-surface"}`}>
              <span className="block font-bold">{t}</span><span className="block text-xs text-muted">{s}</span>
            </button>
          ))}
        </div>
      </section>

      <PickAllButton onClick={() => onPickAll("features")} note="Subclass, Ability Score Improvements, fighting styles… Only what's still open; change anything after. Spells come next." />
      <LevelCards results={plan.steps} show="features" onClass={onClass} onAnswers={onAnswers} onPick={(i) => onPick(i, "features")} wide />
    </div>
  );
}
