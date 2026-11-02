// The builder going straight to level N (pure, tested): level 1 from the builder, then levels 2..N from the
// level-up engine, each in the class the player picked for it (multiclassing when the scores allow it).
import { applyLevelUp, checkAnswers, planLevelUp, type LevelChar } from "../levelup/engine";
import { classOptions, planSteps, toughness, type Missing, type StepResult } from "../levelup/multi";
import type { Plan, RulesData, SpellLite } from "../levelup/types";
import { armorClass, buildCharacter, baseCharacter, startingGear } from "./engine";
import type { Ability } from "../rules";
import type { BuilderData, Draft } from "./types";

/** One level-up in the character's history (characters.level_log), so it can be undone like any other. */
export type LevelLogEntry = { at: string; className: string; level: number; kind: "up"; summary: string[]; before: Record<string, unknown> };
const SNAP = ["class_levels", "ability_scores", "hp_max", "hp_current", "proficiencies", "features", "spells", "resources"] as const;
export const snapshot = (c: object) => Object.fromEntries(SNAP.map((k) => [k, (c as Record<string, unknown>)[k]]));

/** The level-up engine's view of a saved (or about to be saved) character row. */
export function rowChar(row: Record<string, unknown>): LevelChar {
  return {
    class_levels: (row.class_levels ?? []) as LevelChar["class_levels"], ability_scores: (row.ability_scores ?? {}) as LevelChar["ability_scores"],
    proficiencies: (row.proficiencies ?? {}) as LevelChar["proficiencies"], features: (row.features ?? []) as LevelChar["features"],
    spells: (row.spells ?? {}) as LevelChar["spells"], resources: (row.resources ?? []) as LevelChar["resources"],
    hp_max: (row.hp_max ?? null) as number | null, hp_current: (row.hp_current ?? null) as number | null, rule_set: row.rule_set as LevelChar["rule_set"],
  };
}

export type BuildPlan = {
  first: Plan;               // level 1
  firstMissing: Missing[];
  steps: StepResult[];       // levels 2..N
  final: LevelChar;          // after the last level (unfinished choices left out)
};

/** Everything the builder shows, worked out from the draft (in the browser; the server does it again strictly). */
export function planBuild(d: Draft, data: BuilderData, levelData: RulesData, spells: SpellLite[], opts: { multiclass: boolean; featText: (n: string) => string }): BuildPlan {
  const first = planLevelUp(baseCharacter(d, data), d.cls, levelData, spells, { first: true });
  const built = buildCharacter(d, data, levelData, first, opts.featText, { loose: true });
  const start = rowChar(built.row);
  const steps = planSteps(start, (d.ups ?? []).slice(0, Math.max(0, d.targetLevel - 1)), levelData, spells, opts);
  return { first, firstMissing: built.missing, steps, final: steps.length ? steps[steps.length - 1].after : start };
}

/**
 * The finished character at level N, checked strictly (server). `rollHp(die)` rolls a hit die when the player
 * chose rolled hit points (null = take the average). Throws with a message when something is missing.
 */
export function buildAll(d: Draft, data: BuilderData, levelData: RulesData, spells: SpellLite[],
  opts: { multiclass: boolean; featText: (n: string) => string; rollHp: (die: number) => number | null; now?: string }) {
  const first = planLevelUp(baseCharacter(d, data), d.cls, levelData, spells, { first: true });
  const built = buildCharacter(d, data, levelData, first, opts.featText);
  const goal = Math.max(1, Math.min(20, Math.floor(d.targetLevel) || 1));
  let row: Record<string, unknown> = built.row;
  const log: LevelLogEntry[] = [];
  for (let i = 0; i < goal - 1; i++) {
    const step = (d.ups ?? [])[i];
    const c = rowChar(row);
    const lvl = i + 2;
    if (!step?.cls || !levelData.classes[step.cls]) throw new Error(`Level ${lvl}: pick a class.`);
    const opt = classOptions(c, levelData, opts.multiclass).find((o) => o.name === step.cls);
    if (!opt?.ok) throw new Error(`Level ${lvl}: ${step.cls}: ${opt?.why ?? "can't take this class."}`);
    const plan = planLevelUp(c, step.cls, levelData, spells);
    const answers = { picks: step.answers?.picks ?? {}, asi: step.answers?.asi ?? {}, hp: "average" as const };
    const err = checkAnswers(plan, answers, c, levelData);
    if (err) throw new Error(`Level ${lvl} (${step.cls}): ${err}`);
    const hpRoll = opts.rollHp(plan.hitDie);
    const { patch, summary } = applyLevelUp(c, plan, answers, hpRoll, levelData);
    const extra = toughness(c);
    if (extra) { patch.hp_max += extra; patch.hp_current += extra; summary.push("Dwarven Toughness: +1 hit point."); }
    log.push({ at: opts.now ?? new Date().toISOString(), className: step.cls, level: plan.toLevel, kind: "up", summary, before: snapshot(row) });
    row = { ...row, ...patch, hp_current: patch.hp_max };
  }
  const resources = ((row.resources ?? []) as { used?: number }[]).map((r) => ({ ...r, used: 0 }));
  if (!log.length) return { row: { ...row, resources } as Record<string, unknown>, bag: built.bag, log };
  // AC again at the last level: higher DEX (or CON / WIS), and armor a new class lets you wear
  const ac = finalAc(d, data, rowChar(row));
  const weapons = new Set(startingGear(d, data).items.filter((i) => i.w).map((i) => i.name));
  const bag = built.bag.map((b) => ({ ...b, equip: b.name === ac.armor || b.name === ac.shield || (b.equip && weapons.has(b.name)) }));
  return { row: { ...row, resources, ac: ac.ac } as Record<string, unknown>, bag, log };
}

/** Every armor / weapon proficiency the character has (the builder's and each multiclass's "Proficiencies"). */
export function proficiencyList(c: LevelChar): string[] {
  return c.features.flatMap((f) => (typeof f !== "string" && f.name === "Proficiencies" ? (f.description ?? "").split(/,\s*/) : [])).filter(Boolean);
}

/** The best AC from the starting kit at the character's current scores, classes and proficiencies. */
export function finalAc(d: Draft, data: BuilderData, c: LevelChar) {
  const items = startingGear(d, data).items;
  const scores = c.ability_scores as Record<Ability, number>;
  const profs = proficiencyList(c);
  const classes = [d.cls, ...c.class_levels.map((l) => l.class).filter((x) => x !== d.cls)];
  return classes.map((cls) => armorClass(items, scores, cls, profs)).sort((a, b) => b.ac - a.ac)[0];
}
