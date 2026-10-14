// Battle maps: loading the map, tokens and who may move what (server only).
// Players read through their own key, so hidden monster tokens never reach them (database rules).
import type { SupabaseClient } from "@supabase/supabase-js";
import { connection } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Crop } from "@/lib/maps/grid";
import { moveBudget, sizeSquares, startingSpots, walkSpeed } from "@/lib/maps/move";

export type MapRow = { id: string; name: string; image_path: string | null; image_w: number | null; image_h: number | null; cols: number; rows: number; crop: Crop | null; stretch: boolean; feet: number; updated_at: string };
export const MAP_COLUMNS = "id, name, image_path, image_w, image_h, cols, rows, crop, stretch, feet, updated_at";

export type BattleToken = {
  id: string; combatantId: string; x: number; y: number; size: number; hidden: boolean;
  name: string; kind: "pc" | "monster" | "npc"; characterId: string | null; monsterId: string | null;
  portrait: string | null; speed: number; movedFt: number; dashes: number; budget: number; mine: boolean;
};
export type BattleArea = { by: string; spell: string; placed: unknown; at: string } | null;
export type Battle = {
  map: { id: string; name: string; cols: number; rows: number; feet: number; crop: Crop | null; stretch: boolean; image: string | null; imageW: number | null; imageH: number | null };
  tokens: BattleToken[]; lastArea: BattleArea; currentCombatantId: string | null;
};

export const mapImageUrl = (m: Pick<MapRow, "id" | "image_path" | "updated_at">) => (m.image_path ? `/api/maps/${m.id}/image?v=${encodeURIComponent(m.updated_at)}` : null);
export const portraitUrl = (kind: "character" | "monster", id: string, stamp: number | null | undefined) => (stamp ? `/api/portrait/${kind}/${id}?v=${stamp}` : null);

type Combatant = { id: string; name: string; characterId: string | null; monsterId: string | null; ally?: boolean; isMine?: boolean };

/** DM: every fighter in this combat gets a token (new ones start along the top / bottom edge). */
export async function ensureTokens(campaignId: string, combatId: string, cols: number, rows: number) {
  const admin = createAdminClient();
  const [{ data: cs }, { data: toks }] = await Promise.all([
    admin.from("combatants").select("id, character_id, monster_id, monsters(kind, stat_block)").eq("combat_id", combatId),
    admin.from("map_tokens").select("combatant_id, x, y, size").eq("combat_id", combatId),
  ]);
  const have = new Set((toks ?? []).map((t) => t.combatant_id));
  const missing = (cs ?? []).filter((c) => !have.has(c.id));
  if (!missing.length) return;
  const placedTokens = (toks ?? []).map((t) => ({ id: t.combatant_id as string, x: t.x as number, y: t.y as number, size: t.size as number }));
  const want = missing.map((c) => {
    const m = c.monsters as unknown as { kind?: string; stat_block?: { size?: string } } | null;
    return { id: c.id as string, side: (c.character_id || m?.kind === "npc" ? "party" : "enemy") as "party" | "enemy", size: sizeSquares(m?.stat_block?.size) };
  });
  // place around the tokens that are already there
  const spots = startingSpotsAround(want, placedTokens, cols, rows);
  await admin.from("map_tokens").insert(want.map((w) => ({ campaign_id: campaignId, combat_id: combatId, combatant_id: w.id, x: spots[w.id].x, y: spots[w.id].y, size: Math.min(w.size, cols, rows) })));
}

function startingSpotsAround(want: { id: string; side: "party" | "enemy"; size: number }[], placed: { id: string; x: number; y: number; size: number }[], cols: number, rows: number) {
  const all = startingSpots(want, cols, rows);
  if (!placed.length) return all;
  // tokens already on the map stay put: a new one that would land on them moves to the nearest free square
  const out: Record<string, { x: number; y: number }> = {};
  const taken = placed.map((p) => ({ ...p }));
  const free = (id: string, x: number, y: number, size: number) => x >= 0 && y >= 0 && x + size <= cols && y + size <= rows
    && !taken.some((t) => x < t.x + t.size && t.x < x + size && y < t.y + t.size && t.y < y + size) && id;
  for (const w of want) {
    const pref = all[w.id];
    let spot = pref && free(w.id, pref.x, pref.y, w.size) ? pref : null;
    for (let r = 0; !spot && r < Math.max(cols, rows); r++) {
      for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) {
        const x = (pref?.x ?? 0) + dx, y = (pref?.y ?? 0) + dy;
        if (free(w.id, x, y, w.size)) spot = { x, y };
      }
    }
    spot ??= { x: 0, y: 0 };
    out[w.id] = spot;
    taken.push({ id: w.id, x: spot.x, y: spot.y, size: w.size });
  }
  return out;
}

