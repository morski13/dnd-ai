// Battle engine, part 4: space on the battle map. Distance between creatures, range and reach, cover,
// moving through difficult terrain and around walls and enemies, and the opportunity attacks a move provokes.
// Pure, tested. Grid units: one square = `feet` (5); a token's x/y is its top-left square, `size` squares wide.

export type Diagonals = "5" | "5-10-5";
export type Pos = { x: number; y: number };
export type Body = Pos & { id: string; size: number };
export type Terrain = { walls: Set<string>; difficult: Set<string> };
export const key = (x: number, y: number) => `${x},${y}`;

/** Terrain as stored with a map ({ walls: ["3,4"], difficult: [...] }). */
export function terrainOf(raw: unknown): Terrain {
  const r = (raw && typeof raw === "object" ? raw : {}) as { walls?: unknown; difficult?: unknown };
  const list = (v: unknown) => new Set((Array.isArray(v) ? v : []).map(String).filter((s) => /^\d+,\d+$/.test(s)).slice(0, 20000));
  return { walls: list(r.walls), difficult: list(r.difficult) };
}

/** Steps between two creatures' spaces along each axis (next to each other = 1, overlapping = 0). */
function steps(a: Body, b: Body) {
  const dx = Math.max(0, b.x - (a.x + a.size) + 1, a.x - (b.x + b.size) + 1);
  const dy = Math.max(0, b.y - (a.y + a.size) + 1, a.y - (b.y + b.size) + 1);
  return { dx, dy };
}
const diagSquares = (dx: number, dy: number, diag: Diagonals) =>
  diag === "5-10-5" ? Math.max(dx, dy) + Math.floor(Math.min(dx, dy) / 2) : Math.max(dx, dy);

/** Distance between two creatures in feet (side by side = 5 ft). */
export function distanceFt(a: Body, b: Body, feet = 5, diag: Diagonals = "5") {
  const { dx, dy } = steps(a, b);
  return diagSquares(dx, dy, diag) * feet;
}

// ---------------------------------------------------------------- range and reach

export type Reach = { melee: number | null; normal: number | null; long: number | null; self?: boolean };
const REACH_WEAPONS = /glaive|halberd|lance|pike|whip|spear of reach/i;

/**
 * How far an attack or spell goes. Weapons: reach 5 ft (10 with Reach), ranged "80/320". Thrown melee weapons
 * (Javelin "30/120") can do both. Spells: "120 feet", "Touch" (5 ft), "Self" (from you: areas, emanations).
 */
export function reachOf(o: { kind?: string; range?: string | null; ranged?: boolean; name?: string; note?: string | null }): Reach {
  const text = `${o.range ?? ""}`;
  const pair = text.match(/(\d+)\s*\/\s*(\d+)/);
  if (/self/i.test(text)) return { melee: null, normal: null, long: null, self: true };
  if (/touch/i.test(text)) return { melee: 5, normal: null, long: null };
  const reachy = /reach/i.test(`${text} ${o.note ?? ""}`) || REACH_WEAPONS.test(o.name ?? "");
  if (o.kind === "weapon") {
    if (o.ranged) return { melee: null, normal: pair ? Number(pair[1]) : Number(text.match(/\d+/)?.[0] ?? 0) || null, long: pair ? Number(pair[2]) : null };
    return { melee: reachy ? 10 : 5, normal: pair ? Number(pair[1]) : null, long: pair ? Number(pair[2]) : null };
  }
  const ft = text.match(/(\d+)\s*(?:feet|foot|ft)/i) ?? text.match(/^(\d+)$/);
  if (ft) return { melee: null, normal: Number(ft[1]), long: null };
  if (o.kind === "spell_attack" && !text) return { melee: null, normal: 120, long: null };
  return { melee: 5, normal: null, long: null };
}

export type RangeCheck = { ok: boolean; mode: "melee" | "ranged"; long: boolean; why: string | null };

/** Can this attack reach that far, and is it at long range (disadvantage)? */
export function checkRange(dist: number, r: Reach): RangeCheck {
  if (r.self) return { ok: true, mode: "ranged", long: false, why: null };
  if (r.melee != null && dist <= r.melee) return { ok: true, mode: "melee", long: false, why: null };
  if (r.normal != null && dist <= r.normal) return { ok: true, mode: "ranged", long: false, why: null };
  if (r.long != null && dist <= r.long) return { ok: true, mode: "ranged", long: true, why: `long range (${dist} ft, normal ${r.normal} ft)` };
  const reach = r.long ?? r.normal ?? r.melee ?? 0;
  return { ok: false, mode: r.normal != null ? "ranged" : "melee", long: false, why: `${dist} ft away: it only reaches ${reach} ft` };
}

