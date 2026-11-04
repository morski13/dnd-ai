"use server";
import { refresh } from "next/cache";
// Session mode: start/end the session, run fights, roll for monsters, free rolls.
import { redirect } from "next/navigation";
import { roll } from "@/lib/dice";
import { initiative, type SheetCharacter } from "@/lib/rules";
import { applyHp, campaignAutoApply, type Applied } from "@/lib/moderator/apply";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCharacter } from "@/lib/character-data";
import { hitOrMiss, liveState, lookupTarget, recordInitiative, touchCombat, type TableSession } from "@/lib/roll-service";
import { advanceTurn } from "@/lib/combat-turns";
import { attackMods, checkMods, combine as combineAdvantage, rollWith, saveMods } from "@/lib/engine/conditions";
import { campaignRules, whoIs } from "@/lib/engine/server";
import { effectAc } from "@/lib/engine/effects";
import { typesIn } from "@/lib/engine/damage";
import { openWindow } from "@/lib/reactions-server";
import { attackGeometry } from "@/lib/maps/server";
import type { Advantage } from "@/lib/dice";

type Fail = { error: string };
export type QuickRoll = {
  label: string; expression: string; total: number; dice: number[]; diceAll: number[]; modifier: number;
  isCrit: boolean; isFumble: boolean; success: boolean | null; target: string | null; hidden: boolean;
  applied?: Applied | null;
  reasons?: string[];       // what the rules changed (advantage from conditions, cover, distance)
  window?: { id: string; closesAt: string; who: string[] } | null; // a reaction pop-up opened by this roll
};

/** Who is asking, and their role in their campaign. */
async function me() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub ?? null;
  if (!userId) return { supabase, userId: null, campaignId: null, isDm: false };
  const { data: m } = await supabase
    .from("campaign_members").select("campaign_id, role").eq("user_id", userId)
    .order("last_active_at", { ascending: false, nullsFirst: false }).order("joined_at", { ascending: true }).limit(1).maybeSingle();
  return { supabase, userId, campaignId: (m?.campaign_id as string) ?? null, isDm: m?.role === "dm" || m?.role === "co_dm" };
}

// ---------------------------------------------------------------- session
export async function startSession(): Promise<Fail | void> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const { supabase, campaignId, isDm } = await me();
  if (!campaignId || !isDm) return { error: "Only the DM can start a session." };
  const admin = createAdminClient();
  const { session } = await liveState(admin, campaignId);
  // the players started tracking this game: the DM takes it over, same session, same rolls
  if (session && (session as { kind?: string }).kind === "table") await admin.from("sessions").update({ kind: "dm" }).eq("id", session.id);
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
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const { campaignId, isDm } = await me();
  if (!campaignId || !isDm) return { error: "Only the DM can end the session." };
  const { data: ended } = await createAdminClient().from("sessions").select("number").eq("id", sessionId).maybeSingle();
  const r = await closeSession(campaignId, sessionId);
  if (r) return r;
  redirect(ended ? `/stats/wrapped?s=${ended.number}` : "/"); // straight to the night's Wrapped (everyone else's opens too)
}

/**
 * Ends a session: running fights end (their hidden rolls are revealed, like end_combat), the session's
 * hidden rolls are revealed (house rule), and shops opened for the party close.
 * Only call after checking who may end it.
 */
