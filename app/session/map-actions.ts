"use server";
// Battle map moves and area spells. The server checks every move: whose turn it is, how far they may go,
// and that the square is free. The DM may also move anything freely (setting up, fixing mistakes).
import { loadCharacter } from "@/lib/character-data";
import { inRange, parseArea, place, tokensIn } from "@/lib/maps/area";
import { ensureTokens } from "@/lib/maps-data";
import { freeAt, moveBudget, squares, TELEPORTS } from "@/lib/maps/move";
import { battleState, who } from "@/lib/maps/server";
import { liveState } from "@/lib/roll-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { allOptions } from "@/lib/rules";
import type { Advantage } from "@/lib/dice";
import { rollForCharacter, type RollResponse } from "../characters/[id]/actions";

type Fail = { error: string };
const NO_MAP = { error: "There's no battle map in this fight." };

/** Move a token to (x, y). `free`: DM only, ignores turns and distance (for setting up). */
export async function moveToken(tokenId: string, x: number, y: number, free = false): Promise<Fail | { movedFt: number }> {
  const me = await who();
  if (!me.userId || !me.campaignId) return { error: "Log in first." };
  const b = await battleState(me.campaignId);
  if (!b) return NO_MAP;
  const t = b.tokens.find((k) => k.id === tokenId);
  if (!t) return { error: "That token isn't in this fight." };
  const nx = Math.round(x), ny = Math.round(y);
  if (!freeAt(t, nx, ny, b.tokens, b.map.cols, b.map.rows)) return { error: "Someone is already there (or it's off the map)." };
  const isTurn = b.currentCombatantId === t.combatant_id;
  if (free) {
    if (!me.isDm) return { error: "Only the DM can move tokens freely." };
    await b.admin.from("map_tokens").update({ x: nx, y: ny, updated_at: new Date().toISOString() }).eq("id", t.id);
    return { movedFt: t.moved_ft };
  }
  const mine = !!t.character_id && t.owner === me.userId;
  if (!me.isDm && !mine) return { error: "That isn't your token." };
  if (!isTurn) return { error: "You can move on your turn." };
  const cost = squares(t, { x: nx, y: ny }) * b.map.feet;
  const left = moveBudget(t.speed, t.dashes) - t.moved_ft;
  if (cost > left) return { error: `That's ${cost} ft; you have ${Math.max(0, left)} ft of movement left.` };
  await b.admin.from("map_tokens").update({ x: nx, y: ny, moved_ft: t.moved_ft + cost, updated_at: new Date().toISOString() }).eq("id", t.id);
  return { movedFt: t.moved_ft + cost };
}

/** Dash: as much movement again this turn (uses the action, or a bonus action with Cunning Action). */
export async function dashToken(tokenId: string): Promise<Fail | { dashes: number }> {
  const me = await who();
  if (!me.userId || !me.campaignId) return { error: "Log in first." };
  const b = await battleState(me.campaignId);
  if (!b) return NO_MAP;
  const t = b.tokens.find((k) => k.id === tokenId);
  if (!t) return { error: "That token isn't in this fight." };
  if (!me.isDm && !(t.character_id && t.owner === me.userId)) return { error: "That isn't your token." };
  if (b.currentCombatantId !== t.combatant_id) return { error: "You can Dash on your turn." };
  if (t.dashes >= 2) return { error: "You've already dashed twice this turn." };
  await b.admin.from("map_tokens").update({ dashes: t.dashes + 1 }).eq("id", t.id);
  return { dashes: t.dashes + 1 };
}

/** DM: hide a token from the players (or show it). */
export async function setTokenHidden(tokenId: string, hidden: boolean): Promise<Fail | void> {
  const me = await who();
  if (!me.campaignId || !me.isDm) return { error: "Only the DM can hide tokens." };
  const b = await battleState(me.campaignId);
  if (!b) return NO_MAP;
  if (!b.tokens.some((k) => k.id === tokenId)) return { error: "That token isn't in this fight." };
  await b.admin.from("map_tokens").update({ hidden }).eq("id", tokenId);
}

/** DM: put a map in the running fight (or take it away). Everyone in the fight gets a token. */
export async function setFightMap(mapId: string | null): Promise<Fail | void> {
  const me = await who();
  if (!me.campaignId || !me.isDm) return { error: "Only the DM can pick the battle map." };
  const admin = createAdminClient();
  const { combat } = await liveState(admin, me.campaignId);
  if (!combat) return { error: "Start a fight first." };
  if (mapId) {
    const { data: map } = await admin.from("battle_maps").select("id, cols, rows").eq("id", mapId).eq("campaign_id", me.campaignId).maybeSingle();
    if (!map) return { error: "Map not found." };
    const { error } = await admin.from("combats").update({ map_id: map.id, last_area: null }).eq("id", combat.id);
    if (error) return { error: /map_id/.test(error.message) ? "Run supabase/23-battle-maps.sql in Supabase first." : error.message };
    await admin.from("map_tokens").delete().eq("combat_id", combat.id); // a new map: everyone starts at the edges
    await ensureTokens(me.campaignId, combat.id, map.cols, map.rows);
  } else {
    await admin.from("combats").update({ map_id: null, last_area: null }).eq("id", combat.id);
    await admin.from("map_tokens").delete().eq("combat_id", combat.id);
  }
}

