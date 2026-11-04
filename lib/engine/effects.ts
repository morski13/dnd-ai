// Battle engine, part 3: conditions and effects that last a while, and what turn changes do to them. Pure, tested.
//  - "until the end of Orrin's next turn", "1 minute" (10 of the caster's turns), "save ends" (repeat the save
//    at the end of each of its turns), "until removed", and anything tied to someone's concentration.
import type { Ability } from "../rules";

export type Ends =
  | { kind: "removed" }                                                  // until someone takes it off
  | { kind: "turns"; at: "start" | "end"; of: string; left: number };     // after `left` starts/ends of that creature's turns

export type TimedEffect = {
  id: string;
  name: string;                  // what put it there ("Hold Person", or the condition itself)
  conditions: string[];          // conditions it gives ("Paralyzed")
  source: { combatantId: string | null; name: string } | null;
  ends: Ends;
  save?: { ability: Ability; dc: number; at: "start" | "end" } | null; // repeat save on the target's own turn; a success ends it
  concentration?: boolean;       // ends when the source stops concentrating
  note?: string;
  ac?: number;                   // AC bonus while it lasts (Shield: +5)
  halveNext?: boolean;           // the next damage it takes is halved, then it ends (Uncanny Dodge)
  bonusDice?: string;            // added to its attack rolls and saves (Bless "1d4", Bane "-1d4")
  fly?: number;                  // a flying speed while it lasts (Fly: 60)
};

export type TurnEvent = { kind: "start" | "end"; combatantId: string };

/** A repeat save that comes due now (the caller rolls it, then calls `afterSave`). */
export type DueSave = { effectId: string; name: string; ability: Ability; dc: number };

/**
 * What a turn start or end does to the effects on one creature (`ownerId` = that creature's combatant).
 * Expired effects drop off; "save ends" effects on the creature whose turn it is come due.
 */
export function tick(effects: TimedEffect[], ownerId: string, ev: TurnEvent): { kept: TimedEffect[]; expired: TimedEffect[]; saves: DueSave[] } {
  const kept: TimedEffect[] = [];
  const expired: TimedEffect[] = [];
  const saves: DueSave[] = [];
  for (const e of effects) {
    let next = e;
    if (e.ends.kind === "turns" && e.ends.of === ev.combatantId && e.ends.at === ev.kind) {
      const left = e.ends.left - 1;
      if (left <= 0) { expired.push(e); continue; }
      next = { ...e, ends: { ...e.ends, left } };
    }
    if (e.save && ownerId === ev.combatantId && e.save.at === ev.kind) saves.push({ effectId: e.id, name: e.name, ability: e.save.ability, dc: e.save.dc });
    kept.push(next);
  }
  return { kept, expired, saves };
}

/** After a repeat save: a success ends the effect. */
export function afterSave(effects: TimedEffect[], effectId: string, success: boolean) {
  if (!success) return { kept: effects, ended: null as TimedEffect | null };
  const ended = effects.find((e) => e.id === effectId) ?? null;
  return { kept: effects.filter((e) => e.id !== effectId), ended };
}

/** The source stopped concentrating (or dropped): its concentration effects end everywhere. */
export function endConcentration(effects: TimedEffect[], sourceId: string) {
  const ended = effects.filter((e) => e.concentration && e.source?.combatantId === sourceId);
  return { kept: effects.filter((e) => !ended.includes(e)), ended };
}

/** Dice added to attack rolls and saves (Bless +1d4, Bane −1d4), as an expression to add ("+1d4-1d4"). */
export const effectDice = (effects: TimedEffect[]) => effects.map((e) => e.bonusDice).filter(Boolean).map((d) => (d!.startsWith("-") ? d : `+${d}`)).join("");

/** AC bonus from effects (Shield +5). */
export const effectAc = (effects: TimedEffect[]) => effects.reduce((a, e) => a + (e.ac ?? 0), 0);

/** The conditions a creature shows: the ones put on by hand plus every effect's. */
export function shownConditions(manual: string[], effects: TimedEffect[]): string[] {
  return [...new Set([...manual, ...effects.flatMap((e) => e.conditions)])];
}

/** Manual conditions after an effect ends: its conditions go, unless another effect still gives them. */
export function withoutEffect(conditions: string[], ended: TimedEffect[], still: TimedEffect[]) {
  const gone = new Set(ended.flatMap((e) => e.conditions));
  const kept = new Set(still.flatMap((e) => e.conditions));
  return conditions.filter((c) => !gone.has(c) || kept.has(c));
}

