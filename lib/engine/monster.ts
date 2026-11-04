// Battle engine, part 10: what a monster can do on its turn (pure, tested).
//  - Multiattack as a list of attacks ("one Bite and two Claws" → Bite, Claw, Claw)
//  - Recharge (5–6) and per-day uses, rolled / counted in the fight
//  - Legendary actions: uses per round, back at the start of its turn
//  - The DM's best move: for every action and every target, the damage it should do and why
import type { MonsterAction, MonsterStats } from "../encounter/build";
import { compile } from "../encounter/sim";
import { attackMods, saveMods, type RuleSet } from "./conditions";
import type { Ability } from "../rules";

/** What a monster's turn state is in this fight (combatants.monster_state, SQL 40). */
export type MonsterState = {
  spent: string[];                    // recharge actions used and not back yet
  perDay: Record<string, number>;     // uses of "2/Day" actions
  legendaryUsed: number;              // legendary actions used since its last turn
  note?: string | null;               // the last recharge roll, for the DM ("Fire Breath: 6, back")
};
export const NO_STATE: MonsterState = { spent: [], perDay: {}, legendaryUsed: 0 };

export function cleanState(raw: unknown): MonsterState {
  const r = (raw ?? {}) as Record<string, unknown>;
  const perDay: Record<string, number> = {};
  for (const [k, v] of Object.entries((r.perDay ?? {}) as Record<string, unknown>)) if (Number(v) > 0) perDay[k.slice(0, 60)] = Math.min(20, Math.floor(Number(v)));
  return {
    spent: (Array.isArray(r.spent) ? r.spent : []).map(String).slice(0, 20),
    perDay,
    legendaryUsed: Math.max(0, Math.min(10, Math.floor(Number(r.legendaryUsed) || 0))),
    note: typeof r.note === "string" ? r.note.slice(0, 200) : null,
  };
}

export type Features = {
  attacks: MonsterAction[];
  saves: MonsterAction[];             // breath weapons and the like
  bonus: MonsterAction[];
  multi: string[] | null;             // the attacks Multiattack makes, in order
  legendary: number;                  // legendary actions per round
};

/** The parts of a stat block the turn uses. */
export function featuresOf(sb: unknown): Features {
  const s = (sb ?? {}) as Partial<MonsterStats>;
  const actions = Array.isArray(s.actions) ? s.actions : [];
  const attacks = actions.filter((a) => a.kind === "attack" && a.damage);
  const saves = actions.filter((a) => a.kind === "save");
  const bonus = (Array.isArray(s.bonus_actions) ? s.bonus_actions : []).filter((a) => a.kind === "attack" && a.damage);
  return { attacks, saves, bonus, multi: multiList(s.multiattack, attacks), legendary: Math.max(0, Math.min(5, Number(s.legendary_uses) || 0)) };
}

/**
 * Multiattack as the attacks to roll. One attack named: all of them with it. Several: one of each, the rest with
 * the last named ("one with its Bite and two with its Claws": Bite, Claw, Claw).
 */
export function multiList(m: MonsterStats["multiattack"] | undefined, attacks: MonsterAction[]): string[] | null {
  if (!m || !(m.count > 1)) return null;
  const named = (m.uses ?? []).filter((n) => attacks.some((a) => a.name === n));
  const uses = named.length ? named : attacks.length ? [attacks[0].name] : [];
  if (!uses.length) return null;
  const out = uses.slice(0, m.count);
  while (out.length < m.count) out.push(uses[uses.length - 1]);
  return out;
}

/** Can it use this action now? */
export function usable(a: MonsterAction, st: MonsterState): { ok: boolean; why: string | null } {
  if (a.recharge && st.spent.includes(a.name)) return { ok: false, why: `recharging (${a.recharge}–6)` };
  if (a.per_day && (st.perDay[a.name] ?? 0) >= a.per_day) return { ok: false, why: `used ${a.per_day}/day` };
  return { ok: true, why: null };
}

/** After using an action: recharge ones are spent, per-day ones count. */
export function afterUse(a: MonsterAction, st: MonsterState): MonsterState {
  if (a.recharge) return { ...st, spent: [...new Set([...st.spent, a.name])] };
  if (a.per_day) return { ...st, perDay: { ...st.perDay, [a.name]: (st.perDay[a.name] ?? 0) + 1 } };
  return st;
}

/** The start of its turn: roll a d6 for each spent recharge action; legendary actions come back. */
export function atTurnStart(st: MonsterState, saves: MonsterAction[], d6: () => number): MonsterState {
  const notes: string[] = [];
  const spent: string[] = [];
  for (const name of st.spent) {
    const a = saves.find((x) => x.name === name);
    if (!a?.recharge) continue;
    const r = d6();
    if (r >= a.recharge) notes.push(`${name}: rolled ${r}, back`);
    else { notes.push(`${name}: rolled ${r}, not yet (${a.recharge}–6)`); spent.push(name); }
  }
  return { ...st, spent, legendaryUsed: 0, note: notes.length ? notes.join(" · ") : null };
}

// ---------------------------------------------------------------- the DM's best move

export type Foe = {
  id: string; characterId: string; name: string; ac: number; hp: number; max: number; conds: string[];
  dist: number | null;                 // feet from the monster on the map (null: no map)
  concentrating: string | null;
  saves: Partial<Record<Ability, number>>;
  near: number;                        // other party members within 10 ft of it (for area attacks)
};
export type Move = { title: string; attacks: string[]; save: string | null; targetId: string; expected: number; reasons: string[] };

const pHit = (bonus: number, ac: number) => Math.min(0.95, Math.max(0.05, (21 - (ac - bonus)) / 20));
const withAdv = (p: number, adv: number) => (adv > 0 ? 1 - (1 - p) ** 2 : adv < 0 ? p * p : p);

