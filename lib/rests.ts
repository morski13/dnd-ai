// Short and long rests (pure rules, no database). Used by the character sheet and the DM's "party rests".
import { CLASSES, hitDice, type Rules } from "./classes";
import type { Resource } from "./character-data";
import type { SpellBook } from "./rules";

export type RestState = {
  class_levels: { class: string; level: number }[];
  hp_max: number | null; hp_current: number | null; temp_hp: number;
  resources: Resource[]; spells: SpellBook & { pact_level?: number; pact_slots?: number };
  hit_dice_used: Record<string, number>; rule_set?: Rules;
};

/** Hit dice by size: how many in total and how many are left. */
export function hitDiceLeft(s: Pick<RestState, "class_levels" | "hit_dice_used">) {
  const total = hitDice(s.class_levels);
  return Object.entries(total).map(([die, n]) => ({ die: Number(die), total: n, left: Math.max(0, n - (s.hit_dice_used?.[die] ?? 0)) }))
    .sort((a, b) => b.die - a.die);
}

const resetResources = (rs: Resource[], kinds: RegExp) => rs.map((r) => (kinds.test(r.recharge ?? "") ? { ...r, used: 0 } : r));

/** Warlock pact slots come back on a short rest. */
function pactBack(spells: RestState["spells"]): RestState["spells"] {
  if (!spells?.pact_level) return spells;
  const k = String(spells.pact_level);
  const used = spells.slots_used?.[k] ?? 0;
  return { ...spells, slots_used: { ...spells.slots_used, [k]: Math.max(0, used - (spells.pact_slots ?? used)) } };
}

/**
 * Short rest: spend hit dice to heal (each die + CON modifier, at least 1), short-rest resources and pact slots come back.
 * `rolled` is the result of each hit die, e.g. [{ die: 12, roll: 7 }, ...].
 */
export function shortRest(s: RestState, rolled: { die: number; roll: number }[], conMod: number) {
  const healed = rolled.reduce((sum, r) => sum + Math.max(1, r.roll + conMod), 0);
  const used = { ...s.hit_dice_used };
  for (const r of rolled) used[String(r.die)] = (used[String(r.die)] ?? 0) + 1;
  const max = s.hp_max ?? 0;
  return {
    healed,
    hp_current: Math.min(max, (s.hp_current ?? 0) + healed),
    hit_dice_used: used,
    resources: resetResources(s.resources, /short/i),
    spells: pactBack(s.spells),
  };
}

/** Long rest: full HP, no temp HP, every spell slot and resource back, hit dice back (2024: all; 2014: half, at least 1). */
export function longRest(s: RestState) {
  const total = Object.values(hitDice(s.class_levels)).reduce((a, b) => a + b, 0);
  let regain = s.rule_set === "2014" ? Math.max(1, Math.floor(total / 2)) : total;
  const used: Record<string, number> = { ...s.hit_dice_used };
  // give back the biggest dice first
  for (const die of Object.keys(used).sort((a, b) => Number(b) - Number(a))) {
    const back = Math.min(used[die], regain);
    used[die] -= back; regain -= back;
    if (!used[die]) delete used[die];
  }
  return {
    hp_current: s.hp_max ?? s.hp_current ?? 0, temp_hp: 0, hit_dice_used: used,
    resources: s.resources.map((r) => ({ ...r, used: 0 })),
    spells: { ...s.spells, slots_used: {} },
  };
}

/** Average healing of one hit die for this character (for the preview). */
export const averageHitDie = (die: number, conMod: number) => Math.max(1, die / 2 + 0.5 + conMod);
export const isClass = (name: string) => name in CLASSES;
