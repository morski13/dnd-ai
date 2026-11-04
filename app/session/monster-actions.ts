"use server";
// DM: a monster's turn. Multiattack is rolled on the monster card (attack by attack, so reactions still get
// their pop-up); this file keeps track of recharge, per-day uses and legendary actions, rolls breath weapons
// against the creatures picked (each one saves), and works out the best moves for the DM.
import { refresh } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { liveState } from "@/lib/roll-service";
import { who, battleState } from "@/lib/maps/server";
import { campaignRules, whoIs } from "@/lib/engine/server";
import { afterUse, bestMoves, cleanState, featuresOf, usable, type Foe, type Move, type MonsterState } from "@/lib/engine/monster";
import { distanceFt } from "@/lib/engine/space";
import { monsterReach } from "@/lib/engine/damage";
import { rollTargetSaves } from "@/lib/moderator/saves";
import { applyHp } from "@/lib/moderator/apply";
import { roll } from "@/lib/dice";
import { ABILITIES, saveBonus, type SheetCharacter } from "@/lib/rules";

type Fail = { error: string };

export type TurnInfo = {
  combatantId: string;
  multi: string[] | null;
  attacks: { name: string; bonus: number; damage: string; type: string | null; ranged: boolean }[];
  bonus: { name: string; bonus: number; damage: string; type: string | null }[];
  saves: { name: string; dc: number; ability: string; damage: string | null; type: string | null; area: boolean; ok: boolean; why: string | null; recharge: number | null; perDay: number | null; used: number }[];
  legendary: { max: number; left: number } | null;
  note: string | null;
  moves: Move[];
  ready: boolean; // SQL 40 run
};

async function load(monsterId: string) {
  const me = await who();
  if (!me.userId || !me.campaignId || !me.isDm) return { error: "Only the DM runs the monsters." } as Fail;
  const admin = createAdminClient();
  const { combat } = await liveState(admin, me.campaignId);
  if (!combat) return { error: "No fight is running." } as Fail;
  const [{ data: m }, { data: row }] = await Promise.all([
    admin.from("monsters").select("id, name, stat_block").eq("id", monsterId).eq("campaign_id", me.campaignId).maybeSingle(),
    admin.from("combatants").select("*").eq("combat_id", combat.id).eq("monster_id", monsterId).maybeSingle(),
  ]);
  if (!m || !row) return { error: "That monster isn't in this fight." } as Fail;
  const r = row as { id: string; monster_state?: unknown };
  return { me: { ...me, userId: me.userId, campaignId: me.campaignId }, admin, combat, monster: m as { id: string; name: string; stat_block: unknown }, row: r, state: cleanState(r.monster_state), ready: "monster_state" in r };
}

async function saveState(admin: ReturnType<typeof createAdminClient>, combatantId: string, st: MonsterState) {
  const { error } = await admin.from("combatants").update({ monster_state: st }).eq("id", combatantId);
  return error ? (/column/.test(error.message) ? "Run supabase/40-monster-turns.sql in Supabase first." : error.message) : null;
}

/** Everything the monster card needs for its turn: its actions, what's spent, legendary actions left, best moves. */
export async function monsterTurn(monsterId: string): Promise<Fail | TurnInfo> {
  const l = await load(monsterId);
  if ("error" in l) return l;
  const f = featuresOf(l.monster.stat_block);
  const st = l.state;
  return {
    combatantId: l.row.id, multi: f.multi,
    attacks: f.attacks.map((a) => ({ name: a.name, bonus: a.bonus ?? 0, damage: a.damage ?? "", type: a.damage_type ?? null, ranged: !!a.ranged })),
    bonus: f.bonus.map((a) => ({ name: a.name, bonus: a.bonus ?? 0, damage: a.damage ?? "", type: a.damage_type ?? null })),
    saves: f.saves.map((a) => ({ name: a.name, dc: a.dc ?? 10, ability: a.save_ability ?? "DEX", damage: a.damage ?? null, type: a.damage_type ?? null, area: (a.targets ?? 1) > 1,
      ...usable(a, st), recharge: a.recharge ?? null, perDay: a.per_day ?? null, used: st.perDay[a.name] ?? 0 })),
    legendary: f.legendary ? { max: f.legendary, left: Math.max(0, f.legendary - st.legendaryUsed) } : null,
    note: st.note ?? null,
    moves: await suggest(l).catch(() => []),
    ready: l.ready,
  };
}

/** The party as targets: AC, HP, conditions, saves, distance on the map, who stands next to whom. */
async function suggest(l: Exclude<Awaited<ReturnType<typeof load>>, Fail>): Promise<Move[]> {
  const { admin, combat, me, monster } = l;
  const f = featuresOf(monster.stat_block);
  if (!f.attacks.length && !f.saves.length) return [];
  const [{ data: rows }, rules, meW, b] = await Promise.all([
    admin.from("combatants").select("*").eq("combat_id", combat.id),
    campaignRules(admin, me.campaignId),
    whoIs(admin, me.campaignId, combat.id, { monsterId: monster.id }),
    battleState(me.campaignId),
  ]);
  const pcs = ((rows ?? []) as { id: string; character_id: string | null }[]).filter((r) => r.character_id);
  if (!pcs.length) return [];
  const { data: chars } = await admin.from("characters").select("*").in("id", pcs.map((p) => p.character_id!));
  const mine = b?.tokens.find((t) => t.monster_id === monster.id) ?? null;
  const foes: Foe[] = [];
  for (const p of pcs) {
    const c = (chars ?? []).find((x) => x.id === p.character_id) as (SheetCharacter & { id: string; name: string; ac: number | null; hp_current: number | null; hp_max: number | null; concentration?: { spell?: string } | null }) | undefined;
    if (!c) continue;
    const w = await whoIs(admin, me.campaignId, combat.id, { characterId: c.id });
    const tok = b?.tokens.find((t) => t.character_id === c.id) ?? null;
    const near = tok && b ? b.tokens.filter((o) => o.side === "party" && o.id !== tok.id && distanceFt(o, tok, b.map.feet, b.diag) <= 10).length : 0;
    foes.push({
      id: p.id, characterId: c.id, name: c.name, ac: c.ac ?? 12, hp: c.hp_current ?? c.hp_max ?? 10, max: c.hp_max ?? 10, conds: w?.conds ?? [],
      dist: tok && mine && b ? distanceFt(mine, tok, b.map.feet, b.diag, b.terrain) : null,
      concentrating: c.concentration?.spell ?? null,
      saves: Object.fromEntries(ABILITIES.map((a) => [a, saveBonus({ ...c, spells: c.spells ?? {}, attacks: c.attacks ?? [] } as SheetCharacter, a)])),
      near,
    });
  }
  return bestMoves(f, l.state, foes, { name: monster.name, conds: meW?.conds ?? [], reach: monsterReach(monster.stat_block) }, rules);
}

