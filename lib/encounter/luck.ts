// "Personal" simulations: blend a character's real dice history into the simulator.
// Until a character has made at least 30 rolls of a kind (attack d20s, saving throws, damage/healing),
// that kind uses plain average dice: fewer rolls than that say more about chance than about the dice.
// From 30 on, their real results count, still pulled a little towards average so one hot night doesn't swing it.
import { compile, type Unit } from "./sim";

export type RollRow = { character_id: string | null; roll_type: string; expression: string | null; dice: number[] | null; dice_all: number[] | null; total: number | null };

export type RollHistory = {
  attacks: number; attackNatSum: number;    // natural d20s on attack rolls
  saves: number; saveNatSum: number;        // natural d20s on saving throws
  damage: number; damageRatioSum: number;   // damage rolled ÷ average for those dice
};
export type Luck = { attackShift: number; saveShift: number; dmgMult: number; rolls: number; counts?: { attacks: number; saves: number; damage: number } };

const EMPTY: RollHistory = { attacks: 0, attackNatSum: 0, saves: 0, saveNatSum: 0, damage: 0, damageRatioSum: 0 };
export const MIN_ROLLS = 30; // rolls of a kind before real luck is used at all
const K = 20; // prior strength once it is used: at 30 rolls real luck counts 60%, at 80 rolls 80%
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** The natural d20 of a straight roll (advantage/disadvantage rolls are left out: they'd skew the average). */
function natural(r: RollRow): number | null {
  if (!r.expression || !/^\s*1d20(?![\dk])/i.test(r.expression)) return null;
  const d = r.dice?.[0];
  return typeof d === "number" && d >= 1 && d <= 20 ? d : null;
}

/** Sum up a table's roll history per character. */
export function rollHistory(rows: RollRow[]): Record<string, RollHistory> {
  const out: Record<string, RollHistory> = {};
  for (const r of rows) {
    if (!r.character_id) continue;
    const h = (out[r.character_id] ??= { ...EMPTY });
    if (r.roll_type === "attack" || r.roll_type === "save") {
      const n = natural(r);
      if (n == null) continue;
      if (r.roll_type === "attack") { h.attacks++; h.attackNatSum += n; } else { h.saves++; h.saveNatSum += n; }
    } else if (r.roll_type === "damage" && r.expression && r.total != null) {
      const c = compile(r.expression);
      const count = c.groups.reduce((a, g) => a + Math.abs(g.n), 0);
      if (!count || c.avg <= 0 || (r.dice_all?.length ?? count) !== count) continue; // dice we can't account for (kept dice etc.)
      h.damage++; h.damageRatioSum += r.total / c.avg;
    }
  }
  return out;
}

/** How lucky (or unlucky) this character's dice really are, shrunk towards "average" when there are few rolls. */
export function luckFrom(h: RollHistory | undefined): Luck {
  if (!h) return { attackShift: 0, saveShift: 0, dmgMult: 1, rolls: 0, counts: { attacks: 0, saves: 0, damage: 0 } };
  const enough = (n: number) => n >= MIN_ROLLS;
  const shift = (n: number, sum: number) => (enough(n) ? clamp((n / (n + K)) * (sum / n - 10.5), -3, 3) : 0);
  const dmgMult = enough(h.damage) ? clamp(1 + (h.damage / (h.damage + K)) * (h.damageRatioSum / h.damage - 1), 0.75, 1.25) : 1;
  return {
    attackShift: shift(h.attacks, h.attackNatSum),
    saveShift: shift(h.saves, h.saveNatSum),
    dmgMult,
    rolls: h.attacks + h.saves + h.damage,
    counts: { attacks: h.attacks, saves: h.saves, damage: h.damage },
  };
}

/** The simulator unit with this character's real luck applied. */
export function withLuck(u: Unit, l: Luck): Unit {
  if (!l.rolls) return u;
  return {
    ...u,
    dmgMult: l.dmgMult,
    saves: Object.fromEntries(Object.entries(u.saves).map(([a, v]) => [a, v + l.saveShift])) as Unit["saves"],
    plans: u.plans.map((p) => ({ ...p, strikes: p.strikes.map((s) => (s.kind === "attack" ? { ...s, bonus: (s.bonus ?? 0) + l.attackShift } : s)) })),
  };
}

/** Is any of this character's real luck used yet? */
export const luckUsed = (l: Luck) => !!l.counts && (l.counts.attacks >= MIN_ROLLS || l.counts.saves >= MIN_ROLLS || l.counts.damage >= MIN_ROLLS);

/** "average dice (12 of 30 rolls)" · "based on 42 rolls · hits more" */
export function luckLabel(l: Luck): string {
  if (!l.rolls) return "average dice (no rolls yet)";
  if (l.counts && !luckUsed(l)) {
    const most = Math.max(l.counts.attacks, l.counts.saves, l.counts.damage);
    return `average dice (${most} of ${MIN_ROLLS} rolls)`;
  }
  const bits: string[] = [];
  if (l.attackShift >= 0.5) bits.push("hits more"); else if (l.attackShift <= -0.5) bits.push("hits less");
  if (l.dmgMult >= 1.05) bits.push("hits harder"); else if (l.dmgMult <= 0.95) bits.push("hits softer");
  return `based on ${l.rolls} roll${l.rolls === 1 ? "" : "s"}${bits.length ? ` · ${bits.join(", ")}` : ""}`;
}
