// Server helpers for battle-map actions (not a "use server" file: nothing here is callable from a browser).
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { liveState } from "@/lib/roll-service";
import { sortCombatants } from "@/lib/session-data";
import { walkSpeed } from "./move";
import { coverOf, distanceFt, reachOf, terrainOf, type Diagonals, type MoveCtx } from "@/lib/engine/space";
import { monsterReach } from "@/lib/engine/damage";
import { cleanEffects, shownConditions } from "@/lib/engine/effects";
import { cleanZones, withZones, zoneAtCasterTurn, zoneSpares, zoneTouches, type Zone } from "@/lib/engine/spells";
import { makeEffect } from "@/lib/engine/effects";
import { putEffect } from "@/lib/engine/server";
import { rollTargetSaves } from "@/lib/moderator/saves";
import { fallDice, KINDS } from "@/lib/engine/terrain";
import { characterSenses, lightMap, lightNote, seesBody, sensesFromText, type Senses } from "@/lib/engine/vision";
import { characterFlight, falls, flightFromSpeed, type Flight } from "@/lib/engine/flight";
import { speedOf } from "@/lib/engine/conditions";
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
  senses: Senses;
  flight: Flight; // flying speed (its own, or one it has for now) and whether it hovers
};

/** The running fight's map and every token in it (hidden ones too: only for the server's own checks). */
export async function battleState(campaignId: string) {
  const admin = createAdminClient();
  const { combat } = await liveState(admin, campaignId);
  if (!combat) return null;
  const { data: c } = await admin.from("combats").select("*").eq("id", combat.id).maybeSingle(); // "*": zones after 39-spell-zones.sql
  if (!c?.map_id) return null;
  const [{ data: map }, { data: toks }, { data: cbs }, { data: camp }] = await Promise.all([
    admin.from("battle_maps").select("*").eq("id", c.map_id).maybeSingle(), // "*": terrain only after 36-map-terrain.sql
    admin.from("map_tokens").select("*").eq("combat_id", combat.id), // "*": z / fly only after 37-flying.sql
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
  const ch = new Map(((chars ?? []) as { id: string; owner_user_id: string | null; speed: number | null; conditions?: string[]; species?: string | null; features?: (string | { name: string; description?: string })[]; attacks?: { kind?: string; name?: string; range?: string; note?: string; ranged?: boolean }[] }[]).map((x) => [x.id, x]));
  const mo = new Map(((mons ?? []) as { id: string; stat_block: { speed?: unknown; senses?: string } | null }[]).map((x) => [x.id, x]));
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
      ...(t as Omit<FullToken, "character_id" | "monster_id" | "owner" | "speed" | "name" | "side" | "conds" | "reach" | "senses" | "flight">),
      z: Number((t as { z?: number }).z) || 0,
      flight: (() => {
        const own = c1 ? characterFlight(c1) : flightFromSpeed(m1?.stat_block?.speed);
        const extra = Number((t as { fly?: number | null }).fly) || 0;
        const spell = Math.max(0, ...cleanEffects((k as { effects?: unknown } | undefined)?.effects).map((e) => e.fly ?? 0)); // Fly
        return { fly: Math.max(own.fly, extra, spell), hover: own.hover };
      })(),
      character_id: (k?.character_id as string) ?? null, monster_id: (k?.monster_id as string) ?? null,
      owner: c1?.owner_user_id ?? null, speed: c1 ? walkSpeed(c1.speed) : walkSpeed(m1?.stat_block?.speed),
      name: (k?.name as string) ?? "?", side: k?.character_id || npc ? "party" : "enemy",
      conds: shownConditions([...(c1?.conditions ?? []), ...((k?.conditions as string[] | null) ?? [])], cleanEffects((k as { effects?: unknown } | undefined)?.effects)),
      reach,
      senses: c1 ? characterSenses(c1) : sensesFromText(m1?.stat_block?.senses),
    };
  });
  const order = sortCombatants((cbs ?? []) as { id: string; initiative: number | null; dex_mod: number; name: string }[]);
  const current = order.length ? order[combat.turn_index % order.length]?.id ?? null : null;
  const rules = ((camp?.rule_set as string) === "2014" ? "2014" : "2024") as "2014" | "2024";
  const diag: Diagonals = (camp?.settings as { house_rules?: { diagonals?: string } } | null)?.house_rules?.diagonals === "5-10-5" ? "5-10-5" : "5";
  const zones = cleanZones((c as { zones?: unknown }).zones);
  const mp = map as { id: string; cols: number; rows: number; feet: number };
  const ground = terrainOf((map as { terrain?: unknown }).terrain);
  // lasting spells change the ground while they last (Web, Spike Growth, Fog Cloud, Darkness)
  const terrain = withZones(ground, zones, tokens, mp.cols, mp.rows, mp.feet);
  return { admin, combat, map: mp, tokens, currentCombatantId: current, terrain, terrainRaw: (map as { terrain?: unknown }).terrain, diag, rules, zones };
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
  // light and sight: can each of them see the other (darkness, smoke, walls, invisibility)?
  const light = lightMap(b.terrain, b.map.cols, b.map.rows);
  const sees = seesBody(a, a.senses, t, b.terrain, light, t.conds.includes("Invisible"));
  const seen = seesBody(t, t.senses, a, b.terrain, light, a.conds.includes("Invisible"));
  return { dist, cover, feet: b.map.feet, sees, seen, light: lightNote(t, b.terrain, light) };
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

