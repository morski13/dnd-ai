// Area spells on the grid (pure): read the area from the spell's text, then work out which squares and
// which creatures it covers. Grid units: 1 = one square; `feet` per square (5 by default).
import type { Tok } from "./move";

export type Shape = "sphere" | "cylinder" | "emanation" | "cone" | "line" | "cube" | "targets";
export type AreaSpec = {
  shape: Shape; size: number; width?: number;   // feet (radius, length, side); width for lines
  range: number | null;                         // feet; null = from yourself ("Self")
  pick: "all" | "choose";                       // everyone inside, or creatures of your choice
  max?: number;                                 // "up to six creatures"
};
export type Aim = { x: number; y: number };     // where the player points (grid units, any point)

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

/** The area a spell covers, from its text (null = not an area or multi-target spell). */
export function parseArea(description: string, range: string | null): AreaSpec | null {
  const t = description.replace(/’/g, "'");
  const rangeFt = /self/i.test(range ?? "") ? null : Number((range ?? "").match(/(\d+)\s*(?:feet|foot|ft)/i)?.[1] ?? NaN);
  const rng = rangeFt === null ? null : Number.isFinite(rangeFt) ? rangeFt : /touch/i.test(range ?? "") ? 5 : null;
  const upTo = t.match(/(?:up to|choose up to) (\w+) creatures?/i);
  const max = upTo ? WORDS[upTo[1].toLowerCase()] ?? (Number(upTo[1]) || undefined) : undefined;
  const choose = /creatures? of your choice|up to \w+ creatures?|any number of creatures/i.test(t);
  const pick: AreaSpec["pick"] = choose ? "choose" : "all";

  let m: RegExpMatchArray | null;
  if ((m = t.match(/(\d+)-foot-long,\s*(\d+)-foot-wide Line/i)) || (m = t.match(/Line (?:that is )?(\d+) feet long and (\d+) feet wide/i)))
    return { shape: "line", size: Number(m[1]), width: Number(m[2]), range: rng, pick, ...(pick === "choose" && max ? { max } : {}) };
  if ((m = t.match(/(\d+)-foot-radius(?:,\s*\d+-foot-?high)? (Sphere|Cylinder)/i)))
    return { shape: m[2].toLowerCase() as Shape, size: Number(m[1]), range: rng, pick, ...(pick === "choose" && max ? { max } : {}) };
  if ((m = t.match(/(\d+)-foot Emanation/i)))
    return { shape: "emanation", size: Number(m[1]), range: null, pick, ...(pick === "choose" && max ? { max } : {}) };
  if ((m = t.match(/(\d+)-foot Cone/i)))
    return { shape: "cone", size: Number(m[1]), range: null, pick, ...(pick === "choose" && max ? { max } : {}) };
  if ((m = t.match(/(\d+)-foot (?:Cube|square)/i)))
    return { shape: "cube", size: Number(m[1]), range: rangeFt === null ? null : rng, pick, ...(pick === "choose" && max ? { max } : {}) };
  if (choose && max && max > 1) return { shape: "targets", size: 0, range: rng, pick: "choose", max };
  return null;
}

const center = (t: Tok) => ({ x: t.x + t.size / 2, y: t.y + t.size / 2 });
const snap = (p: Aim) => ({ x: Math.round(p.x), y: Math.round(p.y) });

/** The area as drawn on the map, for a caster and where they point. */
export type Placed =
  | { shape: "circle"; cx: number; cy: number; r: number }
  | { shape: "cone"; ox: number; oy: number; angle: number; len: number }
  | { shape: "line"; ox: number; oy: number; angle: number; len: number; width: number }
  | { shape: "rect"; x: number; y: number; w: number; h: number }
  | { shape: "range"; cx: number; cy: number; r: number };

