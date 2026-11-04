// Battle engine, part 9: what spells do beyond their dice (pure, tested).
//  - on a failed save: conditions (Hold Person: Paralyzed, saving again at the end of each turn)
//  - buffs on the creatures you pick (Bless +1d4, Shield of Faith +2 AC, Haste, Fly)
//  - on a hit (Guiding Bolt: the next attack against it has advantage)
//  - lasting areas (zones) on the battle map: Spirit Guardians, Moonbeam, Cloudkill, Spike Growth, Web…
// A curated list for the spells the table uses most; any other SRD spell is read from its text.
import type { Ability, SpellInfo } from "../rules";
import { place, squareIn, squaresIn, type AreaSpec, type Placed } from "../maps/area";
import type { Tok } from "../maps/move";
import type { Terrain } from "./space";

export type ZoneRule = {
  when: ("enter" | "start" | "end")[];       // when a creature is affected: entering, starting or ending its turn there
  save?: Ability;
  damage?: boolean;                          // the spell's own damage (at the slot it was cast with)
  half?: boolean;                            // half on a successful save
  conditions?: string[];                     // on a failed save (Web: Restrained)
  perSquare?: { dice: string; type: string }; // for every 5 ft moved inside (Spike Growth)
  difficult?: boolean; heavy?: boolean; light?: boolean; magicDark?: boolean; dim?: boolean;
  follows?: boolean;                         // moves with the caster (Spirit Guardians)
  drift?: number;                            // moves this many feet away from the caster at the start of the caster's turns (Cloudkill)
  friendsSafe?: boolean;                     // the caster's side isn't affected (Spirit Guardians: you designate creatures)
};

export type SpellRule = {
  save?: Ability;                            // the save, when the spell's dice data has none (Hold Person)
  noCastDamage?: boolean;                    // the data has dice, but casting it deals none (Web)
  onFail?: { conditions: string[]; saveEnds?: boolean; ac?: number; bonusDice?: string; untilEndOfNextTurn?: boolean };
  buff?: { conditions?: string[]; ac?: number; bonusDice?: string; fly?: number };
  onHit?: { conditions: string[] };          // until the end of the caster's next turn
  zone?: ZoneRule;
};

/** The spells the table uses most, by name (SRD 5.2.1 wording, which matches 2014 for these). */
export const SPELL_RULES: Record<string, SpellRule> = {
  "Hold Person": { save: "WIS", onFail: { conditions: ["Paralyzed"], saveEnds: true } },
  "Hold Monster": { save: "WIS", onFail: { conditions: ["Paralyzed"], saveEnds: true } },
  "Hideous Laughter": { save: "WIS", onFail: { conditions: ["Prone", "Incapacitated"], saveEnds: true } },
  "Blindness/Deafness": { save: "CON", onFail: { conditions: ["Blinded"], saveEnds: true } },
  "Color Spray": { save: "CON", onFail: { conditions: ["Blinded"], untilEndOfNextTurn: true } },
  "Faerie Fire": { save: "DEX", onFail: { conditions: ["Outlined"] } },
  "Bane": { save: "CHA", onFail: { conditions: ["Baned"], bonusDice: "-1d4" } },
  "Slow": { save: "WIS", onFail: { conditions: ["Slowed"], ac: -2, saveEnds: true } },
  "Sleep": { save: "WIS", onFail: { conditions: ["Incapacitated"], untilEndOfNextTurn: true } },
  "Command": { save: "WIS", onFail: { conditions: ["Prone"] } },
  "Charm Person": { save: "WIS", onFail: { conditions: ["Charmed"] } },
  "Charm Monster": { save: "WIS", onFail: { conditions: ["Charmed"] } },
  "Fear": { save: "WIS", onFail: { conditions: ["Frightened"], saveEnds: true } },
  "Hypnotic Pattern": { save: "WIS", onFail: { conditions: ["Charmed", "Incapacitated"] } },
  "Banishment": { save: "CHA", onFail: { conditions: ["Incapacitated"] } },
  "Dominate Person": { save: "WIS", onFail: { conditions: ["Charmed"] } },
  "Dominate Monster": { save: "WIS", onFail: { conditions: ["Charmed"] } },
  "Bless": { buff: { conditions: ["Blessed"], bonusDice: "1d4" } },
  "Shield of Faith": { buff: { ac: 2 } },
  "Haste": { buff: { conditions: ["Hasted"], ac: 2 } },
  "Fly": { buff: { fly: 60 } },
  "Invisibility": { buff: { conditions: ["Invisible"] } },
  "Greater Invisibility": { buff: { conditions: ["Invisible"] } },
  "Blur": { buff: { conditions: ["Blurred"] } },
  "Guiding Bolt": { onHit: { conditions: ["Outlined"] } },
  "Spirit Guardians": { noCastDamage: true, zone: { when: ["enter", "end"], save: "WIS", damage: true, half: true, follows: true, friendsSafe: true } },
  "Moonbeam": { zone: { when: ["enter", "end"], save: "CON", damage: true, half: true, dim: true } },
  "Cloudkill": { zone: { when: ["enter", "end"], save: "CON", damage: true, half: true, heavy: true, drift: 10 } },
  "Spike Growth": { zone: { when: ["enter"], perSquare: { dice: "2d4", type: "piercing" }, difficult: true } },
  "Web": { noCastDamage: true, zone: { when: ["enter", "start"], save: "DEX", conditions: ["Restrained"], difficult: true, light: true } },
  "Entangle": { zone: { when: ["enter"], save: "STR", conditions: ["Restrained"], difficult: true } },
  "Grease": { save: "DEX", zone: { when: ["enter", "end"], save: "DEX", conditions: ["Prone"], difficult: true } },
  "Fog Cloud": { zone: { when: [], heavy: true } },
  "Darkness": { zone: { when: [], heavy: true, magicDark: true } },
  "Stinking Cloud": { zone: { when: ["enter", "start"], save: "CON", conditions: ["Incapacitated"], heavy: true } },
  "Sleet Storm": { zone: { when: ["enter", "start"], save: "DEX", conditions: ["Prone"], difficult: true, heavy: true } },
  "Insect Plague": { zone: { when: ["enter", "end"], save: "CON", damage: true, half: true, difficult: true, light: true } },
  "Silence": { zone: { when: [] } },
};

