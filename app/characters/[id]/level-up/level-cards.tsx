"use client";
// Several levels at once (the builder's "Levels" and "Spells" steps, and "Level up to N"): one card per level
// with the class that goes up (multiclassing when the scores allow it), what you get and that level's choices.
import { useState } from "react";
import { activeChoices } from "@/lib/levelup/engine";
import { SPELL_CHOICE, type StepResult } from "@/lib/levelup/multi";
import { suggestions } from "@/lib/levelup/recommend";
import type { AsiAnswer, Answers, Choice } from "@/lib/levelup/types";
import { totalLevel } from "@/lib/rules";
import { ChoiceSection, FeatureCard } from "./wizard";

export type Show = "features" | "spells" | "all";
const wants = (show: Show, c: Choice) => show === "all" || (show === "spells") === SPELL_CHOICE.has(c.kind);

/** The scores after this level's Ability Score Improvement (for the ASI picker). */
function raised(scores: Record<string, number>, a: Answers): Record<string, number> {
  const s = { ...scores };
  for (const x of Object.values(a.asi ?? {}) as AsiAnswer[]) {
    if (x.mode === "plus2") s[x.a] = (s[x.a] ?? 10) + 2;
    else if (x.mode === "split") { s[x.a] = (s[x.a] ?? 10) + 1; s[x.b] = (s[x.b] ?? 10) + 1; }
    else if (x.ability) s[x.ability] = (s[x.ability] ?? 10) + 1;
  }
  return s;
}

/** Still to do at this level, for the part of it this list shows. */
export function stepMissing(r: StepResult, show: Show): string[] {
  const lvl = totalLevel(r.before.class_levels) + 1;
  const own = r.missing.filter((m) => show === "all" || (show === "spells") === m.spell).map((m) => `Level ${lvl}: ${m.text}`);
  return show !== "spells" && r.classProblem ? [`Level ${lvl}: ${r.classProblem}`, ...own] : own;
}

export function LevelCards({ results, show, onClass, onAnswers, onPick, wide = false }: {
  results: StepResult[]; show: Show; onClass: (i: number, cls: string) => void; onAnswers: (i: number, a: Answers) => void;
  /** "Pick for me" on this level */
  onPick?: (i: number) => void;
  /** on wide screens (the builder) two columns of level cards */
  wide?: boolean;
}) {
  const visible = results.filter((r) => show !== "spells" || (r.plan && activeChoices(r.plan, r.answers).some((c) => SPELL_CHOICE.has(c.kind))));
  const firstOpen = visible.find((r) => stepMissing(r, show).length)?.index ?? null;
  if (!visible.length) return null;
  return (
    <ol className={`mt-4 grid grid-cols-1 gap-2 ${wide ? "lg:grid-cols-2 lg:items-start" : ""}`}>
      {visible.map((r) => <LevelCard key={r.index} r={r} show={show} startOpen={r.index === firstOpen}
        onClass={(cls) => onClass(r.index, cls)} onAnswers={(a) => onAnswers(r.index, a)} onPick={onPick ? () => onPick(r.index) : undefined} />)}
    </ol>
  );
}

