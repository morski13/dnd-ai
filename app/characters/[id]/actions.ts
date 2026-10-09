"use server";
// Rolling, casting, HP, resources and the spell list for the character sheet.
// Dice are rolled HERE on the server, every bonus comes from the character's data, and only
// the server (with the secret key) may save rolls, so a roll can't be faked from the browser.
import { roll, type Advantage } from "@/lib/dice";
import { planRoll, type RollRequest, type SpellBook, type SpellInfo } from "@/lib/rules";
import { loadCharacter, SPELL_COLUMNS, type Resource } from "@/lib/character-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { hitOrMiss, liveState, lookupTarget, recordInitiative, type Target } from "@/lib/roll-service";

export type SavedRoll = {
  id: string;
  label: string;           // "Shortbow attack", "Stealth", "Healing Word (level 2)"
  rollType: string;
  expression: string;
  total: number | null;
  dice: number[];
  diceAll: number[];
  modifier: number;
  isCrit: boolean;
  isFumble: boolean;
  dc?: number;
  ability?: string;
  inSession: boolean;
  request: RollRequest;
  followUp?: { key: string; slot?: number }; // offer this damage roll next
  success?: boolean | null;                  // attack: hit (true) / miss (false)
  target?: string | null;                    // "Ogre"
};
export type RollResponse = { roll: SavedRoll; spells: SpellBook; resources: Resource[] };

type Fail = { error: string };
export async function rollForCharacter(
  characterId: string,
  request: RollRequest,
  advantage: Advantage,
  target?: Target | null
): Promise<RollResponse | Fail> {
  const { supabase, userId, character: c, canEdit, library } = await loadCharacter(characterId);
  if (!c) return { error: "Character not found." };
  if (!canEdit) return { error: "You can only roll for your own character." };

  let plan;
  try {
    plan = planRoll(c, request, library);
  } catch (e) {
    return { error: (e as Error).message };
  }

  // Spend the spell slot / resource (only on the first tap, never on the damage follow-up).
  let spells = c.spells;
  let resources = c.resources;
  const changes: Record<string, unknown> = {};
  if (request.kind === "use" && plan.spellSlot) {
    const k = String(plan.spellSlot);
    spells = { ...c.spells, slots_used: { ...c.spells.slots_used, [k]: (c.spells.slots_used?.[k] ?? 0) + 1 } };
    changes.spells = spells;
  }
  if (request.kind === "use" && plan.resource) {
    const r = c.resources.find((x) => x.name === plan.resource);
    if (!r) return { error: `${c.name} doesn't have ${plan.resource}.` };
    if ((r.used ?? 0) >= r.max) return { error: `No ${plan.resource} left. It comes back on a ${r.recharge ?? "rest"}.` };
    resources = c.resources.map((x) => (x === r ? { ...x, used: (x.used ?? 0) + 1 } : x));
    changes.resources = resources;
  }

  // Damage after a critical hit rolls double dice. Check the attack really was a crit.
  let critical = false;
  let parentRollId: string | null = null;
  let parentTarget: Target | null = null;
  if (request.kind === "damage" && request.parentRollId) {
    const { data: parent } = await supabase
      .from("roll_events").select("id, is_crit, character_id, target_character_id, target_monster_id")
      .eq("id", request.parentRollId).maybeSingle();
    if (parent && parent.character_id === c.id) {
      parentRollId = parent.id;
      critical = !!parent.is_crit;
      parentTarget = { characterId: parent.target_character_id, monsterId: parent.target_monster_id };
    }
  }

  let result: ReturnType<typeof roll> | null = null;
  try {
    const adv: Advantage = plan.d20 && (advantage === "advantage" || advantage === "disadvantage") ? advantage : "normal";
    result = plan.expression ? roll(plan.expression, { advantage: adv, critical }) : null;
  } catch (e) {
    return { error: `Can't roll "${plan.expression}": ${(e as Error).message}` };
  }

  if (Object.keys(changes).length) {
    const { error } = await supabase.from("characters").update(changes).eq("id", c.id);
    if (error) return { error: "Couldn't save the spell slot / resource. " + error.message };
  }

  const admin = createAdminClient();
  const { session, combat } = await liveState(admin, c.campaign_id);
  const tgt = await lookupTarget(admin, c.campaign_id, parentTarget ?? target);
  const success = plan.rollType === "attack" && result
    ? hitOrMiss(result.total, tgt?.ac, result.isCrit, result.isFumble)
    : null;
  const slotNote = plan.spellSlot ? ` (level ${plan.spellSlot})` : "";
  const { data: saved, error } = await admin
    .from("roll_events")
    .insert({
      campaign_id: c.campaign_id,
      session_id: session?.id ?? null,
      combat_id: combat?.id ?? null,
      round: combat?.round ?? null,
      rolled_by: userId,
      character_id: c.id,
      roll_type: plan.rollType,
      source: plan.source,
      expression: result?.expression ?? (plan.rollType === "save_dc" ? `DC ${plan.dc} ${plan.ability}` : `used${slotNote}`),
      dice: result?.dice ?? [],
      dice_all: result?.diceAll ?? null,
      modifier: result?.modifier ?? 0,
      total: result?.total ?? null,
      advantage: plan.d20 && result?.diceAll.length === 2 && result.expression.startsWith("2d20k") ? advantage : "normal",
      is_crit: plan.rollType === "attack" && !!result?.isCrit,
      is_fumble: plan.rollType === "attack" && !!result?.isFumble,
      success,
      dc: plan.dc ?? null,
      ability: plan.ability ?? null,
      damage_type: plan.damageType ?? null,
      spell_slot: plan.spellSlot ?? null,
      parent_roll_id: parentRollId,
      target_character_id: tgt?.characterId ?? null,
      target_monster_id: tgt?.monsterId ?? null,
    })
    .select("id")
    .single();
  if (error || !saved) return { error: "Couldn't save the roll. " + (error?.message ?? "") };

  if (plan.rollType === "initiative" && combat && result) {
    await recordInitiative(admin, combat.id, { characterId: c.id }, result.total);
  }

  const label =
    plan.rollType === "attack" ? `${plan.source} attack`
    : plan.rollType === "damage" ? `${plan.source} damage${critical ? " (crit!)" : ""}`
    : plan.rollType === "heal" ? `${plan.source} healing`
    : plan.rollType === "other" ? `${plan.source}: used`
    : plan.source;

  return {
    roll: {
      id: saved.id,
      label: label + slotNote,
      rollType: plan.rollType,
      expression: result?.expression ?? "",
      total: result?.total ?? null,
      dice: result?.dice ?? [],
      diceAll: result?.diceAll ?? [],
      modifier: result?.modifier ?? 0,
      isCrit: !!result?.isCrit && plan.d20,
      isFumble: !!result?.isFumble && plan.d20,
      dc: plan.dc,
      ability: plan.ability,
      inSession: !!session,
      request,
      followUp: plan.followUp && request.kind === "use" ? { key: request.key, slot: plan.spellSlot } : undefined,
      success,
      target: tgt?.name ?? null,
    },
    spells,
    resources,
  };
}