/**
 * Flyers that can't stay up fall now: knocked Prone, speed 0, held, unconscious, or the flying speed is gone
 * (a Fly spell ended). Unless they hover. 1d6 per 10 ft, then Prone on the ground.
 */
export async function checkFalls(campaignId: string, byUser: string): Promise<string[]> {
  const b = await battleState(campaignId);
  if (!b) return [];
  const out: string[] = [];
  for (const t of b.tokens) {
    const z = t.z ?? 0;
    if (z <= 0) continue;
    const why = falls(z, t.conds, t.flight, t.flight.fly ? speedOf(t.flight.fly, t.conds, b.rules).speed : 0);
    if (!why) continue;
    await b.admin.from("map_tokens").update({ z: 0 }).eq("id", t.id);
    out.push(`${t.name} falls ${z} ft (${why}).`, ...await terrainHarm(b, { ...t, z: 0 }, { squares: [], when: "enter", fallFt: z }, byUser));
  }
  return out;
}

/**
 * Lasting spells on the map (Spirit Guardians, Moonbeam, Cloudkill, Spike Growth, Web…): a creature entering one,
 * or starting / ending its turn in one, makes the save and takes the damage or the condition. Once per zone per
 * round, except Spike Growth (every 5 ft moved inside). `path`: the squares it moved through (enter).
 */
export async function zoneHarm(
  b: NonNullable<Awaited<ReturnType<typeof battleState>>>, t: FullToken,
  what: { when: "enter" | "start" | "end" | "appear"; path?: { x: number; y: number }[]; zoneId?: string }, byUser: string,
): Promise<string[]> {
  if (!b.zones.length) return [];
  const out: string[] = [];
  const feet = b.map.feet;
  const { session } = await liveState(b.admin, b.combat.campaign_id as string);
  const round = b.combat.round ?? 0;
  let zones = b.zones;
  let changed = false;
  for (const z of b.zones) {
    if (what.zoneId && z.id !== what.zoneId) continue;
    if ((what.when === "appear" ? false : !z.rule.when.includes(what.when)) || zoneSpares(z, t)) continue;
    if (z.rule.perSquare && (t.z ?? 0) > 0) continue; // flying over Spike Growth
    const caster = b.tokens.find((k) => k.combatant_id === z.casterCombatantId) ?? null;
    const at = (sq: { x: number; y: number }) => zoneTouches(z, caster, { id: t.id, x: sq.x, y: sq.y, size: t.size }, feet);
    let times = 0;
    if (what.when === "enter") {
      const path = what.path ?? [];
      if (z.rule.perSquare) times = path.slice(1).filter(at).length; // Spike Growth: every square moved inside
      else if (path.length > 1 && !at(path[0]) && path.slice(1).some(at)) times = 1;
    } else if (at({ x: t.x, y: t.y })) times = 1;
    if (what.when === "appear" && z.rule.perSquare) times = 0; // Spike Growth only hurts when moving
    if (!times) continue;
    // once per round (Spike Growth hurts every step)
    if (!z.rule.perSquare) {
      if (z.hit?.[t.combatant_id] === round) continue;
      zones = zones.map((x) => (x.id === z.id ? { ...x, hit: { ...(x.hit ?? {}), [t.combatant_id]: round } } : x));
      changed = true;
    }
    const target = { characterId: t.character_id, monsterId: t.monster_id };
    if (z.rule.perSquare) {
      const r = roll(Array.from({ length: times }, () => z.rule.perSquare!.dice).join("+"));
      await logZoneDamage(b, t, z, r, z.rule.perSquare.type, session?.id ?? null, byUser);
      const applied = await applyHp(b.admin, { campaignId: b.combat.campaign_id as string, sessionId: session?.id ?? null, combatId: b.combat.id, round, kind: "damage", total: r.total, target, createdBy: byUser, hidden: t.hidden, damageType: z.rule.perSquare.type, magical: true });
      out.push(`${t.name}: ${z.spell}, ${times * 5} ft through it, ${applied ? applied.amount : r.total} ${z.rule.perSquare.type}.`);
      continue;
    }
    let saved: boolean | null = null;
    if (z.rule.save && z.dc) {
      const [s] = await rollTargetSaves(b.admin, {
        campaignId: b.combat.campaign_id as string, sessionId: session?.id ?? null, combatId: b.combat.id, round, createdBy: byUser,
        parentRollId: null, ability: z.rule.save, dc: z.dc, spell: z.spell, targets: [target], rules: b.rules,
      });
      saved = s?.success ?? null;
    }
    // a monster's save stays the DM's secret (the roll is logged hidden); the result shows in its HP and conditions
    const word = saved == null || t.monster_id ? "" : saved ? " saves" : " fails the save";
    if (z.rule.damage && z.damage && !(saved && !z.rule.half)) {
      const r = roll(z.damage);
      await logZoneDamage(b, t, z, r, z.damageType, session?.id ?? null, byUser);
      const applied = await applyHp(b.admin, { campaignId: b.combat.campaign_id as string, sessionId: session?.id ?? null, combatId: b.combat.id, round, kind: "damage", total: r.total, factor: saved ? "half" : "full", target, createdBy: byUser, hidden: t.hidden, damageType: z.damageType ?? undefined, magical: true });
      out.push(`${t.name}${word}: ${z.spell}, ${applied ? applied.amount : r.total}${z.damageType ? ` ${z.damageType}` : ""}.`);
    } else if (z.rule.conditions?.length && saved === false) {
      // Stinking Cloud: lost this turn; Web, Entangle: held until it breaks free or the spell ends; Grease: Prone
      const plain = z.rule.conditions.every((c) => c === "Prone");
      if (plain) {
        const { data: c } = await b.admin.from("combatants").select("conditions").eq("id", t.combatant_id).maybeSingle();
        const cond = (c?.conditions as string[] | null) ?? [];
        if (!cond.includes("Prone")) await b.admin.from("combatants").update({ conditions: [...cond, "Prone"] }).eq("id", t.combatant_id);
      } else {
        const short = z.rule.conditions.includes("Incapacitated") && z.rule.when.includes("start");
        await putEffect(b.admin, b.combat.campaign_id as string, b.combat.id, target, makeEffect({
          id: crypto.randomUUID(), name: z.spell, conditions: z.rule.conditions, source: { combatantId: z.casterCombatantId, name: z.casterName },
          duration: short ? "end_of_next_turn" : "removed", turnsOf: t.combatant_id, target: t.combatant_id, concentration: z.concentration,
        }));
      }
      out.push(`${t.name}${word}: ${z.spell}, ${z.rule.conditions.join(" and ")}.`);
    } else if (saved != null && !t.monster_id) out.push(`${t.name}${word} against ${z.spell}.`);
  }
  if (changed) await b.admin.from("combats").update({ zones }).eq("id", b.combat.id);
  return out;
}