/**
 * A breath weapon (or any save action): the damage is rolled once, each creature picked makes its save, and full
 * or half comes off its HP (with its resistances). Recharge and per-day uses are spent.
 */
export async function rollSaveAction(monsterId: string, name: string, characterIds: string[], hidden: boolean): Promise<Fail | { lines: string[]; total: number | null; expression: string | null }> {
  refresh();
  const l = await load(monsterId);
  if ("error" in l) return l;
  const f = featuresOf(l.monster.stat_block);
  const a = f.saves.find((x) => x.name === name);
  if (!a) return { error: "That action isn't in its stat block." };
  const can = usable(a, l.state);
  if (!can.ok) return { error: `${name} is ${can.why}.` };
  const targets = [...new Set(characterIds)].slice(0, 12).map((id) => ({ characterId: id }));
  if (!targets.length) return { error: "Pick who is caught in it." };
  const { admin, combat, me } = l;
  const { session } = await liveState(admin, me.campaignId);
  const rules = await campaignRules(admin, me.campaignId);
  const base = { campaignId: me.campaignId, sessionId: session?.id ?? null, combatId: combat.id, round: combat.round ?? null, createdBy: me.userId };
  // the damage once, for everyone
  const dmg = a.damage ? roll(a.damage) : null;
  const { data: parent } = await admin.from("roll_events").insert({
    ...{ campaign_id: base.campaignId, session_id: base.sessionId, combat_id: base.combatId, round: base.round, rolled_by: me.userId },
    monster_id: monsterId, roll_type: dmg ? "damage" : "save_dc", source: name, expression: dmg?.expression ?? `DC ${a.dc} ${a.save_ability}`,
    dice: dmg?.dice ?? [], dice_all: dmg?.diceAll ?? [], modifier: dmg?.modifier ?? 0, total: dmg?.total ?? 0, damage_type: a.damage_type ?? null, hidden,
  }).select("id").single();
  const saves = await rollTargetSaves(admin, { ...base, parentRollId: parent?.id ?? null, ability: (a.save_ability ?? "DEX") as "DEX", dc: a.dc ?? 10, spell: name, targets, rules });
  const lines: string[] = [];
  for (const s of saves) {
    if (!dmg) { lines.push(`${s.name}: ${s.success ? "saved" : "failed"} (${s.total} vs DC ${s.dc})`); continue; }
    const factor = s.success ? (a.half === false ? null : "half") : "full";
    if (!factor) { lines.push(`${s.name}: saved (${s.total}), no damage`); continue; }
    const ap = await applyHp(admin, { ...base, kind: "damage", total: dmg.total, factor, rollId: parent?.id, actor: { monsterId }, target: { characterId: s.target.characterId }, hidden, damageType: a.damage_type ?? undefined, magical: false });
    lines.push(`${s.name}: ${s.success ? "saved" : "failed"} (${s.total} vs DC ${s.dc}), ${ap ? ap.amount : factor === "half" ? Math.floor(dmg.total / 2) : dmg.total} ${a.damage_type ?? "damage"}${ap?.defense ? ` (${ap.defense})` : ""}${ap?.dropped ? ", down!" : ""}`);
  }
  const err = await saveState(admin, l.row.id, afterUse(a, l.state));
  if (err && (a.recharge || a.per_day)) lines.push(err);
  return { lines, total: dmg?.total ?? null, expression: dmg?.expression ?? null };
}

/** Legendary actions: spend one (or give one back). They come back at the start of its turn. */
export async function spendLegendary(monsterId: string, delta: 1 | -1): Promise<Fail | { left: number }> {
  const l = await load(monsterId);
  if ("error" in l) return l;
  const max = featuresOf(l.monster.stat_block).legendary;
  if (!max) return { error: "It has no legendary actions." };
  const used = Math.max(0, Math.min(max, l.state.legendaryUsed + delta));
  if (delta === 1 && l.state.legendaryUsed >= max) return { error: "No legendary actions left this round." };
  const err = await saveState(l.admin, l.row.id, { ...l.state, legendaryUsed: used });
  if (err) return { error: err };
  return { left: max - used };
}

/** DM: a recharge action is back (rolled at the table), or mark one as used. */
export async function setRecharge(monsterId: string, name: string, ready: boolean): Promise<Fail | void> {
  const l = await load(monsterId);
  if ("error" in l) return l;
  const spent = ready ? l.state.spent.filter((n) => n !== name) : [...new Set([...l.state.spent, name])];
  const err = await saveState(l.admin, l.row.id, { ...l.state, spent, note: null });
  if (err) return { error: err };
}