export type HpState = { hp_current: number; temp_hp: number };

/** Damage uses temporary HP first. Healing can't go above max. */
export async function changeHp(characterId: string, kind: "damage" | "heal" | "temp", amount: number): Promise<HpState | Fail> {
  const n = Math.floor(Number(amount));
  if (!Number.isFinite(n) || n <= 0 || n > 999) return { error: "Enter a number from 1 to 999." };

  const { supabase, userId, character, canEdit } = await loadCharacter(characterId);
  if (!character) return { error: "Character not found." };
  if (!canEdit) return { error: "You can only change your own character." };

  const max = character.hp_max ?? 0;
  let hp = character.hp_current ?? max;
  let temp = character.temp_hp ?? 0;
  let applied = n;

  if (kind === "damage") {
    const fromTemp = Math.min(temp, n);
    temp -= fromTemp;
    applied = Math.min(hp, n - fromTemp);
    hp -= applied;
  } else if (kind === "heal") {
    applied = Math.min(n, Math.max(max - hp, 0));
    hp += applied;
  } else {
    temp = Math.max(temp, n); // temp HP doesn't stack: keep the higher
  }

  const { error } = await supabase.from("characters").update({ hp_current: hp, temp_hp: temp }).eq("id", character.id);
  if (error) return { error: "Couldn't save HP. " + error.message };

  const admin = createAdminClient();
  const { session, combat } = await liveState(admin, character.campaign_id);
  await admin.from("effects").insert({
    campaign_id: character.campaign_id,
    session_id: session?.id ?? null,
    combat_id: combat?.id ?? null,
    round: combat?.round ?? null,
    created_by: userId,
    target_character_id: character.id,
    kind: kind === "temp" ? "temp_hp" : kind,
    amount: kind === "temp" ? n : applied,
    rolled_amount: n,
    dropped_to_zero: kind === "damage" && hp === 0 && (character.hp_current ?? max) > 0,
  });

  return { hp_current: hp, temp_hp: temp };
}