/** Expected damage of one attack on one foe, with the conditions on both. */
export function attackValue(a: MonsterAction, f: Foe, me: { name: string; conds: string[] }, rules: RuleSet, reach: number) {
  const within5 = f.dist == null ? !a.ranged : f.dist <= 5;
  const m = attackMods(me, { name: f.name, conds: f.conds }, { ranged: !!a.ranged, within5, rules });
  const adv = (m.advantage.length ? 1 : 0) - (m.disadvantage.length ? 1 : 0);
  const p = withAdv(pHit((a.bonus ?? 0) + m.penalty, f.ac), adv);
  const d = compile(a.damage ?? "0");
  const diceAvg = d.avg - d.k;
  const pCrit = m.autoCrit ? p : withAdv(0.05, adv);
  const value = p * d.avg + pCrit * diceAvg;
  const inReach = a.ranged || f.dist == null || f.dist <= reach;
  return { value, adv, autoCrit: !!m.autoCrit, inReach, why: [...m.advantage.map((x) => `advantage: ${x}`), ...m.disadvantage.map((x) => `disadvantage: ${x}`)] };
}

/** Expected damage of a save action on one foe (and the ones next to it for an area). */
export function saveValue(a: MonsterAction, f: Foe, rules: RuleSet) {
  const ab = (a.save_ability ?? "DEX") as Ability;
  const m = saveMods({ name: f.name, conds: f.conds }, ab, rules);
  const adv = (m.advantage.length ? 1 : 0) - (m.disadvantage.length ? 1 : 0);
  const pSave = m.autoFail ? 0 : withAdv(Math.min(0.95, Math.max(0.05, (21 - ((a.dc ?? 12) - (f.saves[ab] ?? 0) - m.penalty)) / 20)), adv);
  const avg = compile(a.damage ?? "0").avg;
  const one = (1 - pSave) * avg + pSave * (a.half === false ? 0 : avg / 2);
  const caught = (a.targets ?? 1) > 1 ? 1 + Math.min(3, f.near) : 1;
  return { value: one * caught, caught, autoFail: m.autoFail ?? null, pSave };
}

/**
 * The best moves for this monster's turn: every usable action on every foe it can reach, best first.
 * Bonus for a foe it could drop, one concentrating on a spell, and conditions that help it.
 */
export function bestMoves(f: Features, st: MonsterState, foes: Foe[], me: { name: string; conds: string[]; reach: number }, rules: RuleSet, limit = 3): Move[] {
  const up = foes.filter((x) => x.hp > 0);
  const moves: Move[] = [];
  const extra = (x: Foe, dmg: number, reasons: string[]) => {
    let v = dmg;
    if (dmg >= x.hp) { v *= 1.5; reasons.push(`could drop ${x.name} (${x.hp} HP left)`); }
    else if (x.hp <= x.max / 2) reasons.push(`${x.name} is bloodied (${x.hp}/${x.max} HP)`);
    if (x.concentrating) { v *= 1.3; reasons.push(`breaks ${x.name}'s ${x.concentrating}? CON save DC ${Math.max(10, Math.floor(dmg / 2))}`); }
    return v;
  };
  for (const x of up) {
    // Multiattack (or the best single attack), plus a bonus-action attack
    const list = f.multi ?? (f.attacks.length ? [[...f.attacks].sort((a, b) => attackValue(b, x, me, rules, me.reach).value - attackValue(a, x, me, rules, me.reach).value)[0].name] : []);
    const rolls = list.map((n) => f.attacks.find((a) => a.name === n)).filter((a): a is MonsterAction => !!a);
    const all = [...rolls, ...f.bonus];
    if (all.length) {
      const vals = all.map((a) => attackValue(a, x, me, rules, me.reach));
      const reach = vals.every((v) => v.inReach);
      const dmg = vals.reduce((s, v) => s + v.value, 0);
      const reasons = [...new Set(vals.flatMap((v) => v.why))];
      if (vals.some((v) => v.autoCrit)) reasons.unshift(`${x.name} can't fight back: hits within 5 ft are critical`);
      if (!reach) reasons.push(`move first: ${x.name} is ${x.dist} ft away (reach ${me.reach} ft)`);
      const score = extra(x, dmg, reasons) * (reach ? 1 : 0.6);
      const title = `${f.multi ? `Multiattack (${list.join(", ")})` : list[0]}${f.bonus.length ? ` + ${f.bonus.map((b) => b.name).join(", ")}` : ""} on ${x.name}`;
      moves.push({ title, attacks: all.map((a) => a.name), save: null, targetId: x.id, expected: score, reasons: [`≈${Math.round(dmg)} damage expected vs AC ${x.ac}`, ...reasons] });
    }
    for (const a of f.saves) {
      if (!a.damage || !usable(a, st).ok) continue;
      const s = saveValue(a, x, rules);
      const reasons = [`≈${Math.round(s.value)} damage expected (${a.save_ability} save DC ${a.dc}, ${x.name} saves ${Math.round(s.pSave * 100)}%)`];
      if (s.autoFail) reasons.push(s.autoFail);
      if (s.caught > 1) reasons.push(`catches ${s.caught} of the party (${x.name} and ${s.caught - 1} next to them)`);
      if (a.recharge) reasons.push(`then recharges on ${a.recharge}–6`);
      moves.push({ title: `${a.name} on ${x.name}${s.caught > 1 ? ` (+${s.caught - 1})` : ""}`, attacks: [], save: a.name, targetId: x.id, expected: extra(x, s.value / s.caught, reasons) * s.caught, reasons });
    }
  }
  return moves.sort((a, b) => b.expected - a.expected).slice(0, limit);
}
