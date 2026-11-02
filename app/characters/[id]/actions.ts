"use server";
import { refresh } from "next/cache";
// Rolling, casting, HP, resources and the spell list for the character sheet.
// Dice are rolled HERE on the server, every bonus comes from the character's data, and only
// the server (with the secret key) may save rolls, so a roll can't be faked from the browser.
import { cleanSheetStyle, type SheetStyle } from "@/lib/themes";
import { roll, type Advantage, type Rng } from "@/lib/dice";
import { replayRng } from "@/lib/offline-rolls";
import { ABILITIES, allOptions, planRoll, rowKey, SKILLS, tableRow, type Ability, type Attack, type Option, type RollRequest, type SpellBook, type SpellInfo } from "@/lib/rules";
import { isWildSoul, wildSoulPreset } from "@/lib/presets/wild-soul";
import { cleanBonuses, cleanCustomAction, cleanHomebrew, type Bonuses, type Homebrew } from "@/lib/homebrew";
import { loadCharacter, SPELL_COLUMNS, type Resource } from "@/lib/character-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hitOrMiss, liveState, lookupTarget, recordInitiative, type Target } from "@/lib/roll-service";
import type { ConcentrationCheck } from "@/lib/moderator/concentration";
import { maskSaves, rollTargetSaves, type TargetSave } from "@/lib/moderator/saves";
import { adjustHp, applyHp, campaignAutoApply, isCampaignDm, maskFor, type Applied } from "@/lib/moderator/apply";

export type SavedRoll = {
  id: string;
  physical?: boolean;      // real dice, typed in
  offline?: boolean;       // rolled without internet: kept on the phone until it's sent
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
  practice?: boolean;      // practice roll: worked out but not saved, nothing spent
  request: RollRequest;
  followUp?: { key: string; slot?: number }; // offer this damage roll next
  success?: boolean | null;                  // attack: hit (true) / miss (false)
  vsAc?: number | null;                      // the AC it was rolled against (a target's, or one typed on the sheet)
  target?: string | null;                    // "Ogre"
  applied?: Applied | null;                  // what the fight moderator did with it (HP change)
  missed?: boolean;                          // damage after a missed attack: not applied
  table?: { row: string; text?: string };    // a roll table: the row it landed on
  next?: { key: string; label: string; many?: boolean }; // a table row with something to roll: offer it next
  self?: SelfResult | null;                  // what happened to the roller afterwards (temp HP, damage)
};
/** "Then" effects on the roller: Wild Surge temp HP, Magic Reserves damage. Practice rolls only describe them. */
export type SelfResult = { note: string; hp_current?: number; temp_hp?: number };
export type RollResponse = {
  roll: SavedRoll; spells: SpellBook; resources: Resource[]; concentration?: { spell: string } | null; endedConcentration?: string | null;
  triggered?: SavedRoll[];       // rolled by themselves after this one (Wild Surge when Rage is spent)
  saves?: TargetSave[];          // a save spell: each target's save (monster results only for the DM)
  appliedAll?: Applied[];        // damage from a save spell: one HP change per target
};

type Fail = { error: string };

/** The target AC typed on the sheet (only on an attack's "use" roll), or null. */
const typedAc = (r: RollRequest) => (r.kind === "use" && Number.isFinite(r.ac) ? Math.max(1, Math.min(40, Math.round(r.ac!))) : null);

/**
 * Wake-up call, sent when a rolling screen opens (sheet, Session, roller), so the first real roll
 * doesn't pay for a cold start: it loads this file's code on the server (rules, roll service,
 * moderator), checks the login and opens the connection to the database. Writes nothing.
 */
export async function warmUp(): Promise<{ ok: true }> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (data?.claims?.sub) await supabase.from("characters").select("id").limit(1);
  } catch { /* only a warm-up: never fails the page */ }
  return { ok: true };
}

/**
 * The same roll, but the answer comes back without a fresh copy of the page.
 * For screens that show the result from the answer and then call router.refresh() themselves
 * in the background (the character sheet, the Session turn card): the dice land a whole
 * page render sooner. router.refresh() also clears the 30 s client cache, like refresh() does.
 */
export async function rollQuick(
  characterId: string,
  request: RollRequest,
  advantage: Advantage,
  target?: Target | null,
  moreTargets?: Target[],
): Promise<RollResponse | Fail> {
  return rollForCharacter(characterId, request, advantage, target, moreTargets, 0, true);
}

