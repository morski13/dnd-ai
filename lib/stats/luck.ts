// Luck index: how lucky someone's d20s were, compared with what the dice should do.
//
// Every d20 is scored against its own odds: a natural 14 on a straight roll beats 65% of what a d20
// can show, but with advantage (best of two) a 14 is below average. That score (0–1) is averaged
// over many rolls and shown ×100, so 50 is exactly average luck whatever the advantage mix.
//
// Whether it's real luck or just chance: each score varies by about √(1/12) around 0.5, so with n
// rolls the average is "unusual" when it is 2 standard errors (√(1/(12n))) or more from 0.5.
// Under 10 rolls we don't say anything.
import type { StatRoll } from "./compute";

export const LUCK_CATS = ["all", "attack", "save", "check"] as const;
export type LuckCat = (typeof LUCK_CATS)[number];
export const LUCK_CAT_LABEL: Record<LuckCat, string> = { all: "All d20s", attack: "Attacks", save: "Saves", check: "Checks" };
export const LUCK_SOURCES = ["both", "app", "real"] as const;
export type LuckSource = (typeof LUCK_SOURCES)[number];

export const MIN_ROLLS = 10;

/** Which group a roll counts in (null = not a d20 test). Death saves are saves; initiative is a DEX check. */
export function luckCat(rollType: string): Exclude<LuckCat, "all"> | null {
  if (rollType === "attack") return "attack";
  if (rollType === "save" || rollType === "death_save") return "save";
  if (rollType === "check" || rollType === "initiative") return "check";
  return null;
}

export type LuckVerdict = "few" | "normal" | "lucky" | "unlucky";
export type LuckCell = {
  n: number;
  index: number | null; // 0–100, 50 = average luck (1 decimal)
  mean: number | null; // the exact average score, 0–1
  avg: number | null; // average natural d20 that counted
  expected: number | null; // what that average should be with this advantage mix
  z: number | null;
  verdict: LuckVerdict;
};
export type LuckBreakdown = Record<LuckCat, Record<LuckSource, LuckCell>>;

/** Score of one d20 against its odds: chance of rolling lower + half the chance of rolling the same. */
export function luckScore(d: number, mode: "normal" | "advantage" | "disadvantage", dice = 2): number {
  const k = Math.max(1, Math.min(20, Math.round(d)));
  if (mode === "normal") return (k - 0.5) / 20;
  const n = Math.max(2, dice);
  if (mode === "advantage") {
    const below = ((k - 1) / 20) ** n; // all dice under k
    const upTo = (k / 20) ** n;
    return (below + upTo) / 2;
  }
  const below = 1 - ((21 - k) / 20) ** n; // the lowest die is under k
  const upTo = 1 - ((20 - k) / 20) ** n;
  return (below + upTo) / 2;
}

/** Expected natural d20 for a roll mode (straight 10.5, advantage 13.825, disadvantage 7.175). */
export function expectedD20(mode: "normal" | "advantage" | "disadvantage", dice = 2): number {
  if (mode === "normal") return 10.5;
  const n = Math.max(2, dice);
  let e = 0;
  for (let k = 1; k <= 20; k++) {
    const p = mode === "advantage" ? (k / 20) ** n - ((k - 1) / 20) ** n : ((21 - k) / 20) ** n - ((20 - k) / 20) ** n;
    e += k * p;
  }
  return e;
}

type Acc = { n: number; score: number; sum: number; exp: number };
const acc = (): Acc => ({ n: 0, score: 0, sum: 0, exp: 0 });

function cell(a: Acc): LuckCell {
  if (!a.n) return { n: 0, index: null, mean: null, avg: null, expected: null, z: null, verdict: "few" };
  const mean = a.score / a.n;
  const z = (mean - 0.5) / Math.sqrt(1 / (12 * a.n));
  const verdict: LuckVerdict = a.n < MIN_ROLLS ? "few" : z >= 2 ? "lucky" : z <= -2 ? "unlucky" : "normal";
  return { n: a.n, index: Math.round(mean * 1000) / 10, mean, avg: a.sum / a.n, expected: a.exp / a.n, z, verdict };
}

/** The d20 that counted and how it was rolled, or null when the roll isn't a d20 test. */
export function d20Roll(r: StatRoll): { d: number; mode: "normal" | "advantage" | "disadvantage"; dice: number } | null {
  if (!luckCat(r.roll_type) || !r.dice?.length) return null;
  if (!/^\s*[123]d20/.test(r.expression)) return null;
  const d = r.dice[0];
  if (!Number.isFinite(d) || d < 1 || d > 20) return null;
  const all = (r.dice_all ?? []).filter((x) => x >= 1 && x <= 20);
  let mode: "normal" | "advantage" | "disadvantage" = r.advantage === "advantage" || r.advantage === "disadvantage" ? r.advantage : "normal";
  // Older rows: no advantage column, but two d20s kept the highest/lowest.
  if (mode === "normal" && all.length >= 2 && /kh1|adv/.test(r.expression)) mode = "advantage";
  if (mode === "normal" && all.length >= 2 && /kl1|dis/.test(r.expression)) mode = "disadvantage";
  return { d, mode, dice: Math.max(2, all.length) };
}

