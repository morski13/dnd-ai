// Server-only (secret key): whose turn it is, and moving the turn on. Callers check permissions first.
// Used by the DM's "Next turn" and by a player's "End turn" on their sheet (fights played at the table).
import { sortCombatants, shortName } from "@/lib/session-data";
import type { Admin } from "@/lib/roll-service";
import { roll } from "@/lib/dice";
import { saveBonus, type SheetCharacter } from "@/lib/rules";
import { monsterSave } from "@/lib/moderator/concentration";
import { combine, saveMods } from "@/lib/engine/conditions";
import { afterSave, cleanEffects, effectDice, shownConditions, tick, withoutEffect, type TimedEffect, type TurnEvent } from "@/lib/engine/effects";
import { campaignRules } from "@/lib/engine/server";
import { atTurnStart, cleanState, featuresOf } from "@/lib/engine/monster";
import { checkFalls, terrainAtTurnStart, zonesAtCasterTurn, zonesOnTurn } from "@/lib/maps/server";

type Row = { id: string; name: string; initiative: number | null; initiative_hidden?: boolean; dex_mod: number; character_id: string | null; monster_id: string | null; health: string | null };

/** The fight's turn order (highest initiative first), and who's up. */
export async function turnOrder(admin: Admin, combatId: string) {
  const [{ data: combat }, { data: rows }] = await Promise.all([
    admin.from("combats").select("*").eq("id", combatId).maybeSingle(),
    admin.from("combatants").select("id, name, initiative, initiative_hidden, dex_mod, character_id, monster_id, health").eq("combat_id", combatId),
  ]);
  const order = sortCombatants((rows ?? []) as Row[]);
  const c = combat as { id: string; round: number; turn_index: number; name: string | null; mode?: string; ended_at: string | null } | null;
  const current = c && order.length ? order[c.turn_index % order.length] : null;
  return { combat: c, order, current };
}

/** Next creature's turn: skips monsters at 0 HP and dead characters (dying characters still roll death saves). */
export async function advanceTurn(admin: Admin, combatId: string, byUser?: string | null): Promise<{ error: string } | { round: number; turnIndex: number; events: string[] }> {
  const { combat, order, current: ending } = await turnOrder(admin, combatId);
  if (!combat || !order.length) return { error: "No one is in this fight." };
  const charIds = order.filter((r) => r.character_id).map((r) => r.character_id!);
  const { data: dead } = charIds.length
    ? await admin.from("death_saves").select("character_id").in("character_id", charIds).eq("dead", true)
    : { data: [] as { character_id: string }[] };
  const deadSet = new Set((dead ?? []).map((d) => d.character_id as string));
  const skip = (r: Row) => (!!r.monster_id && r.health === "down") || (!!r.character_id && deadSet.has(r.character_id));
  let index = combat.turn_index;
  let round = combat.round;
  for (let k = 0; k < order.length; k++) {
    index += 1;
    if (index >= order.length) { index = 0; round += 1; }
    if (!skip(order[index])) break;
  }
  // the turn that ends, then the one that starts: timed conditions run out, "save ends" saves are rolled
  const events: string[] = [];
  const campaignId = (combat as { campaign_id?: string }).campaign_id;
  // ending a turn inside Spirit Guardians, Moonbeam, Cloudkill…
  if (ending && campaignId && byUser) events.push(...await zonesOnTurn(campaignId, ending.id, "end", byUser).catch(() => [] as string[]));
  if (ending) events.push(...await tickEffects(admin, combat, { kind: "end", combatantId: ending.id }, byUser ?? null));
  await admin.from("combats").update({ turn_index: index, round }).eq("id", combatId);
  events.push(...await tickEffects(admin, combat, { kind: "start", combatantId: order[index].id }, byUser ?? null));
  // a monster's turn: recharge rolls (Fire Breath 5–6), legendary actions back (SQL 40; the DM sees the rolls on its card)
  if (order[index].monster_id) await monsterTurnStart(admin, order[index].id, order[index].monster_id!).catch(() => undefined);
  // its reaction comes back (SQL 38; fine without it)
  await admin.from("combatants").update({ reaction_used: false }).eq("id", order[index].id).then(() => undefined, () => undefined);
  // standing in fire, lava or acid when the turn starts hurts (battle map terrain)
  if (campaignId && byUser) events.push(...await terrainAtTurnStart(campaignId, order[index].id, byUser).catch(() => [] as string[]));
  // its own lasting spells count down (Cloudkill drifts), then starting a turn inside one (Web, Stinking Cloud)
  if (campaignId) events.push(...await zonesAtCasterTurn(campaignId, order[index].id).catch(() => [] as string[]));
  if (campaignId && byUser) events.push(...await zonesOnTurn(campaignId, order[index].id, "start", byUser).catch(() => [] as string[]));
  // a Fly spell or condition ended on the way: flyers that can't stay up fall
  if (campaignId && byUser) events.push(...await checkFalls(campaignId, byUser).catch(() => [] as string[]));
  // a new turn: that creature's movement on the battle map starts fresh (fine if there's no map)
  await admin.from("map_tokens").update({ moved_ft: 0, dashes: 0 }).eq("combatant_id", order[index].id).then(() => undefined, () => undefined);
  return { round, turnIndex: index, events };
}

/**
 * One turn event for everyone in the fight with timed effects (SQL 35; without it nothing happens).
 * Repeat saves are rolled here with the rules (a Paralyzed creature fails DEX saves…): monsters secretly.
 */