export async function rollForCharacter(
  characterId: string,
  request: RollRequest,
  advantage: Advantage,
  target?: Target | null,
  moreTargets?: Target[],
  depth = 0,                   // 1 = rolled by a trigger (a trigger never sets off another one)
  quick = false,               // true = the caller refreshes the page itself (see rollQuick)
  replay?: { rng: Rng; at?: string; offline?: boolean; physical?: boolean } // given dice: rolled offline (when) or real dice typed in (server only)
): Promise<RollResponse | Fail> {
  // other screens (stats, lists) show this change at once, not after the 30 s client cache
  if (!quick && depth === 0) refresh();
  // replayed dice only ever come from syncOfflineRoll on the server (a browser can't send a function)
  if (replay && typeof replay.rng !== "function") replay = undefined;
  const { supabase, userId, character: c, canEdit, library } = await loadCharacter(characterId);
  if (!c) return { error: "Character not found." };
  if (!canEdit) return { error: "You can only roll for your own character." };

  let plan;
  try {
    plan = planRoll(c, request, library);
  } catch (e) {
    return { error: (e as Error).message };
  }

  const opt: Option | undefined = request.kind === "use" || request.kind === "damage" ? allOptions(c, library).find((x) => x.key === request.key) : undefined;

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
    if (!opt?.spend_rolled) { // "spends what you roll" is settled after the dice
      resources = c.resources.map((x) => (x === r ? { ...x, used: (x.used ?? 0) + 1 } : x));
      changes.resources = resources;
    }
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
  // a missed attack (only attacks have hit / miss) has no damage to roll
  if (parentMissed) return { error: "That attack missed, so there's no damage to roll." };

  let result: ReturnType<typeof roll> | null = null;
  try {
    const adv: Advantage = plan.d20 && (advantage === "advantage" || advantage === "disadvantage") ? advantage : "normal";
    result = plan.expression ? roll(plan.expression, { advantage: adv, critical, critOn: plan.critOn, critExtra: plan.critExtra, critMode: plan.critMode, rng: replay?.rng }) : null;
  } catch (e) {
    return { error: `Can't roll "${plan.expression}": ${(e as Error).message}` };
  }

  // Magic Reserves: spends as many uses as the roll shows (no more than are left)
  if (request.kind === "use" && opt?.spend_rolled && plan.resource && result) {
    resources = c.resources.map((x) => (x.name === plan.resource ? { ...x, used: Math.min(x.max, (x.used ?? 0) + Math.max(1, result!.total)) } : x));
    changes.resources = resources;
  }
  // A roll table: which row it landed on
  const row = opt?.kind === "table" && result ? tableRow(opt, result.total) : null;

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

  // These don't depend on each other, so they go to the database together (one wait instead of five).
  const admin = createAdminClient();
  const saveChanges = async () => {
    if (!Object.keys(changes).length) return null;
    const { error } = await supabase.from("characters").update(changes).eq("id", c.id);
    return error;
  };
  const [saveError, { session, combat }, tgt, viewerIsDm, autoApply] = await Promise.all([
    saveChanges(),
    liveState(admin, c.campaign_id),
    lookupTarget(admin, c.campaign_id, parentTarget ?? target),
    isCampaignDm(admin, c.campaign_id, userId),
    campaignAutoApply(admin, c.campaign_id),
  ]);
  if (saveError) return { error: "Couldn't save the spell slot / resource. " + saveError.message };
  // against the target's AC, or the AC typed on the sheet when there's no target
  const vsAc = plan.rollType === "attack" ? tgt?.ac ?? typedAc(request) : null;
  const success = plan.rollType === "attack" && result
    ? hitOrMiss(result.total, vsAc, result.isCrit, result.isFumble)
    : null;
  const slotNote = plan.spellSlot ? ` (level ${plan.spellSlot})` : "";
  const insertRow = {
      campaign_id: c.campaign_id,
      session_id: session?.id ?? null,
      combat_id: combat?.id ?? null,
      round: combat?.round ?? null,
      rolled_by: userId,
      character_id: c.id,
      roll_type: plan.rollType,
      source: row ? `${plan.source}: ${row.name}` : plan.source,
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
  };
  const { data: saved, error } = await admin
    .from("roll_events")
    .insert({
      ...insertRow,
      ...(replay?.at ? { created_at: replay.at } : {}),
      ...(replay?.offline ? { offline: true } : {}),
      ...(replay?.physical ? { physical: true } : {}),
    })
    .select("id")
    .single()
    // before 30-offline-physical-rolls.sql there's no "offline" column: save it without the mark
    .then(async (res) => (res.error && replay && /offline|physical/.test(res.error.message)
      ? admin.from("roll_events").insert({ ...insertRow, ...(replay.at ? { created_at: replay.at } : {}) }).select("id").single() : res));
  if (error || !saved) return { error: "Couldn't save the roll. " + (error?.message ?? "") };

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
  const dealt: number[] = []; // damage really taken by each target (for "temp HP equal to the damage dealt")
  if (plan.rollType === "damage" && parentIsSave && parentRollId && result && session && autoApply) {
    const { data: rows } = await admin.from("roll_events").select("monster_id, character_id, success").eq("parent_roll_id", parentRollId).eq("roll_type", "save");
    appliedAll = [];
    for (const r of rows ?? []) {
      if (r.success && !opt?.half_on_save) continue; // saved completely
      const one = await applyHp(admin, {
        ...base, sessionId: session.id, kind: "damage", total: result.total, crit: false, rollId: saved.id, factor: r.success ? "half" : "full",
        actor: { characterId: c.id }, target: { characterId: r.character_id, monsterId: r.monster_id },
      });
      if (!one) continue;
      dealt.push(one.amount);
      const shown = maskFor({ ...one, canAdjust: true }, viewerIsDm);
      // players don't learn how much a monster took (that would give its save away)
      appliedAll.push(!viewerIsDm && one.target.monsterId ? { ...shown, amount: -1, rolled: -1, factor: "full", canAdjust: false } : shown);
    }
  }

  // Fight moderator: damage / healing with a target changes their HP right away.
  let applied: Applied | null = appliedAll?.[0] ?? null;
  if (!parentIsSave && (plan.rollType === "damage" || plan.rollType === "heal") && result && tgt && session && !parentMissed
      && autoApply) {
    applied = await applyHp(admin, {
      campaignId: c.campaign_id, sessionId: session.id, combatId: combat?.id ?? null, round: combat?.round ?? null,
      kind: plan.rollType, total: result.total, crit: critical, rollId: saved.id,
      actor: { characterId: c.id }, target: { characterId: tgt.characterId, monsterId: tgt.monsterId }, createdBy: userId,
    });
    if (applied && plan.rollType === "damage") dealt.push(applied.amount);
    if (applied) applied = maskFor({ ...applied, canAdjust: true }, viewerIsDm);
  }

  // Healing (Mass Healing Word…) or area damage with no save (Wild Surge's burst): everyone picked gets the same amount.
  const area = plan.rollType === "heal" || (plan.rollType === "damage" && !parentIsSave && !parentMissed && !!opt?.many);
  if (area && result && session && moreTargets?.length && autoApply) {
    appliedAll = applied ? [applied] : [];
    for (const t of moreTargets) {
      if (!t?.characterId && !t?.monsterId) continue;
      if (tgt && t.characterId === tgt.characterId && t.monsterId === tgt.monsterId) continue;
      const kind = plan.rollType === "heal" ? "heal" : "damage";
      const one = await applyHp(admin, { ...base, sessionId: session.id, kind, total: result.total, crit: false, rollId: saved.id,
        actor: { characterId: c.id }, target: { characterId: t.characterId ?? null, monsterId: t.monsterId ?? null } });
      if (!one) continue;
      if (kind === "damage") dealt.push(one.amount);
      appliedAll.push(maskFor({ ...one, canAdjust: true }, viewerIsDm));
    }
  }

  // "Then": temp HP from the damage dealt, or damage to yourself (Magic Reserves)
  const self = opt?.then && result && plan.rollType !== "save_dc" && !parentMissed
    ? await applyThen(admin, c, opt.then, { rolled: result.total, dealt: dealt.length ? dealt.reduce((a, b) => a + b, 0) : null, userId: userId!, sessionId: session?.id ?? null, combatId: combat?.id ?? null, round: combat?.round ?? null, rollId: saved.id })
    : null;

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
    : plan.rollType === "damage" ? `${plan.source} damage${critical ? (result?.doubled ? " (crit! dice ×2)" : " (crit!)") : ""}`
    : plan.rollType === "heal" ? `${plan.source} healing`
    : plan.rollType === "other" ? (row ? `${plan.source}: ${result?.total} · ${row.name}` : result ? plan.source : `${plan.source}: used`)
    : plan.source;

  // Things set off by spending this resource (Wild Surge when you start raging)
  let triggered: SavedRoll[] | undefined;
  if (depth === 0 && request.kind === "use" && plan.resource) {
    for (const t of allOptions(c, library).filter((x) => x.trigger_on === plan.resource && !x.row_of)) {
      const res = await rollForCharacter(characterId, { kind: "use", key: t.key }, "normal", null, [], 1);
      if ("error" in res) continue;
      (triggered ??= []).push(res.roll);
      resources = res.resources;
      spells = res.spells;
    }
  }

  return {
    triggered,
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
      vsAc,
      target: tgt?.name ?? null,
      applied,
      missed: parentMissed && plan.rollType === "damage",
      ...(row ? { table: { row: row.name, text: row.text }, next: row.effect ? { key: rowKey(opt!.name, row.min), label: `${row.name}${row.effect.damage ? ` (${row.effect.damage}${row.effect.damage_type ? ` ${row.effect.damage_type}` : ""})` : ""}`, many: !!row.effect.many } : undefined } : {}),
      self,
    },
    spells,
    resources,
    concentration,
    endedConcentration,
    saves,
    appliedAll,
  };
}

