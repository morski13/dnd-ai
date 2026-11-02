// Several level-ups in a row (pure, tested): the character builder going straight to level N, and the
// level-up screen's "up to level N". Each level says which class goes up and holds that level's choices.
// While the player is still choosing, unfinished choices are skipped so the later levels can already be shown;
// saving checks every level strictly (checkAnswers / applyLevelUp).
import { activeChoices, applyLevelUp, checkAnswers, planLevelUp, type LevelChar } from "./engine";
import type { Answers, Choice, Plan, RulesData, SpellLite } from "./types";
import { totalLevel, type Ability } from "../rules";

export type LevelStep = { cls: string; answers: Answers };
/** A saved plan for several levels at once ("Level up to N"), kept in characters.level_plan. */
export type SavedMulti = { kind: "multi"; to: number; ups: LevelStep[]; hp: "average" | "roll"; savedAt: string };
export const isMulti = (p: unknown): p is SavedMulti => !!p && typeof p === "object" && (p as SavedMulti).kind === "multi" && Array.isArray((p as SavedMulti).ups);
export type ClassOption = { name: string; level: number; isNew: boolean; ok: boolean; why: string | null };
export type Missing = { key: string; spell: boolean; text: string };
export type StepResult = {
  index: number;
  cls: string;
  plan: Plan | null;
  answers: Answers;          // the step's answers with picks that no longer fit dropped
  before: LevelChar;
  after: LevelChar;
  classProblem: string | null;
  missing: Missing[];        // what's still to choose (or wrong) at this level
  options: ClassOption[];
};

export const SPELL_CHOICE = new Set(["cantrips", "spells", "swap-in", "swap-out"]);
export const blankAnswers = (): Answers => ({ picks: {}, hp: "average" });

/** "INT 13 (you have 10)": the multiclass scores this character is missing for `cls` (and for the classes it has). */
export function mcMissing(c: LevelChar, cls: string, data: RulesData): string[] {
  const out: string[] = [];
  for (const name of [cls, ...c.class_levels.map((l) => l.class)]) {
    for (const group of data.classes[name]?.mcPrereq ?? []) {
      if (group.some(([a, min]) => (c.ability_scores[a] ?? 10) >= min)) continue;
      const txt = group.map(([a, min]) => `${a} ${min}`).join(" or ") + ` (you have ${group.map(([a]) => `${a} ${c.ability_scores[a as Ability] ?? 10}`).join(", ")})`;
      out.push(name === cls ? txt : `${txt} for your ${name}`);
    }
  }
  return [...new Set(out)];
}

/** Which classes can go up at this point: your classes, then new ones (multiclassing, if the DM allows it and your scores do). */
export function classOptions(c: LevelChar, data: RulesData, multiclass: boolean): ClassOption[] {
  const mine = c.class_levels.filter((l) => data.classes[l.class])
    .map((l) => ({ name: l.class, level: l.level + 1, isNew: false, ok: l.level < 20, why: l.level >= 20 ? "Already level 20." : null }));
  if (!c.class_levels.length) return Object.keys(data.classes).map((n) => ({ name: n, level: 1, isNew: true, ok: true, why: null }));
  const others = Object.keys(data.classes).filter((n) => !c.class_levels.some((l) => l.class === n)).map((n) => {
    if (!multiclass) return { name: n, level: 1, isNew: true, ok: false, why: "Your DM has turned multiclassing off." };
    const miss = mcMissing(c, n, data);
    return { name: n, level: 1, isNew: true, ok: !miss.length, why: miss.length ? `Needs ${miss.join("; ")}.` : null };
  });
  return [...mine, ...others];
}

/** Picks that are no longer offered are dropped (another class, a spell learned at an earlier level…). */
export function cleanFor(plan: Plan, a: Answers | undefined): Answers {
  const picks: Answers["picks"] = {};
  for (const ch of plan.choices) {
    const got = (a?.picks?.[ch.key] ?? []).filter((n) => ch.options.some((o) => o.name === n) || (ch.kind === "subclass" && n.startsWith("custom:")));
    if (got.length) picks[ch.key] = got.slice(0, Math.max(1, ch.choose));
  }
  const asi = Object.fromEntries(plan.choices.filter((ch) => ch.kind === "asi" && a?.asi?.[ch.key]).map((ch) => [ch.key, a!.asi![ch.key]]));
  return { picks, ...(Object.keys(asi).length ? { asi } : {}), hp: a?.hp === "roll" ? "roll" : "average" };
}