async function closeSession(campaignId: string, sessionId: string): Promise<Fail | null> {
  const admin = createAdminClient();
  const { data: combats } = await admin.from("combats").select("id").eq("session_id", sessionId).is("ended_at", null);
  for (const c of combats ?? []) {
    await admin.from("combats").update({ ended_at: new Date().toISOString() }).eq("id", c.id);
    await admin.from("roll_events").update({ hidden: false }).eq("combat_id", c.id);
    await admin.from("effects").update({ hidden: false }).eq("combat_id", c.id);
    const { data: seen } = await admin.from("roll_events").select("monster_id").eq("combat_id", c.id).not("monster_id", "is", null);
    const ids = [...new Set((seen ?? []).map((x) => x.monster_id as string))];
    if (ids.length) await admin.from("monsters").update({ visibility: "party" }).in("id", ids);
  }
  const { error } = await admin.from("sessions").update({ ended_at: new Date().toISOString() })
    .eq("id", sessionId).eq("campaign_id", campaignId);
  if (error) return { error: error.message };
  await admin.from("roll_events").update({ hidden: false }).eq("session_id", sessionId);
  await admin.from("effects").update({ hidden: false }).eq("session_id", sessionId);
  await admin.from("shops").update({ is_open: false, opened_session: null }).eq("campaign_id", campaignId).eq("is_open", true);
  return null;
}

// ---------------------------------------------------------------- sessions the players start

/** The campaign of this character, if the user is a member of it (and whether they're its DM). */
async function memberOf(characterId: string) {
  const { supabase, userId } = await me();
  if (!userId) return null;
  const { data: ch } = await supabase.from("characters").select("campaign_id").eq("id", characterId).maybeSingle();
  if (!ch) return null;
  const { data: m } = await supabase.from("campaign_members").select("role").eq("campaign_id", ch.campaign_id).eq("user_id", userId).maybeSingle();
  if (!m) return null;
  return { userId, campaignId: ch.campaign_id as string, isDm: m.role === "dm" || m.role === "co_dm" };
}

async function describe(admin: ReturnType<typeof createAdminClient>, s: { id: string; number: number; kind?: string; started_by?: string | null }, userId: string): Promise<TableSession> {
  let startedBy: string | null = null;
  if (s.started_by) {
    const { data } = await admin.from("profiles").select("display_name").eq("id", s.started_by).maybeSingle();
    startedBy = (data?.display_name as string) ?? null;
  }
  return { id: s.id, number: s.number, kind: s.kind === "table" ? "table" : "dm", startedBy, mine: s.started_by === userId };
}

/** The running session of this character's campaign, as the sheet shows it. */
export async function currentSession(characterId: string): Promise<TableSession> {
  const who = await memberOf(characterId);
  if (!who) return null;
  const admin = createAdminClient();
  const { session } = await liveState(admin, who.campaignId);
  return session ? describe(admin, session as { id: string; number: number }, who.userId) : null;
}

/**
 * "Track this game": any member starts a session when none is running, so the table's rolls count in the
 * stats even when the DM doesn't use Session mode. If one is already running (the DM's or another
 * player's), you simply join it. A session the DM planned but hasn't started is used first.
 */
export async function startTableSession(characterId: string): Promise<Fail | { session: TableSession }> {
  refresh();
  const who = await memberOf(characterId);
  if (!who) return { error: "You're not in this character's campaign." };
  const { userId, campaignId } = who;
  const admin = createAdminClient();
  const { session } = await liveState(admin, campaignId);
  if (session) return { session: await describe(admin, session as { id: string; number: number }, userId) };
  const now = new Date().toISOString();
  const { data: unstarted } = await admin.from("sessions").select("id")
    .eq("campaign_id", campaignId).is("started_at", null).order("number").limit(1).maybeSingle();
  let error: { message: string } | null = null;
  if (unstarted) {
    ({ error } = await admin.from("sessions").update({ started_at: now, kind: "table", started_by: userId }).eq("id", unstarted.id));
  } else {
    const { data: last } = await admin.from("sessions").select("number").eq("campaign_id", campaignId)
      .order("number", { ascending: false }).limit(1).maybeSingle();
    ({ error } = await admin.from("sessions").insert({ campaign_id: campaignId, number: (last?.number ?? 0) + 1, started_at: now, kind: "table", started_by: userId }));
  }
  if (error) return { error: /kind|started_by/.test(error.message) ? "Ask whoever runs the app to run supabase/29-table-sessions.sql first." : "Couldn't start tracking. " + error.message };
  const { session: fresh } = await liveState(admin, campaignId);
  return { session: fresh ? await describe(admin, fresh as { id: string; number: number }, userId) : null };
}

