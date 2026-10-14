// Server helpers for battle-map actions (not a "use server" file: nothing here is callable from a browser).
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { liveState } from "@/lib/roll-service";
import { sortCombatants } from "@/lib/session-data";
import { walkSpeed } from "./move";

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
};

/** The running fight's map and every token in it (hidden ones too: only for the server's own checks). */
export async function battleState(campaignId: string) {
  const admin = createAdminClient();
  const { combat } = await liveState(admin, campaignId);
  if (!combat) return null;
  const { data: c } = await admin.from("combats").select("map_id").eq("id", combat.id).maybeSingle();
  if (!c?.map_id) return null;
  const [{ data: map }, { data: toks }, { data: cbs }] = await Promise.all([
    admin.from("battle_maps").select("id, cols, rows, feet").eq("id", c.map_id).maybeSingle(),
    admin.from("map_tokens").select("id, combatant_id, x, y, size, hidden, moved_ft, dashes").eq("combat_id", combat.id),
    admin.from("combatants").select("id, name, initiative, dex_mod, character_id, monster_id").eq("combat_id", combat.id),
  ]);
  if (!map) return null;
  const charIds = (cbs ?? []).map((x) => x.character_id).filter(Boolean) as string[];
  const monIds = (cbs ?? []).map((x) => x.monster_id).filter(Boolean) as string[];
  const [{ data: chars }, { data: mons }] = await Promise.all([
    charIds.length ? admin.from("characters").select("id, owner_user_id, speed").in("id", charIds) : Promise.resolve({ data: [] }),
    monIds.length ? admin.from("monsters").select("id, stat_block").in("id", monIds) : Promise.resolve({ data: [] }),
  ]);
  const ch = new Map(((chars ?? []) as { id: string; owner_user_id: string | null; speed: number | null }[]).map((x) => [x.id, x]));
  const mo = new Map(((mons ?? []) as { id: string; stat_block: { speed?: unknown } | null }[]).map((x) => [x.id, x]));
  const cb = new Map((cbs ?? []).map((x) => [x.id as string, x]));
  const tokens: FullToken[] = (toks ?? []).map((t) => {
    const k = cb.get(t.combatant_id as string);
    const c1 = k?.character_id ? ch.get(k.character_id as string) : null;
    const m1 = k?.monster_id ? mo.get(k.monster_id as string) : null;
    return {
      ...(t as Omit<FullToken, "character_id" | "monster_id" | "owner" | "speed">),
      character_id: (k?.character_id as string) ?? null, monster_id: (k?.monster_id as string) ?? null,
      owner: c1?.owner_user_id ?? null, speed: c1 ? walkSpeed(c1.speed) : walkSpeed(m1?.stat_block?.speed),
    };
  });
  const order = sortCombatants((cbs ?? []) as { id: string; initiative: number | null; dex_mod: number; name: string }[]);
  const current = order.length ? order[combat.turn_index % order.length]?.id ?? null : null;
  return { admin, combat, map: map as { id: string; cols: number; rows: number; feet: number }, tokens, currentCombatantId: current };
}
