// Damage per round (DPR), fight by fight and session by session.
//
// DPR in a fight = damage that landed in that fight ÷ the fight's rounds (the combat's last round,
// at least 1). A character who rolled nothing in a fight didn't take part (null, not 0).
// Session DPR = all their fight damage that session ÷ the rounds of the fights they took part in.
import { computeStats, type StatActor, type StatEffect, type StatRoll } from "./compute";

export type FightDpr = {
  combatId: string;
  name: string;
  sessionId: string | null;
  rounds: number;
  partyDamage: number;
  partyDpr: number;
  damage: Record<string, number>; // character key → damage in this fight (only those who took part)
  dpr: Record<string, number>; // character key → DPR (only those who took part)
};

const r1 = (n: number) => Math.round(n * 10) / 10;

export function fightDpr(
  combats: { id: string; name: string | null; round: number | null; session_id: string | null }[],
  rolls: StatRoll[],
  effects: StatEffect[],
  actors: StatActor[],
  spellNames: Set<string> = new Set()
): FightDpr[] {
  const rollsBy = new Map<string, StatRoll[]>();
  for (const r of rolls) if (r.combat_id) rollsBy.set(r.combat_id, [...(rollsBy.get(r.combat_id) ?? []), r]);
  const effectsBy = new Map<string, StatEffect[]>();
  for (const e of effects) if (e.combat_id) effectsBy.set(e.combat_id, [...(effectsBy.get(e.combat_id) ?? []), e]);
  const chars = actors.filter((a) => a.kind === "character");

  const out: FightDpr[] = [];
  for (const c of combats) {
    const rs = rollsBy.get(c.id) ?? [];
    const es = effectsBy.get(c.id) ?? [];
    if (!rs.length && !es.length) continue;
    const rounds = Math.max(1, c.round ?? 0, ...rs.map((r) => r.round ?? 0));
    const stats = computeStats(rs, es, actors, spellNames);
    const took = new Set<string>();
    for (const r of rs) if (r.character_id) took.add(`c:${r.character_id}`);
    for (const e of es) if (e.actor_character_id) took.add(`c:${e.actor_character_id}`);
    const damage: Record<string, number> = {};
    const dpr: Record<string, number> = {};
    let partyDamage = 0;
    for (const a of chars) {
      if (!took.has(a.key)) continue;
      const d = stats.get(a.key)?.damageDealt ?? 0;
      damage[a.key] = d;
      dpr[a.key] = r1(d / rounds);
      partyDamage += d;
    }
    if (!Object.keys(dpr).length) continue; // monsters only: nothing to show the party
    out.push({ combatId: c.id, name: c.name ?? "Fight", sessionId: c.session_id, rounds, partyDamage, partyDpr: r1(partyDamage / rounds), damage, dpr });
  }
  return out;
}

/** Per character: DPR over a set of fights (damage ÷ rounds of the fights they were in). */
export function dprOver(fights: FightDpr[]): Record<string, { damage: number; rounds: number; dpr: number; fights: number }> {
  const out: Record<string, { damage: number; rounds: number; dpr: number; fights: number }> = {};
  for (const f of fights) {
    for (const [k, d] of Object.entries(f.damage)) {
      const x = (out[k] ??= { damage: 0, rounds: 0, dpr: 0, fights: 0 });
      x.damage += d; x.rounds += f.rounds; x.fights++;
    }
  }
  for (const x of Object.values(out)) x.dpr = x.rounds ? r1(x.damage / x.rounds) : 0;
  return out;
}
