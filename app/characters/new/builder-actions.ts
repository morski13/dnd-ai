"use server";
import { builderDataFor, rulesDataFor } from "@/lib/books/server";
import { refresh } from "next/cache";
// The character builder's server side: the rules data the builder plans with (class levels, feats, spells),
// spell lists for species and feat picks, and saving the finished character at any level. Everything the
// browser sends is checked again here.
import { featTextFor } from "@/lib/builder/data";
import { buildAll } from "@/lib/builder/levels";
import type { Draft } from "@/lib/builder/types";
import { roll } from "@/lib/dice";
import { who, putInBag } from "@/lib/items/server";
import { loadSpellLite } from "@/lib/levelup/server";
import type { RulesData, SpellLite } from "@/lib/levelup/types";

type House = { multiclassing?: boolean; hp_on_level_up?: string };
async function campaignRules(): Promise<{ ok: false; error: string } | { ok: true; rules: string; house: House; ctx: Awaited<ReturnType<typeof who>> }> {
  const ctx = await who();
  if (!ctx.userId) return { ok: false, error: "Log in first." };
  if (!ctx.campaignId) return { ok: false, error: "Join or start a campaign first." };
  const { data } = await ctx.supabase.from("campaigns").select("rule_set, settings").eq("id", ctx.campaignId).maybeSingle();
  const house = ((data?.settings as { house_rules?: House } | null)?.house_rules ?? {}) as House;
  return { ok: true, rules: (data?.rule_set as string) ?? "2024", house, ctx };
}
const allowed = (campaign: string, wanted: string) => (campaign === "mixed" ? wanted === "2014" || wanted === "2024" : wanted === campaign);

/** The rules the builder plans every level with: classes, subclasses, feats (with the books) and the spell library. */
export async function builderRules(rules: string): Promise<{ levelData: RulesData; spells: SpellLite[] } | { error: string }> {
  const c = await campaignRules();
  if (!c.ok) return { error: c.error };
  if (!allowed(c.rules, rules)) return { error: "This campaign uses other rules." };
  const [levelData, spells] = await Promise.all([rulesDataFor(rules, c.ctx.campaignId), loadSpellLite(c.ctx.supabase, c.ctx.campaignId)]);
  return { levelData, spells };
}

/** Spells of one class list (for Magic Initiate and the High Elf cantrip). */
export async function spellList(rules: string, list: string, maxLevel: number) {
  const c = await campaignRules();
  if (!c.ok) return [];
  const r = rules === "2014" ? "2014" : "2024";
  const levelData = await rulesDataFor(r, c.ctx.campaignId);
  const all = await loadSpellLite(c.ctx.supabase, c.ctx.campaignId);
  return all
    .filter((s) => s.level <= maxLevel && (r === "2014" ? (levelData.spells?.[s.name] ?? []).includes(list) : s.classes.includes(list)))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
    .map((s) => ({ name: s.name, level: s.level, text: s.description.slice(0, 600), tags: [s.school ?? "", s.concentration ? "Concentration" : "", s.ritual ? "Ritual" : ""].filter(Boolean) }));
}

/** Saves the character; the browser then uploads the picked portrait (if any) and opens the sheet. */
export async function createFromBuilder(d: Draft): Promise<{ error: string } | { id: string }> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const c = await campaignRules();
  if (!c.ok) return { error: c.error };
  if (!allowed(c.rules, d.rules)) return { error: "This campaign uses other rules." };
  const { supabase, userId, campaignId, isDm } = c.ctx;
  const [data, levelData] = await Promise.all([builderDataFor(d.rules), rulesDataFor(d.rules, campaignId)]);
  if (!levelData.classes[d.cls]) return { error: "Pick a class." };
  const spells = await loadSpellLite(supabase, campaignId);

  let built;
  try {
    built = buildAll(d, data, levelData, spells, {
      multiclass: c.house.multiclassing !== false,
      featText: (n) => featTextFor(d.rules, n, levelData),
      rollHp: (die) => (d.upHp === "roll" ? roll(`1d${die}`).total : null),
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something is missing." };
  }
  const mine = !isDm || d.forMe;
  const insert: Record<string, unknown> = { ...built.row, campaign_id: campaignId, owner_user_id: mine ? userId : null };
  // the level history lets the player undo the levels one by one (needs 20-level-up.sql; works without it)
  let res = await supabase.from("characters").insert(built.log.length ? { ...insert, level_log: built.log.slice(-10) } : insert).select("id").single();
  if (res.error && /level_log/.test(res.error.message)) res = await supabase.from("characters").insert(insert).select("id").single();
  const { data: row, error } = res;
  if (error || !row) return { error: error?.message ?? "Couldn't make the character." };

  for (const b of built.bag) {
    const r = await putInBag(supabase, { campaignId: campaignId!, characterId: row.id, ref: b.ref, name: b.name, qty: b.qty, source: "manual" });
    if (b.equip && "id" in r) await supabase.from("character_items").update({ equipped: true }).eq("id", r.id);
  }
  return { id: row.id as string };
}
