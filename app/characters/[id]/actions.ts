"use server";
// Rolling, casting, HP, resources and the spell list for the character sheet.
// Dice are rolled HERE on the server, every bonus comes from the character's data, and only
// the server (with the secret key) may save rolls, so a roll can't be faked from the browser.
import { cleanSheetStyle, type SheetStyle } from "@/lib/themes";
import { roll, type Advantage } from "@/lib/dice";
import { allOptions, planRoll, type RollRequest, type SpellBook, type SpellInfo } from "@/lib/rules";
import { loadCharacter, SPELL_COLUMNS, type Resource } from "@/lib/character-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { hitOrMiss, liveState, lookupTarget, recordInitiative, type Target } from "@/lib/roll-service";
import type { ConcentrationCheck } from "@/lib/moderator/concentration";
import { maskSaves, rollTargetSaves, type TargetSave } from "@/lib/moderator/saves";
import { applyHp, campaignAutoApply, isCampaignDm, maskFor, type Applied } from "@/lib/moderator/apply";

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
  applied?: Applied | null;                  // what the fight moderator did with it (HP change)
  missed?: boolean;                          // damage after a missed attack: not applied
};
export type RollResponse = {
  roll: SavedRoll; spells: SpellBook; resources: Resource[]; concentration?: { spell: string } | null; endedConcentration?: string | null;
  saves?: TargetSave[];          // a save spell: each target's save (monster results only for the DM)
  appliedAll?: Applied[];        // damage from a save spell: one HP change per target
};