/** Durations people pick in the app. */
export type DurationChoice = "removed" | "end_of_next_turn" | "start_of_next_turn" | "rounds" | "save_ends";

/** Builds an effect from what was picked. `mine`: the creature whose turns count ("until the end of MY next turn"). */
export function makeEffect(p: {
  id: string; name: string; conditions: string[]; source: TimedEffect["source"];
  duration: DurationChoice; rounds?: number; turnsOf: string; target: string;
  save?: { ability: Ability; dc: number } | null; concentration?: boolean;
}): TimedEffect {
  const ends: Ends =
    p.duration === "end_of_next_turn" ? { kind: "turns", at: "end", of: p.turnsOf, left: 1 }
    : p.duration === "start_of_next_turn" ? { kind: "turns", at: "start", of: p.turnsOf, left: 1 }
    : p.duration === "rounds" ? { kind: "turns", at: "start", of: p.turnsOf, left: Math.max(1, Math.min(100, p.rounds ?? 10)) }
    : p.duration === "save_ends" && p.rounds ? { kind: "turns", at: "start", of: p.turnsOf, left: Math.max(1, Math.min(100, p.rounds)) }
    : { kind: "removed" };
  return {
    id: p.id, name: p.name, conditions: p.conditions, source: p.source, ends,
    save: p.duration === "save_ends" && p.save ? { ...p.save, at: "end" } : null,
    concentration: !!p.concentration,
  };
}

/** "until the end of Orrin's next turn", "9 more rounds", "WIS save DC 15 at the end of each of its turns". */
export function describe(e: TimedEffect, nameOf: (combatantId: string) => string): string {
  const parts: string[] = [];
  if (e.ends.kind === "turns") {
    const who = nameOf(e.ends.of);
    parts.push(e.ends.left === 1 ? `until the ${e.ends.at} of ${who}'s next turn` : `${e.ends.left} more rounds (counted at the ${e.ends.at} of ${who}'s turn)`);
  }
  if (e.save) parts.push(`${e.save.ability} save DC ${e.save.dc} at the ${e.save.at} of each of its turns ends it`);
  if (e.concentration && e.source) parts.push(`while ${e.source.name} concentrates`);
  if (!parts.length) parts.push("until removed");
  return parts.join(" · ");
}

/** Cleans effects coming from the browser or the database. */
export function cleanEffects(input: unknown): TimedEffect[] {
  if (!Array.isArray(input)) return [];
  const ab = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
  return input.slice(0, 30).flatMap((raw): TimedEffect[] => {
    const e = (raw ?? {}) as Record<string, unknown>;
    const id = String(e.id ?? "").slice(0, 40);
    const name = String(e.name ?? "").trim().slice(0, 60);
    if (!id || !name) return [];
    const conditions = (Array.isArray(e.conditions) ? e.conditions : []).map(String).slice(0, 6);
    const en = (e.ends ?? {}) as Record<string, unknown>;
    const ends: Ends = en.kind === "turns" && typeof en.of === "string"
      ? { kind: "turns", at: en.at === "start" ? "start" : "end", of: en.of, left: Math.max(1, Math.min(100, Math.floor(Number(en.left) || 1))) }
      : { kind: "removed" };
    const s = e.save as Record<string, unknown> | null | undefined;
    const save = s && ab.includes(String(s.ability)) && Number(s.dc) > 0
      ? { ability: String(s.ability) as Ability, dc: Math.min(40, Math.floor(Number(s.dc))), at: (s.at === "start" ? "start" : "end") as "start" | "end" } : null;
    const src = e.source as Record<string, unknown> | null | undefined;
    const source = src ? { combatantId: typeof src.combatantId === "string" ? src.combatantId : null, name: String(src.name ?? "").slice(0, 60) } : null;
    const ac = Math.max(-10, Math.min(10, Math.round(Number(e.ac) || 0)));
    return [{ id, name, conditions, source, ends, save, concentration: !!e.concentration, note: typeof e.note === "string" ? e.note.slice(0, 200) : undefined,
      ...(ac ? { ac } : {}), ...(e.halveNext ? { halveNext: true } : {}),
      ...(typeof e.bonusDice === "string" && /^-?\d{1,2}d\d{1,3}$/.test(e.bonusDice) ? { bonusDice: e.bonusDice } : {}),
      ...(Number(e.fly) > 0 ? { fly: Math.min(300, Math.round(Number(e.fly))) } : {}) }];
  });
}