// ---------------------------------------------------------------- cover

export type Cover = { level: "none" | "half" | "three-quarters" | "total"; ac: number; why: string | null };

/** Does the straight line from p to q pass through the inside of a square in `cells`? */
function lineHits(p: Pos, q: Pos, cells: (x: number, y: number) => boolean) {
  const n = Math.max(8, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) * 12));
  for (let i = 1; i < n; i++) {
    const x = p.x + ((q.x - p.x) * i) / n, y = p.y + ((q.y - p.y) * i) / n;
    const fx = x - Math.floor(x), fy = y - Math.floor(y);
    if (fx < 0.03 || fx > 0.97 || fy < 0.03 || fy > 0.97) continue; // running along a grid line or a corner: not through
    if (cells(Math.floor(x), Math.floor(y))) return true;
  }
  return false;
}

/**
 * Cover (DMG grid rule): pick the attacker's corner that sees best, draw lines to the four corners of the target's
 * nearest square. Walls blocking 1–2 lines: half (+2 AC), 3: three-quarters (+5), all 4: total (can't be targeted).
 * Creatures in the way give half cover at most.
 */
export function coverOf(from: Body, to: Body, terrain: Terrain, others: Body[]): Cover {
  const fromCorners: Pos[] = [];
  for (let y = from.y; y <= from.y + from.size; y++) for (let x = from.x; x <= from.x + from.size; x++) fromCorners.push({ x, y });
  // the target square nearest to the attacker
  let tx = to.x, ty = to.y, best = Infinity;
  for (let y = to.y; y < to.y + to.size; y++) for (let x = to.x; x < to.x + to.size; x++) {
    const d = Math.hypot(x + 0.5 - (from.x + from.size / 2), y + 0.5 - (from.y + from.size / 2));
    if (d < best) { best = d; tx = x; ty = y; }
  }
  const corners: Pos[] = [{ x: tx, y: ty }, { x: tx + 1, y: ty }, { x: tx, y: ty + 1 }, { x: tx + 1, y: ty + 1 }];
  const wall = (x: number, y: number) => terrain.walls.has(key(x, y));
  const inWay = others.filter((o) => o.id !== from.id && o.id !== to.id);
  const creature = (x: number, y: number) => inWay.some((o) => x >= o.x && x < o.x + o.size && y >= o.y && y < o.y + o.size);
  let bestWalls = 5, bestCreatures = 5;
  for (const c of fromCorners) {
    const w = corners.filter((k) => lineHits(c, k, wall)).length;
    const cr = corners.filter((k) => lineHits(c, k, creature)).length;
    if (w < bestWalls || (w === bestWalls && cr < bestCreatures)) { bestWalls = w; bestCreatures = cr; }
  }
  if (bestWalls === 4) return { level: "total", ac: 0, why: "total cover: no clear line to it" };
  if (bestWalls === 3) return { level: "three-quarters", ac: 5, why: "three-quarters cover (+5 AC)" };
  if (bestWalls >= 1 || bestCreatures >= 1) return { level: "half", ac: 2, why: `half cover (+2 AC)${bestWalls ? "" : ": someone is in the way"}` };
  return { level: "none", ac: 0, why: null };
}

// ---------------------------------------------------------------- moving

export type MoveCtx = {
  cols: number; rows: number; feet: number; diag: Diagonals; terrain: Terrain;
  others: (Body & { hostile: boolean })[]; rules: "2014" | "2024";
};

const footprint = (x: number, y: number, size: number) => {
  const out: [number, number][] = [];
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) out.push([x + i, y + j]);
  return out;
};
const overlaps = (a: Body, x: number, y: number, size: number) => x < a.x + a.size && a.x < x + size && y < a.y + a.size && a.y < y + size;

type Node = { x: number; y: number; parity: number; cost: number };

/**
 * The cheapest way to every square this creature can reach (in squares of movement, before × feet).
 * Difficult terrain costs double; walls and enemies block (an enemy two sizes bigger or smaller can be passed,
 * as difficult terrain); allies can be passed (2024: their space is difficult terrain) but not stopped on.
 */