/** Each required choice on its own: done, or what's missing. Swapping a spell is optional (both halves or neither). */
function choiceStatus(c: LevelChar, plan: Plan, a: Answers, data: RulesData): { done: Choice[]; missing: Missing[] } {
  const done: Choice[] = [];
  const missing: Missing[] = [];
  const sub = a.picks.subclass ?? [];
  for (const ch of activeChoices(plan, a)) {
    if (ch.optional) continue;
    const only: Answers = { picks: { subclass: sub, [ch.key]: a.picks[ch.key] ?? [] }, asi: a.asi, hp: a.hp };
    const err = checkAnswers({ ...plan, choices: [ch] }, only, c, data);
    if (err) missing.push({ key: ch.key, spell: SPELL_CHOICE.has(ch.kind), text: err });
    else done.push(ch);
  }
  const out = a.picks["swap-out"] ?? [], into = a.picks["swap-in"] ?? [];
  const swaps = plan.choices.filter((ch) => ch.optional);
  if (swaps.length && (out.length || into.length)) {
    if (out.length === 1 && into.length === 1 && !(a.picks.spells ?? []).includes(into[0]) && !(a.picks.cantrips ?? []).includes(into[0])) done.push(...swaps);
    else missing.push({ key: "swap-in", spell: true, text: "To swap a spell, pick one to forget and one to learn (or neither)." });
  }
  const spells = done.filter((ch) => ch.kind === "cantrips" || ch.kind === "spells" || ch.kind === "swap-in").flatMap((ch) => a.picks[ch.key] ?? []);
  if (new Set(spells).size !== spells.length) {
    missing.push({ key: "spells", spell: true, text: "You picked the same spell twice." });
    return { done: done.filter((ch) => ch.kind !== "spells" && !ch.optional), missing };
  }
  return { done, missing };
}

/** Apply a level with only the finished choices (for showing what comes next). */
export function looseApply(c: LevelChar, plan: Plan, a: Answers, data: RulesData): { after: LevelChar; missing: Missing[] } {
  const { done, missing } = choiceStatus(c, plan, a, data);
  const keys = new Set(done.map((ch) => ch.key));
  const answers: Answers = {
    picks: Object.fromEntries(Object.entries(a.picks).filter(([k]) => keys.has(k))),
    asi: Object.fromEntries(Object.entries(a.asi ?? {}).filter(([k]) => keys.has(k))),
    hp: "average",
  };
  const { patch } = applyLevelUp(c, { ...plan, choices: done }, answers, null, data);
  return { after: { ...c, ...patch }, missing };
}

/** Dwarven Toughness: +1 HP every level (the level-up engine doesn't know species traits). */
export function toughness(c: LevelChar): number {
  return c.features.some((f) => (typeof f === "string" ? f : f.name) === "Dwarven Toughness") ? 1 : 0;
}

/** Every planned level in order, starting from `start` (the character as it is now). */
export function planSteps(start: LevelChar, steps: LevelStep[], data: RulesData, spells: SpellLite[], opts: { multiclass: boolean }): StepResult[] {
  const out: StepResult[] = [];
  let c = start;
  steps.forEach((s, index) => {
    const options = classOptions(c, data, opts.multiclass);
    const opt = options.find((o) => o.name === s.cls);
    const classProblem = !opt ? `Pick a class for level ${totalLevel(c.class_levels) + 1}.` : opt.ok ? null : `${opt.name}: ${opt.why}`;
    if (!opt || totalLevel(c.class_levels) >= 20) {
      out.push({ index, cls: s.cls, plan: null, answers: blankAnswers(), before: c, after: c, classProblem: classProblem ?? "Level 20 is the highest level.", missing: [], options });
      return;
    }
    const plan = planLevelUp(c, s.cls, data, spells);
    const answers = cleanFor(plan, s.answers);
    const { after, missing } = looseApply(c, plan, answers, data);
    const extra = toughness(c);
    const next = extra ? { ...after, hp_max: (after.hp_max ?? 0) + extra, hp_current: (after.hp_current ?? 0) + extra } : after;
    out.push({ index, cls: s.cls, plan, answers, before: c, after: next, classProblem, missing, options });
    c = next;
  });
  return out;
}

/** Make the list of levels as long as `count`; new levels go up in the class of the level before. */
export function resizeSteps(steps: LevelStep[], count: number, firstClass: string): LevelStep[] {
  const out = steps.slice(0, Math.max(0, count));
  while (out.length < count) out.push({ cls: out[out.length - 1]?.cls ?? firstClass, answers: blankAnswers() });
  return out;
}

/** "Fighter 3 / Wizard 2" */
export function classLine(c: Pick<LevelChar, "class_levels">): string {
  return c.class_levels.map((l) => `${l.class} ${l.level}${l.subclass ? ` (${l.subclass})` : ""}`).join(" / ");
}

/** "Pick for me" on every level, in order (each level's options depend on the ones before). `only`: spells or the rest. */
export function recommendSteps(start: LevelChar, steps: LevelStep[], data: RulesData, spells: SpellLite[], opts: { multiclass: boolean },
  pick: (plan: Plan, a: Answers, c: LevelChar) => Answers, from = 0): LevelStep[] {
  let out = steps;
  for (let i = from; i < out.length; i++) {
    const r = planSteps(start, out.slice(0, i + 1), data, spells, opts)[i];
    if (!r.plan) continue;
    out = out.map((s, j) => (j === i ? { ...s, answers: pick(r.plan!, r.answers, r.before) } : s));
  }
  return out;
}
