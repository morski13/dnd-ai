"use client";
// The character builder: one step at a time, everything offered from the rules, nothing to look up elsewhere.
// The draft is kept on this phone (so a reload or a phone call doesn't lose it) until the character is made.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sendPortrait } from "@/app/components/map/portrait";
import { randomDraft } from "@/lib/builder/random";
import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import type { ClassCard } from "@/lib/builder/data";
import { featTextFor } from "@/lib/builder/data";
import {
  backgroundProblems, blankDraft, checkBase, givenSkills, kitProblems, skillProblems, speciesProblems, suggestedArray,
} from "@/lib/builder/engine";
import { planBuild } from "@/lib/builder/levels";
import type { BuilderData, Draft, Rules, ScoreMethod } from "@/lib/builder/types";
import { baseCharacter } from "@/lib/builder/engine";
import { cleanFor, recommendSteps, resizeSteps } from "@/lib/levelup/multi";
import { recommend } from "@/lib/levelup/recommend";
import type { RulesData, SpellLite } from "@/lib/levelup/types";
import { ABILITIES } from "@/lib/rules";
import { stepMissing } from "../../[id]/level-up/level-cards";
import { builderRules, createFromBuilder } from "../builder-actions";
import { DetailsStep, ReviewStep } from "./steps-end";
import { EquipmentStep, FeaturesStep, SpellsStep } from "./steps-gear";
import { LevelsStep } from "./steps-levels";
import { AbilityScores, SkillsStep } from "./steps-stats";
import { BackgroundStep, ClassStep, SpeciesStep } from "./steps-who";

type StepId = "class" | "species" | "background" | "abilities" | "skills" | "features" | "levels" | "spells" | "equipment" | "details" | "review";
const LABEL: Record<StepId, string> = {
  class: "Class & level", species: "Species", background: "Background", abilities: "Abilities", skills: "Skills", features: "Features",
  levels: "Levels", spells: "Spells", equipment: "Gear", details: "Details", review: "Review",
};
const KEY = "builder-draft-v1";
type Saved = { d: Draft; step: StepId; rolled: number[] };
type LevelRules = { levelData: RulesData; spells: SpellLite[] };
const PLAN_DETAILS: Draft["details"] = { ...blankDraft("2024").details, name: "x" };

function loadSaved(rules: Rules[]): Saved | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
    if (!s || !rules.includes(s.d?.rules)) return null;
    // drafts saved before levels 2+ were planned in the builder
    const d = { ...s.d, ups: s.d.ups ?? [], upHp: s.d.upHp ?? "average" };
    return { ...s, d: { ...d, ups: resizeSteps(d.ups, Math.max(0, d.targetLevel - 1), d.cls) } };
  } catch { return null; }
}

/** Choices that no longer fit (skills you now get from your background, picks from another class) are dropped. */
function tidy(d: Draft, data: BuilderData): Draft {
  const given = givenSkills(d, data);
  return { ...d, classSkills: d.classSkills.filter((s) => !given.has(s)) };
}