const CONDITION_WORDS = ["Blinded", "Charmed", "Deafened", "Frightened", "Grappled", "Incapacitated", "Invisible", "Paralyzed", "Petrified", "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious"];

/** The spell's lasting rules: the curated ones, else read from its text (conditions on a failed save, lasting areas). */
export function spellRule(s: Pick<SpellInfo, "name" | "description" | "duration" | "roll">): SpellRule | null {
  const curated = SPELL_RULES[s.name];
  if (curated) return curated;
  const t = (s.description ?? "").replace(/’/g, "'");
  const out: SpellRule = {};
  // "…must succeed on a Wisdom saving throw or have the Frightened condition…"
  const fail = t.match(/saving throw[^.]{0,80}?(?:or|and) (?:have|has|is|be) the ([A-Z]\w+)(?: and ([A-Z]\w+))? conditions?/);
  if (fail) {
    const conds = [fail[1], fail[2]].filter((c): c is string => !!c && CONDITION_WORDS.includes(c));
    if (conds.length) out.onFail = { conditions: conds, saveEnds: /end of each of its turns[^.]*(?:repeat|another)[^.]*sav/i.test(t) };
  }
  // a lasting area that hurts or holds whoever comes in
  const lasting = !/instantaneous/i.test(s.duration ?? "");
  const enters = /enters[^.]{0,60}(?:area|Sphere|Cube|Cylinder|Emanation|Line|it)/i.test(t);
  const startsTurn = /starts its turn there|starts its turn in/i.test(t), endsTurn = /ends its turn there|ends its turn in/i.test(t);
  if (lasting && (enters || startsTurn || endsTurn || /Heavily Obscured|Difficult Terrain/.test(t)) && /-foot(?:-radius)? (?:Sphere|Cube|Cylinder|Emanation|square)|-foot-radius/i.test(t)) {
    out.zone = {
      when: [...(enters ? ["enter" as const] : []), ...(startsTurn ? ["start" as const] : []), ...(endsTurn ? ["end" as const] : [])],
      save: s.roll?.save_ability, damage: !!s.roll?.damage, half: !!s.roll?.half_on_save,
      difficult: /Difficult Terrain/.test(t) || undefined, heavy: /Heavily Obscured/.test(t) || undefined, light: /Lightly Obscured/.test(t) || undefined,
      follows: /Emanation/.test(t) || undefined,
    };
  }
  return out.onFail || out.zone ? out : null;
}

/** How many rounds a duration lasts ("Concentration, up to 1 minute" → 10), null = until removed / instantaneous. */
export function durationRounds(d: string | null | undefined): number | null {
  const t = (d ?? "").toLowerCase();
  if (/instantaneous|until dispelled|permanent|special/.test(t)) return null;
  const n = Number(t.match(/(\d+)/)?.[1] ?? 1);
  if (/round/.test(t)) return n;
  if (/minute/.test(t)) return Math.min(100, n * 10);
  if (/hour|day/.test(t)) return 100; // longer than any fight
  return null;
}

