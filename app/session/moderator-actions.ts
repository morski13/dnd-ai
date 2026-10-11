"use server";
// Fight moderator actions: fix/undo an HP change, death saves, conditions, DM HP edits.
import { roll } from "@/lib/dice";
import { loadCharacter } from "@/lib/character-data";
import { adjustHp, applyHp, maskFor, setDying, type Applied } from "@/lib/moderator/apply";
import { CONDITIONS, deathSave, NO_SAVES, type DeathSaves, type Factor } from "@/lib/moderator/hp";
import { createAdminClient } from "@/lib/supabase/admin";
import { longRestFor } from "@/lib/rest-service";
import { shortRest, type RestState } from "@/lib/rests";
import { createClient } from "@/lib/supabase/server";
import { liveState, touchCombat } from "@/lib/roll-service";

type Fail = { error: string };

async function me() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub as string | undefined;
  if (!userId) return { supabase, userId: null, campaignId: null, isDm: false };
  const { data: m } = await supabase.from("campaign_members").select("campaign_id, role")
    .eq("user_id", userId).order("last_active_at", { ascending: false, nullsFirst: false }).order("joined_at", { ascending: true }).limit(1).maybeSingle();
  return { supabase, userId, campaignId: (m?.campaign_id as string) ?? null, isDm: m?.role === "dm" || m?.role === "co_dm" };
}

async function ownsCharacter(userId: string, characterId: string | null) {
  if (!characterId) return false;
  const { data } = await createAdminClient().from("characters").select("owner_user_id").eq("id", characterId).maybeSingle();
  return data?.owner_user_id === userId;
}

/** Fix an HP change ("they saved: half", "resistant", …) or undo it. DM, the roller, or the target's player. */
export async function adjustEffect(effectId: string, to: Factor | "undo"): Promise<Applied | Fail> {
  const { userId, campaignId, isDm } = await me();
  if (!userId || !campaignId) return { error: "Join a campaign first." };
  const admin = createAdminClient();
  const { data: e } = await admin.from("effects").select("campaign_id, actor_character_id, target_character_id").eq("id", effectId).maybeSingle();
  if (!e || e.campaign_id !== campaignId) return { error: "Not found." };
  const allowed = isDm || await ownsCharacter(userId, e.actor_character_id) || await ownsCharacter(userId, e.target_character_id);
  if (!allowed) return { error: "Only the DM can change that." };
  const res = await adjustHp(admin, effectId, to, userId);
  if ("error" in res) return res;
  return maskFor({ ...res, canAdjust: !res.undone }, isDm);
}

export type DeathSaveResult = { d20: number | null; outcome: string; saves: DeathSaves | null; hp: number; secret: boolean };

/** Roll a death saving throw (on your turn at 0 HP). Secret if the house rule says so. */
export async function rollDeathSave(characterId: string): Promise<DeathSaveResult | Fail> {
  const { userId, character, canEdit } = await loadCharacter(characterId);
  if (!character || !userId) return { error: "Character not found." };
  if (!canEdit) return { error: "You can only roll for your own character." };
  if ((character.hp_current ?? 1) > 0) return { error: `${character.name} isn't dying.` };
  const admin = createAdminClient();
  const { data: ds } = await admin.from("death_saves").select("successes, failures, stable, dead").eq("character_id", character.id).maybeSingle();
  const saves = (ds as DeathSaves | null) ?? NO_SAVES;
  if (saves.dead) return { error: `${character.name} is dead.` };
  if (saves.stable) return { error: `${character.name} is stable and doesn't need to roll.` };

  const { data: camp } = await admin.from("campaigns").select("settings, dm_user_id").eq("id", character.campaign_id).single();
  const secretRule = (camp?.settings as { house_rules?: { death_saves?: string } } | null)?.house_rules?.death_saves === "secret";
  const { session, combat } = await liveState(admin, character.campaign_id);
  const r = roll("1d20");
  const d20 = r.dice[0];
  const res = deathSave({ hp: 0, max: character.hp_max ?? 0, temp: character.temp_hp ?? 0, saves }, d20);
  await admin.from("roll_events").insert({
    campaign_id: character.campaign_id, session_id: session?.id ?? null, combat_id: combat?.id ?? null, round: combat?.round ?? null,
    rolled_by: userId, character_id: character.id, roll_type: "death_save", source: "Death save",
    expression: r.expression, dice: r.dice, dice_all: r.diceAll, modifier: 0, total: r.total,
    success: d20 >= 10, is_crit: d20 === 20, is_fumble: d20 === 1, hidden: secretRule,
  });
  await setDying(admin, character.campaign_id, character.id, { hp: res.next.hp, saves: res.next.saves });
  if (combat) await touchCombat(admin, combat.id);
  const isDm = camp?.dm_user_id === userId;
  if (secretRule && !isDm) return { d20: null, outcome: "rolled in secret", saves: null, hp: res.next.hp, secret: true };
  return { d20, outcome: res.outcome, saves: res.next.saves, hp: res.next.hp, secret: secretRule };
}

