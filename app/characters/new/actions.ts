"use server";
import { refresh } from "next/cache";
// Make a new character in your active campaign. Players make their own; the DM can make one for a player to claim.
import { redirect } from "next/navigation";
import { averageHp, CLASSES, classResources, spellSlots, type Rules } from "@/lib/classes";
import { who } from "@/lib/items/server";
import { ABILITIES, SKILLS, type Ability } from "@/lib/rules";
import { fillBag, importedParts } from "@/lib/sheet-import/server";

export type NewCharacter = {
  name: string; playerName: string; species: string; background: string; rules: Rules;
  classes: { class: string; subclass: string; level: number }[];
  scores: Record<Ability, number>; skills: string[]; hp: number | null; ac: number | null; speed: number | null; forMe: boolean;
  /** From an imported character sheet: saves, expertise, attacks, spells, equipment, coins, features (checked again here). */
  imported?: unknown;
};

export async function createCharacter(f: NewCharacter): Promise<{ error: string } | void> {
  refresh(); // other screens (stats, lists) show this change at once, not after the 30 s client cache
  const { supabase, userId, campaignId, isDm } = await who();
  if (!userId || !campaignId) return { error: "Join or start a campaign first." };
  const name = (f.name ?? "").trim().slice(0, 60);
  if (!name) return { error: "Give your character a name." };
  const classes = (f.classes ?? []).filter((c) => CLASSES[c.class]).map((c) => ({
    class: c.class, ...(c.subclass?.trim() ? { subclass: c.subclass.trim().slice(0, 40) } : {}), level: Math.max(1, Math.min(20, Math.floor(c.level) || 1)),
  }));
  if (!classes.length) return { error: "Pick a class." };
  if (classes.reduce((s, c) => s + c.level, 0) > 20) return { error: "The highest level is 20." };
  const scores = Object.fromEntries(ABILITIES.map((a) => [a, Math.max(1, Math.min(30, Math.floor(Number(f.scores?.[a])) || 10))])) as Record<Ability, number>;
  const rules: Rules = f.rules === "2014" ? "2014" : "2024";
  const first = CLASSES[classes[0].class];
  const { slots, pact } = spellSlots(classes, rules);
  const spellAbility = classes.map((c) => CLASSES[c.class].spell).find(Boolean) ?? null;
  const hp = f.hp && f.hp > 0 ? Math.min(999, Math.floor(f.hp)) : averageHp(classes, scores.CON);
  const dex = Math.floor((scores.DEX - 10) / 2);
  const mine = !isDm || f.forMe;
  const skills = (f.skills ?? []).filter((s) => s in SKILLS).slice(0, 18);
  const level = classes.reduce((t, c) => t + c.level, 0);
  const sheet = f.imported
    ? await importedParts(supabase, rules, f.imported, { scores, prof: 2 + Math.floor((level - 1) / 4), skills })
    : null;
  const ability = spellAbility ?? (sheet?.known.length ? sheet.spellAbility ?? "INT" : null);
  const { data, error } = await supabase.from("characters").insert({
    campaign_id: campaignId, owner_user_id: mine ? userId : null, player_name: (f.playerName ?? "").trim().slice(0, 40) || null,
    name, species: (f.species ?? "").trim().slice(0, 40) || null, background: (f.background ?? "").trim().slice(0, 40) || null, rule_set: rules,
    class_levels: classes, ability_scores: scores, hp_max: hp, hp_current: hp, temp_hp: 0,
    ac: f.ac && f.ac > 0 ? Math.min(40, Math.floor(f.ac)) : 10 + dex, speed: f.speed && f.speed > 0 ? Math.min(120, Math.floor(f.speed)) : 30,
    proficiencies: { saves: sheet?.saves.length ? sheet.saves : first.saves, skills, expertise: sheet?.expertise ?? [] },
    spells: ability ? { ability, slots, slots_used: {}, known: sheet?.known ?? [], ...(pact ? { pact_level: pact.level, pact_slots: pact.count } : {}) } : {},
    resources: classResources(classes, scores, rules).map((r) => ({ ...r, used: 0 })),
    features: sheet?.features ?? [], attacks: sheet?.attacks ?? [], inventory: [],
    ...(sheet ? { coins: sheet.coins } : {}),
  }).select("id").single();
  if (error || !data) return { error: error?.message ?? "Couldn't make the character." };
  if (sheet) await fillBag(supabase, { campaignId, characterId: data.id, equipment: sheet.equipment, equip: sheet.equip });
  redirect(`/characters/${data.id}`);
}
