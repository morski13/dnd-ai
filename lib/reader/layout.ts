// Places mind-map nodes so linked things sit close and nothing overlaps. Same input → same picture,
// on the server and in every browser: only + − × ÷ and sqrt are used after the start (those give the exact
// same result everywhere), and the start positions are rounded, so the page never "jumps" when it loads.
export type Box = { id: string; w: number; h: number; group: number; pinned?: boolean };
export type Placed = { id: string; x: number; y: number; w: number; h: number };

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

export function layout(boxes: Box[], links: { a: string; b: string; weight?: number }[], opts: { iterations?: number; seed?: number } = {}): Placed[] {
  const n = boxes.length;
  if (!n) return [];
  const rnd = seeded(opts.seed ?? 7);
  const groups = Math.max(1, ...boxes.map((b) => b.group + 1));
  const R = 60 + 34 * Math.sqrt(n);
  // start: each kind of thing in its own slice of a circle
  const pos = boxes.map((b, i) => {
    const a = (b.group / groups) * Math.PI * 2 + rnd() * (Math.PI * 2 / groups) * 0.8;
    const r = R * (0.35 + 0.65 * rnd());
    const r3 = (v: number) => Math.round(v * 1000) / 1000;
    return { x: r3(Math.cos(a) * r * 0.6 + (i % 3)), y: r3(Math.sin(a) * r * 1.3), vx: 0, vy: 0 };
  });
  const idx = new Map(boxes.map((b, i) => [b.id, i]));
  const L = links.map((l) => ({ i: idx.get(l.a)!, j: idx.get(l.b)!, w: Math.min(3, l.weight ?? 1) })).filter((l) => l.i != null && l.j != null && l.i !== l.j);
  const deg = new Array(n).fill(0);
  for (const l of L) { deg[l.i]++; deg[l.j]++; }
  const k = 95;
  const iters = opts.iterations ?? 360;
  for (let it = 0; it < iters; it++) {
    const t = 1 - it / iters;
    const fx = new Array(n).fill(0), fy = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 1) { dx = rnd() - 0.5; dy = rnd() - 0.5; d2 = 1; }
      const d = Math.sqrt(d2);
      const f = (k * k) / d2 * 1.4;
      fx[i] += (dx / d) * f; fy[i] += (dy / d) * f; fx[j] -= (dx / d) * f; fy[j] -= (dy / d) * f;
    }
    for (const { i, j, w } of L) {
      const dx = pos[j].x - pos[i].x, dy = pos[j].y - pos[i].y;
      const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const f = ((d - k * 1.1) / k) * 18 * (0.7 + w * 0.15);
      const si = 1 / Math.sqrt(deg[i] + 1), sj = 1 / Math.sqrt(deg[j] + 1);
      fx[i] += (dx / d) * f * sj * 2; fy[i] += (dy / d) * f * sj * 2;
      fx[j] -= (dx / d) * f * si * 2; fy[j] -= (dy / d) * f * si * 2;
    }
    for (let i = 0; i < n; i++) {
      fx[i] -= pos[i].x * 0.05; fy[i] -= pos[i].y * 0.012; // pull to the middle, harder sideways: phones are tall and labels are wide
      const step = 14 * t + 1;
      const m = Math.sqrt(fx[i] * fx[i] + fy[i] * fy[i]) || 1;
      pos[i].x += (fx[i] / m) * Math.min(step, m);
      pos[i].y += (fy[i] / m) * Math.min(step, m);
    }
  }
  // push apart boxes that still overlap (labels must stay readable)
  for (let pass = 0; pass < 80; pass++) {
    let moved = false;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = boxes[i], b = boxes[j];
      const ox = (a.w + b.w) / 2 + 14 - Math.abs(pos[i].x - pos[j].x);
      const oy = (a.h + b.h) / 2 + 12 - Math.abs(pos[i].y - pos[j].y);
      if (ox > 0 && oy > 0) {
        moved = true;
        if (ox / (a.w + b.w) < oy / (a.h + b.h)) { const s = (pos[i].x < pos[j].x ? -1 : 1) * ox / 2; pos[i].x += s; pos[j].x -= s; }
        else { const s = (pos[i].y < pos[j].y ? -1 : 1) * oy / 2; pos[i].y += s; pos[j].y -= s; }
      }
    }
    if (!moved) break;
  }
  return boxes.map((b, i) => ({ id: b.id, x: Math.round(pos[i].x * 10) / 10, y: Math.round(pos[i].y * 10) / 10, w: b.w, h: b.h }));
}

/** Bounding box of the placed nodes, with a margin. */
export function bounds(p: Placed[], margin = 24) {
  if (!p.length) return { x: 0, y: 0, w: 100, h: 100 };
  const x0 = Math.min(...p.map((q) => q.x - q.w / 2)) - margin, x1 = Math.max(...p.map((q) => q.x + q.w / 2)) + margin;
  const y0 = Math.min(...p.map((q) => q.y - q.h / 2)) - margin, y1 = Math.max(...p.map((q) => q.y + q.h / 2)) + margin;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