type Fail = { error: string };
export async function rollForCharacter(
  characterId: string,
  request: RollRequest,
  advantage: Advantage,
  target?: Target | null,
  moreTargets?: Target[]
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
  let parentMissed = false;
  let parentIsSave = false;
  if (request.kind === "damage" && request.parentRollId) {
    const { data: parent } = await supabase
      .from("roll_events").select("id, is_crit, success, character_id, target_character_id, target_monster_id, roll_type")
      .eq("id", request.parentRollId).maybeSingle();
    if (parent && parent.character_id === c.id) {
      parentRollId = parent.id;
      critical = !!parent.is_crit;
      parentMissed = parent.success === false;
      parentIsSave = parent.roll_type === "save_dc";
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

  // Casting a concentration spell: you now concentrate on it (and stop concentrating on the old one).
  let endedConcentration: string | null = null;
  let concentration = c.concentration ?? null;
  if (request.kind === "use" && request.key.startsWith("spell:")) {
    const sp = library.find((x) => `spell:${x.name}` === request.key);
    if (sp?.concentration) {
      if (concentration?.spell && concentration.spell !== sp.name) endedConcentration = concentration.spell;
      concentration = { spell: sp.name, since: new Date().toISOString() };
      changes.concentration = concentration;
    }
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

  const viewerIsDm = await isCampaignDm(admin, c.campaign_id, userId);
  const base = { campaignId: c.campaign_id, sessionId: session?.id ?? null, combatId: combat?.id ?? null, round: combat?.round ?? null, createdBy: userId };

  // A save spell: the app rolls every target's save now (monster saves secretly).
  let saves: TargetSave[] | undefined;
  if (plan.rollType === "save_dc" && session && plan.dc && plan.ability) {
    const all = [target, ...(moreTargets ?? [])].filter((t): t is Target => !!(t?.characterId || t?.monsterId));
    const unique = all.filter((t, i) => all.findIndex((x) => x.characterId === t.characterId && x.monsterId === t.monsterId) === i);
    if (unique.length) {
      saves = maskSaves(await rollTargetSaves(admin, { ...base, parentRollId: saved.id, ability: plan.ability, dc: plan.dc, spell: plan.source, targets: unique }), viewerIsDm);
    }
  }

  // Damage from a save spell: full damage on a failed save; half (or none) on a success, for each target.
  let appliedAll: Applied[] | undefined;
  if (plan.rollType === "damage" && parentIsSave && parentRollId && result && session && await campaignAutoApply(admin, c.campaign_id)) {
    const { data: rows } = await admin.from("roll_events").select("monster_id, character_id, success").eq("parent_roll_id", parentRollId).eq("roll_type", "save");
    const opt = request.kind === "damage" ? allOptions(c, library).find((x) => x.key === request.key) : undefined;
    appliedAll = [];
    for (const r of rows ?? []) {
      if (r.success && !opt?.half_on_save) continue; // saved completely
      const one = await applyHp(admin, {
        ...base, sessionId: session.id, kind: "damage", total: result.total, crit: false, rollId: saved.id, factor: r.success ? "half" : "full",
        actor: { characterId: c.id }, target: { characterId: r.character_id, monsterId: r.monster_id },
      });
      if (!one) continue;
      const shown = maskFor({ ...one, canAdjust: true }, viewerIsDm);
      // players don't learn how much a monster took (that would give its save away)
      appliedAll.push(!viewerIsDm && one.target.monsterId ? { ...shown, amount: -1, rolled: -1, factor: "full", canAdjust: false } : shown);
    }
  }

  // Fight moderator: damage / healing with a target changes their HP right away.
  let applied: Applied | null = appliedAll?.[0] ?? null;
  if (!parentIsSave && (plan.rollType === "damage" || plan.rollType === "heal") && result && tgt && session && !parentMissed
      && await campaignAutoApply(admin, c.campaign_id)) {
    applied = await applyHp(admin, {
      campaignId: c.campaign_id, sessionId: session.id, combatId: combat?.id ?? null, round: combat?.round ?? null,
      kind: plan.rollType, total: result.total, crit: critical, rollId: saved.id,
      actor: { characterId: c.id }, target: { characterId: tgt.characterId, monsterId: tgt.monsterId }, createdBy: userId,
    });
    if (applied) applied = maskFor({ ...applied, canAdjust: true }, viewerIsDm);
  }

  // Healing several creatures at once (Mass Healing Word, Mass Cure Wounds…): everyone picked gets the same amount.
  if (plan.rollType === "heal" && result && session && moreTargets?.length && await campaignAutoApply(admin, c.campaign_id)) {
    appliedAll = applied ? [applied] : [];
    for (const t of moreTargets) {
      if (!t?.characterId && !t?.monsterId) continue;
      if (tgt && t.characterId === tgt.characterId && t.monsterId === tgt.monsterId) continue;
      const one = await applyHp(admin, { ...base, sessionId: session.id, kind: "heal", total: result.total, crit: false, rollId: saved.id,
        actor: { characterId: c.id }, target: { characterId: t.characterId ?? null, monsterId: t.monsterId ?? null } });
      if (one) appliedAll.push(maskFor({ ...one, canAdjust: true }, viewerIsDm));
    }
  }

  // Creatures hidden on the battle map stay unknown to players (no names, no HP changes shown).
  if (!viewerIsDm && combat && (saves?.length || appliedAll?.length)) {
    const { data: hid } = await admin.from("map_tokens").select("combatant_id, combatants(monster_id)").eq("combat_id", combat.id).eq("hidden", true);
    const hiddenM = new Set((hid ?? []).map((h) => (h.combatants as unknown as { monster_id: string | null } | null)?.monster_id).filter(Boolean));
    if (hiddenM.size) {
      saves = saves?.map((sv) => (sv.target.monsterId && hiddenM.has(sv.target.monsterId) ? { ...sv, name: "Something unseen" } : sv));
      appliedAll = appliedAll?.filter((x) => !(x.target.monsterId && hiddenM.has(x.target.monsterId)));
      if (applied?.target.monsterId && hiddenM.has(applied.target.monsterId)) applied = null;
    }
  }

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
      applied,
      missed: parentMissed && plan.rollType === "damage",
    },
    spells,
    resources,
    concentration,
    endedConcentration,
    saves,
    appliedAll,
  };
}

/** Stop concentrating (by choice), or start concentrating on one of your known spells without casting it here. */
export async function setConcentration(characterId: string, spell: string | null): Promise<{ concentration: { spell: string } | null } | Fail> {
  const { supabase, character, canEdit } = await loadCharacter(characterId);
  if (!character) return { error: "Character not found." };
  if (!canEdit) return { error: "You can only change your own character." };
  if (spell && !character.spells.known?.includes(spell)) return { error: "That spell isn't on your list." };
  const concentration = spell ? { spell, since: new Date().toISOString() } : null;
  const { error } = await supabase.from("characters").update({ concentration }).eq("id", character.id);
  if (error) return { error: error.message };
  return { concentration };
}

export type HpState = { hp_current: number; temp_hp: number; concentration?: ConcentrationCheck | null };

/** The HP card: damage uses temporary HP first, healing can't go above max, 0 HP starts death saves. */
export async function changeHp(characterId: string, kind: "damage" | "heal" | "temp", amount: number): Promise<HpState | Fail> {
  const n = Math.floor(Number(amount));
  if (!Number.isFinite(n) || n <= 0 || n > 999) return { error: "Enter a number from 1 to 999." };

  const { userId, character, canEdit } = await loadCharacter(characterId);
  if (!character || !userId) return { error: "Character not found." };
  if (!canEdit) return { error: "You can only change your own character." };

  const admin = createAdminClient();
  const { session, combat } = await liveState(admin, character.campaign_id);

  if (kind === "temp") {
    const temp = Math.max(character.temp_hp ?? 0, n); // temp HP doesn't stack: keep the higher
    await admin.from("characters").update({ temp_hp: temp }).eq("id", character.id);
    await admin.from("effects").insert({
      campaign_id: character.campaign_id, session_id: session?.id ?? null, combat_id: combat?.id ?? null, round: combat?.round ?? null,
      created_by: userId, target_character_id: character.id, kind: "temp_hp", amount: n, rolled_amount: n,
    });
    return { hp_current: character.hp_current ?? character.hp_max ?? 0, temp_hp: temp };
  }

  const applied = await applyHp(admin, {
    campaignId: character.campaign_id, sessionId: session?.id ?? null, combatId: combat?.id ?? null, round: combat?.round ?? null,
    kind, total: n, target: { characterId: character.id }, createdBy: userId,
  });
  if (!applied) return { error: "Couldn't save HP." };
  const { data } = await admin.from("characters").select("hp_current, temp_hp").eq("id", character.id).single();
  return { hp_current: data?.hp_current ?? applied.hpAfter, temp_hp: data?.temp_hp ?? 0, concentration: applied.concentration ?? null };
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

/** The sheet's own look (theme, accent color, font, text size). Owner or DM. */
export async function saveSheetStyle(characterId: string, style: unknown): Promise<Fail | { style: SheetStyle }> {
  const { supabase, character, canEdit } = await loadCharacter(characterId);
  if (!character || !canEdit) return { error: "You can only change the look of your own sheet." };
  const clean = cleanSheetStyle(style);
  const { error } = await supabase.from("characters").update({ sheet_style: Object.keys(clean).length ? clean : null }).eq("id", characterId);
  if (error) return { error: /sheet_style/.test(error.message) ? "Run supabase/22-sheet-style.sql in Supabase first." : error.message };
  // tidy up: background pictures that were tried but not kept
  try {
    const admin = createAdminClient();
    const { data: files } = await admin.storage.from("vault").list(`sheets/${characterId}`);
    const old = (Array.isArray(files) ? files : []).map((f) => f.name).filter((n) => n !== `bg-${clean.image}.webp`).map((n) => `sheets/${characterId}/${n}`);
    if (old.length) await admin.storage.from("vault").remove(old);
  } catch { /* tidying up is optional: the look is saved */ }
  return { style: clean };
}
