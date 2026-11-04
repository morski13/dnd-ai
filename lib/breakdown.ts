// "How did we get that number?": the sum under a roll's total, e.g. "1d8 (6) + 2d6 (3 + 5) + 4 STR = 18". Pure, tested.
import { parse, signed } from "./dice";
import { abilityModFor, mods, spellAbility, type Attack, type SheetCharacter } from "./rules";
import { activeToggles } from "./homebrew";

/** A named flat number in a roll ("STR" 4, "+1 weapon" 1). */
export type Part = { label: string; value: number };

type Rolled = { expression: string; dice: number[]; diceAll: number[]; modifier: number; total: number | null };

/**
 * The sum that makes the total. Dice groups show what each die rolled (dropped dice in brackets: advantage),
 * flat numbers get their names when `parts` add up to the roll's modifier. Null when there's nothing to explain.
 */
export function howTotal(r: Rolled, parts: Part[] = []): string | null {
  if (r.total == null || !r.expression) return null;
  let terms;
  try { terms = parse(r.expression).terms; } catch { return null; }
  const dice = terms.filter((t) => t.type === "dice");
  if (!dice.length) return null;

  // walk the dice in the order they were rolled: every die is in diceAll, the ones that counted are in dice
  const all = [...r.diceAll.length ? r.diceAll : r.dice];
  const kept = [...r.dice];
  const groups: string[] = [];
  let diceSum = 0;
  let countedAll = 0;
  let droppedAny = false;
  for (const t of dice) {
    if (t.type !== "dice") continue;
    const rolled = all.splice(0, t.count);
    const n = t.keep ? t.keep.n : t.count;
    const counted: number[] = [];
    for (const v of rolled) {
      const i = kept.indexOf(v);
      if (counted.length < n && i >= 0 && (t.keep ? keepsThis(v, rolled, t.keep) : true)) { counted.push(v); kept.splice(i, 1); }
    }
    const dropped = t.keep ? dropOnce(rolled, counted) : [];
    countedAll += counted.length;
    if (dropped.length) droppedAny = true;
    const sum = counted.reduce((a, b) => a + b, 0) * t.sign;
    diceSum += sum;
    const name = t.keep && t.sides === 20 && t.keep.n === 1 ? "d20" : `${t.keep ? t.keep.n : t.count}d${t.sides}`;
    const shown = counted.join(" + ") + (dropped.length ? `, ${dropped.join(", ")} dropped` : "");
    groups.push(`${t.sign < 0 ? "− " : groups.length ? "+ " : ""}${name} (${shown})`);
  }
  // house-rule crits: what the dice rolled counts twice
  const doubled = diceSum !== 0 && r.total - r.modifier === diceSum * 2;
  let line = groups.join(" ").replace(/^\+ /, "");
  if (doubled) line = `(${line}) ×2`;

  const named = parts.filter((p) => p.value !== 0);
  if (named.length && named.reduce((a, p) => a + p.value, 0) === r.modifier) {
    for (const p of named) line += ` ${p.value < 0 ? "−" : "+"} ${Math.abs(p.value)} ${p.label}`;
  } else if (r.modifier) {
    line += ` ${r.modifier < 0 ? "−" : "+"} ${Math.abs(r.modifier)}`;
  }
  // one die and nothing else: "d20 (14) = 14" says nothing new
  if (countedAll === 1 && !r.modifier && !doubled && !droppedAny) return null;
  return `${line} = ${r.total}`;
}

/** With keep-highest/lowest, is this value one of the kept ones? */
function keepsThis(v: number, rolled: number[], keep: { kind: "h" | "l"; n: number }) {
  const sorted = [...rolled].sort((a, b) => (keep.kind === "h" ? b - a : a - b));
  return sorted.slice(0, keep.n).includes(v);
}
function dropOnce(rolled: number[], counted: number[]) {
  const left = [...counted];
  return rolled.filter((v) => { const i = left.indexOf(v); if (i >= 0) { left.splice(i, 1); return false; } return true; });
}

const ABILITY_NAME = { STR: "STR", DEX: "DEX", CON: "CON", INT: "INT", WIS: "WIS", CHA: "CHA" } as const;

/** The named flat numbers in an option's damage or healing (the same ones damageExpression adds). */
export function damageParts(c: SheetCharacter, o: Attack, slotLevel?: number): Part[] {
  const out: Part[] = [];
  if (o.add_mod) {
    const m = mods(c);
    const ab = o.ability === "finesse" ? (m.STR >= m.DEX ? "STR" : "DEX") : o.ability === "spell" ? spellAbility(c) : o.ability;
    if (ab) out.push({ label: ABILITY_NAME[ab], value: abilityModFor(c, o) });
  }
  if (o.bonus && o.kind !== "spell_attack") out.push({ label: o.kind === "weapon" ? "magic weapon" : "bonus", value: o.bonus });
  const level = o.level ?? 0;
  if (o.kind === "heal" && level > 0 && c.spells?.heal_bonus) {
    out.push({ label: "healing bonus", value: c.spells.heal_bonus.base + c.spells.heal_bonus.per_slot_level * (slotLevel ?? level) });
  }
  for (const t of activeToggles(c.homebrew, o)) if (/^[+-]?\d+$/.test(t.damage)) out.push({ label: t.name, value: Number(t.damage) });
  return out;
}

/** Hit dice on a short rest: "d10 (6) + 3 CON = 9". */
export function hitDieLine(r: { die: number; dice: number[]; total: number; expression?: string }, conMod: number) {
  const dice = r.dice.join(" + ");
  const flat = r.total - r.dice.reduce((a, b) => a + b, 0);
  const con = flat ? ` ${flat < 0 ? "−" : "+"} ${Math.abs(flat)} CON` : conMod ? ` ${signed(conMod)} CON` : "";
  return `${r.dice.length > 1 ? `${r.dice.length}d${r.die}` : `d${r.die}`} (${dice})${con} = ${r.total}`;
}
