"use client";
// The character builder: one step at a time, everything offered from the rules, nothing to look up elsewhere.
// The draft is kept on this phone (so a reload or a phone call doesn't lose it) until the character is made.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { CLASSES } from "@/lib/classes";
import type { ClassCard } from "@/lib/builder/data";
import {
  backgroundProblems, baseCharacter, blankDraft, checkBase, givenSkills, kitProblems, skillProblems, speciesProblems, suggestedArray,
} from "@/lib/builder/engine";
import type { BuilderData, Draft, Rules, ScoreMethod } from "@/lib/builder/types";
import { activeChoices } from "@/lib/levelup/engine";
import type { Plan } from "@/lib/levelup/types";
import { ABILITIES } from "@/lib/rules";
import { createFromBuilder, planFirstLevel } from "../builder-actions";
import { DetailsStep, ReviewStep } from "./steps-end";
import { EquipmentStep, FeaturesStep, SPELL_KINDS, SpellsStep } from "./steps-gear";
import { AbilityScores, SkillsStep } from "./steps-stats";
import { BackgroundStep, ClassStep, SpeciesStep } from "./steps-who";

type StepId = "class" | "species" | "background" | "abilities" | "skills" | "features" | "spells" | "equipment" | "details" | "review";
const LABEL: Record<StepId, string> = {
  class: "Class", species: "Species", background: "Background", abilities: "Abilities", skills: "Skills", features: "Features",
  spells: "Spells", equipment: "Gear", details: "Details", review: "Review",
};
const KEY = "builder-draft-v1";
type Saved = { d: Draft; step: StepId; rolled: number[] };

function loadSaved(rules: Rules[]): Saved | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
    return s && rules.includes(s.d?.rules) ? s : null;
  } catch { return null; }
}

/** Choices that no longer fit (skills you now get from your background, picks from another class) are dropped. */
function tidy(d: Draft, data: BuilderData): Draft {
  const given = givenSkills(d, data);
  return { ...d, classSkills: d.classSkills.filter((s) => !given.has(s)) };
}

