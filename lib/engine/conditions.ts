// Battle engine, part 1: what conditions really do (PHB 2014 / 2024 appendix). Pure, tested.
// Every result carries its reasons ("Ogre is Prone"), so the app can say why a roll had advantage.
import type { Advantage } from "../dice";
import type { Ability } from "../rules";

export type RuleSet = "2014" | "2024";

/** A creature's conditions: plain names ("Prone"), Exhaustion with its level ("Exhaustion 3"; "Exhaustion" = 1). */
export type Conds = readonly string[];

const has = (c: Conds, name: string) => c.some((x) => x === name || x.startsWith(`${name} `));

/** Exhaustion level (0–6) from "Exhaustion" / "Exhaustion 3". */
export function exhaustion(c: Conds): number {
  let lvl = 0;
  for (const x of c) {
    const m = x.match(/^Exhaustion(?:\s+(\d))?$/);
    if (m) lvl = Math.max(lvl, Math.min(6, Number(m[1] ?? 1)));
  }
  return lvl;
}

/** Conditions that include Incapacitated (no actions, bonus actions or reactions). */
const INCAPACITATING = ["Incapacitated", "Paralyzed", "Petrified", "Stunned", "Unconscious"];
export const incapacitated = (c: Conds) => INCAPACITATING.some((n) => has(c, n));

export type Mods = {
  advantage: string[];     // reasons for advantage
  disadvantage: string[];  // reasons for disadvantage
  penalty: number;         // flat change to the d20 roll (2024 Exhaustion: −2 per level)
  autoFail?: string;       // the roll fails without dice (a Paralyzed creature's DEX save)
  autoCrit?: string;       // a hit is a critical hit (Paralyzed or Unconscious, attacker within 5 ft)
  notes: string[];         // things worth saying that the app can't decide (Frightened: only with the source in sight)
};
const empty = (): Mods => ({ advantage: [], disadvantage: [], penalty: 0, notes: [] });

/** Advantage and disadvantage together cancel out, however many of each (PHB). */
export function combine(chosen: Advantage, m: Pick<Mods, "advantage" | "disadvantage">): Advantage {
  const adv = chosen === "advantage" || m.advantage.length > 0;
  const dis = chosen === "disadvantage" || m.disadvantage.length > 0;
  return adv && dis ? "normal" : adv ? "advantage" : dis ? "disadvantage" : "normal";
}

function exhaustionOnD20(m: Mods, c: Conds, rules: RuleSet, kind: "attack" | "save" | "check", who: string) {
  const lvl = exhaustion(c);
  if (!lvl) return;
  if (rules === "2024") m.penalty -= 2 * lvl;
  else if (kind === "check" && lvl >= 1) m.disadvantage.push(`${who} has Exhaustion ${lvl}`);
  else if (kind !== "check" && lvl >= 3) m.disadvantage.push(`${who} has Exhaustion ${lvl}`);
}

export type Side = { name: string; conds: Conds };

/**
 * An attack roll: what the attacker's and the target's conditions do to it.
 * `within5`: attacker within 5 ft of the target (melee, as far as the app knows); `ranged`: a ranged attack.
 */
export function attackMods(attacker: Side, target: Side, o: { ranged: boolean; within5: boolean; rules: RuleSet }): Mods {
  const m = empty();
  const a = attacker.conds, t = target.conds;
  const me = attacker.name, it = target.name;
  // the attacker
  if (has(a, "Blinded")) m.disadvantage.push(`${me} is Blinded`);
  if (has(a, "Poisoned")) m.disadvantage.push(`${me} is Poisoned`);
  if (has(a, "Prone")) m.disadvantage.push(`${me} is Prone`);
  if (has(a, "Restrained")) m.disadvantage.push(`${me} is Restrained`);
  if (has(a, "Frightened")) { m.disadvantage.push(`${me} is Frightened`); m.notes.push("Frightened: only while the source of the fear is in sight."); }
  if (has(a, "Invisible")) m.advantage.push(`${me} is Invisible`);
  if (has(a, "Hidden")) m.advantage.push(`${me} is Hidden`);
  if (o.ranged && o.within5 && !has(t, "Incapacitated") && !incapacitated(t)) m.disadvantage.push(`ranged attack with ${it} next to ${me}`);
  exhaustionOnD20(m, a, o.rules, "attack", me);
  if (incapacitated(a)) m.notes.push(`${me} is incapacitated and can't take actions.`);
  // the target
  if (has(t, "Blinded")) m.advantage.push(`${it} is Blinded`);
  if (has(t, "Restrained")) m.advantage.push(`${it} is Restrained`);
  if (has(t, "Stunned")) m.advantage.push(`${it} is Stunned`);
  if (has(t, "Paralyzed")) m.advantage.push(`${it} is Paralyzed`);
  if (has(t, "Unconscious")) m.advantage.push(`${it} is Unconscious`);
  if (has(t, "Petrified")) m.advantage.push(`${it} is Petrified`);
  // Faerie Fire / Guiding Bolt: outlined creatures can't hide in invisibility, and attacks against them have advantage
  if (has(t, "Outlined")) m.advantage.push(`${it} is outlined (Faerie Fire / Guiding Bolt)`);
  else if (has(t, "Invisible")) m.disadvantage.push(`${it} is Invisible`);
  if (has(t, "Blurred")) m.disadvantage.push(`${it} is blurred (Blur)`);
  if (has(t, "Dodging") && !incapacitated(t)) m.disadvantage.push(`${it} is Dodging`);
  if (has(t, "Prone")) {
    if (o.within5 && !o.ranged) m.advantage.push(`${it} is Prone (you're next to it)`);
    else m.disadvantage.push(`${it} is Prone (you're not next to it)`);
  }
  if ((has(t, "Paralyzed") || has(t, "Unconscious")) && o.within5) m.autoCrit = `${it} is ${has(t, "Paralyzed") ? "Paralyzed" : "Unconscious"}: a hit from within 5 ft is a critical hit`;
  return m;
}

