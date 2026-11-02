// Real dice (pure, tested): the player rolls physical dice and types what they show. We turn that into the
// dice values the normal roll uses, so hit / miss, crits, damage and every stat work the same as an app roll.
import { roll, type Advantage } from "./dice";

export type RollShape = { d20s: number; others: number[]; modifierText: string };
type Opts = { advantage?: Advantage; critical?: boolean; critOn?: number; critExtra?: string; critMode?: "dice" | "double" };

/** Which dice a roll asks for, in order (by asking a roll for them once). */
export function diceSides(expression: string, opts: Opts = {}): number[] {
  const sides: number[] = [];
  roll(expression, { ...opts, rng: (s) => { sides.push(s); return 1; } });
  return sides;
}

/** What to ask the player: how many d20s (advantage: 2), and the other dice (damage). */
export function shapeOf(expression: string, opts: Opts = {}): RollShape {
  const sides = diceSides(expression, opts);
  const d20s = sides.filter((s) => s === 20).length;
  const others = sides.filter((s) => s !== 20);
  const mod = roll(expression, { ...opts, rng: () => 1 }).modifier;
  return { d20s, others, modifierText: mod ? `${mod > 0 ? "+" : "−"}${Math.abs(mod)}` : "" };
}

/** "2d6 + 1d8" for the dice in a roll. */
export function diceLabel(others: number[]): string {
  const n = new Map<number, number>();
  for (const s of others) n.set(s, (n.get(s) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[0] - a[0]).map(([s, k]) => `${k}d${s}`).join(" + ");
}

/**
 * The dice values for the typed numbers: `d20` = each d20 as it landed; `sum` = what the other dice add up to
 * (without modifiers). Values are spread over the dice (each 1…sides). An error when a number can't be right.
 */
export function physicalValues(sides: number[], typed: { d20?: number[]; sum?: number | null }): { values: number[] } | { error: string } {
  const d20 = typed.d20 ?? [];
  const need20 = sides.filter((s) => s === 20).length;
  if (d20.length < need20) return { error: need20 > 1 ? `Type both d20s (${need20}).` : "Type what the d20 shows." };
  if (d20.some((v) => !Number.isInteger(v) || v < 1 || v > 20)) return { error: "A d20 shows 1 to 20." };
  const others = sides.filter((s) => s !== 20);
  let left: number[] = [];
  if (others.length) {
    const sum = typed.sum;
    const max = others.reduce((a, b) => a + b, 0);
    if (sum == null || !Number.isInteger(sum)) return { error: `Type what your ${diceLabel(others)} add up to.` };
    if (sum < others.length || sum > max) return { error: `${diceLabel(others)} add up to ${others.length}–${max}.` };
    // each die starts at 1, then the rest is shared out, biggest dice first so it stays believable
    left = others.map(() => 1);
    let rest = sum - others.length;
    const order = others.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s);
    while (rest > 0) {
      let moved = false;
      for (const { s, i } of order) { if (rest > 0 && left[i] < s) { left[i]++; rest--; moved = true; } }
      if (!moved) break;
    }
  }
  let a = 0, b = 0;
  return { values: sides.map((s) => (s === 20 ? d20[a++] : left[b++])) };
}