/**
 * Practice roll: the same rules and bonuses as a real roll, but NOTHING is saved.
 * No roll in the log or the stats, no spell slot or resource spent, no HP changed, no concentration,
 * and the table doesn't see it (even while a session is running). Slots never block a practice cast.
 * `critical` doubles the damage dice (the follow-up after a practice crit; there's no saved roll to check).
 */
export async function practiceRoll(
  characterId: string,
  request: RollRequest,
  advantage: Advantage,
  critical = false,
  depth = 0
): Promise<RollResponse | Fail> {
  const { character: c, canEdit, library } = await loadCharacter(characterId);
  if (!c) return { error: "Character not found." };
  if (!canEdit) return { error: "You can only roll for your own character." };

  // Plan as if every slot were free, so you can try any spell at any level.
  const fresh = { ...c, spells: { ...c.spells, slots_used: {} } };
  const req: RollRequest = request.kind === "damage" ? { kind: "damage", key: request.key, slot: request.slot } : request;
  let plan;
  try {
    plan = planRoll(fresh, req, library);
  } catch (e) {
    return { error: (e as Error).message };
  }

  const crit = req.kind === "damage" && critical;
  let result: ReturnType<typeof roll> | null = null;
  try {
    const adv: Advantage = plan.d20 && (advantage === "advantage" || advantage === "disadvantage") ? advantage : "normal";
    result = plan.expression ? roll(plan.expression, { advantage: adv, critical: crit, critOn: plan.critOn, critExtra: plan.critExtra, critMode: plan.critMode }) : null;
  } catch (e) {
    return { error: `Can't roll "${plan.expression}": ${(e as Error).message}` };
  }

  const opt = req.kind === "use" || req.kind === "damage" ? allOptions(fresh, library).find((x) => x.key === req.key) : undefined;
  const row = opt?.kind === "table" && result ? tableRow(opt, result.total) : null;
  const slotNote = plan.spellSlot ? ` (level ${plan.spellSlot})` : "";
  const label =
    plan.rollType === "attack" ? `${plan.source} attack`
    : plan.rollType === "damage" ? `${plan.source} damage${crit ? (result?.doubled ? " (crit! dice ×2)" : " (crit!)") : ""}`
    : plan.rollType === "heal" ? `${plan.source} healing`
    : plan.rollType === "other" ? (row ? `${plan.source}: ${result?.total} · ${row.name}` : result ? plan.source : `${plan.source}: used`)
    : plan.source;
  // "then" effects are only described in practice
  const then = opt?.then && result && plan.rollType !== "save_dc" ? opt.then : null;
  const self: SelfResult | null = then ? { note: [
    then.temp_hp ? `You'd gain ${result!.total}${then.temp_hp === "dealt" ? " (× each creature hit)" : ""} temp HP` : "",
    then.self_damage_x ? `You'd take ${result!.total * then.self_damage_x} ${then.self_damage_type ?? ""} damage` : "",
  ].filter(Boolean).join(". ").replace(/\s+/g, " ") + ". (Practice: nothing changed.)" } : null;

  let triggered: SavedRoll[] | undefined;
  if (depth === 0 && req.kind === "use" && plan.resource) {
    for (const t of allOptions(fresh, library).filter((x) => x.trigger_on === plan.resource && !x.row_of)) {
      const res = await practiceRoll(characterId, { kind: "use", key: t.key }, "normal", false, 1);
      if (!("error" in res)) (triggered ??= []).push(res.roll);
    }
  }

  return {
    triggered,
    roll: {
      id: `practice-${crypto.randomUUID()}`,
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
      inSession: false,
      practice: true,
      request,
      followUp: plan.followUp && req.kind === "use" ? { key: req.key, slot: plan.spellSlot } : undefined,
      success: plan.rollType === "attack" && result ? hitOrMiss(result.total, typedAc(req), result.isCrit, result.isFumble) : null,
      vsAc: plan.rollType === "attack" ? typedAc(req) : null,
      target: null,
      applied: null,
      ...(row ? { table: { row: row.name, text: row.text }, next: row.effect ? { key: rowKey(opt!.name, row.min), label: `${row.name}${row.effect.damage ? ` (${row.effect.damage}${row.effect.damage_type ? ` ${row.effect.damage_type}` : ""})` : ""}`, many: !!row.effect.many } : undefined } : {}),
      self,
    },
    spells: c.spells,
    resources: c.resources,
  };
}