function LevelCard({ r, show, startOpen, onClass, onAnswers, onPick }: {
  r: StepResult; show: Show; startOpen: boolean; onClass: (cls: string) => void; onAnswers: (a: Answers) => void; onPick?: () => void;
}) {
  const [open, setOpen] = useState(startOpen);
  const lvl = totalLevel(r.before.class_levels) + 1;
  const todo = stepMissing(r, show);
  const plan = r.plan;
  const a = r.answers;
  const choices = plan ? activeChoices(plan, a).filter((c) => wants(show, c)) : [];
  const scores = r.before.ability_scores as Record<string, number>;
  const newScores = raised(scores, a);
  const sub = plan?.subclass ?? a.picks.subclass?.[0]?.replace(/^custom:/, "");
  const sugg = open && plan ? suggestions(plan, a, r.before) : {};

  const toggle = (c: Choice, name: string) => {
    const cur = a.picks[c.key] ?? [];
    let next = cur.includes(name) ? cur.filter((x) => x !== name) : c.choose === 1 ? [name] : cur.length >= c.choose ? cur : [...cur, name];
    if (c.kind === "subclass") next = cur.includes(name) ? [] : [name];
    onAnswers({ ...a, picks: { ...a.picks, [c.key]: next } });
  };

  return (
    <li className={`min-w-0 rounded-2xl border ${todo.length ? "border-line" : "border-success-line"} bg-surface`}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg font-heading text-lg font-bold">{lvl}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold leading-tight">{r.cls ? `${r.cls} ${plan?.toLevel ?? ""}` : "Pick a class"}{plan?.isNew ? " · new class" : ""}</span>
          <span className="block truncate text-xs text-muted">{sub ? `${sub} · ` : ""}{plan ? (plan.auto.map((f) => f.name).join(", ") || "More hit points") : r.classProblem}</span>
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${todo.length ? "bg-bg text-muted" : "bg-success-bg text-success"}`}>
          {todo.length ? `${todo.length} to do` : "✓"}</span>
      </button>
      {open && (
        <div className="border-t border-line px-4 pb-4">
          {onPick && todo.length > 0 && plan && (
            <button type="button" onClick={onPick} className="mt-3 flex h-10 items-center gap-1.5 rounded-xl border border-accent-line bg-accent-surface px-3 text-sm font-semibold text-accent">
              <span aria-hidden>✦</span> Pick for me</button>
          )}
          {show !== "spells" && <ClassPicker r={r} onClass={onClass} />}
          {show !== "spells" && plan && (
            <>
              {plan.gains.length > 0 && <ul className="mt-3 space-y-1 text-sm text-soft">{plan.gains.map((g) => <li key={g}>• {g}</li>)}</ul>}
              {plan.auto.length > 0 && <ul className="mt-3 flex flex-col gap-2">{plan.auto.map((f) => <FeatureCard key={f.source + f.name} name={f.name} source={f.source} text={f.text} />)}</ul>}
            </>
          )}
          {choices.map((c) => (
            <ChoiceSection key={`${r.index}-${r.cls}-${c.key}`} c={c} picks={a.picks[c.key] ?? []} onToggle={(n) => toggle(c, n)}
              suggestion={sugg[c.key]} onUse={(sg) => onAnswers(sg.asi ? { ...a, asi: { ...(a.asi ?? {}), [c.key]: sg.asi } } : { ...a, picks: { ...a.picks, [c.key]: sg.names } })}
              onCustom={(n) => onAnswers({ ...a, picks: { ...a.picks, subclass: n ? [`custom:${n}`] : [] } })}
              asi={a.asi?.[c.key]} onAsi={(x) => {
                const asi = { ...(a.asi ?? {}) };
                if (x) asi[c.key] = x; else delete asi[c.key];
                onAnswers({ ...a, asi });
              }} scores={scores} newScores={newScores} />
          ))}
          {todo.length > 0 && <p className="mt-3 text-sm text-muted" role="status">{todo[0].replace(/^Level \d+: /, "")}</p>}
        </div>
      )}
    </li>
  );
}

function ClassPicker({ r, onClass }: { r: StepResult; onClass: (cls: string) => void }) {
  const mine = r.options.filter((o) => !o.isNew);
  const others = r.options.filter((o) => o.isNew);
  const [more, setMore] = useState(r.options.some((o) => o.isNew && o.name === r.cls));
  return (
    <div className="mt-3">
      <p className="text-xs uppercase tracking-[0.12em] text-muted">Class for this level</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {mine.map((o) => (
          <button key={o.name} type="button" aria-pressed={r.cls === o.name} disabled={!o.ok} onClick={() => onClass(o.name)}
            className={`h-10 rounded-full border px-3 text-sm ${r.cls === o.name ? "border-accent bg-accent-surface font-bold text-accent" : "border-line text-soft"} disabled:opacity-40`}>
            {o.name} {o.level}</button>
        ))}
        {others.length > 0 && (
          <button type="button" aria-expanded={more} onClick={() => setMore(!more)}
            className={`h-10 rounded-full border px-3 text-sm ${r.options.some((o) => o.isNew && o.name === r.cls) ? "border-accent bg-accent-surface font-bold text-accent" : "border-dashed border-line text-muted"}`}>
            {r.options.some((o) => o.isNew && o.name === r.cls) ? `${r.cls} 1 (new)` : "+ New class (multiclass)"}</button>
        )}
      </div>
      {more && others.length > 0 && (
        <div className="mt-2 rounded-xl bg-bg p-2">
          <p className="px-1 text-xs text-muted">You keep everything and add level 1 of another class. You need 13 in the main score of your class{mine.length > 1 ? "es" : ""} and the new one.</p>
          <ul className="mt-2 grid grid-cols-2 gap-1.5">
            {others.map((o) => (
              <li key={o.name}>
                <button type="button" disabled={!o.ok} onClick={() => onClass(o.name)} aria-pressed={r.cls === o.name}
                  className={`block w-full rounded-xl border px-3 py-2 text-left ${r.cls === o.name ? "border-accent-strong bg-accent-surface" : "border-line bg-surface"} disabled:opacity-60`}>
                  <span className={`block font-semibold ${o.ok ? "" : "text-muted"}`}>{o.name}</span>
                  <span className="block text-xs text-muted">{o.ok ? "Your scores allow it" : o.why}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** "✦ Pick for me on every level": fills only what's still open; everything stays editable. */
export function PickAllButton({ onClick, label = "Pick for me on every level", note = "Fills only what's still open. You can change anything after." }: { onClick: () => void; label?: string; note?: string }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
      <button type="button" onClick={onClick} className="flex h-11 items-center gap-1.5 rounded-xl border border-accent-line bg-accent-surface px-4 text-sm font-bold text-accent">
        <span aria-hidden>✦</span> {label}</button>
      <span className="text-xs text-muted">{note}</span>
    </div>
  );
}
