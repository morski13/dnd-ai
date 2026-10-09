// The shapes of the dice: corners, faces and which number sits on which face.
// Pure math, no three.js here, so it can be tested.

export type DieType = "d4" | "d6" | "d8" | "d10" | "d12" | "d20" | "d100";
export type V3 = [number, number, number];

export type Face = {
  verts: number[];      // corner indexes, counter-clockwise seen from outside
  normal: V3;           // outward, unit length
  centroid: V3;
};

export type Shape = {
  type: DieType;
  vertices: V3[];
  faces: Face[];
  /** Number shown on each face (index = face). For d4: number on each corner (index = vertex). */
  labels: number[];
  readsVertex: boolean; // d4: the result is the corner pointing up
  size: number;
};

const PHI = (1 + Math.sqrt(5)) / 2;

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const norm = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];

/** Finds the flat faces of a convex shape from its corners. */
export function hullFaces(vertices: V3[]): Face[] {
  const eps = 1e-6;
  const faces: Face[] = [];
  const seen = new Set<string>();
  const n = vertices.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      for (let k = j + 1; k < n; k++) {
        let normal = cross(sub(vertices[j], vertices[i]), sub(vertices[k], vertices[i]));
        if (Math.hypot(...normal) < eps) continue;
        normal = norm(normal);
        let d = dot(normal, vertices[i]);
        // Every other corner must be on one side of this plane.
        let pos = false, neg = false;
        for (const v of vertices) { const s = dot(normal, v) - d; if (s > eps) pos = true; if (s < -eps) neg = true; }
        if (pos && neg) continue;
        if (pos) { normal = scale(normal, -1); d = -d; }
        const on = vertices.map((v, idx) => (Math.abs(dot(normal, v) - d) < 1e-4 ? idx : -1)).filter((x) => x >= 0);
        const key = on.join(",");
        if (seen.has(key)) continue;
        seen.add(key);
        const centroid = scale(on.reduce<V3>((a, idx) => add(a, vertices[idx]), [0, 0, 0]), 1 / on.length);
        // Sort corners counter-clockwise around the outward normal.
        const u = norm(sub(vertices[on[0]], centroid));
        const w = cross(normal, u);
        const sorted = [...on].sort((a, b) => {
          const pa = sub(vertices[a], centroid), pb = sub(vertices[b], centroid);
          return Math.atan2(dot(pa, w), dot(pa, u)) - Math.atan2(dot(pb, w), dot(pb, u));
        });
        faces.push({ verts: sorted, normal, centroid });
      }
  return faces;
}

function corners(type: DieType): V3[] {
  switch (type) {
    case "d4":
      return [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
    case "d6":
      return [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [x, y, z] as V3)));
    case "d8":
      return [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    case "d12": {
      const a = 1 / PHI, b = PHI;
      const v: V3[] = [];
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x, y, z]);
      for (const s of [-1, 1]) for (const t of [-1, 1]) { v.push([0, s * a, t * b]); v.push([s * a, t * b, 0]); v.push([s * b, 0, t * a]); }
      return v;
    }
    case "d20": {
      const v: V3[] = [];
      for (const s of [-1, 1]) for (const t of [-1, 1]) { v.push([0, s, t * PHI]); v.push([s, t * PHI, 0]); v.push([t * PHI, 0, s]); }
      return v;
    }
    case "d10":
    case "d100": {
      // Pentagonal trapezohedron: two tips and a zig-zag ring of 10 corners.
      const h = 0.1;
      const ring: V3[] = Array.from({ length: 10 }, (_, k) => {
        const a = (k * Math.PI) / 5;
        return [Math.cos(a), k % 2 ? -h : h, Math.sin(a)];
      });
      // Height of the tips that makes each kite flat: plane through ring 0 (up), 1 (down), 2 (up), at x=z=0.
      const n = cross(sub(ring[1], ring[0]), sub(ring[2], ring[0]));
      const tip = dot(n, ring[0]) / n[1];
      return [[0, tip, 0], [0, -tip, 0], ...ring];
    }
  }
}

const SIZE: Record<DieType, number> = { d4: 1.15, d6: 0.82, d8: 1.0, d10: 0.95, d12: 0.95, d20: 1.0, d100: 0.95 };

const shapeCache = new Map<DieType, Shape>();

export function makeShape(type: DieType): Shape {
  const hit = shapeCache.get(type);
  if (hit) return cloneShape(hit);
  const raw = corners(type);
  const r = Math.max(...raw.map((v) => Math.hypot(...v)));
  const vertices = raw.map((v) => scale(v, SIZE[type] / r));
  const faces = hullFaces(vertices);
  const readsVertex = type === "d4";
  const labels = readsVertex ? [1, 2, 3, 4] : defaultLabels(type, faces);
  const shape = { type, vertices, faces, labels, readsVertex, size: SIZE[type] };
  shapeCache.set(type, shape);
  return cloneShape(shape);
}