/** The battle map of the running fight, as this person may see it (null = no map in this fight). */
export async function loadBattle(supabase: SupabaseClient, a: {
  campaignId: string; combatId: string; isDm: boolean; combatants: Combatant[]; currentCombatantId: string | null; myCharacterIds: string[];
}): Promise<Battle | null> {
  const { data: c, error } = await supabase.from("combats").select("map_id, last_area").eq("id", a.combatId).maybeSingle();
  if (error || !c?.map_id) return null; // no map (or 23-battle-maps.sql not run yet)
  const { data: m } = await supabase.from("battle_maps").select(MAP_COLUMNS).eq("id", c.map_id).maybeSingle();
  const map = m as MapRow | null;
  if (!map) return null;
  if (a.isDm) await ensureTokens(a.campaignId, a.combatId, map.cols, map.rows);
  const { data: rows } = await supabase.from("map_tokens").select("id, combatant_id, x, y, size, hidden, moved_ft, dashes").eq("combat_id", a.combatId);
  const byId = new Map(a.combatants.map((x) => [x.id, x]));
  const charIds = a.combatants.map((x) => x.characterId).filter((x): x is string => !!x);
  const monIds = a.combatants.map((x) => x.monsterId).filter((x): x is string => !!x);
  const [{ data: chars }, { data: mons }] = await Promise.all([
    charIds.length ? supabase.from("characters").select("id, speed, portrait").in("id", charIds) : Promise.resolve({ data: [] }),
    monIds.length && a.isDm ? supabase.from("monsters").select("id, stat_block, portrait").in("id", monIds)
      : monIds.length ? createAdminClient().from("monsters").select("id, stat_block, portrait").in("id", monIds) : Promise.resolve({ data: [] }),
  ]);
  const ch = new Map(((chars ?? []) as { id: string; speed: number | null; portrait: number | null }[]).map((x) => [x.id, x]));
  const mo = new Map(((mons ?? []) as { id: string; stat_block: { speed?: unknown } | null; portrait: number | null }[]).map((x) => [x.id, x]));
  const tokens: BattleToken[] = [];
  for (const t of (rows ?? []) as { id: string; combatant_id: string; x: number; y: number; size: number; hidden: boolean; moved_ft: number; dashes: number }[]) {
    const cb = byId.get(t.combatant_id);
    if (!cb) continue;
    const cRow = cb.characterId ? ch.get(cb.characterId) : null;
    const mRow = cb.monsterId ? mo.get(cb.monsterId) : null;
    const speed = cRow ? walkSpeed(cRow.speed) : walkSpeed(mRow?.stat_block?.speed);
    tokens.push({
      id: t.id, combatantId: t.combatant_id, x: t.x, y: t.y, size: t.size, hidden: t.hidden,
      name: cb.name, kind: cb.characterId ? "pc" : cb.ally ? "npc" : "monster", characterId: cb.characterId, monsterId: cb.monsterId,
      portrait: cRow ? portraitUrl("character", cRow.id, cRow.portrait) : mRow ? portraitUrl("monster", mRow.id, mRow.portrait) : null,
      speed, movedFt: t.moved_ft, dashes: t.dashes, budget: moveBudget(speed, t.dashes),
      mine: !!cb.characterId && a.myCharacterIds.includes(cb.characterId),
    });
  }
  return {
    map: { id: map.id, name: map.name, cols: map.cols, rows: map.rows, feet: map.feet, crop: map.crop, stretch: map.stretch, image: mapImageUrl(map), imageW: map.image_w, imageH: map.image_h },
    tokens, lastArea: (c.last_area as BattleArea) ?? null, currentCombatantId: a.currentCombatantId,
  };
}

/** DM: every battle map of the active campaign, and whether a fight is running (to put a map in it). */
export async function listMaps() {
  await connection(); // depends on who is logged in
  const { who } = await import("@/lib/maps/server");
  const me = await who();
  if (!me.userId) return { isDm: false, maps: [] as (MapRow & { image: string | null })[], fightId: null as string | null, inFight: null as string | null, ready: true };
  if (!me.campaignId || !me.isDm) return { isDm: false, maps: [], fightId: null, inFight: null, ready: true };
  const { data, error } = await me.supabase.from("battle_maps").select(MAP_COLUMNS).eq("campaign_id", me.campaignId).order("created_at", { ascending: false });
  const { liveState } = await import("@/lib/roll-service");
  const { combat } = await liveState(createAdminClient(), me.campaignId);
  const { data: c } = combat ? await me.supabase.from("combats").select("map_id").eq("id", combat.id).maybeSingle() : { data: null };
  return {
    isDm: true, ready: !error,
    maps: ((data ?? []) as MapRow[]).map((m) => ({ ...m, image: mapImageUrl(m) })),
    fightId: combat?.id ?? null, inFight: (c as { map_id?: string } | null)?.map_id ?? null,
  };
}

export async function getMapForEdit(id: string) {
  await connection();
  const { who } = await import("@/lib/maps/server");
  const me = await who();
  if (!me.campaignId || !me.isDm) return null;
  const { data } = await me.supabase.from("battle_maps").select(MAP_COLUMNS).eq("id", id).eq("campaign_id", me.campaignId).maybeSingle();
  return data ? { ...(data as MapRow), image: mapImageUrl(data as MapRow) } : null;
}
