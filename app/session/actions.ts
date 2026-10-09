"use server";
// Session mode: start/end the session, run fights, roll for monsters, free rolls.
import { redirect } from "next/navigation";
import { roll } from "@/lib/dice";
import { initiative, type SheetCharacter } from "@/lib/rules";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCharacter } from "@/lib/character-data";
import { hitOrMiss, liveState, lookupTarget, recordInitiative, touchCombat } from "@/lib/roll-service";

type Fail = { error: string };
export type QuickRoll = {
  label: string; expression: string; total: number; dice: number[]; diceAll: number[]; modifier: number;
  isCrit: boolean; isFumble: boolean; success: boolean | null; target: string | null; hidden: boolean;
};

/** Who is asking, and their role in their campaign. */
async function me() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub ?? null;
  if (!userId) return { supabase, userId: null, campaignId: null, isDm: false };
  const { data: m } = await supabase
    .from("campaign_members").select("campaign_id, role").eq("user_id", userId)
    .order("joined_at", { ascending: true }).limit(1).maybeSingle();
  return { supabase, userId, campaignId: (m?.campaign_id as string) ?? null, isDm: m?.role === "dm" || m?.role === "co_dm" };
}

// ---------------------------------------------------------------- session
export async function startSession(): Promise<Fail | void> {
  const { supabase, campaignId, isDm } = await me();
  if (!campaignId || !isDm) return { error: "Only the DM can start a session." };
  const admin = createAdminClient();
  const { session } = await liveState(admin, campaignId);
  if (!session) {
    const { data: unstarted } = await supabase.from("sessions").select("id")
      .eq("campaign_id", campaignId).is("started_at", null).order("number").limit(1).maybeSingle();
    if (unstarted) {
      await supabase.from("sessions").update({ started_at: new Date().toISOString() }).eq("id", unstarted.id);
    } else {
      const { data: last } = await supabase.from("sessions").select("number").eq("campaign_id", campaignId)
        .order("number", { ascending: false }).limit(1).maybeSingle();
      const { error } = await supabase.from("sessions").insert({
        campaign_id: campaignId, number: (last?.number ?? 0) + 1, started_at: new Date().toISOString(),
      });
      if (error) return { error: "Couldn't start the session. " + error.message };
    }
  }
  redirect("/session");
}

export async function endSession(sessionId: string): Promise<Fail | void> {
  const { supabase, campaignId, isDm } = await me();
  if (!campaignId || !isDm) return { error: "Only the DM can end the session." };
  const { data: combats } = await supabase.from("combats").select("id").eq("session_id", sessionId).is("ended_at", null);
  for (const c of combats ?? []) await supabase.rpc("end_combat", { p_combat_id: c.id });
  const { error } = await supabase.from("sessions").update({ ended_at: new Date().toISOString() })
    .eq("id", sessionId).eq("campaign_id", campaignId);
  if (error) return { error: error.message };
  // House rule: hidden DM rolls are revealed afterwards.
  const admin = createAdminClient();
  await admin.from("roll_events").update({ hidden: false }).eq("session_id", sessionId);
  await admin.from("effects").update({ hidden: false }).eq("session_id", sessionId);
  redirect("/");
}

// ---------------------------------------------------------------- combat
export async function startCombat(sessionId: string, monsterIds: string[]): Promise<Fail | void> {
  const { supabase, campaignId, isDm } = await me();
  if (!campaignId || !isDm) return { error: "Only the DM can start a fight." };
  const { data: combat, error } = await supabase.from("combats")
    .insert({ campaign_id: campaignId, session_id: sessionId, name: "Combat", round: 1, turn_index: 0 })
    .select("id").single();
  if (error || !combat) return { error: "Couldn't start the fight. " + (error?.message ?? "") };

  const [{ data: party }, { data: monsters }] = await Promise.all([
    supabase.from("characters").select("id, name, ability_scores").eq("campaign_id", campaignId),
    monsterIds.length ? supabase.from("monsters").select("id, name, stat_block").in("id", monsterIds) : Promise.resolve({ data: [] }),
  ]);
  const rows = [
    ...(party ?? []).map((c) => ({
      combat_id: combat.id, campaign_id: campaignId, character_id: c.id, name: c.name,
      dex_mod: Math.floor(((c.ability_scores?.DEX ?? 10) - 10) / 2),
    })),
    ...(monsters ?? []).map((m: { id: string; name: string; stat_block: { init_bonus?: number } | null }) => ({
      combat_id: combat.id, campaign_id: campaignId, monster_id: m.id, name: m.name, dex_mod: m.stat_block?.init_bonus ?? 0,
    })),
  ];
  if (rows.length) await supabase.from("combatants").insert(rows);
}