/** Teleport (Misty Step and friends): casts the spell, then moves the token without using movement. */
export async function teleportToken(characterId: string, spellKey: string, x: number, y: number): Promise<Fail | RollResponse> {
  const me = await who();
  if (!me.userId || !me.campaignId) return { error: "Log in first." };
  const b = await battleState(me.campaignId);
  if (!b) return NO_MAP;
  const t = b.tokens.find((k) => k.character_id === characterId);
  if (!t) return { error: "Your token isn't on the map." };
  const { character, canEdit, library } = await loadCharacter(characterId);
  if (!character || !canEdit) return { error: "That isn't your character." };
  const opt = allOptions(character, library).find((o) => o.key === spellKey);
  const range = TELEPORTS[opt?.name ?? ""];
  if (!opt || !range) return { error: "That spell doesn't teleport." };
  const nx = Math.round(x), ny = Math.round(y);
  if (squares(t, { x: nx, y: ny }) * b.map.feet > range) return { error: `${opt.name} reaches ${range} ft.` };
  if (!freeAt(t, nx, ny, b.tokens, b.map.cols, b.map.rows)) return { error: "Someone is already there (or it's off the map)." };
  const res = await rollForCharacter(characterId, { kind: "use", key: spellKey }, "normal");
  if ("error" in res) return res;
  await b.admin.from("map_tokens").update({ x: nx, y: ny, updated_at: new Date().toISOString() }).eq("id", t.id);
  return res;
}

/**
 * Cast an area spell placed on the map. The server works out who is inside (hidden creatures too),
 * then casts it on them. Spells that let you choose: only the creatures you picked (from those inside).
 */
export async function castArea(characterId: string, optionKey: string, aim: { x: number; y: number }, chosen: string[], advantage: Advantage = "normal"):
  Promise<Fail | (RollResponse & { hit: number })> {
  const me = await who();
  if (!me.userId || !me.campaignId) return { error: "Log in first." };
  const b = await battleState(me.campaignId);
  if (!b) return NO_MAP;
  const { character, canEdit, library } = await loadCharacter(characterId);
  if (!character || !canEdit) return { error: "That isn't your character." };
  const opt = allOptions(character, library).find((o) => o.key === optionKey);
  const sp = opt?.fromSpell as (typeof opt & { fromSpell?: { description?: string; range?: string } })["fromSpell"] | undefined;
  const spec = sp ? parseArea(sp.description ?? "", sp.range ?? null) : null;
  if (!opt || !spec) return { error: "That spell has no area to place." };
  const caster = b.tokens.find((k) => k.character_id === characterId);
  if (!caster) return { error: "Your token isn't on the map." };
  if (!inRange(spec, caster, aim, b.map.feet)) return { error: `Out of range (${spec.range} ft).` };
  const placed = place(spec, caster, aim, b.map.feet);
  let inside = tokensIn(placed, b.tokens, caster.id, spec.shape);
  if (spec.pick === "choose") {
    const allowedIds = new Set(inside.filter((t) => me.isDm || !t.hidden).map((t) => t.combatant_id));
    const pick = [...new Set(chosen)].filter((id) => allowedIds.has(id));
    if (spec.max && pick.length > spec.max) return { error: `${opt.name} affects up to ${spec.max} creatures.` };
    if (!pick.length) return { error: "Pick at least one creature." };
    inside = inside.filter((t) => pick.includes(t.combatant_id));
  }
  const targets = inside.map((t) => ({ characterId: t.character_id, monsterId: t.monster_id }));
  const res = await rollForCharacter(characterId, { kind: "use", key: optionKey }, advantage, targets[0] ?? null, targets.slice(1));
  if ("error" in res) return res;
  await b.admin.from("combats").update({ last_area: { by: character.name, spell: opt.name, placed, at: new Date().toISOString() } }).eq("id", b.combat.id);
  // players must not learn about creatures they can't see
  const hiddenMonsters = new Set(b.tokens.filter((t) => t.hidden && t.monster_id).map((t) => t.monster_id));
  if (!me.isDm && hiddenMonsters.size) {
    res.saves = res.saves?.map((s) => (s.target.monsterId && hiddenMonsters.has(s.target.monsterId) ? { ...s, name: "Something unseen" } : s));
    res.appliedAll = res.appliedAll?.filter((a) => !(a.target.monsterId && hiddenMonsters.has(a.target.monsterId)));
  }
  return { ...res, hit: targets.length };
}