/** Stop concentrating (by choice), or start concentrating on one of your known spells without casting it here. */
export async function setConcentration(characterId: string, spell: string | null): Promise<{ concentration: { spell: string } | null } | Fail> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
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
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
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
export async function setResourceUsed(characterId: string, index: number, used: number, practice = false): Promise<{ resources: Resource[]; triggered?: SavedRoll[] } | Fail> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const { supabase, character, canEdit, library } = await loadCharacter(characterId);
  if (!character) return { error: "Character not found." };
  if (!canEdit) return { error: "You can only change your own character." };
  if (!character.resources[index]) return { error: "Unknown resource." };

  const resources = character.resources.map((r, i) =>
    i === index ? { ...r, used: Math.min(Math.max(Math.floor(used), 0), r.max) } : r
  );
  const spent = (resources[index].used ?? 0) > (character.resources[index].used ?? 0);
  const { error } = await supabase.from("characters").update({ resources }).eq("id", character.id);
  if (error) return { error: "Couldn't save. " + error.message };

  // Spending a use by its pip sets off the same things as using it (Rage pip → Wild Surge)
  let triggered: SavedRoll[] | undefined;
  if (spent) {
    for (const t of allOptions(character, library).filter((x) => x.trigger_on === resources[index].name && !x.row_of)) {
      const res = practice
        ? await practiceRoll(characterId, { kind: "use", key: t.key }, "normal", false, 1)
        : await rollForCharacter(characterId, { kind: "use", key: t.key }, "normal", null, [], 1);
      if (!("error" in res)) (triggered ??= []).push(res.roll);
    }
  }
  return { resources, triggered };
}

