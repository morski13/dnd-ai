"use server";
import { stripControl } from "@/lib/sheet-import/clean";
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

export async function createCharacter(input: NewCharacter): Promise<{ error: string } | void> {
  const f = stripControl(input); // a sheet PDF can carry NUL characters the database refuses
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
    ...(sheet && Object.keys(sheet.bonuses).length ? { homebrew: { bonuses: sheet.bonuses } } : {}),
  }).select("id").single();
  if (error || !data) return { error: error?.message ?? "Couldn't make the character." };
  if (sheet) await fillBag(supabase, { campaignId, characterId: data.id, equipment: sheet.equipment, equip: sheet.equip });
  redirect(`/characters/${data.id}`);
}

/** Our own sheet was printed from this character: may this user update it, and what is it called? */
export async function sheetTarget(characterId: string): Promise<{ id: string; name: string } | null> {
  if (!/^[0-9a-f-]{36}$/.test(String(characterId ?? ""))) return null;
  const { supabase, userId, campaignId, isDm } = await who();
  if (!userId || !campaignId) return null;
  const { data } = await supabase.from("characters").select("id, name, owner_user_id, campaign_id").eq("id", characterId).maybeSingle();
  if (!data || data.campaign_id !== campaignId) return null;
  return data.owner_user_id === userId || isDm ? { id: data.id as string, name: data.name as string } : null;
}

/**
 * Bring a printed sheet back into the character it came from ("Update Kazar").
 * Replaced: name, species, background, classes, scores, HP max, AC, speed, saves, skills, expertise,
 * known spells, coins, hand-set extras, and the sheet's own attacks (the character's own actions stay).
 * Added, never removed: features and bag items the character doesn't have yet (so level-up history,
 * library links and attunement are kept). Class levels changed → slots and class uses are worked out
 * again, keeping what was already used.
 */
export async function updateFromSheet(characterId: string, input: NewCharacter): Promise<{ error: string } | void> {
  const f = stripControl(input);
  refresh();
  const target = await sheetTarget(characterId);
  if (!target) return { error: "You can't change that character." };
  const { supabase, campaignId } = await who();
  const name = (f.name ?? "").trim().slice(0, 60);
  if (!name) return { error: "Give your character a name." };
  const classes = (f.classes ?? []).filter((c) => CLASSES[c.class]).map((c) => ({
    class: c.class, ...(c.subclass?.trim() ? { subclass: c.subclass.trim().slice(0, 40) } : {}), level: Math.max(1, Math.min(20, Math.floor(c.level) || 1)),
  }));
  if (!classes.length) return { error: "Pick a class." };
  if (classes.reduce((s, c) => s + c.level, 0) > 20) return { error: "The highest level is 20." };
  const scores = Object.fromEntries(ABILITIES.map((a) => [a, Math.max(1, Math.min(30, Math.floor(Number(f.scores?.[a])) || 10))])) as Record<Ability, number>;
  const skills = (f.skills ?? []).filter((s) => s in SKILLS).slice(0, 18);
  const level = classes.reduce((t, c) => t + c.level, 0);

  const { data: old } = await supabase.from("characters")
    .select("rule_set, class_levels, hp_max, hp_current, spells, resources, features, attacks, proficiencies, homebrew").eq("id", characterId).maybeSingle();
  if (!old) return { error: "Character not found." };
  const rules: Rules = old.rule_set === "2014" ? "2014" : "2024";
  const sheet = await importedParts(supabase, rules, f.imported ?? {}, { scores, prof: 2 + Math.floor((level - 1) / 4), skills });

  const sameClasses = JSON.stringify(old.class_levels ?? []) === JSON.stringify(classes);
  const oldSpells = (old.spells ?? {}) as Record<string, unknown> & { slots_used?: Record<string, number>; ability?: string };
  let spells: Record<string, unknown> = { ...oldSpells, known: sheet.known };
  if (!sameClasses) {
    const { slots, pact } = spellSlots(classes, rules);
    spells = { ...spells, slots, ...(pact ? { pact_level: pact.level, pact_slots: pact.count } : {}) };
  }
  const ability = classes.map((c) => CLASSES[c.class].spell).find(Boolean) ?? sheet.spellAbility ?? (oldSpells.ability as string | undefined);
  if (ability && (sheet.known.length || Object.keys((spells.slots as object) ?? {}).length)) spells.ability = ability;
  type Res = { name: string; max: number; used?: number; custom?: boolean };
  const oldRes = (old.resources ?? []) as Res[];
  const resources = sameClasses ? oldRes : [
    ...classResources(classes, scores, rules).map((r) => ({ ...r, used: Math.min(r.max, oldRes.find((o) => o.name === r.name)?.used ?? 0) })),
    ...oldRes.filter((r) => r.custom),
  ];

  const oldFeatures = (old.features ?? []) as (string | { name: string })[];
  const has = new Set(oldFeatures.map((x) => (typeof x === "string" ? x : x.name).toLowerCase()));
  const features = [...oldFeatures, ...sheet.features.filter((x) => !has.has(x.name.toLowerCase()))];
  // the sheet's attacks replace the old non-custom ones; equipped bag weapons are added by the loader anyway
  const custom = ((old.attacks ?? []) as { name: string; custom?: boolean }[]).filter((a) => a.custom);
  const attacks = [...custom, ...sheet.attacks.filter((a) => !custom.some((c) => c.name.toLowerCase() === a.name.toLowerCase()))];

  const hpMax = f.hp && f.hp > 0 ? Math.min(999, Math.floor(f.hp)) : averageHp(classes, scores.CON);
  const oldMax = (old.hp_max as number | null) ?? hpMax;
  const cur = (old.hp_current as number | null) ?? oldMax;
  const homebrew = { ...((old.homebrew as object) ?? {}) } as Record<string, unknown>;
  if (Object.keys(sheet.bonuses).length) homebrew.bonuses = sheet.bonuses; else delete homebrew.bonuses;

  const { error } = await supabase.from("characters").update({
    name, species: (f.species ?? "").trim().slice(0, 40) || null, background: (f.background ?? "").trim().slice(0, 40) || null,
    player_name: (f.playerName ?? "").trim().slice(0, 40) || null,
    class_levels: classes, ability_scores: scores, hp_max: hpMax, hp_current: Math.min(hpMax, cur >= oldMax ? hpMax : cur),
    ...(f.ac && f.ac > 0 ? { ac: Math.min(40, Math.floor(f.ac)) } : {}), ...(f.speed && f.speed > 0 ? { speed: Math.min(120, Math.floor(f.speed)) } : {}),
    proficiencies: { ...((old.proficiencies as object) ?? {}), saves: sheet.saves.length ? sheet.saves : CLASSES[classes[0].class].saves, skills, expertise: sheet.expertise },
    spells, resources, features, attacks, coins: sheet.coins, homebrew,
  }).eq("id", characterId);
  if (error) return { error: error.message };

  // bag: only items the character doesn't have yet are added
  const { data: bag } = await supabase.from("character_items").select("name").eq("character_id", characterId);
  const inBag = new Set((bag ?? []).map((b) => String(b.name).toLowerCase()));
  const fresh = sheet.equipment.filter((e) => !inBag.has((e.lib?.name ?? e.name).toLowerCase()));
  if (fresh.length && campaignId) await fillBag(supabase, { campaignId, characterId, equipment: fresh, equip: [] });
  redirect(`/characters/${characterId}`);
}
