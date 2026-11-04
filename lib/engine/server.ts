// Battle engine, server side (secret key): reads who has which conditions and defenses, so rolls and damage
// follow the rules. Callers check permissions first. Only import from server code.
import type { Admin, Target } from "@/lib/roll-service";
import { defensesOf, NO_DEFENSES, type Defenses } from "./damage";
import { cleanEffects, endConcentration, shownConditions, withoutEffect, type TimedEffect } from "./effects";
import type { RuleSet } from "./conditions";

export type Who = { name: string; conds: string[]; combatantId: string | null; effects: TimedEffect[]; defenses: Defenses };

/**
 * A creature's conditions right now: a character's own (they outlast fights, SQL 34), plus what is on them in the
 * running fight (put on by hand, or by a timed effect, SQL 35). Monsters: only what's on them in the fight.
 */
export async function whoIs(admin: Admin, campaignId: string, combatId: string | null, t: Target | null | undefined): Promise<Who | null> {
  if (!t?.characterId && !t?.monsterId) return null;
  const [{ data: row }, own] = await Promise.all([
    combatId
      ? admin.from("combatants").select("*").eq("combat_id", combatId).eq(t.characterId ? "character_id" : "monster_id", (t.characterId ?? t.monsterId)!).maybeSingle()
      : Promise.resolve({ data: null }),
    t.characterId
      ? admin.from("characters").select("*").eq("id", t.characterId).eq("campaign_id", campaignId).maybeSingle()
      : admin.from("monsters").select("id, name, stat_block").eq("id", t.monsterId!).eq("campaign_id", campaignId).maybeSingle(),
  ]);
  const rec = own.data as { name?: string; conditions?: string[]; stat_block?: unknown } | null;
  if (!rec) return null;
  const r = row as { id: string; conditions?: string[] | null; effects?: unknown } | null;
  const effects = cleanEffects(r?.effects);
  const conds = shownConditions([...(rec.conditions ?? []), ...(r?.conditions ?? [])], effects);
  return { name: rec.name ?? "?", conds, combatantId: r?.id ?? null, effects, defenses: t.monsterId ? defensesOf(rec.stat_block) : NO_DEFENSES };
}

/** The rules a campaign plays by (a "mixed" campaign uses each character's own; monsters then follow 2024). */
export async function campaignRules(admin: Admin, campaignId: string, fallback?: string | null): Promise<RuleSet> {
  if (fallback === "2014" || fallback === "2024") return fallback;
  const { data } = await admin.from("campaigns").select("rule_set").eq("id", campaignId).maybeSingle();
  return data?.rule_set === "2014" ? "2014" : "2024";
}

/** Someone stopped concentrating: every effect they keep up with it ends (Hold Person's Paralyzed goes away). */
export async function endConcentrationEffects(admin: Admin, combatId: string, source: Target): Promise<string[]> {
  const col = source.characterId ? "character_id" : "monster_id";
  const id = source.characterId ?? source.monsterId;
  if (!id) return [];
  const { data: src } = await admin.from("combatants").select("id").eq("combat_id", combatId).eq(col, id).maybeSingle();
  if (!src) return [];
  const { data: rows, error } = await admin.from("combatants").select("*").eq("combat_id", combatId);
  if (error || !rows?.length || !("effects" in rows[0])) return [];
  const out: string[] = [];
  // lasting spell areas it kept up (SQL 39)
  const { data: cz } = await admin.from("combats").select("*").eq("id", combatId).maybeSingle();
  const zones = (cz as { zones?: unknown } | null)?.zones;
  if (Array.isArray(zones) && zones.some((z) => (z as { casterCombatantId?: string; concentration?: boolean }).casterCombatantId === src.id && (z as { concentration?: boolean }).concentration)) {
    const kept = zones.filter((z) => !((z as { casterCombatantId?: string }).casterCombatantId === src.id && (z as { concentration?: boolean }).concentration));
    await admin.from("combats").update({ zones: kept }).eq("id", combatId);
    out.push(...zones.filter((z) => !kept.includes(z)).map((z) => `${(z as { spell: string }).spell} ends.`));
  }
  for (const r of rows as { id: string; name: string; conditions: string[] | null; effects: unknown }[]) {
    const all = cleanEffects(r.effects);
    const { kept, ended } = endConcentration(all, src.id as string);
    if (!ended.length) continue;
    await admin.from("combatants").update({ effects: kept, conditions: shownConditions(withoutEffect(r.conditions ?? [], ended, kept), kept) }).eq("id", r.id);
    out.push(...ended.map((e) => `${r.name}: ${e.name} ends.`));
  }
  return out;
}

/**
 * Put a timed effect on a creature in the fight (a spell's condition or buff). A monster immune to one of its
 * conditions doesn't get those. Returns the conditions it now has (or null if it isn't in the fight).
 */
export async function putEffect(admin: Admin, campaignId: string, combatId: string, target: Target, e: TimedEffect): Promise<{ name: string; added: string[]; immune: string[] } | null> {
  const who = await whoIs(admin, campaignId, combatId, target);
  if (!who?.combatantId) return null;
  const immune = e.conditions.filter((c) => who.defenses.conditionImmune.includes(c.replace(/\s+\d$/, "")));
  const effect = { ...e, conditions: e.conditions.filter((c) => !immune.includes(c)) };
  if (!effect.conditions.length && !effect.ac && !effect.bonusDice && !effect.fly && e.conditions.length) return { name: who.name, added: [], immune };
  const { data: row } = await admin.from("combatants").select("*").eq("id", who.combatantId).maybeSingle();
  // the same spell from the same caster again replaces the old one (Bless twice doesn't stack)
  const fx = [...cleanEffects((row as { effects?: unknown } | null)?.effects).filter((x) => !(x.name === e.name && x.source?.combatantId && x.source.combatantId === e.source?.combatantId)), effect];
  const conditions = shownConditions((row as { conditions?: string[] } | null)?.conditions ?? [], fx);
  await admin.from("combatants").update({ effects: fx, conditions }).eq("id", who.combatantId);
  return { name: who.name, added: effect.conditions, immune };
}