/** DM: a dying character is stabilized (Medicine check, Spare the Dying…). */
export async function stabilize(characterId: string): Promise<Fail | void> {
  const { campaignId, isDm } = await me();
  if (!campaignId || !isDm) return { error: "Only the DM can do that." };
  const admin = createAdminClient();
  const { data: ds } = await admin.from("death_saves").select("successes, failures, stable, dead").eq("character_id", characterId).maybeSingle();
  const saves = (ds as DeathSaves | null) ?? NO_SAVES;
  if (saves.dead) return { error: "They're dead." };
  await setDying(admin, campaignId, characterId, { saves: { ...saves, stable: true } });
  const { combat } = await liveState(admin, campaignId);
  if (combat) await touchCombat(admin, combat.id);
}

/** Conditions on someone in the fight. DM: anyone. Players: their own character. */
export async function setConditions(combatantId: string, conditions: string[]): Promise<Fail | { conditions: string[] }> {
  const { userId, campaignId, isDm } = await me();
  if (!userId || !campaignId) return { error: "Join a campaign first." };
  const admin = createAdminClient();
  const { data: c } = await admin.from("combatants").select("id, campaign_id, character_id, combat_id").eq("id", combatantId).maybeSingle();
  if (!c || c.campaign_id !== campaignId) return { error: "Not found." };
  if (!isDm && !(await ownsCharacter(userId, c.character_id))) return { error: "Only the DM can change that." };
  const allowed = new Set<string>(CONDITIONS);
  const clean = [...new Set(conditions.filter((x) => allowed.has(x)))];
  await admin.from("combatants").update({ conditions: clean }).eq("id", c.id);
  await touchCombat(admin, c.combat_id);
  return { conditions: clean };
}

/** DM: change anyone's HP by hand (monster card +/−). */
export async function dmChangeHp(target: { characterId?: string | null; monsterId?: string | null }, kind: "damage" | "heal", amount: number): Promise<Applied | Fail> {
  const { userId, campaignId, isDm } = await me();
  if (!userId || !campaignId || !isDm) return { error: "Only the DM can do that." };
  const n = Math.floor(Number(amount));
  if (!Number.isFinite(n) || n <= 0 || n > 9999) return { error: "Enter a number from 1 to 9999." };
  const admin = createAdminClient();
  const { session, combat } = await liveState(admin, campaignId);
  const res = await applyHp(admin, {
    campaignId, sessionId: session?.id ?? null, combatId: combat?.id ?? null, round: combat?.round ?? null,
    kind, total: n, target, createdBy: userId,
  });
  if (!res) return { error: "Not found." };
  res.canAdjust = true;
  return res;
}

/** DM: turn automatic HP changes on or off for the campaign. */
export async function setAutoApply(on: boolean): Promise<Fail | void> {
  const { campaignId, isDm } = await me();
  if (!campaignId || !isDm) return { error: "Only the DM can change that." };
  const admin = createAdminClient();
  const { data } = await admin.from("campaigns").select("settings").eq("id", campaignId).single();
  const settings = (data?.settings ?? {}) as { house_rules?: Record<string, unknown> };
  await admin.from("campaigns").update({ settings: { ...settings, house_rules: { ...(settings.house_rules ?? {}), auto_apply_damage: on } } }).eq("id", campaignId);
  const { combat } = await liveState(admin, campaignId);
  if (combat) await touchCombat(admin, combat.id);
}

/** DM: the whole party rests. Long = everything back. Short = short-rest abilities and pact slots back
 *  (each player spends their own hit dice on their sheet). */
export async function partyRest(kind: "short" | "long"): Promise<{ error: string } | { count: number }> {
  const { userId, campaignId, isDm } = await me();
  if (!userId || !campaignId || !isDm) return { error: "Only the DM can do that." };
  const admin = createAdminClient();
  const { data: chars } = await admin.from("characters").select("id, class_levels, hp_max, hp_current, temp_hp, resources, spells, hit_dice_used, rule_set").eq("campaign_id", campaignId);
  for (const c of chars ?? []) {
    if (kind === "long") await longRestFor(c.id, userId);
    else {
      const r = shortRest({ ...c, resources: c.resources ?? [], spells: c.spells ?? {}, hit_dice_used: c.hit_dice_used ?? {} } as RestState, [], 0);
      await admin.from("characters").update({ resources: r.resources, spells: r.spells }).eq("id", c.id);
    }
  }
  return { count: chars?.length ?? 0 };
}

/** DM: a monster is concentrating on a spell (its CON saves on damage are rolled in secret). */
export async function setMonsterConcentration(monsterId: string, spell: string | null): Promise<{ error: string } | void> {
  const { userId, campaignId, isDm } = await me();
  if (!userId || !campaignId || !isDm) return { error: "Only the DM can do that." };
  const name = spell?.trim().slice(0, 60) || null;
  await createAdminClient().from("monsters").update({ concentration: name ? { spell: name, since: new Date().toISOString() } : null })
    .eq("id", monsterId).eq("campaign_id", campaignId);
}

/** DM: show a secret roll to the players now (instead of waiting for the fight to end). */
export async function revealRoll(rollId: string): Promise<{ error: string } | void> {
  const { userId, campaignId, isDm } = await me();
  if (!userId || !campaignId || !isDm) return { error: "Only the DM can do that." };
  const { error } = await createAdminClient().from("roll_events").update({ hidden: false }).eq("id", rollId).eq("campaign_id", campaignId);
  if (error) return { error: "Couldn't reveal it." };
}