async function tickEffects(admin: Admin, combat: { id: string; round: number; campaign_id?: string; session_id?: string | null }, ev: TurnEvent, byUser: string | null): Promise<string[]> {
  const { data: rows, error } = await admin.from("combatants").select("*").eq("combat_id", combat.id);
  if (error || !rows?.length || !("effects" in rows[0])) return [];
  const out: string[] = [];
  let campaignId = combat.campaign_id ?? (rows[0] as { campaign_id: string }).campaign_id;
  const rules = await campaignRules(admin, campaignId);
  for (const raw of rows as { id: string; name: string; campaign_id: string; character_id: string | null; monster_id: string | null; conditions: string[] | null; effects: unknown }[]) {
    campaignId = raw.campaign_id;
    const effects = cleanEffects(raw.effects);
    if (!effects.length) continue;
    const t = tick(effects, raw.id, ev);
    let kept: TimedEffect[] = t.kept;
    const ended: TimedEffect[] = [...t.expired];
    for (const e of t.expired) out.push(`${raw.name}: ${e.name} ends.`);
    for (const due of t.saves) {
      const res = await rollRepeatSave(admin, raw, due, rules, { ...combat, campaign_id: campaignId }, byUser);
      if (!res) continue;
      const after = afterSave(kept, due.effectId, res.success);
      kept = after.kept;
      if (after.ended) ended.push(after.ended);
      out.push(`${raw.name}: ${due.name} ${due.ability} save ${raw.monster_id ? "(secret)" : `${res.total} vs DC ${due.dc}`}${raw.monster_id ? "" : res.success ? ": it ends." : ": still on."}`);
    }
    if (!ended.length && kept.every((k, i) => k === effects[i])) continue;
    const conditions = shownConditions(withoutEffect(raw.conditions ?? [], ended, kept), kept);
    await admin.from("combatants").update({ effects: kept, conditions }).eq("id", raw.id);
  }
  return out;
}

async function rollRepeatSave(
  admin: Admin, who: { id: string; name: string; character_id: string | null; monster_id: string | null; conditions: string[] | null; effects: unknown },
  due: { name: string; ability: "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA"; dc: number }, rules: "2014" | "2024",
  combat: { id: string; round: number; campaign_id: string; session_id?: string | null }, byUser: string | null,
) {
  let bonus = 0;
  if (who.monster_id) {
    const { data: m } = await admin.from("monsters").select("stat_block").eq("id", who.monster_id).maybeSingle();
    bonus = monsterSave(m?.stat_block, due.ability);
  } else if (who.character_id) {
    const { data: c } = await admin.from("characters").select("*").eq("id", who.character_id).maybeSingle();
    if (!c) return null;
    bonus = saveBonus({ ability_scores: c.ability_scores ?? {}, class_levels: c.class_levels ?? [], proficiencies: c.proficiencies ?? {}, spells: {}, attacks: [], homebrew: c.homebrew ?? undefined } as SheetCharacter, due.ability);
  }
  const conds = shownConditions(who.conditions ?? [], cleanEffects(who.effects));
  const mods = saveMods({ name: who.name, conds }, due.ability, rules);
  const r = roll(`1d20${bonus + mods.penalty >= 0 ? "+" : ""}${bonus + mods.penalty}${effectDice(cleanEffects(who.effects))}`, { advantage: combine("normal", mods) });
  const success = mods.autoFail ? false : r.total >= due.dc;
  if (byUser) {
    await admin.from("roll_events").insert({
      campaign_id: combat.campaign_id, session_id: combat.session_id ?? null, combat_id: combat.id, round: combat.round, rolled_by: byUser,
      character_id: who.character_id, monster_id: who.monster_id, roll_type: "save", source: `${due.name} (repeat save)`,
      expression: r.expression, dice: r.dice, dice_all: r.diceAll, modifier: r.modifier, total: r.total, dc: due.dc, ability: due.ability,
      success, hidden: !!who.monster_id,
    });
  }
  return { success, total: r.total };
}

/** One chip in the turn order on the sheet. Players don't see a monster's secret initiative. */
export type OrderChip = { id: string; name: string; initiative: number | null; hidden: boolean; me: boolean; enemy: boolean; current: boolean; out: boolean };

export function chipsFor(order: Row[], current: Row | null, characterId: string, viewerIsDm: boolean, npcIds: Set<string>): OrderChip[] {
  return order.map((r) => ({
    id: r.id, name: shortName(r.name),
    initiative: r.initiative_hidden && !viewerIsDm ? null : r.initiative,
    hidden: !!r.initiative_hidden && !viewerIsDm,
    me: r.character_id === characterId,
    enemy: !!r.monster_id && !npcIds.has(r.monster_id),
    current: current?.id === r.id,
    out: !!r.monster_id && r.health === "down",
  }));
}

async function monsterTurnStart(admin: Admin, combatantId: string, monsterId: string) {
  const [{ data: row }, { data: m }] = await Promise.all([
    admin.from("combatants").select("*").eq("id", combatantId).maybeSingle(),
    admin.from("monsters").select("stat_block").eq("id", monsterId).maybeSingle(),
  ]);
  if (!row || !("monster_state" in row)) return;
  const st = cleanState((row as { monster_state?: unknown }).monster_state);
  if (!st.spent.length && !st.legendaryUsed && !st.note) return;
  const next = atTurnStart(st, featuresOf(m?.stat_block).saves, () => roll("1d6").total);
  await admin.from("combatants").update({ monster_state: next }).eq("id", combatantId);
}
