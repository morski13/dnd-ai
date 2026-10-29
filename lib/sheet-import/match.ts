// Finds a sheet's spells and items in the app's libraries, by name, forgiving the ways sheets write them:
// "Crossbow, Light" = "Light Crossbow", "Daggers" = "Dagger", "Arrows (20)" = "Arrows", "Shield of faith" = "Shield of Faith".
// Pure (tested); the database rows are passed in.
import { key } from "./parse";

/** Every spelling we'd accept for one library name. */
function variants(name: string): string[] {
  const out = new Set<string>();
  const base = name.replace(/\([^)]*\)/g, " ").trim();
  for (const n of [name, base]) {
    const k = key(n);
    if (!k) continue;
    out.add(k);
    // "Crossbow, light" ↔ "light crossbow"
    const comma = n.split(",");
    if (comma.length === 2) out.add(key(`${comma[1]} ${comma[0]}`));
  }
  return [...out];
}
/** Singular forms of a name someone typed ("daggers" → "dagger", "torches" → "torch"). */
function singulars(k: string): string[] {
  const out = [k];
  if (k.endsWith("ies")) out.push(`${k.slice(0, -3)}y`);
  if (k.endsWith("es")) out.push(k.slice(0, -2));
  if (k.endsWith("s")) out.push(k.slice(0, -1));
  return out;
}

export function makeIndex<T extends { name: string }>(rows: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows) for (const v of variants(r.name)) {
    if (!m.has(v)) m.set(v, r);
    for (const s of singulars(v)) if (!m.has(s)) m.set(s, r); // library "Arrows" found by "arrow" too
  }
  return m;
}

export function findIn<T extends { name: string }>(index: Map<string, T>, name: string): T | null {
  for (const v of variants(name)) for (const s of singulars(v)) { const hit = index.get(s); if (hit) return hit; }
  // magic "+1" written on the sheet: "Dagger +1", "+1 Longsword"
  const plain = name.replace(/\s*\+\d\s*/g, " ").trim();
  if (plain !== name) return findIn(index, plain);
  return null;
}