export function place(spec: AreaSpec, caster: Tok, aim: Aim, feet = 5): Placed {
  const c = center(caster);
  const ang = Math.atan2(aim.y - c.y, aim.x - c.x);
  const S = spec.size / feet;
  switch (spec.shape) {
    case "sphere": case "cylinder": { const o = spec.range === null ? c : snap(aim); return { shape: "circle", cx: o.x, cy: o.y, r: S }; }
    case "emanation": return { shape: "circle", cx: c.x, cy: c.y, r: S + caster.size / 2 };
    case "cone": return { shape: "cone", ox: c.x, oy: c.y, angle: ang, len: S + caster.size / 2 };
    case "line": return { shape: "line", ox: c.x, oy: c.y, angle: ang, len: S + caster.size / 2, width: (spec.width ?? 5) / feet };
    case "cube": {
      if (spec.range === null) {
        // a cube coming out of you: one face against your space, towards where you point
        const dx = Math.cos(ang), dy = Math.sin(ang);
        const half = caster.size / 2 + S / 2;
        const k = Math.max(Math.abs(dx), Math.abs(dy)) || 1;
        const cx = c.x + (dx / k) * half, cy = c.y + (dy / k) * half;
        return { shape: "rect", x: Math.round(cx - S / 2), y: Math.round(cy - S / 2), w: S, h: S };
      }
      const p = snap(aim);
      return { shape: "rect", x: p.x - Math.floor(S / 2), y: p.y - Math.floor(S / 2), w: S, h: S };
    }
    case "targets": return { shape: "range", cx: c.x, cy: c.y, r: (spec.range ?? 5) / feet + caster.size / 2 };
  }
}

/** Is the point the spell is aimed at within its range? (Self spells always are.) */
export function inRange(spec: AreaSpec, caster: Tok, aim: Aim, feet = 5): boolean {
  if (spec.range === null || spec.shape === "targets") return true;
  const c = center(caster), p = spec.shape === "cube" ? snap(aim) : snap(aim);
  return Math.hypot(p.x - c.x, p.y - c.y) <= spec.range / feet + caster.size / 2 + 1e-9;
}

const CONE_HALF = Math.atan(0.5) + 0.02; // a cone is as wide as it is long away from you

/** Is the middle of square (i, j) inside the placed area? */
export function squareIn(a: Placed, i: number, j: number): boolean {
  const x = i + 0.5, y = j + 0.5;
  switch (a.shape) {
    case "circle": case "range": return Math.hypot(x - a.cx, y - a.cy) <= a.r + 1e-9;
    case "rect": return x > a.x && x < a.x + a.w && y > a.y && y < a.y + a.h;
    case "cone": {
      const d = Math.hypot(x - a.ox, y - a.oy);
      if (d < 0.5 || d > a.len + 1e-9) return false;
      let diff = Math.atan2(y - a.oy, x - a.ox) - a.angle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      return Math.abs(diff) <= CONE_HALF;
    }
    case "line": {
      const dx = Math.cos(a.angle), dy = Math.sin(a.angle);
      const t = (x - a.ox) * dx + (y - a.oy) * dy;
      const perp = Math.abs(-(x - a.ox) * dy + (y - a.oy) * dx);
      return t > 0.5 && t <= a.len + 1e-9 && perp <= a.width / 2 + 0.01;
    }
  }
}

/** The tokens the area touches (any of their squares). The caster is left out of cones, lines and emanations. */
export function tokensIn<T extends Tok>(a: Placed, tokens: T[], casterId: string, shape: Shape): T[] {
  return tokens.filter((t) => {
    if (t.id === casterId && (shape === "cone" || shape === "line" || shape === "emanation")) return false;
    for (let j = t.y; j < t.y + t.size; j++) for (let i = t.x; i < t.x + t.size; i++) if (squareIn(a, i, j)) return true;
    return false;
  });
}

/** All squares covered (for drawing), limited to the map. */
export function squaresIn(a: Placed, cols: number, rows: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if (squareIn(a, i, j)) out.push({ x: i, y: j });
  return out;
}
