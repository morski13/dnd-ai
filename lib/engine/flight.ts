// Battle engine, part 7: flying (pure, tested).
//  - Flying speed from a stat block ("30 ft., fly 60 ft. (hover)"), a character's features or species, or a
//    spell for now (Fly: 60 ft).
//  - Going up or down costs movement foot for foot; while in the air, ground terrain doesn't slow you and
//    you pass over trees (20 ft) and boulders (10 ft); walls still block.
//  - A flyer that is knocked Prone, gets speed 0 or can't move falls (unless it can hover): 1d6 per 10 ft, Prone.
import type { Kind } from "./terrain";

export type Flight = { fly: number; hover: boolean };

/** "30 ft., fly 60 ft. (hover)" → fly 60, hover. */
export function flightFromSpeed(text: unknown): Flight {
  const t = String(text ?? "");
  const m = t.match(/fly(?:ing)?\s*(?:speed\s*(?:of\s*)?)?(\d+)/i);
  return { fly: m ? Number(m[1]) : 0, hover: /hover/i.test(t) };
}

const SPECIES_FLY: [RegExp, (walk: number) => number][] = [
  [/aarakocra/i, () => 50],
  [/fairy|owlin/i, (w) => w],
];

/** A character's own flying speed: features ("flying speed of 30 feet", "flying speed equal to your walking speed"), else the species. */
export function characterFlight(c: { species?: string | null; speed?: number | null; features?: (string | { name: string; description?: string })[] }): Flight {
  const walk = c.speed ?? 30;
  let fly = 0;
  for (const f of c.features ?? []) {
    const text = typeof f === "string" ? f : `${f.name} ${f.description ?? ""}`;
    if (!/fly|flying/i.test(text)) continue;
    if (/flying speed equal to your (?:walking )?speed/i.test(text)) fly = Math.max(fly, walk);
    const n = Number(text.match(/flying speed of (\d+)/i)?.[1] ?? 0);
    fly = Math.max(fly, n);
  }
  if (!fly) for (const [re, f] of SPECIES_FLY) if (re.test(c.species ?? "")) { fly = f(walk); break; }
  return { fly, hover: false };
}

/** How tall things are, for flying over them. */
export const TALL: Partial<Record<Kind, number>> = { tree: 20, boulder: 10, wall: Infinity };

/** Can a creature flying `z` ft up pass over this kind of square? */
export const flyOver = (kind: Kind | undefined, z: number) => !kind || z >= (TALL[kind] ?? 0);

/** Going up or down: the feet it costs (5 ft of movement per 5 ft of height). */
export const climbCost = (from: number, to: number) => Math.abs(Math.max(0, to) - Math.max(0, from));

/** Does a flyer fall now? */
export function falls(z: number, conds: readonly string[], f: Flight, speedNow: number): string | null {
  if (z <= 0) return null;
  if (f.hover) return null;
  if (conds.includes("Prone")) return "knocked Prone in the air";
  if (["Paralyzed", "Stunned", "Unconscious", "Petrified", "Restrained", "Grappled"].some((c) => conds.includes(c)) || speedNow <= 0) return "can't move any more";
  return null;
}
