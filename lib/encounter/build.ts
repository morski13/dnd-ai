// Turns character sheets and monster stat blocks into simulator units.
import { findCombos } from "../combos";
import {
  ABILITIES, actionOf, allOptions, attackBonus, damageExpression, initiative, lowestFreeSlot, saveBonus, spellSaveDC,
  type Ability, type Option, type SheetCharacter, type SpellInfo,
} from "../rules";
import { combine } from "../dice";
import { compile, type Cost, type HealPlan, type Plan, type Strike, type Unit } from "./sim";

// ---------------------------------------------------------------- monsters (SRD stat blocks or custom)
export type MonsterAction = {
  name: string; kind: "attack" | "save" | "multiattack" | string;
  bonus?: number; damage?: string; avg?: number; damage_type?: string; ranged?: boolean;
  save_ability?: Ability; dc?: number; half?: boolean; targets?: number;
  recharge?: number; per_day?: number; count?: number;
};
export type MonsterStats = {
  name: string;
  ac: number;
  hp: number;
  init: number;
  cr?: string;
  cr_num?: number;
  xp?: number;
  size_type?: string;
  abilities?: Partial<Record<"STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA", { mod: number; save: number }>>;
  actions: MonsterAction[];
  bonus_actions?: MonsterAction[];
  multiattack?: { count: number; uses: string[] };
  legendary_uses?: number;
  regeneration?: number;
  resistances?: string;
  immunities?: string;
};

const TYPICAL_AC = 15;
const hitP = (bonus: number, ac: number) => Math.min(0.95, Math.max(0.05, (21 - (ac - bonus)) / 20));

function attackStrike(a: MonsterAction): Strike {
  return { kind: "attack", bonus: a.bonus ?? 0, damage: compile(a.damage || "1"), targets: 1 };
}

export function monsterUnit(m: MonsterStats, key: string, side: "party" | "enemy" = "enemy", name = m.name): Unit {
  const attacks = m.actions.filter((a) => a.kind === "attack" && a.damage);
  const value = (a: MonsterAction) => hitP(a.bonus ?? 0, TYPICAL_AC) * compile(a.damage!).avg;
  const best = [...attacks].sort((a, b) => value(b) - value(a))[0];
  const bonusAttacks = (m.bonus_actions ?? []).filter((a) => a.kind === "attack" && a.damage);

  const plans: Plan[] = [];
  // Normal turn: Multiattack (or the best single attack), plus a bonus-action attack if it has one.
  if (best) {
    const pool = m.multiattack?.uses.length ? attacks.filter((a) => m.multiattack!.uses.includes(a.name)) : [best];
    const pick = [...(pool.length ? pool : [best])].sort((a, b) => value(b) - value(a))[0];
    const count = m.multiattack?.count ?? 1;
    const strikes = Array.from({ length: count }, () => attackStrike(pick));
    for (const b of bonusAttacks) strikes.push(attackStrike(b));
    plans.push({ name: count > 1 ? `Multiattack (${count}× ${pick.name})` : pick.name, strikes, cost: {}, expected: count * value(pick) });
  }
  // Breath weapons and other saving-throw attacks (recharge / per day).
  for (const a of m.actions.filter((x) => x.kind === "save" && x.damage)) {
    const dmg = compile(a.damage!);
    const targets = a.targets ?? 1;
    const cost: Cost = a.recharge ? { recharge: a.recharge } : a.per_day ? { perDay: a.per_day } : {};
    plans.push({
      name: a.name,
      strikes: [{ kind: "save", dc: a.dc ?? 12, ability: a.save_ability ?? "DEX", half: a.half ?? true, damage: dmg, targets }],
      cost,
      expected: dmg.avg * targets * 0.75,
    });
  }
  plans.sort((a, b) => b.expected - a.expected);
  if (!plans.length) plans.push({ name: "Nothing", strikes: [], cost: {}, expected: 0 });

  const saves = Object.fromEntries(ABILITIES.map((ab) => [ab, m.abilities?.[ab]?.save ?? 0])) as Record<Ability, number>;
  return {
    key, name, side, isCharacter: false,
    maxHp: m.hp, startHp: m.hp, ac: m.ac, init: m.init ?? 0, saves,
    plans, heals: [], slots: {}, resources: {},
    legendary: m.legendary_uses && best ? { uses: m.legendary_uses, strike: attackStrike(best) } : undefined,
    regeneration: m.regeneration,
  };
}

// ---------------------------------------------------------------- characters
export type CharacterForSim = SheetCharacter & {
  id: string; name: string; ac: number | null; hp_max: number | null; hp_current: number | null;
  resources?: { name: string; max: number; used?: number }[];
};

/** How many creatures an area spell usually catches, from its description. */
export function areaTargets(text: string | undefined, enemyCount: number) {
  if (!text) return 1;
  const m = text.match(/(\d+)-foot(?:-radius)?[- ](?:long[^ ]* )?(Cone|Sphere|Cube|Line|Emanation|Cylinder)/);
  if (!m || !/each creature/i.test(text)) return 1;
  const size = Number(m[1]);
  const shape = m[2];
  const n = shape === "Line" ? 2
    : shape === "Cone" ? (size <= 15 ? 2 : 3)
    : shape === "Cube" ? (size <= 10 ? 2 : 3)
    : size <= 10 ? 2 : 3;
  return Math.max(1, Math.min(n, enemyCount));
}

