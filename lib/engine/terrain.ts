// Battle engine, part 5: what each kind of terrain does (pure, tested).
// The DM paints squares with a kind (tree, water, barrels…), a height, and hazards.
// Stored on the map as terrain v2: { v: 2, cells: { "3,4": { k: "tree", h: 10 } } }.
// The old format ({ walls: [...], difficult: [...] }) still reads.

export type Kind =
  | "wall" | "tree" | "boulder" | "bush" | "grass" | "rocks" | "water" | "deep-water" | "barrel" | "crate" | "difficult"
  | "fire" | "lava" | "spikes" | "acid" | "smoke" | "darkness" | "torch" | "ground";

export type HazardRule = { dice: string; type: string; when: "enter" | "start" | "both"; note: string };

/** The rules of each kind. `cover`: what it gives when it's between attacker and target. */
export const KINDS: Record<Kind, {
  label: string; blocksMove: boolean; difficult: boolean; blocksSight: boolean; cover: "half" | "three-quarters" | "total" | null;
  lightlyObscured?: boolean; swim?: boolean; hazard?: HazardRule; image: string; color: string;
  heavilyObscured?: boolean;   // smoke, fog, magical darkness: nobody sees into or through it
  magicalDark?: boolean;       // darkvision doesn't see through it
  light?: { bright: number; dim: number }; // a light source on this square (feet)
}> = {
  wall:         { label: "Wall", blocksMove: true, difficult: false, blocksSight: true, cover: "total", image: "wall", color: "#16120e" },
  tree:         { label: "Tree", blocksMove: true, difficult: false, blocksSight: true, cover: "three-quarters", image: "tree", color: "#2f5d2a" },
  boulder:      { label: "Boulder", blocksMove: true, difficult: false, blocksSight: true, cover: "three-quarters", image: "boulder", color: "#6d6a63" },
  bush:         { label: "Bush", blocksMove: false, difficult: true, blocksSight: false, cover: "half", lightlyObscured: true, image: "bush", color: "#4f7a3a" },
  grass:        { label: "Tall grass", blocksMove: false, difficult: true, blocksSight: false, cover: null, lightlyObscured: true, image: "grass", color: "#7f9a3c" },
  rocks:        { label: "Rocks", blocksMove: false, difficult: true, blocksSight: false, cover: null, image: "rocks", color: "#8a847a" },
  water:        { label: "Shallow water", blocksMove: false, difficult: true, blocksSight: false, cover: null, image: "water-shallow", color: "#3f7fa8" },
  "deep-water": { label: "Deep water", blocksMove: false, difficult: true, blocksSight: false, cover: null, swim: true, image: "water-deep", color: "#1f4f7a" },
  barrel:       { label: "Barrels", blocksMove: false, difficult: true, blocksSight: false, cover: "half", image: "barrel", color: "#8a5a2b" },
  crate:        { label: "Crates", blocksMove: false, difficult: true, blocksSight: false, cover: "half", image: "crate", color: "#9b7442" },
  difficult:    { label: "Difficult", blocksMove: false, difficult: true, blocksSight: false, cover: null, image: "", color: "#C9A05A" },
  fire:         { label: "Fire", blocksMove: false, difficult: false, blocksSight: false, cover: null, hazard: { dice: "1d10", type: "fire", when: "both", note: "entering or starting a turn in it" }, image: "fire", color: "#e0662a" },
  lava:         { label: "Lava", blocksMove: false, difficult: true, blocksSight: false, cover: null, hazard: { dice: "10d10", type: "fire", when: "both", note: "entering or starting a turn in it" }, image: "lava", color: "#c43b12" },
  spikes:       { label: "Spikes", blocksMove: false, difficult: true, blocksSight: false, cover: null, hazard: { dice: "2d4", type: "piercing", when: "enter", note: "for every 5 ft moved through it" }, image: "spikes", color: "#7a6a5a" },
  acid:         { label: "Acid", blocksMove: false, difficult: true, blocksSight: false, cover: null, hazard: { dice: "2d6", type: "acid", when: "both", note: "entering or starting a turn in it" }, image: "acid", color: "#6fae2a" },
  smoke:        { label: "Smoke / fog", blocksMove: false, difficult: false, blocksSight: false, cover: null, heavilyObscured: true, image: "", color: "#9aa0a6" },
  darkness:     { label: "Magical darkness", blocksMove: false, difficult: false, blocksSight: false, cover: null, heavilyObscured: true, magicalDark: true, image: "", color: "#05040a" },
  torch:        { label: "Light (torch)", blocksMove: false, difficult: false, blocksSight: false, cover: null, light: { bright: 20, dim: 20 }, image: "torch", color: "#f2c14e" },
  ground:       { label: "Ground (height only)", blocksMove: false, difficult: false, blocksSight: false, cover: null, image: "", color: "transparent" },
};
export const KIND_LIST = Object.keys(KINDS) as Kind[];
export const isKind = (k: unknown): k is Kind => typeof k === "string" && k in KINDS;