/** Sets how many uses of a resource (Rage, Channel Divinity...) are spent. */
export async function setResourceUsed(characterId: string, index: number, used: number): Promise<{ resources: Resource[] } | Fail> {
  const { supabase, character, canEdit } = await loadCharacter(characterId);
  if (!character) return { error: "Character not found." };
  if (!canEdit) return { error: "You can only change your own character." };
  if (!character.resources[index]) return { error: "Unknown resource." };

  const resources = character.resources.map((r, i) =>
    i === index ? { ...r, used: Math.min(Math.max(Math.floor(used), 0), r.max) } : r
  );
  const { error } = await supabase.from("characters").update({ resources }).eq("id", character.id);
  if (error) return { error: "Couldn't save. " + error.message };
  return { resources };
}

/** Sets how many spell slots of one level are spent. */
export async function setSlotsUsed(characterId: string, level: number, used: number): Promise<{ spells: SpellBook } | Fail> {
  const { supabase, character, canEdit } = await loadCharacter(characterId);
  if (!character) return { error: "Character not found." };
  if (!canEdit) return { error: "You can only change your own character." };
  const max = character.spells.slots?.[String(level)] ?? 0;
  if (!max) return { error: "No slots of that level." };

  const spells = { ...character.spells, slots_used: { ...character.spells.slots_used, [String(level)]: Math.min(Math.max(Math.floor(used), 0), max) } };
  const { error } = await supabase.from("characters").update({ spells }).eq("id", character.id);
  if (error) return { error: "Couldn't save. " + error.message };
  return { spells };
}

/** Long rest: all spell slots back. (Resources are restored with their pips.) */
export async function restoreAllSlots(characterId: string): Promise<{ spells: SpellBook } | Fail> {
  const { supabase, character, canEdit } = await loadCharacter(characterId);
  if (!character) return { error: "Character not found." };
  if (!canEdit) return { error: "You can only change your own character." };
  const spells = { ...character.spells, slots_used: {} };
  const { error } = await supabase.from("characters").update({ spells }).eq("id", character.id);
  if (error) return { error: "Couldn't save. " + error.message };
  return { spells };
}

export type SpellSummary = Pick<SpellInfo, "name" | "level" | "school" | "classes" | "casting_time" | "concentration" | "ritual">;

/** Search the spell library (by name, optionally only spells of the given classes). */
export async function searchSpells(characterId: string, query: string, classes: string[] | null): Promise<SpellSummary[] | Fail> {
  const { supabase, character } = await loadCharacter(characterId);
  if (!character) return { error: "Character not found." };
  let q = supabase.from("srd_spells").select("name, level, school, classes, casting_time, concentration, ritual")
    .order("level").order("name").limit(60);
  const text = query.trim().replace(/[%_,()]/g, "");
  if (text) q = q.ilike("name", `%${text}%`);
  if (classes?.length) q = q.overlaps("classes", classes);
  const { data, error } = await q;
  if (error) return { error: error.message };
  return (data ?? []) as SpellSummary[];
}

/** Add a spell to the character's list; returns its full info for the sheet. */
export async function addSpell(characterId: string, name: string): Promise<{ spells: SpellBook; spell: SpellInfo } | Fail> {
  const { supabase, character, canEdit } = await loadCharacter(characterId);
  if (!character) return { error: "Character not found." };
  if (!canEdit) return { error: "You can only change your own character." };
  const { data: spell } = await supabase.from("srd_spells").select(SPELL_COLUMNS).eq("name", name).maybeSingle();
  if (!spell) return { error: "Spell not found." };
  if (character.spells.known?.includes(name)) return { spells: character.spells, spell: spell as SpellInfo };

  const spells = { ...character.spells, known: [...(character.spells.known ?? []), name] };
  const { error } = await supabase.from("characters").update({ spells }).eq("id", character.id);
  if (error) return { error: "Couldn't save. " + error.message };
  return { spells, spell: spell as SpellInfo };
}

export async function removeSpell(characterId: string, name: string): Promise<{ spells: SpellBook } | Fail> {
  const { supabase, character, canEdit } = await loadCharacter(characterId);
  if (!character) return { error: "Character not found." };
  if (!canEdit) return { error: "You can only change your own character." };
  const spells = { ...character.spells, known: (character.spells.known ?? []).filter((n) => n !== name) };
  const { error } = await supabase.from("characters").update({ spells }).eq("id", character.id);
  if (error) return { error: "Couldn't save. " + error.message };
  return { spells };
}
