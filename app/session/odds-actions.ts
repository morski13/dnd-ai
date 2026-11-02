"use server";
// Live fight odds (DM only): the fight as it is now, for the simulator in the DM's browser, and applying
// one of the "make it fairer" changes the DM picked.
import { refresh } from "next/cache";
import type { CharacterForSim, MonsterStats } from "@/lib/encounter/build";
import type { LiveFoe, OddsInput } from "@/lib/encounter/live";
import { loadHistory } from "@/lib/fights-data";
import { spellsNamed } from "@/lib/srd-cache";
import type { SpellInfo } from "@/lib/rules";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { touchCombat } from "@/lib/roll-service";

type Fail = { error: string };
const CHAR_COLUMNS = "id, name, class_levels, ability_scores, proficiencies, spells, attacks, resources, features, hp_max, hp_current, ac";

async function dm() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub ?? null;
  if (!userId) return null;
  const { data: m } = await supabase.from("campaign_members").select("campaign_id, role").eq("user_id", userId)
    .order("last_active_at", { ascending: false, nullsFirst: false }).order("joined_at", { ascending: true }).limit(1).maybeSingle();
  if (m?.role !== "dm" && m?.role !== "co_dm") return null;
  return { supabase, userId, campaignId: m.campaign_id as string };
}

export async function fightOddsInput(combatId: string): Promise<Fail | OddsInput> {
  const ctx = await dm();
  if (!ctx) return { error: "Only the DM sees the odds." };
  const { supabase, campaignId } = ctx;
  const { data: combat } = await supabase.from("combats").select("id, name, campaign_id").eq("id", combatId).maybeSingle();
  if (!combat || combat.campaign_id !== campaignId) return { error: "Fight not found." };
  const { data: cs } = await supabase.from("combatants").select("character_id, monster_id").eq("combat_id", combatId);
  const charIds = (cs ?? []).map((c) => c.character_id).filter(Boolean) as string[];
  const monIds = (cs ?? []).map((c) => c.monster_id).filter(Boolean) as string[];
  const [{ data: chars }, { data: mons }, { data: saved }] = await Promise.all([
    charIds.length ? supabase.from("characters").select(CHAR_COLUMNS).in("id", charIds) : Promise.resolve({ data: [] }),
    monIds.length ? supabase.from("monsters").select("id, name, kind, ac, hp_max, hp_current, stat_block").in("id", monIds) : Promise.resolve({ data: [] }),
    supabase.from("encounters").select("name, data").eq("campaign_id", campaignId).eq("name", combat.name).limit(1).maybeSingle(),
  ]);
  const characters = ((chars ?? []) as Record<string, unknown>[]).map((c) => ({
    ...c, class_levels: c.class_levels ?? [], ability_scores: c.ability_scores ?? {}, proficiencies: c.proficiencies ?? {},
    spells: c.spells ?? {}, attacks: c.attacks ?? [], resources: c.resources ?? [], features: c.features ?? [],
  })) as unknown as CharacterForSim[];
  const known = [...new Set(characters.flatMap((c) => c.spells?.known ?? []))];
  const [library, history] = await Promise.all([known.length ? spellsNamed(known) : Promise.resolve([]), loadHistory(supabase, campaignId, charIds)]);
  const statsOf = (m: { name: string; ac: number | null; hp_max: number | null; stat_block: unknown }): MonsterStats | null => {
    const sb = m.stat_block as MonsterStats | null;
    if (!sb || !Array.isArray(sb.actions)) return null; // a quick monster without a stat block can't be simulated
    return { ...sb, name: m.name, ac: m.ac ?? sb.ac, hp: m.hp_max ?? sb.hp, init: sb.init ?? 0 };
  };
  const foes: LiveFoe[] = ((mons ?? []) as { id: string; name: string; kind: string; ac: number | null; hp_max: number | null; hp_current: number | null; stat_block: unknown }[])
    .flatMap((m) => { const st = statsOf(m); return st ? [{ key: m.id, monsterId: m.id, name: m.name, stats: st, hp: m.hp_current ?? st.hp, ally: m.kind === "npc" }] : []; });
  const entries = ((saved?.data as { entries?: { stats: MonsterStats; side: string }[] } | null)?.entries ?? []).filter((e) => e.side !== "ally");
  const extra = entries.map((e) => ({ name: e.stats.name, stats: e.stats }));
  return { characters, library: library as SpellInfo[], foes, extra, history };
}

/** The DM picked a change: take a monster out, take HP off it, or add one from the saved fight. */
export async function applyFairer(combatId: string, change: { kind: "remove"; monsterId: string } | { kind: "hp"; monsterId: string; minus: number } | { kind: "add"; name: string }): Promise<Fail | { ok: true }> {
  refresh();
  const ctx = await dm();
  if (!ctx) return { error: "Only the DM can change the fight." };
  const { supabase, campaignId } = ctx;
  const admin = createAdminClient();
  if (change.kind === "remove" || change.kind === "hp") {
    const { data: m } = await supabase.from("monsters").select("id, campaign_id, hp_current").eq("id", change.monsterId).maybeSingle();
    if (!m || m.campaign_id !== campaignId) return { error: "Monster not found." };
    if (change.kind === "remove") await admin.from("combatants").delete().eq("combat_id", combatId).eq("monster_id", m.id);
    else await supabase.from("monsters").update({ hp_current: Math.max(1, (m.hp_current ?? 1) - Math.max(1, Math.floor(change.minus))) }).eq("id", m.id);
  } else {
    const input = await fightOddsInput(combatId);
    if ("error" in input) return input;
    const e = input.extra.find((x) => x.name === change.name);
    if (!e) return { error: "That monster isn't in the saved fight." };
    const n = input.foes.filter((f) => f.stats.name === e.name || f.name.startsWith(e.name)).length + 1;
    const { data: m, error } = await supabase.from("monsters").insert({
      campaign_id: campaignId, name: `${e.name} ${n}`, kind: "monster", ac: e.stats.ac, hp_max: e.stats.hp, hp_current: e.stats.hp,
      stat_block: { ...e.stats, init_bonus: e.stats.init ?? 0 }, visibility: "dm",
    }).select("id, name").single();
    if (error || !m) return { error: error?.message ?? "Couldn't add it." };
    await supabase.from("combatants").insert({ combat_id: combatId, campaign_id: campaignId, monster_id: m.id, name: m.name, dex_mod: e.stats.init ?? 0 });
  }
  await touchCombat(admin, combatId);
  return { ok: true };
}
