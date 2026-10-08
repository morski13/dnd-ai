// Dice engine: reads dice notation and rolls it.
// Supports: 2d6+3, 1d20-1, 4d6kh3 (keep highest 3), 2d20kl1 (keep lowest 1),
// "1d20+5 adv" / "1d20+5 dis", several dice groups (1d6+2d6+3), and critical hits (double dice).

export type Advantage = "normal" | "advantage" | "disadvantage";

type DiceTerm = { type: "dice"; sign: 1 | -1; count: number; sides: number; keep?: { kind: "h" | "l"; n: number } };
type ConstTerm = { type: "const"; sign: 1 | -1; value: number };
export type Term = DiceTerm | ConstTerm;

export type ParsedRoll = { terms: Term[]; advantage: Advantage };

export type RollResult = {
  expression: string; // what was rolled, after advantage/crit changes (e.g. "2d20kh1+5")
  total: number;
  dice: number[];     // dice that counted
  diceAll: number[];  // every die rolled, including dropped ones
  modifier: number;   // sum of the plain numbers
  natural: number | null; // the d20 that counted, for d20 rolls
  isCrit: boolean;    // natural 20
  isFumble: boolean;  // natural 1
};

/** Returns a whole number from 1 to `sides`. Replaceable in tests. */
export type Rng = (sides: number) => number;

export const secureRng: Rng = (sides) => {
  // crypto.getRandomValues works in browsers and in Node (server).
  const max = Math.floor(0x1_0000_0000 / sides) * sides; // avoid bias
  const buf = new Uint32Array(1);
  let x: number;
  do {
    crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= max);
  return (x % sides) + 1;
};

const MAX_DICE = 100;
const MAX_SIDES = 1000;

export function parse(input: string): ParsedRoll {
  let text = input.toLowerCase().replace(/\s+/g, " ").trim();
  let advantage: Advantage = "normal";
  const advMatch = text.match(/\s(adv|advantage|dis|disadvantage)$/);
  if (advMatch) {
    advantage = advMatch[1].startsWith("adv") ? "advantage" : "disadvantage";
    text = text.slice(0, advMatch.index).trim();
  }
  text = text.replace(/\s/g, "");
  if (!text) throw new Error("Empty dice expression");

  const terms: Term[] = [];
  const re = /([+-]?)(?:(\d*)d(\d+)(?:k([hl]?)(\d+))?|(\d+))/gy;
  let pos = 0;
  while (pos < text.length) {
    re.lastIndex = pos;
    const m = re.exec(text);
    if (!m || m[0] === "" || (pos > 0 && !m[1])) {
      throw new Error(`Can't read "${input}" near "${text.slice(pos)}"`);
    }
    const sign = m[1] === "-" ? -1 : 1;
    if (m[3] !== undefined) {
      const count = m[2] === "" ? 1 : Number(m[2]);
      const sides = Number(m[3]);
      if (count < 1 || count > MAX_DICE) throw new Error(`Use between 1 and ${MAX_DICE} dice`);
      if (sides < 2 || sides > MAX_SIDES) throw new Error(`Dice need between 2 and ${MAX_SIDES} sides`);
      const term: DiceTerm = { type: "dice", sign, count, sides };
      if (m[5] !== undefined) {
        const n = Number(m[5]);
        if (n < 1 || n > count) throw new Error(`Can't keep ${n} of ${count} dice`);
        term.keep = { kind: m[4] === "l" ? "l" : "h", n };
      }
      terms.push(term);
    } else {
      terms.push({ type: "const", sign, value: Number(m[6]) });
    }
    pos = re.lastIndex;
  }
  return { terms, advantage };
}

export function format(terms: Term[]): string {
  return terms
    .map((t, i) => {
      const sign = t.sign === -1 ? "-" : i === 0 ? "" : "+";
      if (t.type === "const") return `${sign}${t.value}`;
      const keep = t.keep ? `k${t.keep.kind}${t.keep.n}` : "";
      return `${sign}${t.count}d${t.sides}${keep}`;
    })
    .join("");
}

