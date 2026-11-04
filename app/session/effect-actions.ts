"use server";
// Timed conditions in a fight: "Paralyzed until the end of its next turn", "Frightened for 1 minute, WIS save ends".
// The DM can put them on anyone; players on anyone in a fight their character is in (the DM can take them off).
import { refresh } from "next/cache";
import { defensesOf, conditionBlocked } from "@/lib/engine/damage";
import { cleanEffects, makeEffect, shownConditions, withoutEffect, type DurationChoice } from "@/lib/engine/effects";
import { CONDITIONS } from "@/lib/moderator/hp";
import { touchCombat } from "@/lib/roll-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Ability } from "@/lib/rules";

type Fail = { error: string };

async function allowed(combatantId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub ?? null;
  if (!userId) return null;
  const admin = createAdminClient();
  const { data: row } = await admin.from("combatants").select("*").eq("id", combatantId).maybeSingle();
  if (!row) return null;
  const { data: m } = await admin.from("campaign_members").select("role").eq("campaign_id", row.campaign_id).eq("user_id", userId).maybeSingle();
  if (!m) return null;
  const isDm = m.role === "dm" || m.role === "co_dm";
  if (!isDm) {
    // a player: one of their characters fights in this combat
    const { data: mine } = await admin.from("combatants").select("id, characters!inner(owner_user_id)").eq("combat_id", row.combat_id).eq("characters.owner_user_id", userId).limit(1);
    if (!mine?.length) return null;
  }
  return { admin, row: row as { id: string; combat_id: string; campaign_id: string; monster_id: string | null; character_id: string | null; name: string; conditions: string[] | null; effects?: unknown }, userId, isDm };
}

const ABILITIES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

export async function addEffect(combatantId: string, input: {
  conditions: string[]; name?: string; duration: DurationChoice; rounds?: number;
  save?: { ability: string; dc: number } | null; sourceCombatantId?: string | null; concentration?: boolean;
}): Promise<Fail | { conditions: string[] }> {
  const a = await allowed(combatantId);
  if (!a) return { error: "You can't change that." };
  if (a.row.effects === undefined) return { error: "Run 35-timed-effects.sql in Supabase first." };
  const ok = new Set<string>(CONDITIONS);
  const conds = input.conditions.filter((c) => ok.has(c) || /^Exhaustion [1-6]$/.test(c)).slice(0, 4);
  if (!conds.length) return { error: "Pick a condition." };
  if (a.row.monster_id) {
    const { data: mo } = await a.admin.from("monsters").select("stat_block").eq("id", a.row.monster_id).maybeSingle();
    const d = defensesOf(mo?.stat_block);
    for (const c of conds) { const why = conditionBlocked(c, d); if (why) return { error: `${a.row.name} is ${why}.` }; }
  }
  let source: { combatantId: string | null; name: string } | null = null;
  if (input.sourceCombatantId) {
    const { data: s } = await a.admin.from("combatants").select("id, name, combat_id").eq("id", input.sourceCombatantId).maybeSingle();
    if (s && s.combat_id === a.row.combat_id) source = { combatantId: s.id as string, name: s.name as string };
  }
  const save = input.save && ABILITIES.includes(input.save.ability) && input.save.dc > 0
    ? { ability: input.save.ability as Ability, dc: Math.min(40, Math.floor(input.save.dc)) } : null;
  const e = makeEffect({
    id: crypto.randomUUID(), name: (input.name ?? "").trim().slice(0, 60) || conds.join(", "), conditions: conds, source,
    duration: input.duration, rounds: input.rounds, turnsOf: input.duration === "rounds" && source?.combatantId ? source.combatantId : a.row.id,
    target: a.row.id, save, concentration: !!input.concentration && !!source,
  });
  const effects = [...cleanEffects(a.row.effects), e];
  const conditions = shownConditions(a.row.conditions ?? [], effects);
  await a.admin.from("combatants").update({ effects, conditions }).eq("id", a.row.id);
  await touchCombat(a.admin, a.row.combat_id);
  refresh();
  return { conditions };
}

export async function removeEffect(combatantId: string, effectId: string): Promise<Fail | { conditions: string[] }> {
  const a = await allowed(combatantId);
  if (!a) return { error: "You can't change that." };
  const all = cleanEffects(a.row.effects);
  const ended = all.filter((e) => e.id === effectId);
  const kept = all.filter((e) => e.id !== effectId);
  const conditions = withoutEffect(a.row.conditions ?? [], ended, kept);
  await a.admin.from("combatants").update({ effects: kept, conditions }).eq("id", a.row.id);
  await touchCombat(a.admin, a.row.combat_id);
  refresh();
  return { conditions };
}