/** Sets how many spell slots of one level are spent. */
export async function setSlotsUsed(characterId: string, level: number, used: number): Promise<{ spells: SpellBook } | Fail> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
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
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
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
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
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
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
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
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
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

/**
 * Delete a character for good (owner or DM; the database's own rules check that too).
 * Inventory, item log, death saves and fight spots go with it. Past rolls and HP changes stay
 * in the session log and stats, just no longer linked to a character. Pictures are tidied up.
 * Not allowed while the character is in a running fight.
 */
export async function deleteCharacter(characterId: string, typedName: string): Promise<{ ok: true } | Fail> {
  refresh();
  const { supabase, character, canEdit } = await loadCharacter(characterId);
  if (!character) return { error: "Character not found." };
  if (!canEdit) return { error: "You can only delete your own character." };
  if (typedName.trim().toLowerCase() !== character.name.trim().toLowerCase()) {
    return { error: `Type the name "${character.name}" to confirm.` };
  }

  const admin = createAdminClient();
  const { data: fights } = await admin
    .from("combatants").select("id, combats!inner(ended_at)")
    .eq("character_id", characterId).is("combats.ended_at", null).limit(1);
  if (fights?.length) return { error: `${character.name} is in a running fight. End the fight first.` };

  const { data: pics } = await admin.from("characters").select("portrait").eq("id", characterId).maybeSingle();
  const { error, count } = await supabase.from("characters").delete({ count: "exact" }).eq("id", characterId);
  if (error) return { error: "Couldn't delete the character. " + error.message };
  if (!count) return { error: "You can't delete this character." };

  // Tidy up stored pictures (optional: the character is already gone).
  try {
    const files: string[] = [];
    if (pics?.portrait) files.push(`portraits/character/${characterId}-${pics.portrait}.webp`);
    const { data: bg } = await admin.storage.from("vault").list(`sheets/${characterId}`);
    for (const f of Array.isArray(bg) ? bg : []) files.push(`sheets/${characterId}/${f.name}`);
    if (files.length) await admin.storage.from("vault").remove(files);
  } catch { /* nothing to tidy */ }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Homebrew: this character's own rules, actions and uses (content from other books).
// ---------------------------------------------------------------------------

/** Crit range, extra crit dice and toggles ("Flaming Tongue ignited"). */
export async function saveHomebrew(characterId: string, input: Homebrew): Promise<{ homebrew: Homebrew } | Fail> {
  refresh();
  const { supabase, character, canEdit } = await loadCharacter(characterId);
  if (!character) return { error: "Character not found." };
  if (!canEdit) return { error: "You can only change your own character." };
  const homebrew = cleanHomebrew(input);
  // hand-set numbers ("Edit numbers") are kept unless this save brings its own
  const bonuses = input && typeof input === "object" && "bonuses" in input ? cleanBonuses(input.bonuses, Object.keys(SKILLS)) : character.homebrew?.bonuses;
  if (bonuses && Object.keys(bonuses).length) homebrew.bonuses = bonuses; else delete homebrew.bonuses;
  const { error } = await supabase.from("characters").update({ homebrew }).eq("id", characterId);
  if (error) return { error: error.message };
  return { homebrew };
}

export type NumbersInput = {
  hp_max: number; ac: number; speed: number;
  scores: Record<Ability, number>;
  saves: Ability[]; skills: string[]; expertise: string[];
  bonuses: Bonuses;
};

/**
 * "Edit numbers": every number on the sheet, set by hand (homebrew, magic items, a sheet that was wrong).
 * HP max, AC, speed and ability scores are stored as they are; save and skill proficiencies too;
 * extras on top (initiative, saves, skills, spell DC / attack) and a fixed proficiency bonus go in homebrew.bonuses.
 */
export async function saveNumbers(characterId: string, input: NumbersInput): Promise<{ ok: true; homebrew: Homebrew } | Fail> {
  refresh();
  const { supabase, character, canEdit } = await loadCharacter(characterId);
  if (!character) return { error: "Character not found." };
  if (!canEdit) return { error: "You can only change your own character." };
  const int = (v: unknown, lo: number, hi: number, dflt: number) => (Number.isFinite(Number(v)) && v !== "" && v !== null ? Math.max(lo, Math.min(hi, Math.round(Number(v)))) : dflt);
  const hpMax = int(input?.hp_max, 1, 999, character.hp_max ?? 1);
  const oldMax = character.hp_max ?? hpMax;
  const cur = character.hp_current ?? oldMax;
  // raising max HP while unhurt keeps you unhurt; lowering it never leaves you above the new max
  const hpCurrent = Math.min(hpMax, cur >= oldMax ? hpMax : cur);
  const scores = Object.fromEntries(ABILITIES.map((a) => [a, int(input?.scores?.[a], 1, 30, character.ability_scores[a] ?? 10)])) as Record<Ability, number>;
  const skillNames = Object.keys(SKILLS);
  const saves = ABILITIES.filter((a) => (input?.saves ?? []).includes(a));
  const skills = skillNames.filter((x) => (input?.skills ?? []).includes(x));
  const expertise = skills.filter((x) => (input?.expertise ?? []).includes(x));
  const { data: row } = await supabase.from("characters").select("proficiencies, homebrew").eq("id", characterId).maybeSingle();
  const proficiencies = { ...((row?.proficiencies as Record<string, unknown>) ?? {}), saves, skills, expertise };
  const homebrew = cleanHomebrew(row?.homebrew ?? {});
  const bonuses = cleanBonuses(input?.bonuses, skillNames);
  if (Object.keys(bonuses).length) homebrew.bonuses = bonuses; else delete homebrew.bonuses;
  const { error } = await supabase.from("characters").update({
    hp_max: hpMax, hp_current: hpCurrent, ac: int(input?.ac, 0, 40, character.ac ?? 10), speed: int(input?.speed, 0, 200, character.speed ?? 30),
    ability_scores: scores, proficiencies, homebrew,
  }).eq("id", characterId);
  if (error) return { error: error.message };
  return { ok: true, homebrew };
}

/** Add or change one of the character's own actions (`oldName` = the one being edited). */
export async function saveCustomAction(characterId: string, input: Attack, oldName?: string | null): Promise<{ attacks: Attack[] } | Fail> {
  refresh();
  const { supabase, character, canEdit } = await loadCharacter(characterId);
  if (!character) return { error: "Character not found." };
  if (!canEdit) return { error: "You can only change your own character." };
  const action = cleanCustomAction(input, character.resources.map((r) => r.name));
  if ("error" in action) return action;
  const stored = await storedAttacks(supabase, characterId);
  const others = stored.filter((a) => !(a.custom && oldName && a.name === oldName));
  if (others.some((a) => a.name.toLowerCase() === action.name.toLowerCase())) return { error: `${character.name} already has something called ${action.name}.` };
  const attacks = [...others, action];
  const { error } = await supabase.from("characters").update({ attacks }).eq("id", characterId);
  if (error) return { error: error.message };
  return { attacks };
}

export async function deleteCustomAction(characterId: string, name: string): Promise<{ attacks: Attack[] } | Fail> {
  refresh();
  const { supabase, character, canEdit } = await loadCharacter(characterId);
  if (!character) return { error: "Character not found." };
  if (!canEdit) return { error: "You can only change your own character." };
  const attacks = (await storedAttacks(supabase, characterId)).filter((a) => !(a.custom && a.name === name));
  const { error } = await supabase.from("characters").update({ attacks }).eq("id", characterId);
  if (error) return { error: error.message };
  return { attacks };
}

/** The attacks as saved (the loader also adds equipped weapons, which must not be written back). */
async function storedAttacks(supabase: Awaited<ReturnType<typeof loadCharacter>>["supabase"], id: string): Promise<Attack[]> {
  const { data } = await supabase.from("characters").select("attacks").eq("id", id).maybeSingle();
  return Array.isArray(data?.attacks) ? (data!.attacks as Attack[]) : [];
}

/** Add one of the character's own limited uses ("Arcane Rebuke 4 / long rest"), or remove one they added. */
export async function saveCustomResource(characterId: string, input: { name: string; max: number; recharge: string } | null, removeName?: string): Promise<{ resources: Resource[] } | Fail> {
  refresh();
  const { supabase, character, canEdit } = await loadCharacter(characterId);
  if (!character) return { error: "Character not found." };
  if (!canEdit) return { error: "You can only change your own character." };
  let resources = character.resources;
  if (removeName) resources = resources.filter((r) => !((r as Resource & { custom?: boolean }).custom && r.name === removeName));
  if (input) {
    const name = String(input.name ?? "").trim().slice(0, 40);
    const max = Math.round(Number(input.max));
    const recharge = ["short rest", "long rest", "dawn", "never"].includes(input.recharge) ? input.recharge : "long rest";
    if (!name) return { error: "Give the uses a name." };
    if (!Number.isFinite(max) || max < 1 || max > 99) return { error: "Uses: a number from 1 to 99." };
    if (resources.some((r) => r.name.toLowerCase() === name.toLowerCase())) return { error: `${character.name} already has ${name}.` };
    resources = [...resources, { name, max, used: 0, recharge, custom: true } as Resource];
  }
  if (resources.length > 30) return { error: "That's a lot of uses. Remove some first." };
  const { error } = await supabase.from("characters").update({ resources }).eq("id", characterId);
  if (error) return { error: error.message };
  return { resources };
}

/** "Then" effects on the roller after a roll (server only; the roll is already saved). */
async function applyThen(
  admin: ReturnType<typeof createAdminClient>,
  c: { id: string; campaign_id: string; name: string; temp_hp?: number | null },
  then: NonNullable<Attack["then"]>,
  ctx: { rolled: number; dealt: number | null; userId: string; sessionId: string | null; combatId: string | null; round: number | null; rollId: string }
): Promise<SelfResult | null> {
  const notes: string[] = [];
  if (then.temp_hp) {
    const n = Math.max(0, Math.floor(then.temp_hp === "dealt" ? (ctx.dealt ?? ctx.rolled) : ctx.rolled));
    if (n > 0) {
      const { data: now } = await admin.from("characters").select("temp_hp").eq("id", c.id).single();
      const temp = Math.max(now?.temp_hp ?? 0, n); // temp HP doesn't stack: keep the higher
      await admin.from("characters").update({ temp_hp: temp }).eq("id", c.id);
      await admin.from("effects").insert({
        campaign_id: c.campaign_id, session_id: ctx.sessionId, combat_id: ctx.combatId, round: ctx.round, roll_event_id: ctx.rollId,
        created_by: ctx.userId, actor_character_id: c.id, target_character_id: c.id, kind: "temp_hp", amount: n, rolled_amount: n,
      });
      notes.push(temp > n ? `You gain ${n} temp HP (you keep your ${temp})` : `You gain ${n} temp HP`);
    }
  }
  if (then.self_damage_x) {
    const n = ctx.rolled * then.self_damage_x;
    if (n > 0) {
      const a = await applyHp(admin, {
        campaignId: c.campaign_id, sessionId: ctx.sessionId, combatId: ctx.combatId, round: ctx.round, kind: "damage", total: n,
        rollId: ctx.rollId, actor: { characterId: c.id }, target: { characterId: c.id }, createdBy: ctx.userId,
      });
      if (a) notes.push(`You take ${a.amount} ${then.self_damage_type ?? ""} damage`.replace(/\s+/g, " ").trim());
    }
  }
  if (!notes.length) return null;
  const { data } = await admin.from("characters").select("hp_current, temp_hp").eq("id", c.id).single();
  return { note: notes.join(". ") + ".", hp_current: data?.hp_current ?? undefined, temp_hp: data?.temp_hp ?? undefined };
}

/**
 * Add a subclass's rules to one character in one tap (only Path of the Wild Soul for now).
 * Actions and uses with the same name are replaced; the name-only features from a PDF import get real descriptions.
 * Run it again after a level-up to pick up the new level's features.
 */
export async function applySubclassPreset(characterId: string): Promise<{ attacks: Attack[]; resources: Resource[]; added: string[] } | Fail> {
  refresh();
  const { supabase, character: c, canEdit } = await loadCharacter(characterId);
  if (!c) return { error: "Character not found." };
  if (!canEdit) return { error: "You can only change your own character." };
  const barb = c.class_levels.find((x) => /^barbarian$/i.test(x.class) && isWildSoul(x.subclass));
  if (!barb) return { error: "This works for a Barbarian with the subclass Path of the Wild Soul." };

  const stored = await storedAttacks(supabase, characterId);
  const hasRage = stored.some((a) => /^rage$/i.test(a.name) && !a.custom);
  const conMod = Math.floor(((c.ability_scores.CON ?? 10) - 10) / 2);
  const preset = wildSoulPreset(barb.level, conMod, hasRage);

  // uses: add the missing ones, update the maximum of ours, keep what's used
  let resources = [...c.resources];
  for (const u of preset.uses) {
    const old = resources.find((r) => r.name.toLowerCase() === u.name.toLowerCase());
    if (old) resources = resources.map((r) => (r === old ? { ...r, max: u.max, recharge: u.recharge, used: Math.min(r.used ?? 0, u.max) } : r));
    else resources.push({ ...u, used: 0, custom: true } as Resource);
  }
  // actions: through the same checks as the editor
  const names = resources.map((r) => r.name);
  const actions: Attack[] = [];
  for (const a of preset.actions) {
    const clean = cleanCustomAction(a, names);
    if ("error" in clean) return { error: `${a.name}: ${clean.error}` };
    actions.push(clean);
  }
  const attacks = [...stored.filter((a) => !actions.some((x) => x.name.toLowerCase() === a.name.toLowerCase())), ...actions];
  // features: replace the name-only ones from the sheet, keep everything else
  const features = [
    ...c.features.filter((f) => {
      const name = typeof f === "string" ? f : f.name;
      return !preset.replaces.some((re) => re.test(name));
    }),
    ...preset.features,
  ];
  const { error } = await supabase.from("characters").update({ attacks, resources, features }).eq("id", characterId);
  if (error) return { error: error.message };
  return { attacks, resources, added: [...actions.map((a) => a.name), ...preset.uses.map((u) => `${u.name} (${u.max})`)] };
}

/** Inspiration on / off (the DM gives it, the player spends it). */
export async function setInspiration(characterId: string, on: boolean): Promise<{ inspiration: boolean } | Fail> {
  refresh();
  const { supabase, character, canEdit } = await loadCharacter(characterId);
  if (!character) return { error: "Character not found." };
  if (!canEdit) return { error: "You can only change your own character." };
  const { error } = await supabase.from("characters").update({ inspiration: !!on }).eq("id", characterId);
  if (error) return { error: error.message.includes("inspiration") ? "Run supabase/28-inspiration.sql first." : error.message };
  return { inspiration: !!on };
}

/**
 * A roll made without internet, sent once the phone is back online: the same dice go through the usual roll
 * (slots and resources are spent now, the stats count it at the time it was rolled, up to 12 hours back).
 * `parentRollId` for a damage roll is the saved id of the attack it follows (the phone maps its own ids).
 */
export async function syncOfflineRoll(characterId: string, q: { request: RollRequest; advantage: Advantage; values: number[]; at: string; physical?: boolean }): Promise<Fail | { id: string; label: string }> {
  const values = (Array.isArray(q?.values) ? q.values : []).slice(0, 400).map((v) => Math.floor(Number(v)));
  const t = Date.parse(q?.at);
  const now = Date.now();
  const at = new Date(Number.isFinite(t) ? Math.min(now, Math.max(now - 12 * 3600_000, t)) : now).toISOString();
  const adv: Advantage = q?.advantage === "advantage" || q?.advantage === "disadvantage" ? q.advantage : "normal";
  const res = await rollForCharacter(characterId, q.request, adv, null, [], 0, true, { rng: replayRng(values), at, offline: true, physical: !!q.physical });
  if ("error" in res) return res;
  return { id: res.roll.id, label: res.roll.label };
}

/**
 * Real dice: the player typed what their dice showed (the phone turned it into dice values, lib/physical).
 * It goes through the usual roll, so hits, crits, damage, slots, resources and stats all count it.
 */
export async function realDiceRoll(characterId: string, request: RollRequest, advantage: Advantage, values: number[], target?: Target | null, moreTargets?: Target[]): Promise<RollResponse | Fail> {
  const clean = (Array.isArray(values) ? values : []).slice(0, 400).map((v) => Math.floor(Number(v)));
  const res = await rollForCharacter(characterId, request, advantage, target, moreTargets, 0, true, { rng: replayRng(clean), physical: true });
  if ("error" in res) return res;
  return { ...res, roll: { ...res.roll, physical: true } };
}

/**
 * Typed the wrong number? Within 2 minutes the player can take a real-dice roll back: its HP changes are undone,
 * its spell slot comes back, and it's gone from the log. Then they type it again.
 */
export async function undoRealDiceRoll(characterId: string, rollId: string): Promise<Fail | { ok: true }> {
  refresh();
  const { supabase, userId, character: c, canEdit } = await loadCharacter(characterId);
  if (!c || !canEdit) return { error: "You can only change your own rolls." };
  const admin = createAdminClient();
  const { data: r, error } = await admin.from("roll_events").select("id, character_id, rolled_by, created_at, spell_slot, physical").eq("id", rollId).maybeSingle();
  if (error && /physical/.test(error.message)) return { error: "Run supabase/30-offline-physical-rolls.sql first." };
  if (!r || r.character_id !== c.id || r.rolled_by !== userId || !r.physical) return { error: "Only your own real-dice rolls can be taken back." };
  if (Date.now() - Date.parse(r.created_at) > 2 * 60_000) return { error: "It's been more than 2 minutes, so it stays. Ask your DM to fix it." };
  const { data: effects } = await admin.from("effects").select("id").eq("roll_event_id", rollId).eq("undone", false).order("created_at", { ascending: false });
  for (const e of effects ?? []) {
    const u = await adjustHp(admin, e.id, "undo", userId!);
    if ("error" in u) return { error: `Couldn't undo the HP change: ${u.error}` };
  }
  if (r.spell_slot) {
    const k = String(r.spell_slot);
    const used = { ...(c.spells.slots_used ?? {}) };
    if ((used[k] ?? 0) > 0) { used[k] = used[k] - 1; await supabase.from("characters").update({ spells: { ...c.spells, slots_used: used } }).eq("id", c.id); }
  }
  await admin.from("roll_events").delete().eq("id", rollId);
  return { ok: true };
}

/** "Confirm your numbers": keep the app's number or use the sheet's; either way the note goes away for good. */
export async function confirmNumber(characterId: string, key: "ac" | "speed" | "hp_max", use: "sheet" | "app"): Promise<Fail | { value: number }> {
  refresh();
  if (!["ac", "speed", "hp_max"].includes(key)) return { error: "Unknown number." };
  const { supabase, character, canEdit } = await loadCharacter(characterId);
  if (!character) return { error: "Character not found." };
  if (!canEdit) return { error: "You can only change your own character." };
  const sv = { ...(character.sheet_values ?? {}) } as Record<string, number>;
  const sheetValue = sv[key];
  delete sv[key];
  const patch: Record<string, unknown> = { sheet_values: sv };
  let value = Number(character[key] ?? 0);
  if (use === "sheet" && typeof sheetValue === "number") {
    value = sheetValue;
    patch[key] = value;
    if (key === "hp_max") patch.hp_current = Math.min(value, character.hp_current ?? value);
  }
  const { error } = await supabase.from("characters").update(patch).eq("id", characterId);
  if (error) return { error: error.message };
  return { value };
}