const cloneShape = (s: Shape): Shape => ({ ...s, labels: [...s.labels] });

/** Opposite faces add up to (max + 1) like real dice, where the shape allows it. */
function defaultLabels(type: DieType, faces: Face[]): number[] {
  const count = faces.length;
  const labels = new Array<number>(count).fill(0);
  const used = new Set<number>();
  let next = 1;
  for (let i = 0; i < count; i++) {
    if (labels[i]) continue;
    const opp = faces.findIndex((f, j) => j !== i && !labels[j] && dot(f.normal, faces[i].normal) < -0.999);
    labels[i] = next; used.add(next);
    if (opp >= 0) { labels[opp] = count + 1 - next; used.add(count + 1 - next); }
    while (used.has(next)) next++;
  }
  // d10 faces have no exact opposite, fill any gaps in order
  for (let i = 0; i < count; i++) if (!labels[i]) { while (used.has(next)) next++; labels[i] = next; used.add(next); }
  return type === "d100" ? labels : labels;
}

/** What is written on a face: d10 shows 0–9, the d100 tens die 00–90. */
export function labelText(type: DieType, value: number): string {
  if (type === "d100") return value === 10 ? "00" : `${value * 10}`;
  if (type === "d10") return value === 10 ? "0" : String(value);
  return String(value);
}

export function maxValue(type: DieType): number {
  return type === "d100" ? 10 : Number(type.slice(1));
}

// ---------------------------------------------------------------------------
// Reading a die and making it show the number we need

export type Quat = [number, number, number, number]; // x, y, z, w

export function rotate(q: Quat, v: V3): V3 {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1];
  const iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0];
  const iw = -x * v[0] - y * v[1] - z * v[2];
  return [
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x,
  ];
}

const UP: V3 = [0, 1, 0];

/** Which face (or for a d4, which corner) points up, and how flat the die is lying (1 = perfectly flat). */
export function upIndex(shape: Shape, q: Quat): { index: number; flatness: number } {
  if (shape.readsVertex) {
    let best = -1, bestDot = -Infinity;
    shape.vertices.forEach((v, i) => { const d = dot(norm(rotate(q, v)), UP); if (d > bestDot) { bestDot = d; best = i; } });
    // a d4 lies flat when its bottom face points straight down
    const bottom = Math.min(...shape.faces.map((f) => dot(rotate(q, f.normal), UP)));
    return { index: best, flatness: -bottom };
  }
  let best = -1, bestDot = -Infinity;
  shape.faces.forEach((f, i) => { const d = dot(rotate(q, f.normal), UP); if (d > bestDot) { bestDot = d; best = i; } });
  return { index: best, flatness: bestDot };
}

/** Swap two numbers on the die so the face that landed up shows `value`. */
export function forceValue(shape: Shape, upIdx: number, value: number): Shape {
  const labels = [...shape.labels];
  const from = labels.indexOf(value);
  if (from < 0 || from === upIdx) return { ...shape, labels };
  [labels[from], labels[upIdx]] = [labels[upIdx], labels[from]];
  return { ...shape, labels };
}

/** The number a die shows when lying with rotation q. */
export function readValue(shape: Shape, q: Quat): number {
  return shape.labels[upIndex(shape, q).index];
}

// ---------------------------------------------------------------------------
// From a roll result to the dice to throw

export type ThrowDie = { type: DieType; value: number; dropped: boolean; group: number };

const SUPPORTED = new Set([4, 6, 8, 10, 12, 20, 100]);

/**
 * Turns the server's result into dice to throw. `expression` is the rolled expression
 * ("2d20kh1+5", "1d6+2d6+3"); `diceAll` lists every die in order, `dice` the ones that counted.
 */
export function diceToThrow(expression: string, diceAll: number[], dice: number[], max = 14): ThrowDie[] {
  const out: ThrowDie[] = [];
  const re = /(\d*)d(\d+)(?:k[hl]?\d+)?/gi;
  let m: RegExpExecArray | null;
  let i = 0;
  const kept = [...dice];
  let group = 0;
  while ((m = re.exec(expression))) {
    const count = m[1] ? Number(m[1]) : 1;
    const sides = Number(m[2]);
    for (let k = 0; k < count && i < diceAll.length; k++, i++) {
      const v = diceAll[i];
      const keptAt = kept.indexOf(v);
      const dropped = keptAt < 0;
      if (!dropped) kept.splice(keptAt, 1);
      if (!SUPPORTED.has(sides)) continue;
      if (sides === 100) {
        const ones = v % 10;
        const tens = Math.floor((v % 100) / 10);
        out.push({ type: "d100", value: tens === 0 ? 10 : tens, dropped, group });
        out.push({ type: "d10", value: ones === 0 ? 10 : ones, dropped, group });
      } else {
        out.push({ type: `d${sides}` as DieType, value: v, dropped, group });
      }
    }
    group++;
  }
  return out.slice(0, max);
}