export function Builder({ isDm, campaignRules, datas, cards, feats, defaultMethod, multiclass, rollHp, partyLevel }: {
  isDm: boolean; campaignRules: string; datas: Partial<Record<Rules, BuilderData>>; cards: Partial<Record<Rules, ClassCard[]>>;
  feats: Partial<Record<Rules, Record<string, string>>>; defaultMethod: ScoreMethod;
  /** the campaign's house rules: multiclassing allowed, HP on level up rolled, the party's level */
  multiclass: boolean; rollHp: boolean; partyLevel: number | null;
}) {
  const rulesOptions: Rules[] = campaignRules === "mixed" ? ["2024", "2014"] : [campaignRules === "2014" ? "2014" : "2024"];
  const fresh = (rules: Rules): Saved => {
    const d = blankDraft(rules);
    return { d: { ...d, method: defaultMethod, base: defaultMethod === "standard" ? suggestedArray([...ABILITIES]) : d.base, forMe: !isDm, upHp: rollHp ? "roll" : "average" }, step: "class", rolled: [] };
  };
  // rendered in the browser only (see ClientOnly), so the saved draft can be read right away
  const [state, setState] = useState<Saved>(() => loadSaved(rulesOptions) ?? fresh(rulesOptions[0]));
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode: fine */ } }, [state]);

  const d = state.d;
  const data = datas[d.rules]!;
  const set = (p: Partial<Draft>) => setState((s) => ({ ...s, d: tidy({ ...s.d, ...p }, datas[(p.rules ?? s.d.rules) as Rules]!) }));
  const go = (step: StepId) => { setState((s) => ({ ...s, step })); if (typeof window !== "undefined") window.scrollTo({ top: 0 }); };

  // ---- the class levels, feats and spells (loaded once per rule set), then every level is planned right here
  const [rulesBy, setRulesBy] = useState<Partial<Record<Rules, LevelRules>>>({});
  const [rulesErr, setRulesErr] = useState<string | null>(null);
  const lr = rulesBy[d.rules];
  useEffect(() => {
    if (rulesBy[d.rules]) return;
    let live = true;
    builderRules(d.rules).then((r) => {
      if (!live) return;
      if ("error" in r) setRulesErr(r.error); else { setRulesErr(null); setRulesBy((m) => ({ ...m, [d.rules]: r })); }
    }).catch(() => { if (live) setRulesErr("Couldn't load your class's choices. Check your connection and go back and forth once."); });
    return () => { live = false; };
  }, [d.rules, rulesBy]);
  // typing a name or backstory doesn't change any level, so it doesn't plan everything again
  const planKey = JSON.stringify({ ...d, details: PLAN_DETAILS, forMe: true });
  const bp = useMemo(() => {
    const draft = JSON.parse(planKey) as Draft;
    if (!lr || !draft.cls || !lr.levelData.classes[draft.cls]) return null;
    try { return planBuild(draft, data, lr.levelData, lr.spells, { multiclass, featText: (n) => featTextFor(draft.rules, n, lr.levelData) }); }
    catch { return null; }
  }, [planKey, lr, data, multiclass]);

  const order0: StepId[] = ["class", "species", "background", "abilities", "skills", "features", "levels", "spells", "equipment", "details", "review"];
  const isCaster = bp ? [bp.first, ...bp.steps.map((r) => r.plan)].some((p) => p?.choices.some((c) => c.kind === "cantrips" || c.kind === "spells"))
    : !!cards[d.rules]?.find((c) => c.name === d.cls)?.spell;
  const steps: StepId[] = order0.filter((s) => (s !== "spells" || isCaster) && (s !== "levels" || d.targetLevel > 1));

  // ---- what's missing, per step
  const waiting = !d.cls ? ["Pick a class first."] : !bp ? [rulesErr ?? "Loading your class's choices…"] : null;
  const firstMissing = (spell: boolean) => waiting ?? bp!.firstMissing.filter((m) => m.spell === spell).map((m) => (d.targetLevel > 1 ? `Level 1: ${m.text}` : m.text));
  const problems: Record<StepId, string[]> = {
    class: d.cls ? [] : ["Pick a class."],
    species: speciesProblems(d, data),
    background: backgroundProblems(d, data),
    abilities: d.method === "roll" && state.rolled.length < 6 ? ["Roll your scores first."] : [checkBase(d.method, d.base)].filter(Boolean) as string[],
    skills: d.cls ? skillProblems(d, data) : ["Pick a class first."],
    features: firstMissing(false),
    levels: waiting ?? bp!.steps.flatMap((r) => stepMissing(r, "features")),
    spells: [...firstMissing(true), ...(bp?.steps.flatMap((r) => stepMissing(r, "spells")) ?? [])],
    equipment: d.cls ? kitProblems(d, data) : ["Pick a class first."],
    details: d.details.name.trim() ? [] : ["Give your character a name."],
    review: [],
  };
  const all = steps.filter((s) => s !== "review").flatMap((s) => problems[s].map((text) => ({ step: s, label: LABEL[s], text })));
  const idx = Math.max(0, steps.indexOf(state.step));
  const step = steps[idx];
  const here = problems[step];
  const setUp = (i: number, p: Partial<Draft["ups"][number]>) => set({ ups: d.ups.map((u, j) => (j === i ? { ...u, ...p } : u)) });

  const router = useRouter();
  const [pending, start] = useTransition();
  const [saveErr, setSaveErr] = useState<string | null>(null);
  function save() {
    setSaveErr(null);
    start(async () => {
      // only the picks that are still offered go to the server (it checks everything again)
      const clean: Draft = bp ? { ...d, level: cleanFor(bp.first, d.level), ups: bp.steps.map((r) => ({ cls: r.cls, answers: r.answers })) } : d;
      const r = await createFromBuilder({ ...clean, portrait: null });
      if ("error" in r) { setSaveErr(r.error); return; }
      // the picture goes up once the character exists (a failed upload doesn't stop anything: it can be added on the sheet)
      if (d.portrait) { try { await sendPortrait("character", r.id, await (await fetch(d.portrait)).blob()); } catch { /* added later on the sheet */ } }
      try { localStorage.removeItem(KEY); } catch { /* fine */ }
      router.push(`/characters/${r.id}`);
    });
  }

  const props = { d, set, data, cards: cards[d.rules] ?? [], feats: feats[d.rules] ?? {} };
  // "Pick for me": one level, or level 1 and then every level in order
  const pickLevel = (i: number, only?: "spells" | "features") => {
    const r = bp?.steps[i];
    if (!lr || !r?.plan) return;
    setUp(i, { answers: recommend(r.plan, r.answers, r.before, lr.levelData, only) });
  };
  const pickFirst = (only?: "spells" | "features") => {
    if (lr && bp) set({ level: recommend(bp.first, cleanFor(bp.first, d.level), baseCharacter(d, data), lr.levelData, only) });
  };
  const pickAll = (only?: "spells" | "features") => {
    if (!lr || !bp) return;
    const featText = (n: string) => featTextFor(d.rules, n, lr.levelData);
    const level = recommend(bp.first, cleanFor(bp.first, d.level), baseCharacter(d, data), lr.levelData, only);
    const next = planBuild({ ...d, level, details: PLAN_DETAILS }, data, lr.levelData, lr.spells, { multiclass, featText });
    const start = next.steps[0]?.before;
    const ups = start ? recommendSteps(start, next.steps.map((r) => ({ cls: r.cls, answers: r.answers })), lr.levelData, lr.spells, { multiclass },
      (plan, a, c) => recommend(plan, a, c, lr.levelData, only)) : d.ups;
    set({ level, ups });
  };
  /** "Random character": everything filled in (the class you picked, or any), then the review. */
  const randomize = (keepClass: boolean, keepPicks = false) => {
    if (!lr) return;
    const next = randomDraft(d, data, lr.levelData, lr.spells, { multiclass, keepClass, keepPicks, featText: (n) => featTextFor(d.rules, n, lr.levelData) });
    setState((s) => ({ ...s, d: { ...next, portrait: s.d.portrait ?? null }, step: "review" }));
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  };
  const cardsProps = {
    plan: bp, onClass: (i: number, cls: string) => setUp(i, { cls, answers: { picks: {}, hp: "average" } }), onAnswers: (i: number, a: Draft["ups"][number]["answers"]) => setUp(i, { answers: a }),
    onPick: pickLevel, onPickAll: pickAll,
  };
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

      {d.cls && lr && step !== "review" && all.length > 0 && (
        <button type="button" onClick={() => randomize(true, true)}
          className="mt-3 flex min-h-10 items-center gap-1.5 text-sm font-semibold text-accent underline">
          <span aria-hidden>✦</span> Pick everything still open for me ({all.length} left)
        </button>
      )}
      <div className="mt-4">
        {step === "class" && <ClassStep {...props} partyLevel={partyLevel} onRandom={lr ? randomize : undefined} />}
        {step === "species" && <SpeciesStep {...props} />}
        {step === "background" && <BackgroundStep {...props} />}
        {step === "abilities" && <AbilityScores {...props} rolled={state.rolled} setRolled={(r) => setState((s) => ({ ...s, rolled: r }))} />}
        {step === "skills" && <SkillsStep {...props} />}
        {step === "features" && <FeaturesStep {...props} plan={bp?.first ?? null} error={bp ? null : rulesErr} onPickAll={() => pickFirst("features")} />}
        {step === "levels" && <LevelsStep {...props} {...cardsProps} />}
        {step === "spells" && <SpellsStep {...props} {...cardsProps} />}
        {step === "equipment" && <EquipmentStep {...props} />}
        {step === "details" && <DetailsStep {...props} isDm={isDm} />}
        {step === "review" && <ReviewStep {...props} plan={bp} problems={all} goTo={(s) => go(s as StepId)} />}
      </div>

      <p className="mt-8 text-center text-xs text-muted">
        <button type="button" onClick={() => { if (confirm("Start over? This clears everything you picked.")) setState(fresh(rulesOptions[0])); }} className="inline-flex min-h-10 items-center underline">Start over</button>
        {" · "}<Link href="/characters/new?quick=1" className="inline-flex min-h-10 items-center underline">Quick form (I know my numbers)</Link>
        {" · "}<Link href="/characters/import" className="inline-flex min-h-10 items-center underline">Import a PDF</Link>
      </p>
      <p className="mt-1 text-center text-[11px] text-muted">Rules: SRD {d.rules === "2014" ? "5.1" : "5.2.1"} by Wizards of the Coast (CC-BY-4.0). Only the free rules are built in; use “Other” or your own subclass name for things from the books.</p>

      <div className="dock z-10 border-t border-line bg-surface-2/95 backdrop-blur" role="region" aria-label="Builder steps">
        <div className="mx-auto max-w-md px-5 py-3">
          {(saveErr || (here.length > 0 && step !== "review")) && <p className="mb-2 text-sm text-muted" role="status">{saveErr ? <span className="text-danger">{saveErr}</span> : here[0]}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => go(steps[Math.max(0, idx - 1)])} disabled={idx === 0}
              className="h-12 rounded-xl border border-line px-4 font-semibold text-soft disabled:opacity-40">Back</button>
            {step === "review" ? (
              <button type="button" onClick={save} disabled={pending || all.length > 0}
                className="h-12 flex-1 rounded-xl bg-accent font-bold text-accent-text disabled:opacity-40">{pending ? "Making…" : d.targetLevel > 1 ? `Make my level ${d.targetLevel} character` : "Make character"}</button>
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
