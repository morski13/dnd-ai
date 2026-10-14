// Movement on the battle map (pure). One square = `feet` (5 by default). Diagonals cost the same as straight
// moves (the usual D&D grid rule). Tokens can't end their move on another token.

export type Tok = { id: string; x: number; y: number; size: number };

/** Squares between two tokens' top-left corners, as the grid counts them (a diagonal step = 1). */
export const squares = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** Walking speed from a sheet value or a stat block ("30 ft., fly 60 ft." → 30). */
export function walkSpeed(v: unknown, fallback = 30): number {
  if (typeof v === "number" && v > 0) return v;
  const m = String(v ?? "").match(/(?:^|walk\s*)(\d+)\s*ft/i) ?? String(v ?? "").match(/(\d+)/);
  return m ? Number(m[1]) : fallback;
}

/** How far a token may go this turn: speed (doubled by Haste), plus the speed again for each Dash. */
export function moveBudget(speed: number, dashes: number, hasted = false) {
  const s = speed * (hasted ? 2 : 1);
  return s * (1 + Math.max(0, dashes));
}

const overlaps = (a: Tok, x: number, y: number, size: number) =>
  x < a.x + a.size && a.x < x + size && y < a.y + a.size && a.y < y + size;

/** Is this square free for a token of `size` (inside the map, not on anyone else)? */
export function freeAt(me: Tok, x: number, y: number, others: Tok[], cols: number, rows: number) {
  if (x < 0 || y < 0 || x + me.size > cols || y + me.size > rows) return false;
  return !others.some((o) => o.id !== me.id && overlaps(o, x, y, me.size));
}

/** Every square the token can move to with `feetLeft` (its top-left corner). */
export function reachable(me: Tok, others: Tok[], cols: number, rows: number, feetLeft: number, feet = 5): { x: number; y: number }[] {
  const n = Math.floor(Math.max(0, feetLeft) / feet);
  const out: { x: number; y: number }[] = [];
  for (let y = me.y - n; y <= me.y + n; y++) for (let x = me.x - n; x <= me.x + n; x++) {
    if (x === me.x && y === me.y) continue;
    if (freeAt(me, x, y, others, cols, rows)) out.push({ x, y });
  }
  return out;
}

/** Where tokens start when a map is put in a fight: the party along the bottom, the others along the top. */
export function startingSpots(items: { id: string; side: "party" | "enemy"; size: number }[], cols: number, rows: number): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  const placed: Tok[] = [];
  const put = (it: { id: string; size: number }, rowsOrder: number[]) => {
    const mid = Math.floor(cols / 2);
    const xs = Array.from({ length: cols }, (_, i) => i).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
    for (const y of rowsOrder) for (const x of xs) {
      const t = { id: it.id, x, y, size: it.size };
      if (freeAt(t, x, y, placed, cols, rows)) { placed.push(t); out[it.id] = { x, y }; return; }
    }
    out[it.id] = { x: 0, y: 0 };
  };
  const down = Array.from({ length: rows }, (_, i) => rows - 1 - i), up = Array.from({ length: rows }, (_, i) => i);
  for (const it of items.filter((i) => i.side === "party")) put(it, down.map((y) => Math.max(0, y - it.size + 1)));
  for (const it of items.filter((i) => i.side === "enemy")) put(it, up);
  return out;
}

/** Token size in squares from a creature size word. */
export const sizeSquares = (size: unknown) => ({ large: 2, huge: 3, gargantuan: 4 } as Record<string, number>)[String(size ?? "").toLowerCase().split(/[ ,]/)[0]] ?? 1;

/** Spells that move you without walking, and how far (feet). */
export const TELEPORTS: Record<string, number> = { "Misty Step": 30, "Thunder Step": 90, "Far Step": 60, "Dimension Door": 500 };
