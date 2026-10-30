"use server";
import { refresh } from "next/cache";
// The character builder's server side: the level-1 plan (class choices and spells, from the level-up engine),
// spell lists for species and feat picks, and saving the finished character. Everything the browser sends
// is checked again here.
import { redirect } from "next/navigation";
import { builderData, featTextFor } from "@/lib/builder/data";
import { baseCharacter, buildCharacter } from "@/lib/builder/engine";
import type { Draft } from "@/lib/builder/types";
import { who, putInBag } from "@/lib/items/server";
import { rulesData } from "@/lib/levelup/data";
import { planLevelUp } from "@/lib/levelup/engine";
import { loadSpellLite } from "@/lib/levelup/server";
import type { Plan } from "@/lib/levelup/types";

async function campaignRules(): Promise<{ ok: false; error: string } | { ok: true; rules: string; ctx: Awaited<ReturnType<typeof who>> }> {
  const ctx = await who();
  if (!ctx.userId) return { ok: false, error: "Log in first." };
  if (!ctx.campaignId) return { ok: false, error: "Join or start a campaign first." };
  const { data } = await ctx.supabase.from("campaigns").select("rule_set").eq("id", ctx.campaignId).maybeSingle();
  return { ok: true, rules: (data?.rule_set as string) ?? "2024", ctx };
}
const allowed = (campaign: string, wanted: string) => (campaign === "mixed" ? wanted === "2014" || wanted === "2024" : wanted === campaign);

/** The class's level-1 plan for this draft: what they get and what they must choose. */
export async function planFirstLevel(d: Draft): Promise<{ plan: Plan } | { error: string }> {
  const c = await campaignRules();
  if (!c.ok) return { error: c.error };
  if (!allowed(c.rules, d.rules)) return { error: "This campaign uses other rules." };
  const data = builderData(d.rules), levelData = rulesData(d.rules);
  if (!levelData.classes[d.cls]) return { error: "Pick a class first." };
  const spells = await loadSpellLite(c.ctx.supabase);
  return { plan: planLevelUp(baseCharacter(d, data), d.cls, levelData, spells, { first: true }) };
}

/** Spells of one class list (for Magic Initiate and the High Elf cantrip). */
export async function spellList(rules: string, list: string, maxLevel: number) {
  const c = await campaignRules();
  if (!c.ok) return [];
  const r = rules === "2014" ? "2014" : "2024";
  const levelData = rulesData(r);
  const all = await loadSpellLite(c.ctx.supabase);
  return all
    .filter((s) => s.level <= maxLevel && (r === "2014" ? (levelData.spells?.[s.name] ?? []).includes(list) : s.classes.includes(list)))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
    .map((s) => ({ name: s.name, level: s.level, text: s.description.slice(0, 600), tags: [s.school ?? "", s.concentration ? "Concentration" : "", s.ritual ? "Ritual" : ""].filter(Boolean) }));
}

export async function createFromBuilder(d: Draft): Promise<{ error: string } | void> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const c = await campaignRules();
  if (!c.ok) return { error: c.error };
  if (!allowed(c.rules, d.rules)) return { error: "This campaign uses other rules." };
  const { supabase, userId, campaignId, isDm } = c.ctx;
  const data = builderData(d.rules), levelData = rulesData(d.rules);
  if (!levelData.classes[d.cls]) return { error: "Pick a class." };
  const spells = await loadSpellLite(supabase);

  let built;
  try {
    const plan = planLevelUp(baseCharacter(d, data), d.cls, levelData, spells, { first: true });
    built = buildCharacter(d, data, levelData, plan, (n) => featTextFor(d.rules, n));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something is missing." };
  }
  const mine = !isDm || d.forMe;
  const { data: row, error } = await supabase.from("characters").insert({
    ...built.row, campaign_id: campaignId, owner_user_id: mine ? userId : null,
  }).select("id").single();
  if (error || !row) return { error: error?.message ?? "Couldn't make the character." };

  for (const b of built.bag) {
    const r = await putInBag(supabase, { campaignId: campaignId!, characterId: row.id, ref: b.ref, name: b.name, qty: b.qty, source: "manual" });
    if (b.equip && "id" in r) await supabase.from("character_items").update({ equipped: true }).eq("id", r.id);
  }
  const goal = Math.max(1, Math.min(20, Math.floor(d.targetLevel) || 1));
  redirect(goal > 1 ? `/characters/${row.id}/level-up?to=${goal}` : `/characters/${row.id}`);
}