export function Builder({ isDm, campaignRules, datas, cards, feats, defaultMethod }: {
  isDm: boolean; campaignRules: string; datas: Partial<Record<Rules, BuilderData>>; cards: Partial<Record<Rules, ClassCard[]>>;
  feats: Partial<Record<Rules, Record<string, string>>>; defaultMethod: ScoreMethod;
}) {
  const rulesOptions: Rules[] = campaignRules === "mixed" ? ["2024", "2014"] : [campaignRules === "2014" ? "2014" : "2024"];
  const fresh = (rules: Rules): Saved => {
    const d = blankDraft(rules);
    return { d: { ...d, method: defaultMethod, base: defaultMethod === "standard" ? suggestedArray([...ABILITIES]) : d.base, forMe: !isDm }, step: "class", rolled: [] };
  };
  // rendered in the browser only (see ClientOnly), so the saved draft can be read right away
  const [state, setState] = useState<Saved>(() => loadSaved(rulesOptions) ?? fresh(rulesOptions[0]));
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode: fine */ } }, [state]);

  const d = state.d;
  const data = datas[d.rules]!;
  const set = (p: Partial<Draft>) => setState((s) => ({ ...s, d: tidy({ ...s.d, ...p }, datas[(p.rules ?? s.d.rules) as Rules]!) }));
  const go = (step: StepId) => { setState((s) => ({ ...s, step })); if (typeof window !== "undefined") window.scrollTo({ top: 0 }); };

  // ---- the class's level-1 plan comes from the server (it needs the rules data and the spell library)
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planErr, setPlanErr] = useState<string | null>(null);
  const planKey = useMemo(() => {
    if (!d.cls) return "";
    const b = baseCharacter(d, data);
    return JSON.stringify([d.rules, d.cls, b.ability_scores, b.proficiencies.skills, b.spells.known]);
  }, [d, data]);
  const asked = useRef("");
  const stepIndexOfFeatures = 5;
  const order0: StepId[] = ["class", "species", "background", "abilities", "skills", "features", "spells", "equipment", "details", "review"];
  const needPlan = !!d.cls && order0.indexOf(state.step) >= stepIndexOfFeatures - 1;
  useEffect(() => {
    if (!needPlan || !planKey || asked.current === planKey) return;
    asked.current = planKey;
    setPlanErr(null);
    planFirstLevel(d).then((r) => {
      if (asked.current !== planKey) return;
      if ("error" in r) { setPlanErr(r.error); return; }
      setPlan(r.plan);
      // keep only picks that are still offered
      setState((s) => {
        const picks: Draft["level"]["picks"] = {};
        for (const c of r.plan.choices) {
          const got = (s.d.level.picks[c.key] ?? []).filter((n) => c.options.some((o) => o.name === n) || (c.kind === "subclass" && n.startsWith("custom:")));
          if (got.length) picks[c.key] = got.slice(0, Math.max(1, c.choose));
        }
        return { ...s, d: { ...s.d, level: { ...s.d.level, picks } } };
      });
    }).catch(() => setPlanErr("Couldn't load your class's choices. Check your connection and go back and forth once."));
  }, [needPlan, planKey, d]);
  const planFits = plan && plan.className === d.cls;

  const isCaster = planFits ? plan!.choices.some((c) => SPELL_KINDS.has(c.kind)) : !!CLASSES[d.cls]?.spell;
  const steps: StepId[] = order0.filter((s) => s !== "spells" || isCaster);

  // ---- what's missing, per step
  const choiceProblems = (kinds: (k: string) => boolean): string[] => {
    if (!d.cls) return ["Pick a class first."];
    if (!planFits) return [planErr ?? "Loading your class's choices…"];
    return activeChoices(plan!, d.level).filter((c) => kinds(c.kind) && !c.optional).flatMap((c) => {
      const got = d.level.picks[c.key] ?? [];
      if (c.kind === "subclass") return got[0]?.replace(/^custom:/, "").trim() ? [] : [`${c.title}: pick one.`];
      return got.length === c.choose ? [] : [`${c.title}: pick ${c.choose} (${got.length} picked).`];
    });
  };
  const problems: Record<StepId, string[]> = {
    class: d.cls ? [] : ["Pick a class."],
    species: speciesProblems(d, data),
    background: backgroundProblems(d, data),
    abilities: d.method === "roll" && state.rolled.length < 6 ? ["Roll your scores first."] : [checkBase(d.method, d.base)].filter(Boolean) as string[],
    skills: d.cls ? skillProblems(d, data) : ["Pick a class first."],
    features: choiceProblems((k) => !SPELL_KINDS.has(k)),
    spells: choiceProblems((k) => SPELL_KINDS.has(k)),
    equipment: d.cls ? kitProblems(d, data) : ["Pick a class first."],
    details: d.details.name.trim() ? [] : ["Give your character a name."],
    review: [],
  };
  const all = steps.filter((s) => s !== "review").flatMap((s) => problems[s].map((text) => ({ step: s, label: LABEL[s], text })));
  const idx = Math.max(0, steps.indexOf(state.step));
  const step = steps[idx];
  const here = problems[step];

  const [pending, start] = useTransition();
  const [saveErr, setSaveErr] = useState<string | null>(null);
  function save() {
    setSaveErr(null);
    start(async () => {
      const r = await createFromBuilder(d);
      if (r?.error) setSaveErr(r.error);
      else { try { localStorage.removeItem(KEY); } catch { /* fine */ } }
    });
  }

  const props = { d, set, data, cards: cards[d.rules] ?? [], feats: feats[d.rules] ?? {} };
  return (
    <div className="mt-4">
      {rulesOptions.length > 1 && state.step === "class" && (
        <div className="mb-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Rules">
          {rulesOptions.map((r) => (
            <button key={r} type="button" role="radio" aria-checked={d.rules === r} onClick={() => { if (r !== d.rules) setState(fresh(r)); }}
              className={`h-11 rounded-xl border text-sm ${d.rules === r ? "border-accent bg-accent-surface font-bold text-accent" : "border-line text-soft"}`}>{r} rules</button>
          ))}
        </div>
      )}

      <nav aria-label="Steps" className="-mx-5 overflow-x-auto px-5 [scrollbar-width:none]">
        <ol className="flex gap-1.5 pb-1">
          {steps.map((s, i) => {
            const done = i < idx && !problems[s].length;
            return (
              <li key={s} className="shrink-0">
                <button type="button" onClick={() => go(s)} aria-current={s === step ? "step" : undefined}
                  className={`h-9 rounded-full border px-3 text-xs ${s === step ? "border-accent bg-accent font-bold text-accent-text" : done ? "border-success-line bg-success-bg text-success" : "border-line text-muted"}`}>
                  {done ? "✓ " : `${i + 1}. `}{LABEL[s]}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="mt-4">
        {step === "class" && <ClassStep {...props} />}
        {step === "species" && <SpeciesStep {...props} />}
        {step === "background" && <BackgroundStep {...props} />}
        {step === "abilities" && <AbilityScores {...props} rolled={state.rolled} setRolled={(r) => setState((s) => ({ ...s, rolled: r }))} />}
        {step === "skills" && <SkillsStep {...props} />}
        {step === "features" && <FeaturesStep {...props} plan={planFits ? plan : null} error={planErr} />}
        {step === "spells" && <SpellsStep {...props} plan={planFits ? plan : null} />}
        {step === "equipment" && <EquipmentStep {...props} />}
        {step === "details" && <DetailsStep {...props} isDm={isDm} />}
        {step === "review" && <ReviewStep {...props} plan={planFits ? plan : null} problems={all} goTo={(s) => go(s as StepId)} />}
      </div>

      <p className="mt-8 text-center text-xs text-muted">
        <button type="button" onClick={() => { if (confirm("Start over? This clears everything you picked.")) setState(fresh(rulesOptions[0])); }} className="inline-flex min-h-10 items-center underline">Start over</button>
        {" · "}<Link href="/characters/new?quick=1" className="inline-flex min-h-10 items-center underline">Quick form (I know my numbers)</Link>
        {" · "}<Link href="/characters/import" className="inline-flex min-h-10 items-center underline">Import a PDF</Link>
      </p>
      <p className="mt-1 text-center text-[11px] text-muted">Rules: SRD {d.rules === "2014" ? "5.1" : "5.2.1"} by Wizards of the Coast (CC-BY-4.0). Only the free rules are built in; use “Other” or your own subclass name for things from the books.</p>

      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 border-t border-line bg-surface-2/95 backdrop-blur" role="region" aria-label="Builder steps">
        <div className="mx-auto max-w-md px-5 py-3">
          {(saveErr || (here.length > 0 && step !== "review")) && <p className="mb-2 text-sm text-muted" role="status">{saveErr ? <span className="text-danger">{saveErr}</span> : here[0]}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => go(steps[Math.max(0, idx - 1)])} disabled={idx === 0}
              className="h-12 rounded-xl border border-line px-4 font-semibold text-soft disabled:opacity-40">Back</button>
            {step === "review" ? (
              <button type="button" onClick={save} disabled={pending || all.length > 0}
                className="h-12 flex-1 rounded-xl bg-accent font-bold text-accent-text disabled:opacity-40">{pending ? "Making…" : d.targetLevel > 1 ? `Make character, then level up to ${d.targetLevel}` : "Make character"}</button>
            ) : (
              <button type="button" onClick={() => go(steps[idx + 1])} disabled={here.length > 0}
                className="h-12 flex-1 rounded-xl bg-accent font-bold text-accent-text disabled:opacity-40">Next: {LABEL[steps[idx + 1]]}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


const noop = () => () => {};
/** Shows its children only in the browser (the builder reads the draft saved on this phone). */
export function ClientOnly({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  const client = useSyncExternalStore(noop, () => true, () => false);
  return client ? children : fallback;
}