export function roll(
  input: string,
  opts: { advantage?: Advantage; critical?: boolean; rng?: Rng } = {}
): RollResult {
  const rng = opts.rng ?? secureRng;
  const parsed = parse(input);
  const advantage = opts.advantage && opts.advantage !== "normal" ? opts.advantage : parsed.advantage;

  // Turn a single 1d20 into 2d20 keep highest/lowest.
  let terms = parsed.terms.map((t) => {
    if (advantage !== "normal" && t.type === "dice" && t.sides === 20 && t.count === 1 && !t.keep) {
      return { ...t, count: 2, keep: { kind: advantage === "advantage" ? "h" : "l", n: 1 } } as DiceTerm;
    }
    return t;
  });

  // Critical hit: roll all damage dice twice (modifiers once).
  if (opts.critical) {
    terms = terms.map((t) =>
      t.type === "dice" ? { ...t, count: t.count * 2, keep: t.keep ? { ...t.keep, n: t.keep.n * 2 } : undefined } : t
    );
  }

  const dice: number[] = [];
  const diceAll: number[] = [];
  let total = 0;
  let modifier = 0;
  let natural: number | null = null;

  for (const t of terms) {
    if (t.type === "const") {
      total += t.sign * t.value;
      modifier += t.sign * t.value;
      continue;
    }
    const rolled = Array.from({ length: t.count }, () => rng(t.sides));
    let kept = rolled;
    if (t.keep) {
      // Keep the highest/lowest n, but report them in the order they were rolled.
      const order = rolled.map((v, i) => ({ v, i })).sort((a, b) => (t.keep!.kind === "h" ? b.v - a.v : a.v - b.v));
      const keepIdx = new Set(order.slice(0, t.keep.n).map((o) => o.i));
      kept = rolled.filter((_, i) => keepIdx.has(i));
    }
    diceAll.push(...rolled);
    dice.push(...kept);
    total += t.sign * kept.reduce((a, b) => a + b, 0);
    if (t.sides === 20 && kept.length === 1 && natural === null) natural = kept[0];
  }

  return {
    expression: format(terms),
    total,
    dice,
    diceAll,
    modifier,
    natural,
    isCrit: natural === 20,
    isFumble: natural === 1,
  };
}

/** Adds expressions and tidies them: combine("3d4+3", "1d4+1") → "4d4+4". Keep/advantage terms stay separate. */
export function combine(...exprs: string[]): string {
  const dice = new Map<number, number>();
  const others: Term[] = [];
  let constant = 0;
  for (const e of exprs.filter(Boolean)) {
    for (const t of parse(e).terms) {
      if (t.type === "const") constant += t.sign * t.value;
      else if (t.keep || t.sign === -1) others.push(t);
      else dice.set(t.sides, (dice.get(t.sides) ?? 0) + t.count);
    }
  }
  const terms: Term[] = [...[...dice.entries()].sort((a, b) => b[0] - a[0])
    .map(([sides, count]) => ({ type: "dice", sign: 1, count, sides }) as Term), ...others];
  if (constant) terms.push({ type: "const", sign: constant < 0 ? -1 : 1, value: Math.abs(constant) });
  return terms.length ? format(terms) : "0";
}

/** Multiplies the number of dice: times("1d10", 2) → "2d10" (cantrip upgrades). */
export function timesDice(expr: string, n: number): string {
  const p = parse(expr);
  return format(p.terms.map((t) => (t.type === "dice" ? { ...t, count: t.count * n } : t)));
}

/** Average and maximum of an expression (for the combo calculator). */
export function stats(expr: string): { avg: number; max: number; diceAvg: number } {
  let avg = 0, max = 0, diceAvg = 0;
  for (const t of parse(expr).terms) {
    if (t.type === "const") { avg += t.sign * t.value; max += t.sign * t.value; continue; }
    const n = t.keep ? t.keep.n : t.count;
    const a = n * (t.sides + 1) / 2;
    avg += t.sign * a; diceAvg += t.sign * a; max += t.sign * n * t.sides;
  }
  return { avg, max, diceAvg };
}

/** "+5", "-1", "+0" */
export function signed(n: number) {
  return n >= 0 ? `+${n}` : `${n}`;
}
