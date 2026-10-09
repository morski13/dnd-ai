// Server-side helpers for saving rolls. Only import this from server actions.
// Everything here uses the secret-key client, so callers must check permissions first.
import { createAdminClient } from "@/lib/supabase/admin";

export type Admin = ReturnType<typeof createAdminClient>;
export type Target = { characterId?: string | null; monsterId?: string | null };

/** The running session (started, not ended) and its running fight, if any. */
export async function liveState(admin: Admin, campaignId: string) {
  const { data: session } = await admin
    .from("sessions").select("id, number")
    .eq("campaign_id", campaignId).not("started_at", "is", null).is("ended_at", null)
    .order("number", { ascending: false }).limit(1).maybeSingle();
  if (!session) return { session: null, combat: null };
  const { data: combat } = await admin
    .from("combats").select("id, round, turn_index")
    .eq("session_id", session.id).is("ended_at", null)
    .order("started_at", { ascending: false }).limit(1).maybeSingle();
  return { session, combat };
}

/** Name and AC of a target in this campaign (null if it isn't one). */
export async function lookupTarget(admin: Admin, campaignId: string, t?: Target | null) {
  if (t?.characterId) {
    const { data } = await admin.from("characters").select("id, name, ac").eq("id", t.characterId).eq("campaign_id", campaignId).maybeSingle();
    return data ? { characterId: data.id as string, monsterId: null, name: data.name as string, ac: data.ac as number | null } : null;
  }
  if (t?.monsterId) {
    const { data } = await admin.from("monsters").select("id, name, ac").eq("id", t.monsterId).eq("campaign_id", campaignId).maybeSingle();
    return data ? { characterId: null, monsterId: data.id as string, name: data.name as string, ac: data.ac as number | null } : null;
  }
  return null;
}

/** Hit or miss: natural 20 always hits, natural 1 always misses. Null if the target's AC is unknown. */
export function hitOrMiss(total: number | null, ac: number | null | undefined, natural20: boolean, natural1: boolean) {
  if (natural20) return true;
  if (natural1) return false;
  if (total == null || ac == null) return null;
  return total >= ac;
}

/** After an initiative roll: put it on the combatant (if they're in the running fight). */
export async function recordInitiative(
  admin: Admin, combatId: string, who: { characterId?: string; monsterId?: string }, total: number, hidden = false
) {
  let q = admin.from("combatants").update({ initiative: total, initiative_hidden: hidden }).eq("combat_id", combatId);
  q = who.characterId ? q.eq("character_id", who.characterId) : q.eq("monster_id", who.monsterId!);
  await q;
  await touchCombat(admin, combatId);
}

/** Nudges the fight so everyone's screen refreshes (live updates listen to the combats table). */
export async function touchCombat(admin: Admin, combatId: string) {
  const { data } = await admin.from("combats").select("round").eq("id", combatId).maybeSingle();
  if (data) await admin.from("combats").update({ round: data.round }).eq("id", combatId);
}
