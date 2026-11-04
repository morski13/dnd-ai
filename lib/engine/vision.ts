// Battle engine, part 6: light and sight (pure, tested).
//  - Light: the map's own (bright / dim / dark), plus light sources (a torch: 20 ft bright, 20 ft more dim).
//  - Sight: walls and smoke block the line; darkness needs darkvision (magical darkness beats it);
//    blindsight sees anything close, truesight sees through magical darkness.
//  - What it means in a fight: attacking something you can't see = disadvantage; attacking someone who
//    can't see you = advantage (PHB "Unseen Attackers and Targets").
import { key, lineHits, type Body, type Terrain } from "./space";

export type Senses = { darkvision: number; blindsight: number; truesight: number };
export const NO_SENSES: Senses = { darkvision: 0, blindsight: 0, truesight: 0 };

/** A monster's senses from its stat block ("Darkvision 60 ft.; Blindsight 30 ft."). */
export function sensesFromText(text: string | null | undefined): Senses {
  const t = text ?? "";
  const n = (re: RegExp) => Number(t.match(re)?.[1] ?? 0);
  return { darkvision: n(/darkvision\s*(\d+)/i), blindsight: n(/blindsight\s*(\d+)/i), truesight: n(/truesight\s*(\d+)/i) };
}

const SPECIES_DARKVISION: [RegExp, number][] = [
  [/\bdrow\b|deep gnome|svirfneblin|duergar/i, 120],
  [/dwarf|elf|gnome|half-orc|\borc\b|tiefling|aasimar|goblin|kobold|tabaxi|firbolg|shadar|genasi|satyr|yuan-ti|bugbear|hobgoblin|lizardfolk/i, 60],
];

/** A character's senses: features ("Darkvision (60 ft.)", "Superior Darkvision"), else the species. */
export function characterSenses(c: { species?: string | null; features?: (string | { name: string; description?: string })[] }): Senses {
  let dv = 0;
  for (const f of c.features ?? []) {
    const name = typeof f === "string" ? f : f.name;
    const text = `${name} ${typeof f === "string" ? "" : f.description ?? ""}`;
    if (!/darkvision/i.test(text)) continue;
    const ft = Number(text.match(/darkvision[^0-9]{0,40}(\d+)\s*(?:ft|feet)/i)?.[1] ?? text.match(/(\d+)\s*(?:ft|feet)/i)?.[1] ?? 0);
    dv = Math.max(dv, /superior darkvision/i.test(text) ? Math.max(120, ft) : ft || 60);
  }
  if (!dv) for (const [re, ft] of SPECIES_DARKVISION) if (re.test(c.species ?? "")) { dv = ft; break; }
  return { ...NO_SENSES, darkvision: dv };
}

export type Lit = "bright" | "dim" | "dark";

/** How lit each square is (light sources shine around walls only where they can reach). */
export function lightMap(t: Terrain, cols: number, rows: number): Map<string, Lit> {
  const out = new Map<string, Lit>();
  const rank = { dark: 0, dim: 1, bright: 2 } as const;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) out.set(key(x, y), t.magicDark.has(key(x, y)) ? "dark" : t.ambient);
  if (t.ambient === "bright" || !t.lights.length) return out;
  const blocks = (x: number, y: number) => t.sight.has(key(x, y)) || t.capped.has(key(x, y));
  for (const l of t.lights) {
    const reach = Math.ceil((l.bright + l.dim) / 5);
    for (let y = Math.max(0, l.y - reach); y <= Math.min(rows - 1, l.y + reach); y++) for (let x = Math.max(0, l.x - reach); x <= Math.min(cols - 1, l.x + reach); x++) {
      const k = key(x, y);
      if (t.magicDark.has(k)) continue; // magical darkness: no ordinary light gets in
      const ft = Math.max(Math.abs(x - l.x), Math.abs(y - l.y)) * 5;
      const lvl: Lit = ft <= l.bright ? "bright" : ft <= l.bright + l.dim ? "dim" : "dark";
      if (rank[lvl] <= rank[out.get(k)!]) continue;
      if ((x !== l.x || y !== l.y) && lineHits({ x: l.x + 0.5, y: l.y + 0.5 }, { x: x + 0.5, y: y + 0.5 }, blocks)) continue;
      out.set(k, lvl);
    }
  }
  return out;
}

/** Feet between two squares' centres, the way the grid counts them. */
const ftBetween = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) * 5;

/**
 * Can `viewer` see square (x, y)? Not through walls or smoke; dark squares only with darkvision in range
 * (magical darkness only with truesight); blindsight sees anything in its range, even through smoke.
 */
export function seesSquare(viewer: Body, senses: Senses, x: number, y: number, t: Terrain, light: Map<string, Lit>): boolean {
  const k = key(x, y);
  const from = { x: viewer.x + viewer.size / 2, y: viewer.y + viewer.size / 2 };
  const near = { x: Math.min(Math.max(x, viewer.x), viewer.x + viewer.size - 1), y: Math.min(Math.max(y, viewer.y), viewer.y + viewer.size - 1) };
  const dist = ftBetween(near, { x, y });
  if (x >= viewer.x && x < viewer.x + viewer.size && y >= viewer.y && y < viewer.y + viewer.size) return true;
  const walls = (cx: number, cy: number) => t.sight.has(key(cx, cy)) || t.capped.has(key(cx, cy));
  const blocked = lineHits(from, { x: x + 0.5, y: y + 0.5 }, walls);
  if (senses.blindsight && dist <= senses.blindsight && !blocked) return true;
  if (blocked) return false;
  // smoke: you can't see into it or past it
  if (t.heavy.has(k) && !(t.magicDark.has(k) && senses.truesight >= dist)) return false;
  if (lineHits(from, { x: x + 0.5, y: y + 0.5 }, (cx, cy) => t.heavy.has(key(cx, cy)) && !(t.magicDark.has(key(cx, cy)) && senses.truesight > 0))) return false;
  const lit = light.get(k) ?? "bright";
  if (lit !== "dark") return true;
  if (t.magicDark.has(k)) return senses.truesight >= dist;
  return senses.darkvision >= dist || senses.truesight >= dist;
}

/** Every square the viewer sees. */
export function visibleSquares(viewer: Body, senses: Senses, t: Terrain, light: Map<string, Lit>, cols: number, rows: number): Set<string> {
  const out = new Set<string>();
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (seesSquare(viewer, senses, x, y, t, light)) out.add(key(x, y));
  return out;
}

/** Can the viewer see this creature (any of the squares it takes up)? */
export function seesBody(viewer: Body, senses: Senses, target: Body, t: Terrain, light: Map<string, Lit>, invisible = false): boolean {
  if (invisible && !(senses.blindsight || senses.truesight)) return false;
  for (let j = 0; j < target.size; j++) for (let i = 0; i < target.size; i++) if (seesSquare(viewer, senses, target.x + i, target.y + j, t, light)) return true;
  return false;
}

/** Light where a creature stands: dim light (or a lightly obscured square) gives disadvantage on Perception. */
export function lightNote(target: Body, t: Terrain, light: Map<string, Lit>): string | null {
  const k = key(target.x, target.y);
  if (t.obscured.has(k)) return "lightly obscured (tall grass / bushes): Perception to see it has disadvantage";
  if (light.get(k) === "dim") return "in dim light: Perception to see it has disadvantage";
  return null;
}