/** A zone placed on the map, stored with the fight (combats.zones, SQL 39). */
export type Zone = {
  id: string; spell: string; casterCombatantId: string; casterName: string;
  rule: ZoneRule; spec: AreaSpec; placed: Placed;          // where it is (re-placed around the caster when it follows)
  damage: string | null; damageType: string | null; dc: number | null;
  roundsLeft: number | null; concentration: boolean; side: "party" | "enemy";
  hit?: Record<string, number>;             // combatant → the round it was last affected (once per turn)
};

export function cleanZones(raw: unknown): Zone[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 30).filter((z) => z && typeof z === "object" && typeof (z as Zone).id === "string" && typeof (z as Zone).spell === "string" && (z as Zone).placed && (z as Zone).rule) as Zone[];
}

/** Where the zone is now: Spirit Guardians goes wherever its caster goes. */
export function zonePlaced(z: Zone, caster: Tok | null, feet = 5): Placed {
  if (z.rule.follows && caster) return place(z.spec, caster, { x: caster.x + caster.size / 2, y: caster.y + caster.size / 2 }, feet);
  return z.placed;
}

/** The squares the zone covers ("x,y"). */
export function zoneCells(z: Zone, caster: Tok | null, cols: number, rows: number, feet = 5): string[] {
  return squaresIn(zonePlaced(z, caster, feet), cols, rows).map((q) => `${q.x},${q.y}`);
}

/** Does the zone touch any square of this creature? */
export function zoneTouches(z: Zone, caster: Tok | null, t: Tok, feet = 5): boolean {
  const p = zonePlaced(z, caster, feet);
  for (let j = t.y; j < t.y + t.size; j++) for (let i = t.x; i < t.x + t.size; i++) if (squareIn(p, i, j)) return true;
  return false;
}

const shift = (p: Placed, dx: number, dy: number): Placed =>
  p.shape === "rect" ? { ...p, x: p.x + dx, y: p.y + dy }
  : p.shape === "circle" || p.shape === "range" ? { ...p, cx: p.cx + dx, cy: p.cy + dy }
  : { ...p, ox: p.ox + dx, oy: p.oy + dy };

const middle = (p: Placed) => p.shape === "rect" ? { x: p.x + p.w / 2, y: p.y + p.h / 2 } : p.shape === "circle" || p.shape === "range" ? { x: p.cx, y: p.cy } : { x: p.ox, y: p.oy };

/** The zone after the start of its caster's turn: one round fewer, and it drifts (Cloudkill) away from the caster. */
export function zoneAtCasterTurn(z: Zone, caster: Tok | null, feet = 5): Zone | null {
  const left = z.roundsLeft == null ? null : z.roundsLeft - 1;
  if (left != null && left <= 0) return null;
  let placed = z.placed;
  if (z.rule.drift && caster) {
    const m = middle(placed);
    const cx = caster.x + caster.size / 2, cy = caster.y + caster.size / 2;
    const dx = m.x - cx, dy = m.y - cy, len = Math.hypot(dx, dy) || 1;
    const step = z.rule.drift / feet;
    // whole squares, along the stronger direction (diagonal when both are)
    const sx = Math.round((dx / len) * step), sy = Math.round((dy / len) * step);
    placed = shift(placed, sx, sy);
  }
  return { ...z, placed, roundsLeft: left };
}

/** Is this creature affected by the zone at all? (Spirit Guardians spares the caster's side.) */
export const zoneSpares = (z: Zone, t: { combatant_id?: string; side?: "party" | "enemy" }) =>
  t.combatant_id === z.casterCombatantId ? !!z.rule.friendsSafe || !!z.rule.follows : !!z.rule.friendsSafe && t.side === z.side;

/** The map's terrain with the lasting spells on it: Web and Spike Growth are difficult, Fog Cloud and Darkness hide. */
export function withZones(t: Terrain, zones: Zone[], tokens: (Tok & { combatant_id: string })[], cols: number, rows: number, feet = 5): Terrain {
  if (!zones.length) return t;
  const out: Terrain = { ...t, difficult: new Set(t.difficult), obscured: new Set(t.obscured), heavy: new Set(t.heavy), magicDark: new Set(t.magicDark) };
  for (const z of zones) {
    const r = z.rule;
    if (!r.difficult && !r.heavy && !r.light && !r.magicDark) continue;
    const caster = tokens.find((k) => k.combatant_id === z.casterCombatantId) ?? null;
    for (const k of zoneCells(z, caster, cols, rows, feet)) {
      if (r.difficult) out.difficult.add(k);
      if (r.light) out.obscured.add(k);
      if (r.heavy || r.magicDark) out.heavy.add(k);
      if (r.magicDark) out.magicDark.add(k);
    }
  }
  return out;
}