export async function addMonster(form: { name: string; ac: number; hp: number; initBonus: number }, combatId: string | null): Promise<Fail | { id: string }> {
  const { supabase, campaignId, isDm } = await me();
  if (!campaignId || !isDm) return { error: "Only the DM can add monsters." };
  const name = form.name.trim();
  if (!name) return { error: "Give the monster a name." };
  const { data: m, error } = await supabase.from("monsters").insert({
    campaign_id: campaignId, name, ac: form.ac || null, hp_max: form.hp || null, hp_current: form.hp || null,
    stat_block: { init_bonus: form.initBonus || 0 }, visibility: "dm",
  }).select("id").single();
  if (error || !m) return { error: "Couldn't add the monster. " + (error?.message ?? "") };
  if (combatId) {
    await supabase.from("combatants").insert({ combat_id: combatId, campaign_id: campaignId, monster_id: m.id, name, dex_mod: form.initBonus || 0 });
    await touchCombat(createAdminClient(), combatId);
  }
  return { id: m.id };
}

/** DM: roll initiative for every monster (secretly, if the house rule says so) and unclaimed characters. */
export async function rollNpcInitiative(combatId: string, hidden: boolean): Promise<Fail | void> {
  const { supabase, userId, campaignId, isDm } = await me();
  if (!campaignId || !isDm) return { error: "Only the DM can do that." };
  const admin = createAdminClient();
  const { session } = await liveState(admin, campaignId);
  const { data: rows } = await supabase.from("combatants")
    .select("id, character_id, monster_id, name, initiative, dex_mod").eq("combat_id", combatId).is("initiative", null);

  for (const r of rows ?? []) {
    let bonus = r.dex_mod;
    let isHidden = false;
    if (r.character_id) {
      const { character } = await loadCharacter(r.character_id);
      if (!character || character.owner_user_id) continue; // players roll their own
      bonus = initiative(character as SheetCharacter);
    } else {
      isHidden = hidden;
    }
    const res = roll(`1d20${bonus >= 0 ? "+" : ""}${bonus}`);
    await admin.from("roll_events").insert({
      campaign_id: campaignId, session_id: session?.id ?? null, combat_id: combatId, round: 0, rolled_by: userId,
      character_id: r.character_id, monster_id: r.monster_id, roll_type: "initiative", source: "Initiative",
      expression: res.expression, dice: res.dice, dice_all: res.diceAll, modifier: res.modifier, total: res.total,
      hidden: isHidden,
    });
    await recordInitiative(admin, combatId, r.character_id ? { characterId: r.character_id } : { monsterId: r.monster_id }, res.total, isHidden);
  }
}

export async function nextTurn(combatId: string): Promise<Fail | void> {
  const { supabase, isDm } = await me();
  if (!isDm) return { error: "Only the DM can move the turn on." };
  const [{ data: combat }, { count }] = await Promise.all([
    supabase.from("combats").select("round, turn_index").eq("id", combatId).single(),
    supabase.from("combatants").select("id", { count: "exact", head: true }).eq("combat_id", combatId),
  ]);
  if (!combat || !count) return { error: "No one is in this fight." };
  const next = combat.turn_index + 1;
  const wrap = next >= count;
  await supabase.from("combats").update({ turn_index: wrap ? 0 : next, round: wrap ? combat.round + 1 : combat.round }).eq("id", combatId);
}

export async function endCombat(combatId: string): Promise<Fail | void> {
  const { supabase, isDm } = await me();
  if (!isDm) return { error: "Only the DM can end the fight." };
  const { error } = await supabase.rpc("end_combat", { p_combat_id: combatId });
  if (error) return { error: error.message };
}

// ---------------------------------------------------------------- monster + free rolls
export async function monsterRoll(
  monsterId: string,
  form: { label: string; expression: string; kind: "attack" | "damage" | "save" | "check" | "other"; hidden: boolean; targetCharacterId: string | null }
): Promise<Fail | QuickRoll> {
  const { userId, campaignId, isDm } = await me();
  if (!campaignId || !isDm) return { error: "Only the DM rolls for monsters." };
  const admin = createAdminClient();
  const { data: monster } = await admin.from("monsters").select("id, name").eq("id", monsterId).eq("campaign_id", campaignId).maybeSingle();
  if (!monster) return { error: "Monster not found." };

  let res;
  try { res = roll(form.expression); } catch (e) { return { error: (e as Error).message }; }
  const { session, combat } = await liveState(admin, campaignId);
  const tgt = await lookupTarget(admin, campaignId, { characterId: form.targetCharacterId });
  const success = form.kind === "attack" ? hitOrMiss(res.total, tgt?.ac, res.isCrit, res.isFumble) : null;
  const { error } = await admin.from("roll_events").insert({
    campaign_id: campaignId, session_id: session?.id ?? null, combat_id: combat?.id ?? null, round: combat?.round ?? null,
    rolled_by: userId, monster_id: monster.id, roll_type: form.kind, source: form.label.trim() || "Roll",
    expression: res.expression, dice: res.dice, dice_all: res.diceAll, modifier: res.modifier, total: res.total,
    is_crit: form.kind === "attack" && res.isCrit, is_fumble: form.kind === "attack" && res.isFumble, success,
    target_character_id: tgt?.characterId ?? null, hidden: form.hidden,
  });
  if (error) return { error: "Couldn't save the roll. " + error.message };
  return {
    label: `${monster.name}: ${form.label || "Roll"}`, expression: res.expression, total: res.total, dice: res.dice,
    diceAll: res.diceAll, modifier: res.modifier, isCrit: res.isCrit, isFumble: res.isFumble, success,
    target: tgt?.name ?? null, hidden: form.hidden,
  };
}

