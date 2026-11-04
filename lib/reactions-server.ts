// Reaction windows, server side (secret key). Callers check permissions first; only import from server code.
// Something happens in a fight → `openWindow` works out who can react (lib/engine/react.ts) and, if anyone can,
// stores a window that closes in a few seconds. The pop-up reads it; answers come in through `respondReaction`.
import type { Admin } from "@/lib/roll-service";
import { canAct, type RuleSet } from "@/lib/engine/conditions";
import { cleanEffects, shownConditions } from "@/lib/engine/effects";
import { monsterReactions, whoCanReact, WINDOW_SECONDS, type Eligible, type Reactor, type Trigger } from "@/lib/engine/react";
import { distanceFt, terrainOf } from "@/lib/engine/space";
import { lowestFreeSlot, type SheetCharacter } from "@/lib/rules";

/** Reaction spells and their levels. */
const REACTION_SPELLS: Record<string, number> = { Shield: 1, Counterspell: 3, "Silvery Barbs": 1, "Hellish Rebuke": 1, "Absorb Elements": 1 };

export type WindowEligible = Eligible & { characterId: string | null; monsterId: string | null };

type CombatantRow = { id: string; name: string; character_id: string | null; monster_id: string | null; conditions: string[] | null; effects?: unknown; reaction_used?: boolean; monsters?: { kind?: string } | null };

/** Everyone in the fight, as reactors, and the distance between any two (from the battle map, if there is one). */
export async function reactors(admin: Admin, combatId: string, rules: RuleSet) {
  const { data: rows, error } = await admin.from("combatants").select("*, monsters(kind)").eq("combat_id", combatId);
  if (error || !rows?.length || !("reaction_used" in rows[0])) return null; // before 38-reactions.sql
  const list = rows as CombatantRow[];
  const charIds = list.map((r) => r.character_id).filter((x): x is string => !!x);
  const monIds = list.map((r) => r.monster_id).filter((x): x is string => !!x);
  const [{ data: chars }, { data: mons }, { data: toks }, { data: combat }] = await Promise.all([
    charIds.length ? admin.from("characters").select("*").in("id", charIds) : Promise.resolve({ data: [] }),
    monIds.length ? admin.from("monsters").select("id, stat_block").in("id", monIds) : Promise.resolve({ data: [] }),
    admin.from("map_tokens").select("*").eq("combat_id", combatId),
    admin.from("combats").select("map_id").eq("id", combatId).maybeSingle(),
  ]);
  const { data: map } = combat?.map_id ? await admin.from("battle_maps").select("*").eq("id", combat.map_id).maybeSingle() : { data: null };
  const terrain = terrainOf((map as { terrain?: unknown } | null)?.terrain);
  const ch = new Map(((chars ?? []) as Record<string, unknown>[]).map((c) => [c.id as string, c]));
  const mo = new Map(((mons ?? []) as { id: string; stat_block: unknown }[]).map((m) => [m.id, m]));
  const out: (Reactor & { characterId: string | null; monsterId: string | null; owner: string | null })[] = [];
  for (const r of list) {
    const conds = shownConditions(r.conditions ?? [], cleanEffects(r.effects));
    const base = { combatantId: r.id, name: r.name, canReact: !r.reaction_used && canAct(conds, rules).reactions, characterId: r.character_id, monsterId: r.monster_id };
    if (r.character_id) {
      const c = ch.get(r.character_id) as (SheetCharacter & { owner_user_id?: string | null; features?: (string | { name: string })[]; attacks?: { kind?: string; name: string; ranged?: boolean }[] }) | undefined;
      const known = (c?.spells?.known ?? []) as string[];
      const spells = Object.entries(REACTION_SPELLS)
        .filter(([n, lvl]) => known.includes(n) && c && lowestFreeSlot(c, lvl) !== null)
        .map(([n]) => ({ name: n, key: `spell:${n}` }));
      const melee = (c?.attacks ?? []).find((a) => a.kind === "weapon" && !a.ranged) ?? null;
      out.push({ ...base, side: "party", spells, features: (c?.features ?? []).map((f) => (typeof f === "string" ? f : f.name)),
        melee: melee ? { key: `atk:${melee.name}`, name: melee.name } : null, owner: (c?.owner_user_id as string | null) ?? null });
    } else {
      const sb = mo.get(r.monster_id ?? "")?.stat_block as { actions?: { name: string; kind: string; ranged?: boolean }[] } | undefined;
      const melee = (sb?.actions ?? []).find((a) => a.kind === "attack" && !a.ranged) ?? null;
      const text = JSON.stringify(sb ?? "");
      out.push({ ...base, side: r.monsters?.kind === "npc" ? "party" : "enemy", features: [], monsterReactions: monsterReactions(sb),
        spells: /Counterspell/.test(text) ? [{ name: "Counterspell", key: "Counterspell" }] : [],
        melee: melee ? { key: melee.name, name: melee.name } : null, owner: null });
    }
  }
  const tok = new Map(((toks ?? []) as { combatant_id: string; x: number; y: number; size: number; z?: number }[]).map((t) => [t.combatant_id, t]));
  const feet = (map as { feet?: number } | null)?.feet ?? 5;
  const dist = (a: string, b: string) => {
    const ta = tok.get(a), tb = tok.get(b);
    return ta && tb ? distanceFt({ id: a, ...ta, z: ta.z ?? 0 }, { id: b, ...tb, z: tb.z ?? 0 }, feet, "5", terrain) : null;
  };
  return { list: out, dist };
}

/** Opens a reaction window if anyone can react. Returns it (or null: nobody can, or SQL 38 isn't run yet). */
export async function openWindow(admin: Admin, a: { campaignId: string; combatId: string; rules: RuleSet; trigger: Trigger & Record<string, unknown>; rollId?: string | null; effectId?: string | null }) {
  const rs = await reactors(admin, a.combatId, a.rules);
  if (!rs) return null;
  const eligible = whoCanReact(a.trigger, rs.list, rs.dist);
  if (!eligible.length) return null;
  const full: WindowEligible[] = eligible.map((e) => {
    const r = rs.list.find((x) => x.combatantId === e.combatantId)!;
    return { ...e, characterId: r.characterId, monsterId: r.monsterId };
  });
  const closes = new Date(Date.now() + WINDOW_SECONDS * 1000).toISOString();
  const { data, error } = await admin.from("reaction_windows").insert({
    campaign_id: a.campaignId, combat_id: a.combatId, trigger: { ...a.trigger, ...(a.effectId ? { effectId: a.effectId } : {}) },
    eligible: full, roll_id: a.rollId ?? null, closes_at: closes,
  }).select("id").single();
  if (error || !data) return null;
  return { id: data.id as string, closesAt: closes, who: full.map((e) => e.name) };
}