/** Luck per actor key ("c:<id>"), split by roll group and by app vs real dice. */
export function luckByActor(rolls: StatRoll[]): Map<string, LuckBreakdown> {
  const raw = new Map<string, Record<LuckCat, Record<LuckSource, Acc>>>();
  const blank = () => Object.fromEntries(LUCK_CATS.map((c) => [c, { both: acc(), app: acc(), real: acc() }])) as Record<LuckCat, Record<LuckSource, Acc>>;
  for (const r of rolls) {
    const key = r.character_id ? `c:${r.character_id}` : r.monster_id ? `m:${r.monster_id}` : null;
    if (!key) continue;
    const roll = d20Roll(r);
    if (!roll) continue;
    const cat = luckCat(r.roll_type)!;
    const s = luckScore(roll.d, roll.mode, roll.dice);
    const e = expectedD20(roll.mode, roll.dice);
    const me = raw.get(key) ?? blank();
    raw.set(key, me);
    for (const c of ["all", cat] as const) {
      for (const src of ["both", r.physical ? "real" : "app"] as const) {
        const a = me[c][src];
        a.n++; a.score += s; a.sum += roll.d; a.exp += e;
      }
    }
  }
  const out = new Map<string, LuckBreakdown>();
  for (const [k, v] of raw) {
    out.set(k, Object.fromEntries(LUCK_CATS.map((c) => [c, { both: cell(v[c].both), app: cell(v[c].app), real: cell(v[c].real) }])) as LuckBreakdown);
  }
  return out;
}

/** Puts several people's luck together (the whole table). */
export function mergeLuck(list: LuckBreakdown[]): LuckBreakdown {
  const merged = Object.fromEntries(LUCK_CATS.map((c) => [c, { both: acc(), app: acc(), real: acc() }])) as Record<LuckCat, Record<LuckSource, Acc>>;
  for (const b of list) {
    for (const c of LUCK_CATS) for (const s of LUCK_SOURCES) {
      const x = b[c][s];
      if (!x.n || x.mean === null) continue;
      const a = merged[c][s];
      a.n += x.n; a.score += x.mean * x.n; a.sum += (x.avg ?? 0) * x.n; a.exp += (x.expected ?? 0) * x.n;
    }
  }
  return Object.fromEntries(LUCK_CATS.map((c) => [c, { both: cell(merged[c].both), app: cell(merged[c].app), real: cell(merged[c].real) }])) as LuckBreakdown;
}

export type DiceCompare = { verdict: "few" | "same" | "app-higher" | "real-higher"; z: number | null; gap: number | null };

/** App dice vs real dice: is the difference bigger than chance would make? */
export function compareDice(app: LuckCell, real: LuckCell): DiceCompare {
  if (app.n < MIN_ROLLS || real.n < MIN_ROLLS || app.mean === null || real.mean === null) {
    return { verdict: "few", z: null, gap: app.index !== null && real.index !== null ? app.index - real.index : null };
  }
  const se = Math.sqrt(1 / (12 * app.n) + 1 / (12 * real.n));
  const z = (app.mean - real.mean) / se;
  return { verdict: z >= 2 ? "app-higher" : z <= -2 ? "real-higher" : "same", z, gap: Math.round((app.mean - real.mean) * 1000) / 10 };
}

/** One plain line about a luck number. */
export function verdictLine(c: LuckCell): string {
  switch (c.verdict) {
    case "few": return c.n ? `Only ${c.n} roll${c.n === 1 ? "" : "s"}: too few to tell` : "No rolls yet";
    case "lucky": return "Luckier than chance would explain";
    case "unlucky": return "Unluckier than chance would explain";
    default: return c.index !== null && c.index >= 50 ? "A bit above average, could easily be chance" : "A bit below average, could easily be chance";
  }
}

/** One plain line about app vs real dice. */
export function compareLine(cmp: DiceCompare, app: LuckCell, real: LuckCell): string {
  if (!app.n && !real.n) return "No d20 rolls yet.";
  if (!real.n) return "Only app dice so far. Turn on \"I use real dice\" on a sheet to compare.";
  if (!app.n) return "Only real dice so far.";
  switch (cmp.verdict) {
    case "few": return `Need ${MIN_ROLLS}+ rolls of each kind to compare (app ${app.n}, real ${real.n}).`;
    case "same": return "No real difference: the app's dice and the real dice roll the same.";
    case "app-higher": return "The app's dice ran hotter than the real dice, more than chance usually makes.";
    default: return "The real dice ran hotter than the app's, more than chance usually makes.";
  }
}