/** Any dice, any time ("2d6+3", "4d6kh3", "1d20+5 adv"). Saved to the log. */
export async function freeRoll(expression: string, label: string, characterId: string | null, hidden: boolean): Promise<Fail | QuickRoll> {
  const { userId, campaignId, isDm } = await me();
  if (!campaignId || !userId) return { error: "Join a campaign first." };
  if (characterId) {
    const { character, canEdit } = await loadCharacter(characterId);
    if (!character || !canEdit) return { error: "You can only roll for your own character." };
  }
  let res;
  try { res = roll(expression); } catch (e) { return { error: (e as Error).message }; }
  const admin = createAdminClient();
  const { session, combat } = await liveState(admin, campaignId);
  const { error } = await admin.from("roll_events").insert({
    campaign_id: campaignId, session_id: session?.id ?? null, combat_id: combat?.id ?? null, round: combat?.round ?? null,
    rolled_by: userId, character_id: characterId, roll_type: "other", source: label.trim() || "Free roll",
    expression: res.expression, dice: res.dice, dice_all: res.diceAll, modifier: res.modifier, total: res.total,
    hidden: isDm && hidden,
  });
  if (error) return { error: "Couldn't save the roll. " + error.message };
  return {
    label: label.trim() || "Free roll", expression: res.expression, total: res.total, dice: res.dice, diceAll: res.diceAll,
    modifier: res.modifier, isCrit: res.isCrit, isFumble: res.isFumble, success: null, target: null, hidden: isDm && hidden,
  };
}

// ---------------------------------------------------------------- saved fights
type SavedFightEntry = {
  stats: { name: string; ac: number; hp: number; init?: number; [k: string]: unknown };
  count: number;
  side: "enemy" | "ally";
};

/** DM: start a fight planned in the Fight planner. Creates its monsters and places everyone. */
export async function startSavedFight(sessionId: string, encounterId: string): Promise<Fail | void> {
  const { supabase, campaignId, isDm } = await me();
  if (!campaignId || !isDm) return { error: "Only the DM can start a fight." };
  const { data: enc } = await supabase.from("encounters").select("id, name, data").eq("id", encounterId).eq("campaign_id", campaignId).maybeSingle();
  if (!enc) return { error: "Saved fight not found." };
  const plan = (enc.data ?? {}) as { entries?: SavedFightEntry[]; characterIds?: string[] | null };
  const entries = (plan.entries ?? []).filter((e) => e.count > 0);

  // One monster row per creature ("Goblin Warrior 1", "Goblin Warrior 2"…), with its full stat block.
  const monsterRows = entries.flatMap((e) => Array.from({ length: e.count }, (_, i) => ({
    campaign_id: campaignId,
    name: e.count > 1 ? `${e.stats.name} ${i + 1}` : e.stats.name,
    kind: e.side === "ally" ? "npc" : "monster",
    ac: e.stats.ac, hp_max: e.stats.hp, hp_current: e.stats.hp,
    stat_block: { ...e.stats, init_bonus: e.stats.init ?? 0 },
    visibility: e.side === "ally" ? "party" : "dm",
  })));
  const { data: created, error: mErr } = monsterRows.length
    ? await supabase.from("monsters").insert(monsterRows).select("id, name, stat_block")
    : { data: [], error: null };
  if (mErr) return { error: "Couldn't create the monsters. " + mErr.message };

  const { data: combat, error } = await supabase.from("combats")
    .insert({ campaign_id: campaignId, session_id: sessionId, name: enc.name, round: 1, turn_index: 0 })
    .select("id").single();
  if (error || !combat) return { error: "Couldn't start the fight. " + (error?.message ?? "") };

  let q = supabase.from("characters").select("id, name, ability_scores").eq("campaign_id", campaignId);
  if (plan.characterIds?.length) q = q.in("id", plan.characterIds);
  const { data: party } = await q;
  const rows = [
    ...(party ?? []).map((c) => ({
      combat_id: combat.id, campaign_id: campaignId, character_id: c.id, name: c.name,
      dex_mod: Math.floor(((c.ability_scores?.DEX ?? 10) - 10) / 2),
    })),
    ...(created ?? []).map((m: { id: string; name: string; stat_block: { init_bonus?: number } | null }) => ({
      combat_id: combat.id, campaign_id: campaignId, monster_id: m.id, name: m.name, dex_mod: m.stat_block?.init_bonus ?? 0,
    })),
  ];
  if (rows.length) await supabase.from("combatants").insert(rows);
}
