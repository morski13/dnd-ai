"use server";
// Fight planner: create, save, delete fights; search the monster library.
import { redirect } from "next/navigation";
import { requireDm, type FightData, type FightSummary } from "@/lib/fights-data";
import type { MonsterStats } from "@/lib/encounter/build";

type Fail = { error: string };

export async function createFight(): Promise<Fail | void> {
  const { supabase, campaignId, isDm } = await requireDm();
  if (!campaignId || !isDm) return { error: "Only the DM can plan fights." };
  const { data, error } = await supabase.from("encounters")
    .insert({ campaign_id: campaignId, name: "New fight", data: { entries: [], characterIds: null, fresh: true } })
    .select("id").single();
  if (error || !data) return { error: "Couldn't create the fight. " + (error?.message ?? "") };
  redirect(`/fights/${data.id}`);
}

export async function saveFight(id: string, name: string, data: FightData, summary: FightSummary | null): Promise<Fail | { ok: true }> {
  const { supabase, campaignId, isDm } = await requireDm();
  if (!campaignId || !isDm) return { error: "Only the DM can save fights." };
  const { error } = await supabase.from("encounters")
    .update({ name: name.trim() || "Untitled fight", data, summary, updated_at: new Date().toISOString() })
    .eq("id", id).eq("campaign_id", campaignId);
  if (error) return { error: "Couldn't save. " + error.message };
  return { ok: true };
}

export async function deleteFight(id: string): Promise<Fail | void> {
  const { supabase, campaignId, isDm } = await requireDm();
  if (!campaignId || !isDm) return { error: "Only the DM can delete fights." };
  await supabase.from("encounters").delete().eq("id", id).eq("campaign_id", campaignId);
  redirect("/fights");
}

export type MonsterHit = { name: string; cr: string; xp: number; ac: number; hp: number; size_type: string };

export async function searchMonsters(query: string, maxCr: number | null): Promise<Fail | MonsterHit[]> {
  const { supabase } = await requireDm();
  let q = supabase.from("srd_monsters").select("name, cr, xp, ac, hp, size_type").order("cr_num").order("name").limit(40);
  const text = query.trim().replace(/[%_,()]/g, "");
  if (text) q = q.ilike("name", `%${text}%`);
  if (maxCr != null) q = q.lte("cr_num", maxCr);
  const { data, error } = await q;
  if (error) return { error: error.message };
  return (data ?? []) as MonsterHit[];
}

export async function getMonster(name: string): Promise<Fail | MonsterStats> {
  const { supabase } = await requireDm();
  const { data } = await supabase.from("srd_monsters").select("data").eq("name", name).maybeSingle();
  if (!data) return { error: "Monster not found." };
  const { sections: _sections, ...stats } = data.data as MonsterStats & { sections?: unknown };
  void _sections;
  return stats as MonsterStats;
}
