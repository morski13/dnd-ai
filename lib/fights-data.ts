// Fight planner data (DM only).
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { CharacterForSim, MonsterStats } from "@/lib/encounter/build";
import type { SpellInfo } from "@/lib/rules";
import { SPELL_COLUMNS } from "@/lib/character-data";
import { rollHistory, type RollRow } from "@/lib/encounter/luck";

export type SavedEntry = {
  id: string;
  source: "srd" | "campaign" | "custom";
  ref: string;                 // SRD name, campaign monster id, or "custom"
  stats: MonsterStats;
  count: number;
  side: "enemy" | "ally";
};
export type FightData = { entries: SavedEntry[]; characterIds: string[] | null; fresh: boolean };
export type FightSummary = { tier: string; pWin: number; pAnyDown: number; pDeath: number; avgRounds: number; xp: number };

export async function requireDm() {
  await connection();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) redirect("/login");
  const { data: m } = await supabase
    .from("campaign_members").select("campaign_id, role").eq("user_id", userId)
    .order("last_active_at", { ascending: false, nullsFirst: false }).order("joined_at", { ascending: true }).limit(1).maybeSingle();
  const isDm = m?.role === "dm" || m?.role === "co_dm";
  return { supabase, userId, campaignId: (m?.campaign_id as string) ?? null, isDm };
}

export async function listFights() {
  const { supabase, campaignId, isDm } = await requireDm();
  if (!campaignId || !isDm) return { isDm: false, fights: [] };
  const { data } = await supabase.from("encounters").select("id, name, summary, updated_at")
    .eq("campaign_id", campaignId).order("updated_at", { ascending: false });
  return { isDm: true, fights: (data ?? []) as { id: string; name: string; summary: FightSummary | null; updated_at: string }[] };
}

type Db = Awaited<ReturnType<typeof createClient>>;

/** Each character's real dice so far (attacks, saves, damage), for "personal" simulations. */
export async function loadHistory(supabase: Db, campaignId: string, characterIds: string[]) {
  if (!characterIds.length) return {};
  const { data } = await supabase.from("roll_events")
    .select("character_id, roll_type, expression, dice, dice_all, total")
    .eq("campaign_id", campaignId).in("character_id", characterIds).in("roll_type", ["attack", "save", "damage"])
    .order("created_at", { ascending: false }).limit(5000);
  return rollHistory((data ?? []) as RollRow[]);
}

const CHAR_COLUMNS =
  "id, name, class_levels, ability_scores, proficiencies, spells, attacks, resources, hp_max, hp_current, ac";

export async function getFight(id: string) {
  const { supabase, campaignId, isDm } = await requireDm();
  if (!campaignId || !isDm) redirect("/");
  const [{ data: fight }, { data: chars }, { data: monsters }] = await Promise.all([
    supabase.from("encounters").select("id, name, data, summary").eq("id", id).eq("campaign_id", campaignId).maybeSingle(),
    supabase.from("characters").select(CHAR_COLUMNS).eq("campaign_id", campaignId).order("name"),
    supabase.from("monsters").select("id, name, ac, hp_max, stat_block").eq("campaign_id", campaignId).order("name"),
  ]);
  if (!fight) notFound();
  const characters = (chars ?? []).map((c) => ({
    ...c,
    class_levels: c.class_levels ?? [], ability_scores: c.ability_scores ?? {}, proficiencies: c.proficiencies ?? {},
    spells: c.spells ?? {}, attacks: c.attacks ?? [], resources: c.resources ?? [],
  })) as unknown as CharacterForSim[];
  const known = [...new Set(characters.flatMap((c) => c.spells?.known ?? []))];
  const { data: spells } = known.length
    ? await supabase.from("srd_spells").select(SPELL_COLUMNS).in("name", known)
    : { data: [] };
  const data = (fight.data ?? {}) as Partial<FightData>;
  const history = await loadHistory(supabase, campaignId, characters.map((c) => c.id));
  return {
    history,
    fight: { id: fight.id as string, name: fight.name as string, data: { entries: data.entries ?? [], characterIds: data.characterIds ?? null, fresh: data.fresh ?? true } as FightData },
    characters,
    library: (spells ?? []) as SpellInfo[],
    campaignMonsters: (monsters ?? [])
      .filter((m) => Array.isArray((m.stat_block as MonsterStats | null)?.actions))
      .map((m) => ({ id: m.id as string, name: m.name as string, stats: { ...(m.stat_block as MonsterStats), name: m.name, ac: m.ac ?? (m.stat_block as MonsterStats).ac, hp: m.hp_max ?? (m.stat_block as MonsterStats).hp } })),
  };
}

/** Practice fights (any member): your own characters against library monsters, nothing saved. */
export async function getPractice() {
  const { supabase, userId, campaignId } = await requireDm();
  if (!campaignId) redirect("/");
  const { data: chars } = await supabase.from("characters").select(CHAR_COLUMNS).eq("campaign_id", campaignId).eq("owner_user_id", userId).order("name");
  const characters = (chars ?? []).map((c) => ({
    ...c,
    class_levels: c.class_levels ?? [], ability_scores: c.ability_scores ?? {}, proficiencies: c.proficiencies ?? {},
    spells: c.spells ?? {}, attacks: c.attacks ?? [], resources: c.resources ?? [],
  })) as unknown as CharacterForSim[];
  const known = [...new Set(characters.flatMap((c) => c.spells?.known ?? []))];
  const [{ data: spells }, history] = await Promise.all([
    known.length ? supabase.from("srd_spells").select(SPELL_COLUMNS).in("name", known) : Promise.resolve({ data: [] }),
    loadHistory(supabase, campaignId, characters.map((c) => c.id)),
  ]);
  return { characters, library: (spells ?? []) as SpellInfo[], history };
}