/** End a session the players started (any player of the campaign may; the DM may end any session). */
export async function endTableSession(characterId: string, sessionId: string): Promise<Fail | { ok: true; number: number }> {
  refresh();
  const who = await memberOf(characterId);
  if (!who) return { error: "You're not in this character's campaign." };
  const admin = createAdminClient();
  const { data: s } = await admin.from("sessions").select("*").eq("id", sessionId).eq("campaign_id", who.campaignId).is("ended_at", null).maybeSingle();
  if (!s) return { error: "That session isn't running any more." };
  if ((s as { kind?: string }).kind !== "table" && !who.isDm) return { error: "The DM runs this session; only the DM can end it." };
  const r = await closeSession(who.campaignId, sessionId);
  return r ?? { ok: true, number: (s as { number: number }).number };
}

// ---------------------------------------------------------------- combat
export async function startCombat(sessionId: string, monsterIds: string[]): Promise<Fail | void> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
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
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
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
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
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
      if (!character || (character.owner_user_id && character.owner_user_id !== userId)) continue; // players roll their own; the DM's own characters are rolled here
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
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const { isDm, campaignId, userId } = await me();
  if (!isDm || !campaignId) return { error: "Only the DM can move the turn on." };
  const admin = createAdminClient();
  const { data: own } = await admin.from("combats").select("id").eq("id", combatId).eq("campaign_id", campaignId).maybeSingle();
  if (!own) return { error: "That fight isn't in your campaign." };
  const r = await advanceTurn(admin, combatId, userId);
  if ("error" in r) return r;
}

/**
 * Combat mode for a fight played at the table: no monsters needed in the app. Everyone in the party joins;
 * players roll initiative from their sheets and end their own turns. The DM can still add enemies (name, AC, HP).
 */
export async function startTableCombat(sessionId: string): Promise<Fail | { combatId: string }> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const { campaignId, isDm } = await me();
  if (!campaignId || !isDm) return { error: "Only the DM can start combat mode." };
  const admin = createAdminClient();
  const { session, combat: running } = await liveState(admin, campaignId);
  if (!session || session.id !== sessionId) return { error: "Start the session first." };
  if (running) return { combatId: running.id as string };
  const row = { campaign_id: campaignId, session_id: sessionId, name: "Combat at the table", round: 1, turn_index: 0 };
  // "mode" needs 34-table-combat.sql; without it the fight is saved as an ordinary one
  let { data: c, error } = await admin.from("combats").insert({ ...row, mode: "table" }).select("id").single();
  if (error && /mode/.test(error.message)) ({ data: c, error } = await admin.from("combats").insert(row).select("id").single());
  if (error || !c) return { error: "Couldn't start combat mode. " + (error?.message ?? "") };
  // the players' characters (not the DM's NPC characters)
  const [{ data: chars }, { data: members }] = await Promise.all([
    admin.from("characters").select("id, name, owner_user_id, ability_scores").eq("campaign_id", campaignId),
    admin.from("campaign_members").select("user_id, role").eq("campaign_id", campaignId),
  ]);
  const players = new Set((members ?? []).filter((m) => m.role === "player").map((m) => m.user_id as string));
  const rows = (chars ?? []).filter((ch) => ch.owner_user_id && players.has(ch.owner_user_id as string)).map((ch) => ({
    combat_id: c!.id, campaign_id: campaignId, character_id: ch.id, name: ch.name,
    dex_mod: Math.floor((((ch.ability_scores as Record<string, number> | null)?.DEX ?? 10) - 10) / 2),
  }));
  if (rows.length) await admin.from("combatants").insert(rows);
  await copyConditions(admin, c.id as string);
  return { combatId: c.id as string };
}

