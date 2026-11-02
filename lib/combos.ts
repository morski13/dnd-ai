// "Best moves": expected damage / healing for every combination of
// action + bonus action + free boosts (Rage, Reckless Attack, Sneak Attack...).
// Uses the math from 03-rules-math-reference.md §5.
import { stats } from "./dice";
import {
  actionOf, attackBonus, damageExpression, lowestFreeSlot, spellSaveDC,
  type Option, type SheetCharacter,
} from "./rules";

export type Target = { ac: number; saveBonus: number; allyAdjacent: boolean };
export type ComboStep = { name: string; action: string; detail: string };
export type Combo = {
  title: string;
  steps: ComboStep[];
  damage: number;        // expected damage
  heal: number;          // expected healing
  maxDamage: number;     // if everything hits and rolls max (no crits)
  costs: string[];       // "level 2 slot", "1 Rage", "bonus action"
  notes: string[];
  /** The pieces, for the fight simulator and "Do it". `main` is null when only the bonus action is left. */
  parts: { main: Option | null; bonus: Option | null; boosts: Option[]; advantage: boolean };
};

/** Fight mode: what's left of this turn (see lib/turn.ts turnLeft). Without it: a whole fresh turn. */
export type TurnLeft = { actionLeft: boolean; attacksLeft: number; bonusLeft: boolean; active: string[] };

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Chance to hit and to crit for an attack bonus vs AC. */
export function hitChances(bonus: number, ac: number, advantage: boolean) {
  const p = clamp((21 - (ac - bonus)) / 20, 0.05, 0.95);
  return advantage ? { hit: 1 - (1 - p) ** 2, crit: 1 - 0.95 ** 2 } : { hit: p, crit: 0.05 };
}

/** Chance the target FAILS a save against `dc`. */
export function failChance(dc: number, saveBonus: number) {
  return clamp((dc - saveBonus - 1) / 20, 0, 1);
}

const isWeapon = (o: Option) => o.kind === "weapon";
const isStrWeapon = (o: Option) => isWeapon(o) && o.ability === "STR" && !o.ranged;
const isAttackRoll = (o: Option) => o.kind === "weapon" || o.kind === "spell_attack";
const isFinesseOrRanged = (o: Option) => isWeapon(o) && (o.ability === "finesse" || !!o.ranged || o.ability === "DEX");

function boostApplies(b: Option, main: Option) {
  switch (b.applies) {
    case "str_weapon": return isStrWeapon(main);
    case "finesse_ranged": return isFinesseOrRanged(main);
    case "weapon": return isWeapon(main);
    case "attack": return isWeapon(main) || main.kind === "spell_attack";
    default: return false;
  }
}

type Eval = { damage: number; heal: number; max: number; detail: string };

/** Expected result of one option (with the given boosts already active). */
function evalOption(c: SheetCharacter, o: Option, t: Target, boosts: Option[], advantage: boolean, potentCantrip: boolean): Eval {
  const slot = o.level && o.level > 0 ? lowestFreeSlot(c, o.level) ?? o.level : undefined;
  if (!o.damage) return { damage: 0, heal: 0, max: 0, detail: "" };
  const expr = damageExpression(c, o, slot);
  const s = stats(expr);

  if (o.kind === "heal") return { damage: 0, heal: s.avg, max: 0, detail: `heals ${expr}` };
  if (o.kind === "damage_only") return { damage: s.avg, heal: 0, max: s.max, detail: `${expr}, no roll to hit` };

  if (o.kind === "save") {
    const fail = failChance(spellSaveDC(c), t.saveBonus);
    const onSave = o.half_on_save || (potentCantrip && (o.level ?? 0) === 0) ? 0.5 : 0;
    return {
      damage: s.avg * (fail + (1 - fail) * onSave), heal: 0, max: s.max,
      detail: `${expr}, ${Math.round(fail * 100)}% chance they fail the save`,
    };
  }

  // Attack roll (weapon or spell attack)
  const { hit, crit } = hitChances(attackBonus(c, o), t.ac, advantage);
  let perHit = s.avg;
  let critExtra = s.diceAvg;
  let max = s.max;
  const extras: string[] = [];
  for (const b of boosts) {
    if (!boostApplies(b, o)) continue;
    if (b.damage_bonus) { perHit += b.damage_bonus; max += b.damage_bonus; extras.push(`+${b.damage_bonus} ${b.name}`); }
    if (b.damage && b.kind === "boost") {
      const bs = stats(damageExpression(c, b));
      perHit += bs.avg; critExtra += bs.diceAvg; max += bs.max; extras.push(`+${damageExpression(c, b)} ${b.name}`);
    }
  }
  let damage = hit * perHit + crit * critExtra;
  if (potentCantrip && o.kind === "spell_attack" && (o.level ?? 0) === 0) damage += (1 - hit) * s.avg * 0.5;
  return {
    damage, heal: 0, max,
    detail: `${Math.round(hit * 100)}% to hit${advantage ? " (advantage)" : ""}${extras.length ? ", " + extras.join(", ") : ""}`,
  };
}

/**
 * Every reasonable turn, best first. With `turn` (fight mode) it plans only what's left of this turn:
 * boosts already on (Rage) count for free, a started Attack action only allows weapon attacks, a used
 * bonus action drops bonus options, and with no action left only the bonus action is planned.
 */
