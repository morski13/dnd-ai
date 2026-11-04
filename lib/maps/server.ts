// Server helpers for battle-map actions (not a "use server" file: nothing here is callable from a browser).
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { liveState } from "@/lib/roll-service";
import { sortCombatants } from "@/lib/session-data";
import { walkSpeed } from "./move";
import { coverOf, distanceFt, reachOf, terrainOf, type Diagonals, type MoveCtx } from "@/lib/engine/space";
import { monsterReach } from "@/lib/engine/damage";
import { cleanEffects, shownConditions } from "@/lib/engine/effects";
import { fallDice, KINDS } from "@/lib/engine/terrain";
import { roll } from "@/lib/dice";
import { applyHp } from "@/lib/moderator/apply";

export async function who() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = (auth?.claims?.sub as string | undefined) ?? null;
  if (!userId) return { supabase, userId: null, campaignId: null, isDm: false };
  const { data: m } = await supabase.from("campaign_members").select("campaign_id, role").eq("user_id", userId)
    .order("last_active_at", { ascending: false, nullsFirst: false }).order("joined_at", { ascending: true }).limit(1).maybeSingle();
  return { supabase, userId, campaignId: (m?.campaign_id as string) ?? null, isDm: m?.role === "dm" || m?.role === "co_dm" };
}

export type FullToken = {
  id: string; combatant_id: string; x: number; y: number; size: number; hidden: boolean; moved_ft: number; dashes: number;
  character_id: string | null; monster_id: string | null; owner: string | null; speed: number;
  name: string; side: "party" | "enemy"; conds: string[]; reach: number;
  z?: number; // flying height (feet)
};

/** The running fight's map and every token in it (hidden ones too: only for the server's own checks). */
export async function battleState(campaignId: string) {
  const admin = createAdminClient();
  const { combat } = await liveState(admin, campaignId);
  if (!combat) return null;
  const { data: c } = await admin.from("combats").select("map_id").eq("id", combat.id).maybeSingle();
  if (!c?.map_id) return null;
  const [{ data: map }, { data: toks }, { data: cbs }, { data: camp }] = await Promise.all([
    admin.from("battle_maps").select("*").eq("id", c.map_id).maybeSingle(), // "*": terrain only after 36-map-terrain.sql
    admin.from("map_tokens").select("id, combatant_id, x, y, size, hidden, moved_ft, dashes").eq("combat_id", combat.id),
    admin.from("combatants").select("*, monsters(kind)").eq("combat_id", combat.id),
    admin.from("campaigns").select("rule_set, settings").eq("id", campaignId).maybeSingle(),
  ]);
  if (!map) return null;
  const charIds = (cbs ?? []).map((x) => x.character_id).filter(Boolean) as string[];
  const monIds = (cbs ?? []).map((x) => x.monster_id).filter(Boolean) as string[];
  const [{ data: chars }, { data: mons }] = await Promise.all([
    charIds.length ? admin.from("characters").select("*").in("id", charIds) : Promise.resolve({ data: [] }),
    monIds.length ? admin.from("monsters").select("id, stat_block").in("id", monIds) : Promise.resolve({ data: [] }),
  ]);
  const ch = new Map(((chars ?? []) as { id: string; owner_user_id: string | null; speed: number | null; conditions?: string[]; attacks?: { kind?: string; name?: string; range?: string; note?: string; ranged?: boolean }[] }[]).map((x) => [x.id, x]));
  const mo = new Map(((mons ?? []) as { id: string; stat_block: { speed?: unknown } | null }[]).map((x) => [x.id, x]));
  const cb = new Map((cbs ?? []).map((x) => [x.id as string, x]));
  const tokens: FullToken[] = (toks ?? []).map((t) => {
    const k = cb.get(t.combatant_id as string);
    const c1 = k?.character_id ? ch.get(k.character_id as string) : null;
    const m1 = k?.monster_id ? mo.get(k.monster_id as string) : null;
    const npc = (k?.monsters as unknown as { kind?: string } | null)?.kind === "npc";
    const reach = c1
      ? Math.max(5, ...(c1.attacks ?? []).filter((a) => a.kind === "weapon" && !a.ranged).map((a) => reachOf({ kind: "weapon", name: a.name, range: a.range, note: a.note }).melee ?? 5))
      : monsterReach(m1?.stat_block);
    return {
      ...(t as Omit<FullToken, "character_id" | "monster_id" | "owner" | "speed" | "name" | "side" | "conds" | "reach">),
      character_id: (k?.character_id as string) ?? null, monster_id: (k?.monster_id as string) ?? null,
      owner: c1?.owner_user_id ?? null, speed: c1 ? walkSpeed(c1.speed) : walkSpeed(m1?.stat_block?.speed),
      name: (k?.name as string) ?? "?", side: k?.character_id || npc ? "party" : "enemy",
      conds: shownConditions([...(c1?.conditions ?? []), ...((k?.conditions as string[] | null) ?? [])], cleanEffects((k as { effects?: unknown } | undefined)?.effects)),
      reach,
    };
  });
  const order = sortCombatants((cbs ?? []) as { id: string; initiative: number | null; dex_mod: number; name: string }[]);
  const current = order.length ? order[combat.turn_index % order.length]?.id ?? null : null;
  const rules = ((camp?.rule_set as string) === "2014" ? "2014" : "2024") as "2014" | "2024";
  const diag: Diagonals = (camp?.settings as { house_rules?: { diagonals?: string } } | null)?.house_rules?.diagonals === "5-10-5" ? "5-10-5" : "5";
  const terrain = terrainOf((map as { terrain?: unknown }).terrain);
  return { admin, combat, map: map as { id: string; cols: number; rows: number; feet: number }, tokens, currentCombatantId: current, terrain, terrainRaw: (map as { terrain?: unknown }).terrain, diag, rules };
}