function optionStrike(c: SheetCharacter, o: Option, enemyCount: number, boosts: Option[] = [], advantage = false): Strike | null {
  if (!o.damage) return null;
  const slot = o.level && o.level > 0 ? lowestFreeSlot(c, o.level) ?? o.level : undefined;
  if (o.kind === "save") {
    return {
      kind: "save", dc: spellSaveDC(c), ability: o.save_ability ?? "DEX",
      half: !!o.half_on_save || (!!c.spells?.potent_cantrip && (o.level ?? 0) === 0),
      damage: compile(damageExpression(c, o, slot)),
      targets: areaTargets(o.fromSpell?.description, enemyCount),
    };
  }
  if (o.kind === "damage_only") return { kind: "auto", damage: compile(damageExpression(c, o, slot)), targets: 1 };
  if (o.kind !== "weapon" && o.kind !== "spell_attack") return null;
  // Flat boosts (Rage +2) add to every hit; dice boosts (Sneak Attack, Frenzy) once per turn.
  const flat = boosts.filter((b) => b.damage_bonus).reduce((a, b) => a + (b.damage_bonus ?? 0), 0);
  const extra = boosts.filter((b) => b.damage).map((b) => damageExpression(c, b));
  return {
    kind: "attack",
    bonus: attackBonus(c, o),
    damage: compile(combine(damageExpression(c, o, slot), String(flat))),
    advantage,
    targets: 1,
    extraOnce: extra.length ? compile(combine(...extra)) : undefined,
  };
}

/**
 * A character as the simulator sees them.
 * fresh = full HP, slots and resources (planning ahead); otherwise as they are right now.
 */
export function characterUnit(
  ch: CharacterForSim, library: SpellInfo[], foes: { ac: number; saves: Record<Ability, number> }[], fresh: boolean
): Unit {
  const c: SheetCharacter = fresh ? { ...ch, spells: { ...ch.spells, slots_used: {} } } : ch;
  const options = allOptions(c, library);
  const enemyCount = Math.max(1, foes.length);
  const med = <T,>(xs: T[], f: (x: T) => number, dflt: number) => {
    const v = xs.map(f).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : dflt;
  };
  const target = { ac: med(foes, (f) => f.ac, 13), saveBonus: med(foes, (f) => f.saves.DEX, 2), allyAdjacent: true };

  // Turn plans from the Best moves engine (damage only; healing is handled separately).
  const combos = findCombos(c, options, target)
    .filter((x) => x.damage > 0 && x.parts.main.kind !== "heal" && x.parts.bonus?.kind !== "heal")
    .sort((a, b) => b.damage - a.damage);
  const plans: Plan[] = [];
  const seen = new Set<string>();
  for (const combo of combos) {
    const { main, bonus, boosts, advantage } = combo.parts;
    const slotLevel = Math.max(main.level ?? 0, bonus?.level ?? 0) || undefined;
    const resourceBoost = boosts.find((b) => b.resource);
    const resource = resourceBoost?.resource ?? main.resource ?? bonus?.resource;
    const cost: Cost = { slot: slotLevel, resource, stance: !!resourceBoost && !!resourceBoost.damage_bonus };
    const sig = `${cost.slot ?? 0}|${cost.resource ?? ""}`;
    if (seen.has(sig)) continue; // keep the best plan for each kind of cost
    seen.add(sig);
    const strikes = [
      optionStrike(c, main, enemyCount, boosts, advantage),
      bonus ? optionStrike(c, bonus, enemyCount) : null,
    ].filter(Boolean) as Strike[];
    plans.push({
      name: combo.title, strikes, cost,
      expected: combo.damage * Math.max(...strikes.map((s) => s.targets), 1),
      usesBonus: !!bonus || boosts.some((b) => b.action === "bonus" && !b.damage_bonus),
    });
  }
  plans.sort((a, b) => b.expected - a.expected);

  const heals: HealPlan[] = options
    .filter((o) => o.kind === "heal" && (actionOf(o) === "action" || actionOf(o) === "bonus"))
    .map((o) => {
      const slot = o.level && o.level > 0 ? lowestFreeSlot(c, o.level) ?? o.level : undefined;
      const amount = compile(damageExpression(c, o, slot));
      return { name: o.name, amount, bonusAction: actionOf(o) === "bonus", cost: { slot: o.level || undefined, resource: o.resource }, expected: amount.avg };
    })
    .sort((a, b) => Number(b.bonusAction) - Number(a.bonusAction) || b.expected - a.expected);

  const slots: Record<number, number> = {};
  for (const [lvl, max] of Object.entries(c.spells?.slots ?? {})) {
    slots[Number(lvl)] = Math.max(0, max - (c.spells?.slots_used?.[lvl] ?? 0));
  }
  const resources = Object.fromEntries((ch.resources ?? []).map((r) => [r.name, fresh ? r.max : r.max - (r.used ?? 0)]));
  const maxHp = ch.hp_max ?? 10;

  return {
    key: `c:${ch.id}`, name: ch.name, side: "party", isCharacter: true,
    maxHp, startHp: fresh ? maxHp : Math.max(0, ch.hp_current ?? maxHp),
    ac: ch.ac ?? 10, init: initiative(c),
    saves: Object.fromEntries(ABILITIES.map((a) => [a, saveBonus(c, a)])) as Record<Ability, number>,
    plans, heals, slots, resources,
  };
}