export function findCombos(c: SheetCharacter, options: Option[], t: Target, turn?: TurnLeft): Combo[] {
  const potent = !!c.spells?.potent_cantrip;
  const active = new Set(turn?.active ?? []);
  const bonusLeft = turn ? turn.bonusLeft : true;
  const allBoosts = options.filter((o) => o.kind === "boost" && (o.applies || o.gives_advantage));
  const on = allBoosts.filter((b) => active.has(b.name) && !b.once_per_turn);                 // already working, free
  const boosts = allBoosts.filter((b) => !active.has(b.name) && (bonusLeft || b.action !== "bonus"));
  let mains = options.filter((o) => o.kind !== "boost" && actionOf(o) === "action" && (o.damage || o.kind === "heal"));
  if (turn && turn.attacksLeft > 0) mains = mains.filter((o) => o.kind === "weapon");              // inside the Attack action
  else if (turn && !turn.actionLeft) mains = [];
  const bonusOpts = bonusLeft ? options.filter((o) => o.kind !== "boost" && actionOf(o) === "bonus" && (o.damage || o.kind === "heal")) : [];
  const usable = (o: Option) => !(o.level && o.level > 0 && lowestFreeSlot(c, o.level) === null);

  // All subsets of boosts (there are only a handful).
  const subsets: Option[][] = [[]];
  for (const b of boosts) for (const s of [...subsets]) subsets.push([...s, b]);

  const combos: Combo[] = [];
  const mainList: (Option | null)[] = mains.filter(usable);
  if (!mainList.length && turn) mainList.push(null); // only the bonus action is left
  for (const main of mainList) {
    for (const bonus of [null, ...bonusOpts.filter(usable)]) {
      if (!main && !bonus) continue;
      // 2024 rule: only one spell with a spell slot per turn.
      if (main && bonus && (bonus.level ?? 0) > 0 && (main.level ?? 0) > 0) continue;
      for (const picked of subsets) {
        if (!main && picked.length) continue; // boosts help the action's attack
        const set = [...on, ...picked];
        const names = new Set(set.map((b) => b.name));
        if (set.some((b) => b.requires?.some((r) => !names.has(r)))) continue;
        const bonusBoosts = picked.filter((b) => b.action === "bonus");
        if (bonusBoosts.length + (bonus ? 1 : 0) > (bonusLeft ? 1 : 0)) continue; // one bonus action
        // Skip boosts that would do nothing for this action.
        if (main && picked.some((b) => (b.applies ? !boostApplies(b, main) : b.gives_advantage && !isAttackRoll(main)))) continue;
        const advantage = !!main && set.some((b) => b.gives_advantage && (!b.applies || boostApplies(b, main)));
        // Sneak Attack needs advantage, or an ally next to the target.
        if (picked.some((b) => b.needs_advantage_or_ally) && !advantage && !t.allyAdjacent) continue;

        const m = main ? evalOption(c, main, t, set, advantage, potent) : { damage: 0, heal: 0, max: 0, detail: "" };
        const b = bonus ? evalOption(c, bonus, t, [], false, potent) : null;
        const costs = [
          ...(main?.level ? [`level ${lowestFreeSlot(c, main.level)} slot`] : []),
          ...(bonus?.level ? [`level ${lowestFreeSlot(c, bonus.level)} slot`] : []),
          ...picked.filter((x) => x.resource).map((x) => `1 ${x.resource}`),
          ...(main?.resource ? [`1 ${main.resource}`] : []),
          ...(bonus?.resource ? [`1 ${bonus.resource}`] : []),
        ];
        const attackStep = turn && turn.attacksLeft > 0 ? "Attack (same action)" : "Action";
        const steps: ComboStep[] = [
          ...on.map((x) => ({ name: x.name, action: "Already on", detail: "" })),
          ...picked.filter((x) => x.action === "bonus").map((x) => ({ name: x.name, action: "Bonus action", detail: x.note ?? "" })),
          ...picked.filter((x) => x.action !== "bonus").map((x) => ({ name: x.name, action: "Free", detail: x.drawback ?? x.note ?? "" })),
          ...(main ? [{ name: main.name, action: attackStep, detail: m.detail }] : []),
          ...(bonus && b ? [{ name: bonus.name, action: "Bonus action", detail: b.detail }] : []),
        ];
        combos.push({
          title: [...picked.map((x) => x.name), ...(main ? [main.name] : []), ...(bonus ? [bonus.name] : [])].join(" + "),
          steps,
          damage: m.damage + (b?.damage ?? 0),
          heal: m.heal + (b?.heal ?? 0),
          maxDamage: m.max + (b?.max ?? 0),
          costs,
          notes: picked.map((x) => x.drawback).filter(Boolean) as string[],
          parts: { main, bonus, boosts: picked, advantage },
        });
      }
    }
  }
  return combos;
}

/** The three highlights shown on the sheet. */
export function bestMoves(c: SheetCharacter, options: Option[], t: Target, turn?: TurnLeft) {
  const all = findCombos(c, options, t, turn);
  const byDamage = [...all].sort((a, b) => b.damage - a.damage);
  const free = byDamage.filter((x) => x.costs.length === 0);
  const healers = [...all].filter((x) => x.heal > 0).sort((a, b) => b.heal + b.damage * 0.25 - (a.heal + a.damage * 0.25));
  return {
    bestDamage: byDamage[0] ?? null,
    bestFree: free[0] && free[0] !== byDamage[0] ? free[0] : null,
    bestHeal: healers[0] ?? null,
    top: byDamage.slice(0, 5),
  };
}