export function moveCosts(me: Body, ctx: MoveCtx, maxFt = Infinity) {
  const max = Math.floor(maxFt / ctx.feet);
  const best = new Map<string, { cost: number; prev: string | null }>();
  const seen = new Map<string, number>();
  const start: Node = { x: me.x, y: me.y, parity: 0, cost: 0 };
  const queue: Node[] = [start];
  const sk = (n: { x: number; y: number; parity: number }) => `${n.x},${n.y},${n.parity}`;
  seen.set(sk(start), 0);
  best.set(key(me.x, me.y), { cost: 0, prev: null });
  const prevOf = new Map<string, string | null>([[sk(start), null]]);
  while (queue.length) {
    // the cheapest node next (maps are small: a sorted pick is fast enough)
    let bi = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i].cost < queue[bi].cost) bi = i;
    const n = queue.splice(bi, 1)[0];
    if (n.cost > (seen.get(sk(n)) ?? Infinity)) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const x = n.x + dx, y = n.y + dy;
      if (x < 0 || y < 0 || x + me.size > ctx.cols || y + me.size > ctx.rows) continue;
      const cells = footprint(x, y, me.size);
      if (cells.some(([cx, cy]) => ctx.terrain.walls.has(key(cx, cy)))) continue;
      let hard = cells.some(([cx, cy]) => ctx.terrain.difficult.has(key(cx, cy)));
      let blocked = false;
      for (const o of ctx.others) {
        if (o.id === me.id || !overlaps(o, x, y, me.size)) continue;
        if (o.hostile && Math.abs(o.size - me.size) < 2) { blocked = true; break; }
        if (o.hostile || ctx.rules === "2024") hard = true;
      }
      if (blocked) continue;
      const diagonal = !!dx && !!dy;
      let step = 1, parity = n.parity;
      if (diagonal && ctx.diag === "5-10-5") { step = n.parity ? 2 : 1; parity = n.parity ? 0 : 1; }
      const cost = n.cost + step * (hard ? 2 : 1);
      if (cost > max) continue;
      const s = { x, y, parity };
      if (cost >= (seen.get(sk(s)) ?? Infinity)) continue;
      seen.set(sk(s), cost);
      prevOf.set(sk(s), sk(n));
      queue.push({ ...s, cost });
      const k = key(x, y);
      if (cost < (best.get(k)?.cost ?? Infinity)) best.set(k, { cost, prev: sk(n) });
    }
  }
  /** The squares walked to get to (x, y), start first. */
  const pathTo = (x: number, y: number): Pos[] | null => {
    const b = best.get(key(x, y));
    if (!b) return null;
    // find the state with that cost
    const end = [0, 1].map((p) => `${x},${y},${p}`).find((s) => seen.get(s) === b.cost);
    if (!end) return null;
    const out: Pos[] = [];
    for (let s: string | null | undefined = end; s; s = prevOf.get(s)) { const [px, py] = s.split(",").map(Number); out.push({ x: px, y: py }); }
    return out.reverse();
  };
  return { costFt: (x: number, y: number) => { const b = best.get(key(x, y)); return b ? b.cost * ctx.feet : null; }, pathTo, squares: best };
}

/** Squares the creature can end its move on with `leftFt` (not on another creature). */
export function reachableSquares(me: Body, ctx: MoveCtx, leftFt: number): (Pos & { ft: number })[] {
  const m = moveCosts(me, ctx, leftFt);
  const out: (Pos & { ft: number })[] = [];
  for (const [k, v] of m.squares) {
    const [x, y] = k.split(",").map(Number);
    if (x === me.x && y === me.y) continue;
    if (ctx.others.some((o) => o.id !== me.id && overlaps(o, x, y, me.size))) continue;
    out.push({ x, y, ft: v.cost * ctx.feet });
  }
  return out;
}

/** Standing up from Prone costs half your speed; crawling costs double (the app counts the standing). */
export const standUpCost = (speed: number) => Math.ceil(speed / 2 / 5) * 5;

export type Threat = Body & { name: string; reach: number; canReact: boolean };

/**
 * The enemies a move provokes opportunity attacks from: leaving their reach along the path
 * (not after Disengage, and not from anyone who can't take reactions).
 */
export function provoked<T extends Threat>(path: Pos[], mover: Body, enemies: T[], o: { feet: number; diag: Diagonals; disengaged: boolean }): T[] {
  if (o.disengaged || path.length < 2) return [];
  const out: T[] = [];
  for (const e of enemies) {
    if (!e.canReact) continue;
    for (let i = 0; i + 1 < path.length; i++) {
      const a = { ...mover, ...path[i] }, b = { ...mover, ...path[i + 1] };
      if (distanceFt(a, e, o.feet, o.diag) <= e.reach && distanceFt(b, e, o.feet, o.diag) > e.reach) { out.push(e); break; }
    }
  }
  return out;
}