async function logZoneDamage(b: NonNullable<Awaited<ReturnType<typeof battleState>>>, t: FullToken, z: Zone, r: ReturnType<typeof roll>, type: string | null, sessionId: string | null, byUser: string) {
  const spell = z.spell;
  // counted as the caster's damage in the stats
  const by = b.tokens.find((k) => k.combatant_id === z.casterCombatantId);
  await b.admin.from("roll_events").insert({
    character_id: by?.character_id ?? null, monster_id: by?.character_id ? null : by?.monster_id ?? null,
    campaign_id: b.combat.campaign_id, session_id: sessionId, combat_id: b.combat.id, round: b.combat.round, rolled_by: byUser,
    roll_type: "damage", source: `${spell} (area)`, expression: r.expression, dice: r.dice, dice_all: r.diceAll, modifier: r.modifier, total: r.total,
    damage_type: type, target_character_id: t.character_id, target_monster_id: t.monster_id, hidden: t.hidden,
  });
}

/** The start of the zone caster's turn: zones count down a round and Cloudkill drifts away. */
export async function zonesAtCasterTurn(campaignId: string, combatantId: string): Promise<string[]> {
  const b = await battleState(campaignId);
  if (!b || !b.zones.some((z) => z.casterCombatantId === combatantId)) return [];
  const caster = b.tokens.find((k) => k.combatant_id === combatantId) ?? null;
  const out: string[] = [];
  const kept = b.zones.flatMap((z) => {
    if (z.casterCombatantId !== combatantId) return [z];
    const next = zoneAtCasterTurn(z, caster, b.map.feet);
    if (!next) out.push(`${z.spell} ends.`);
    else if (z.rule.drift) out.push(`${z.spell} drifts ${z.rule.drift} ft away from ${z.casterName}.`);
    return next ? [next] : [];
  });
  await b.admin.from("combats").update({ zones: kept }).eq("id", b.combat.id);
  return out;
}

/** A creature's turn starts or ends: is it standing in a lasting spell? */
export async function zonesOnTurn(campaignId: string, combatantId: string, when: "start" | "end", byUser: string): Promise<string[]> {
  const b = await battleState(campaignId);
  if (!b?.zones.length) return [];
  const t = b.tokens.find((k) => k.combatant_id === combatantId);
  return t ? zoneHarm(b, t, { when }, byUser) : [];
}
