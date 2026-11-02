"use server";
// The homebrew editor: the DM's spells, feats and subclasses are in the game at once; a player's are requests
// the DM approves or rejects with a note. Monsters (DM only) go in the campaign's monsters with a full stat block.
import { refresh } from "next/cache";
import { checkFeat, checkSpell, checkSubclass, safeMonster, type FeatForm, type HomebrewKind, type MonsterForm, type SpellForm, type SubclassForm } from "@/lib/campaign-homebrew";
import { rulesData } from "@/lib/levelup/data";
import { createClient } from "@/lib/supabase/server";

type Fail = { error: string };
const sqlHint = (m: string) => (/campaign_homebrew/.test(m) ? "Run supabase/31-campaign-homebrew.sql in Supabase first." : m);

async function me() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub ?? null;
  if (!userId) return null;
  const { data: m } = await supabase.from("campaign_members").select("campaign_id, role, campaigns(rule_set)").eq("user_id", userId)
    .order("last_active_at", { ascending: false, nullsFirst: false }).order("joined_at", { ascending: true }).limit(1).maybeSingle();
  if (!m) return null;
  return { supabase, userId, campaignId: m.campaign_id as string, isDm: m.role === "dm" || m.role === "co_dm",
    campaignRules: ((m.campaigns as unknown as { rule_set?: string } | null)?.rule_set ?? "2024") as string };
}

export async function saveHomebrew(kind: HomebrewKind, form: SpellForm | FeatForm | SubclassForm, rules: "2014" | "2024", id?: string | null): Promise<Fail | { id: string; status: string }> {
  refresh();
  const ctx = await me();
  if (!ctx) return { error: "Join a campaign first." };
  if (ctx.campaignRules !== "mixed" && rules !== (ctx.campaignRules === "2014" ? "2014" : "2024")) rules = ctx.campaignRules === "2014" ? "2014" : "2024";
  const checked = kind === "spell" ? checkSpell(form as SpellForm) : kind === "feat" ? checkFeat(form as FeatForm)
    : checkSubclass(form as SubclassForm, Object.keys(rulesData(rules).classes));
  if ("error" in checked) return checked;
  const data = checked.data as { name: string; cls?: string };
  const row = { kind, rules, parent: kind === "subclass" ? data.cls ?? "" : "", name: data.name, data, updated_at: new Date().toISOString(),
    status: ctx.isDm ? "approved" : "pending", ...(ctx.isDm ? {} : { dm_note: null }) };
  const q = id
    ? ctx.supabase.from("campaign_homebrew").update(row).eq("id", id).eq("campaign_id", ctx.campaignId).select("id, status").single()
    : ctx.supabase.from("campaign_homebrew").insert({ ...row, campaign_id: ctx.campaignId, requested_by: ctx.userId }).select("id, status").single();
  const { data: saved, error } = await q;
  if (error || !saved) return { error: error ? (/duplicate|unique/.test(error.message) ? `There's already a ${kind} called ${data.name}.` : sqlHint(error.message)) : "Couldn't save." };
  return { id: saved.id as string, status: saved.status as string };
}

export async function reviewHomebrew(id: string, status: "approved" | "rejected", note: string): Promise<Fail | { ok: true }> {
  refresh();
  const ctx = await me();
  if (!ctx?.isDm) return { error: "Only the DM can approve homebrew." };
  const { error } = await ctx.supabase.from("campaign_homebrew").update({ status, dm_note: note.trim().slice(0, 500) || null, updated_at: new Date().toISOString() })
    .eq("id", id).eq("campaign_id", ctx.campaignId);
  return error ? { error: sqlHint(error.message) } : { ok: true };
}

export async function deleteHomebrew(id: string): Promise<Fail | { ok: true }> {
  refresh();
  const ctx = await me();
  if (!ctx) return { error: "Join a campaign first." };
  const { error } = await ctx.supabase.from("campaign_homebrew").delete().eq("id", id).eq("campaign_id", ctx.campaignId);
  return error ? { error: sqlHint(error.message) } : { ok: true };
}

/** DM: a homebrew monster with a full stat block (Session mode, the fight planner and live odds use it). */
export async function saveMonster(form: MonsterForm, id?: string | null): Promise<Fail | { id: string }> {
  refresh();
  const ctx = await me();
  if (!ctx?.isDm) return { error: "Only the DM can make monsters." };
  const r = safeMonster(form);
  if ("error" in r) return r;
  const st = r.stats;
  const row = { name: st.name, kind: "monster", ac: st.ac, hp_max: st.hp, stat_block: { ...st, init_bonus: st.init, homebrew: true }, visibility: "dm" };
  const { data, error } = id
    ? await ctx.supabase.from("monsters").update(row).eq("id", id).eq("campaign_id", ctx.campaignId).select("id").single()
    : await ctx.supabase.from("monsters").insert({ ...row, campaign_id: ctx.campaignId, hp_current: st.hp }).select("id").single();
  if (error || !data) return { error: error?.message ?? "Couldn't save." };
  return { id: data.id as string };
}

export async function deleteMonster(id: string): Promise<Fail | { ok: true }> {
  refresh();
  const ctx = await me();
  if (!ctx?.isDm) return { error: "Only the DM can delete monsters." };
  const { error } = await ctx.supabase.from("monsters").delete().eq("id", id).eq("campaign_id", ctx.campaignId);
  return error ? { error: error.message } : { ok: true };
}