/** Conditions a character already has (Poisoned from the last fight) show on the initiative chips too. */
async function copyConditions(admin: ReturnType<typeof createAdminClient>, combatId: string) {
  const { data: rows } = await admin.from("combatants").select("id, character_id").eq("combat_id", combatId).not("character_id", "is", null);
  const ids = (rows ?? []).map((r) => r.character_id as string);
  if (!ids.length) return;
  const { data: chars, error } = await admin.from("characters").select("id, conditions").in("id", ids);
  if (error) return; // before 34-table-combat.sql
  for (const ch of chars ?? []) {
    const cond = (ch as { conditions?: string[] }).conditions ?? [];
    if (!cond.length) continue;
    const r = (rows ?? []).find((x) => x.character_id === ch.id);
    if (r) await admin.from("combatants").update({ conditions: cond }).eq("id", r.id);
  }
}

export async function endCombat(combatId: string): Promise<Fail | void> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const { supabase, isDm } = await me();
  if (!isDm) return { error: "Only the DM can end the fight." };
  const { error } = await supabase.rpc("end_combat", { p_combat_id: combatId });
  if (error) return { error: error.message };
}

// ---------------------------------------------------------------- monster + free rolls
export async function monsterRoll(
  monsterId: string,
  form: { label: string; expression: string; kind: "attack" | "damage" | "save" | "check" | "other"; hidden: boolean; targetCharacterId: string | null; crit?: boolean }
): Promise<Fail | QuickRoll> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const { userId, campaignId, isDm } = await me();
  if (!campaignId || !isDm) return { error: "Only the DM rolls for monsters." };
  const admin = createAdminClient();
  const { data: monster } = await admin.from("monsters").select("id, name").eq("id", monsterId).eq("campaign_id", campaignId).maybeSingle();
  if (!monster) return { error: "Monster not found." };

  let res;
  const { session, combat } = await liveState(admin, campaignId);
  // the rules: the monster's and the target's conditions, distance and cover on the battle map
  const reasons: string[] = [];
  let adv: Advantage = /\badv\b/i.test(form.expression) ? "advantage" : /\bdis\b/i.test(form.expression) ? "disadvantage" : "normal";
  let coverAc = 0;
  let autoCrit: string | undefined;
  let autoFail: string | undefined;
  if (combat && (form.kind === "attack" || form.kind === "save" || form.kind === "check")) {
    const rules = await campaignRules(admin, campaignId);
    const meW = await whoIs(admin, campaignId, combat.id, { monsterId });
    if (meW && form.kind === "attack") {
      const them = await whoIs(admin, campaignId, combat.id, { characterId: form.targetCharacterId });
      const geo = form.targetCharacterId ? await attackGeometry(campaignId, { monsterId }, { characterId: form.targetCharacterId }) : null;
      if (geo?.cover.level === "total") return { error: `${them?.name ?? "The target"} has total cover from ${monster.name}.` };
      const within5 = geo ? geo.dist <= 5 : true;
      const m = attackMods(meW, them ?? { name: "the target", conds: [] }, { ranged: !!geo && geo.dist > 10, within5, rules });
      if (geo && !geo.sees && !(them?.conds ?? []).includes("Invisible") && !meW.conds.includes("Blinded")) m.disadvantage.push(`${monster.name} can't see ${them?.name ?? "the target"} (darkness or smoke)`);
      if (geo && !geo.seen && !meW.conds.includes("Invisible") && !(them?.conds ?? []).includes("Blinded")) m.advantage.push(`${them?.name ?? "the target"} can't see ${monster.name}`);
      adv = combineAdvantage(adv, m);
      coverAc = (geo?.cover.ac ?? 0) + (them ? effectAc(them.effects) : 0); // cover, plus Shield and the like
      autoCrit = m.autoCrit;
      reasons.push(...rollWith("normal", m).reasons, ...(geo?.cover.why ? [`${them?.name}: ${geo.cover.why}`] : []), ...(geo ? [`${geo.dist} ft away`] : []));
    } else if (meW && (form.kind === "save" || form.kind === "check")) {
      const ab = (form.label.match(/\b(STR|DEX|CON|INT|WIS|CHA)\b/)?.[1] ?? null) as "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA" | null;
      const m = form.kind === "save" && ab ? saveMods(meW, ab, rules) : checkMods(meW, rules);
      adv = combineAdvantage(adv, m);
      autoFail = m.autoFail;
      reasons.push(...rollWith("normal", m).reasons);
    }
  }
  // Damage right after a critical hit: every damage die is rolled twice.
  try { res = roll(form.expression.replace(/\s*\b(adv|dis)\b/gi, ""), { critical: form.kind === "damage" && !!form.crit, advantage: adv }); } catch (e) { return { error: (e as Error).message }; }
  const tgt = await lookupTarget(admin, campaignId, { characterId: form.targetCharacterId });
  let success = form.kind === "attack" ? hitOrMiss(res.total, tgt?.ac != null ? tgt.ac + coverAc : null, res.isCrit, res.isFumble) : null;
  if (autoCrit && success !== false && form.kind === "attack" && !res.isCrit) { res = { ...res, isCrit: true }; reasons.unshift(autoCrit); }
  if (autoFail) { success = false; reasons.unshift(autoFail); }
  const { data: saved, error } = await admin.from("roll_events").insert({
    campaign_id: campaignId, session_id: session?.id ?? null, combat_id: combat?.id ?? null, round: combat?.round ?? null,
    rolled_by: userId, monster_id: monster.id, roll_type: form.kind, source: form.label.trim() || "Roll",
    expression: res.expression, dice: res.dice, dice_all: res.diceAll, modifier: res.modifier, total: res.total,
    is_crit: form.kind === "attack" && res.isCrit, is_fumble: form.kind === "attack" && res.isFumble, success,
    target_character_id: tgt?.characterId ?? null, hidden: form.hidden,
  }).select("id").single();
  if (error || !saved) return { error: "Couldn't save the roll. " + (error?.message ?? "") };

  // Fight moderator: monster damage on a character comes off their HP right away.
  let applied: Applied | null = null;
  if (form.kind === "damage" && tgt && session && await campaignAutoApply(admin, campaignId)) {
    applied = await applyHp(admin, {
      campaignId, sessionId: session.id, combatId: combat?.id ?? null, round: combat?.round ?? null,
      kind: "damage", total: res.total, crit: !!form.crit, rollId: saved.id,
      actor: { monsterId: monster.id }, target: { characterId: tgt.characterId }, createdBy: userId!, hidden: form.hidden,
    });
    if (applied) applied.canAdjust = true;
  }
  // Reactions: an attack on a character (Shield, Uncanny Dodge, Silvery Barbs…), damage taken (Hellish Rebuke, Absorb Elements)
  let window: { id: string; closesAt: string; who: string[] } | null = null;
  if (combat && tgt?.characterId && (form.kind === "attack" || (form.kind === "damage" && applied && applied.amount > 0))) {
    try {
      const rules = await campaignRules(admin, campaignId);
      const [atkW, tgtW] = await Promise.all([whoIs(admin, campaignId, combat.id, { monsterId }), whoIs(admin, campaignId, combat.id, { characterId: tgt.characterId })]);
      if (atkW?.combatantId && tgtW?.combatantId) {
        const geo = await attackGeometry(campaignId, { monsterId }, { characterId: tgt.characterId });
        window = await openWindow(admin, {
          campaignId, combatId: combat.id, rules, rollId: saved.id, effectId: applied?.effectId ?? null,
          trigger: form.kind === "attack"
            ? { kind: "attack", attackerId: atkW.combatantId, attackerName: monster.name, targetId: tgtW.combatantId, total: res.total, hit: success, ac: tgt.ac != null ? tgt.ac + coverAc : null, melee: geo ? geo.dist <= 10 : true }
            : { kind: "damage", sourceId: atkW.combatantId, sourceName: monster.name, targetId: tgtW.combatantId, types: typesIn(form.label) },
        });
      }
    } catch { window = null; }
  }
  return {
    window,
    label: `${monster.name}: ${form.label || "Roll"}`, expression: res.expression, total: res.total, dice: res.dice,
    diceAll: res.diceAll, modifier: res.modifier, isCrit: res.isCrit, isFumble: res.isFumble, success,
    target: tgt?.name ?? null, hidden: form.hidden, applied, reasons: reasons.length ? reasons : undefined,
  };
}