export type Cell = { k: Kind; h?: number };         // h: height in feet (+ hill, ledge; − pit)
/** light: the map's light (outdoors by day = bright; a dim cave; a dark dungeon). fog: players only see what their characters see. */
export type Light = "bright" | "dim" | "dark";
/**
 * Objects placed on the map: a tree, a boulder, barrels… as big as the DM wants (1 square = 5 ft, up to 6×6 =
 * 30 ft) and as tall as the DM wants (for flying over them). Their rules cover every square they take.
 */
export type MapObject = { id: string; k: Kind; x: number; y: number; size: number; tall?: number };
export const OBJECT_KINDS: Kind[] = ["tree", "boulder", "bush", "rocks", "barrel", "crate", "torch"];
/** How tall an object is by default (feet). */
export const DEFAULT_TALL: Partial<Record<Kind, number>> = { tree: 20, boulder: 10, bush: 5, rocks: 0, barrel: 5, crate: 5, torch: 5 };
export type TerrainData = { v: 2; cells: Record<string, Cell>; objects?: MapObject[]; light?: Light; fog?: boolean };

const okKey = (s: string) => /^\d+,\d+$/.test(s);

/** Reads any stored terrain (old walls/difficult lists, or v2). */
export function readTerrain(raw: unknown): TerrainData {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const cells: Record<string, Cell> = {};
  for (const k of (Array.isArray(r.walls) ? r.walls : []).map(String)) if (okKey(k)) cells[k] = { k: "wall" };
  for (const k of (Array.isArray(r.difficult) ? r.difficult : []).map(String)) if (okKey(k) && !cells[k]) cells[k] = { k: "difficult" };
  const rc = (r.cells && typeof r.cells === "object" ? r.cells : {}) as Record<string, unknown>;
  let n = 0;
  for (const [k, v] of Object.entries(rc)) {
    if (!okKey(k) || ++n > 20000) continue;
    const c = (v ?? {}) as Record<string, unknown>;
    const kind = isKind(c.k) ? c.k : "ground";
    const h = Math.max(-200, Math.min(200, Math.round(Number(c.h) || 0)));
    if (kind === "ground" && !h) continue;
    cells[k] = h ? { k: kind, h } : { k: kind };
  }
  const light: Light | undefined = r.light === "dim" || r.light === "dark" || r.light === "bright" ? r.light : undefined;
  const objects: MapObject[] = [];
  for (const raw of (Array.isArray(r.objects) ? r.objects : []).slice(0, 2000)) {
    const o = (raw ?? {}) as Record<string, unknown>;
    if (!isKind(o.k) || !OBJECT_KINDS.includes(o.k)) continue;
    const x = Math.floor(Number(o.x)), y = Math.floor(Number(o.y));
    if (!(x >= 0 && y >= 0 && x < 200 && y < 200)) continue;
    const size = Math.max(1, Math.min(6, Math.round(Number(o.size) || 1)));
    const tall = o.tall == null ? undefined : Math.max(0, Math.min(500, Math.round(Number(o.tall) || 0)));
    objects.push({ id: String(o.id ?? `${x},${y}`).slice(0, 40), k: o.k, x, y, size, ...(tall !== undefined ? { tall } : {}) });
  }
  return { v: 2, cells, ...(objects.length ? { objects } : {}), ...(light ? { light } : {}), ...(r.fog ? { fog: true } : {}) };
}