/** The battle state as the movement rules need it, for one creature (who is friend and who is foe). */
export function moveCtx(b: NonNullable<Awaited<ReturnType<typeof battleState>>>, me: FullToken): MoveCtx {
  return {
    cols: b.map.cols, rows: b.map.rows, feet: b.map.feet, diag: b.diag, terrain: b.terrain, rules: b.rules,
    others: b.tokens.filter((t) => t.id !== me.id).map((t) => ({ id: t.id, x: t.x, y: t.y, size: t.size, hostile: t.side !== me.side })),
  };
}

/**
 * Where two creatures stand on the running fight's map: the distance, and the cover the target has from the
 * attacker. Null when there's no map or either one has no token.
 */
export async function attackGeometry(campaignId: string, from: { characterId?: string | null; monsterId?: string | null }, to: { characterId?: string | null; monsterId?: string | null } | null | undefined) {
  if (!to?.characterId && !to?.monsterId) return null;
  const b = await battleState(campaignId);
  if (!b) return null;
  const find = (w: { characterId?: string | null; monsterId?: string | null }) =>
    b.tokens.find((t) => (w.characterId ? t.character_id === w.characterId : !!w.monsterId && t.monster_id === w.monsterId)) ?? null;
  const a = find(from), t = find(to);
  if (!a || !t) return null;
  const dist = distanceFt(a, t, b.map.feet, b.diag, b.terrain);
  const cover = coverOf(a, t, b.terrain, b.tokens.filter((k) => k.id !== a.id && k.id !== t.id));
  return { dist, cover, feet: b.map.feet };
}

/**
 * Terrain that hurts: fire, lava, acid (entering or starting a turn there), spikes (every square moved through),
 * and falling (a drop of 10 ft or more on the way: 1d6 per 10 ft, then Prone). Rolls the damage, takes it off HP
 * with the creature's resistances, and logs it. Returns what happened, in words.
 */
export async function terrainHarm(
  b: NonNullable<Awaited<ReturnType<typeof battleState>>>, t: FullToken,
  what: { squares: { x: number; y: number }[]; when: "enter" | "start"; fallFt?: number }, byUser: string,
): Promise<string[]> {
  const out: string[] = [];
  const hits: { dice: string; type: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const sq of what.squares) {
    for (let j = 0; j < t.size; j++) for (let i = 0; i < t.size; i++) {
      const k = `${sq.x + i},${sq.y + j}`;
      const h = b.terrain.hazards.get(k);
      if (!h) continue;
      const fits = h.when === "both" || h.when === what.when;
      if (!fits) continue;
      // spikes hurt for every square walked; the others once per move or turn start
      const once = h.kind !== "spikes" ? h.kind : `${h.kind}:${sq.x},${sq.y}`;
      if (seen.has(once)) continue;
      seen.add(once);
      hits.push({ dice: h.dice, type: h.type, label: KINDS[h.kind].label });
    }
  }
  const fall = fallDice(what.fallFt ?? 0);
  if (fall) hits.push({ dice: fall, type: "bludgeoning", label: `Falling ${what.fallFt} ft` });
  if (!hits.length) return out;
  const { session } = await liveState(b.admin, b.combat.campaign_id as string);
  for (const h of hits) {
    const r = roll(h.dice);
    await b.admin.from("roll_events").insert({
      campaign_id: b.combat.campaign_id, session_id: session?.id ?? null, combat_id: b.combat.id, round: b.combat.round, rolled_by: byUser,
      roll_type: "damage", source: `${h.label} (terrain)`, expression: r.expression, dice: r.dice, dice_all: r.diceAll, modifier: r.modifier, total: r.total,
      damage_type: h.type, target_character_id: t.character_id, target_monster_id: t.monster_id, hidden: t.hidden,
    });
    const applied = await applyHp(b.admin, {
      campaignId: b.combat.campaign_id as string, sessionId: session?.id ?? null, combatId: b.combat.id, round: b.combat.round,
      kind: "damage", total: r.total, target: { characterId: t.character_id, monsterId: t.monster_id }, createdBy: byUser, hidden: t.hidden,
      damageType: h.type, magical: false,
    });
    out.push(`${t.name}: ${h.label}, ${applied ? applied.amount : r.total} ${h.type}${applied?.defense ? ` (${applied.defense})` : ""}.`);
  }
  if (fall) {
    const { data: c } = await b.admin.from("combatants").select("conditions").eq("id", t.combatant_id).maybeSingle();
    const cond = (c?.conditions as string[] | null) ?? [];
    if (!cond.includes("Prone")) await b.admin.from("combatants").update({ conditions: [...cond, "Prone"] }).eq("id", t.combatant_id);
    out.push(`${t.name} lands Prone.`);
  }
  return out;
}

/** The start of a creature's turn on the map: does the ground it stands on hurt? */
export async function terrainAtTurnStart(campaignId: string, combatantId: string, byUser: string): Promise<string[]> {
  const b = await battleState(campaignId);
  if (!b) return [];
  const t = b.tokens.find((k) => k.combatant_id === combatantId);
  if (!t || (t.z ?? 0) > 0) return [];
  return terrainHarm(b, t, { squares: [{ x: t.x, y: t.y }], when: "start" }, byUser);
}