/** Any dice, any time ("2d6+3", "4d6kh3", "1d20+5 adv"). Saved to the log. */
export async function freeRoll(expression: string, label: string, characterId: string | null, hidden: boolean): Promise<Fail | QuickRoll> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
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
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
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

/**
 * Player fight mode at the table: join the session's running fight, or start one ("Table fight") when there's none,
 * so this character's rolls carry the fight (combat_id) and the recap shows it.
 */
export async function joinTableFight(characterId: string): Promise<Fail | { combatId: string; started: boolean }> {
  refresh();
  const { userId, campaignId, isDm } = await me();
  if (!userId || !campaignId) return { error: "Join a campaign first." };
  const admin = createAdminClient();
  const { data: ch } = await admin.from("characters").select("id, name, campaign_id, owner_user_id, ability_scores").eq("id", characterId).maybeSingle();
  if (!ch || ch.campaign_id !== campaignId || (!isDm && ch.owner_user_id !== userId)) return { error: "That isn't your character." };
  const { session, combat } = await liveState(admin, campaignId);
  if (!session) return { error: "Start Track game first: a fight belongs to a session." };
  let combatId = combat?.id ?? null;
  let started = false;
  if (!combatId) {
    const row = { campaign_id: campaignId, session_id: session.id, name: "Table fight", round: 1, turn_index: 0 };
    let { data: c, error } = await admin.from("combats").insert({ ...row, mode: "table" }).select("id").single();
    if (error && /mode/.test(error.message)) ({ data: c, error } = await admin.from("combats").insert(row).select("id").single()); // before SQL 34
    if (error || !c) return { error: error?.message ?? "Couldn't start the fight." };
    combatId = c.id as string; started = true;
  }
  const { data: there } = await admin.from("combatants").select("id").eq("combat_id", combatId).eq("character_id", characterId).maybeSingle();
  if (!there) await admin.from("combatants").insert({ combat_id: combatId, campaign_id: campaignId, character_id: characterId, name: ch.name,
    dex_mod: Math.floor((((ch.ability_scores as Record<string, number> | null)?.DEX ?? 10) - 10) / 2) });
  return { combatId, started };
}

/** Player turns fight mode off: a "Table fight" (one players started) ends once nobody has rolled in it for 10 minutes or everyone's left. */
export async function leaveTableFight(characterId: string): Promise<Fail | { ended: boolean }> {
  refresh();
  const { userId, campaignId } = await me();
  if (!userId || !campaignId) return { error: "Join a campaign first." };
  const admin = createAdminClient();
  const { combat } = await liveState(admin, campaignId);
  if (!combat) return { ended: false };
  const { data: c } = await admin.from("combats").select("id, name").eq("id", combat.id).maybeSingle();
  if (c?.name !== "Table fight") return { ended: false }; // the DM's fights are the DM's to end
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count } = await admin.from("roll_events").select("id", { count: "exact", head: true }).eq("combat_id", combat.id).neq("character_id", characterId).gt("created_at", since);
  if (count) return { ended: false };
  await admin.from("combats").update({ ended_at: new Date().toISOString() }).eq("id", combat.id);
  return { ended: true };
}