/** Paint squares: a kind (keeps the height), a height (keeps the kind), or clear. */
export function paint(t: TerrainData, keys: string[], what: { kind?: Kind | "clear"; height?: number }): TerrainData {
  const cells = { ...t.cells };
  const keep = { ...(t.objects?.length ? { objects: t.objects } : {}), ...(t.light ? { light: t.light } : {}), ...(t.fog ? { fog: true } : {}) };
  for (const k of keys) {
    if (!okKey(k)) continue;
    const old = cells[k];
    if (what.kind === "clear") { delete cells[k]; continue; }
    const kind = what.kind ?? old?.k ?? "ground";
    const h = what.height !== undefined ? Math.max(-200, Math.min(200, Math.round(what.height))) : old?.h ?? 0;
    if (kind === "ground" && !h) delete cells[k]; else cells[k] = h ? { k: kind, h } : { k: kind };
  }
  return { v: 2, cells, ...keep };
}

/** The squares of a brush stroke between two points (a straight line of squares, `size` wide). */
export function strokeSquares(a: { x: number; y: number }, b: { x: number; y: number }, size = 1): string[] {
  const out = new Set<string>();
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 3));
  const r = Math.max(0, Math.floor((size - 1) / 2));
  for (let i = 0; i <= n; i++) {
    const x = Math.floor(a.x + ((b.x - a.x) * i) / n), y = Math.floor(a.y + ((b.y - a.y) * i) / n);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (x + dx >= 0 && y + dy >= 0) out.add(`${x + dx},${y + dy}`);
  }
  return [...out];
}

/** Falling: 1d6 bludgeoning per 10 ft, at most 20d6. */
export function fallDice(feet: number): string | null {
  const n = Math.min(20, Math.floor(Math.max(0, feet) / 10));
  return n ? `${n}d6` : null;
}

/** The squares an object takes up. */
export function objectSquares(o: MapObject): string[] {
  const out: string[] = [];
  for (let j = 0; j < o.size; j++) for (let i = 0; i < o.size; i++) out.push(`${o.x + i},${o.y + j}`);
  return out;
}

/** Put an object on the map (objects it would overlap are replaced). */
export function placeObject(t: TerrainData, o: MapObject, cols: number, rows: number): TerrainData {
  const size = Math.max(1, Math.min(6, Math.round(o.size)));
  const x = Math.max(0, Math.min(cols - size, Math.floor(o.x))), y = Math.max(0, Math.min(rows - size, Math.floor(o.y)));
  const placed = { ...o, x, y, size };
  const overlaps = (a: MapObject) => a.x < x + size && x < a.x + a.size && a.y < y + size && y < a.y + a.size;
  return { ...t, objects: [...(t.objects ?? []).filter((a) => !overlaps(a)), placed] };
}

/** The object at a square, if any (the topmost). */
export function objectAt(t: TerrainData, x: number, y: number): MapObject | null {
  const list = t.objects ?? [];
  for (let i = list.length - 1; i >= 0; i--) { const o = list[i]; if (x >= o.x && x < o.x + o.size && y >= o.y && y < o.y + o.size) return o; }
  return null;
}

export function removeObject(t: TerrainData, id: string): TerrainData {
  return { ...t, objects: (t.objects ?? []).filter((o) => o.id !== id) };
}