/** A saving throw: what the saver's own conditions do. */
export function saveMods(saver: Side, ability: Ability, rules: RuleSet): Mods {
  const m = empty();
  const c = saver.conds, me = saver.name;
  if (ability === "STR" || ability === "DEX") {
    for (const n of ["Paralyzed", "Stunned", "Unconscious", "Petrified"]) if (has(c, n)) { m.autoFail = `${me} is ${n}: STR and DEX saves fail`; break; }
  }
  if (ability === "DEX" && has(c, "Restrained")) m.disadvantage.push(`${me} is Restrained`);
  if (ability === "DEX" && has(c, "Dodging") && !incapacitated(c)) m.advantage.push(`${me} is Dodging`);
  if (ability === "DEX" && has(c, "Hasted")) m.advantage.push(`${me} is Hasted`);
  if (ability === "DEX" && has(c, "Slowed")) m.penalty -= 2;
  exhaustionOnD20(m, c, rules, "save", me);
  return m;
}

/** An ability check (skills included). */
export function checkMods(who: Side, rules: RuleSet, ability?: Ability): Mods {
  const m = empty();
  const c = who.conds, me = who.name;
  if (has(c, "Poisoned")) m.disadvantage.push(`${me} is Poisoned`);
  if (has(c, "Frightened")) { m.disadvantage.push(`${me} is Frightened`); m.notes.push("Frightened: only while the source of the fear is in sight."); }
  if (has(c, "Blinded")) m.notes.push("Blinded: checks that need sight fail.");
  if (has(c, "Deafened")) m.notes.push("Deafened: checks that need hearing fail.");
  void ability;
  exhaustionOnD20(m, c, rules, "check", me);
  return m;
}

/** Speed after conditions (base speed in feet). */
export function speedOf(base: number, c: Conds, rules: RuleSet): { speed: number; why: string | null } {
  for (const n of ["Grappled", "Restrained", "Paralyzed", "Petrified", "Stunned", "Unconscious"]) if (has(c, n)) return { speed: 0, why: `${n}: speed 0` };
  const lvl = exhaustion(c);
  if (has(c, "Hasted") && !has(c, "Slowed")) base *= 2;
  if (has(c, "Slowed") && !has(c, "Hasted")) base = Math.floor(base / 2);
  if (rules === "2024" && lvl) return { speed: Math.max(0, base - 5 * lvl), why: `Exhaustion ${lvl}: −${5 * lvl} ft` };
  if (rules === "2014" && lvl >= 5) return { speed: 0, why: `Exhaustion ${lvl}: speed 0` };
  if (rules === "2014" && lvl >= 2) return { speed: Math.floor(base / 2), why: `Exhaustion ${lvl}: half speed` };
  return { speed: base, why: has(c, "Hasted") && !has(c, "Slowed") ? "Hasted: speed doubled" : has(c, "Slowed") && !has(c, "Hasted") ? "Slowed: half speed" : null };
}

/** What a creature can do on its turn. */
export function canAct(c: Conds, rules: RuleSet) {
  const inc = incapacitated(c);
  const lvl = exhaustion(c);
  const dead = lvl >= 6;
  return {
    actions: !inc && !dead,
    reactions: !inc && !dead,
    move: speedOf(30, c, rules).speed > 0 && !dead,
    why: dead ? "Exhaustion 6: dead" : inc ? `${INCAPACITATING.find((n) => has(c, n))}: no actions, bonus actions or reactions` : null,
    /** 2014 Exhaustion 4: hit point maximum halved */
    halfMaxHp: rules === "2014" && lvl >= 4,
    concentrationEnds: inc,
  };
}

/** A d20 roll with these mods: the advantage to roll with and the flat change. */
export function rollWith(chosen: Advantage, m: Mods) {
  return { advantage: combine(chosen, m), penalty: m.penalty, reasons: [...m.advantage.map((r) => `Advantage: ${r}`), ...m.disadvantage.map((r) => `Disadvantage: ${r}`), ...(m.penalty ? [`${m.penalty} to the roll (Exhaustion)`] : [])] };
}
