// Loads one character for the character sheet, as the logged-in user.
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SheetCharacter, SpellInfo } from "@/lib/rules";
import { getGear } from "@/lib/items-data";

export type Resource = { name: string; max: number; used?: number; recharge?: string };
export type Feature = { name: string; source?: string; description?: string; feat?: boolean };

export type FullCharacter = SheetCharacter & {
  id: string;
  campaign_id: string;
  name: string;
  species: string | null;
  hp_max: number | null;
  hp_current: number | null;
  temp_hp: number;
  ac: number | null;
  speed: number | null;
  features: (string | Feature)[];
  inventory: string[];
  resources: Resource[];
  sheet_values: { ac?: number; speed?: number; hp_max?: number };
  owner_user_id: string | null;
  rule_set?: "2014" | "2024";
  hit_dice_used?: Record<string, number>;
  concentration?: { spell: string; since?: string } | null;
};

const COLUMNS =
  "id, campaign_id, name, species, class_levels, ability_scores, hp_max, hp_current, temp_hp, ac, speed, " +
  "proficiencies, features, inventory, spells, resources, sheet_values, attacks, owner_user_id, rule_set, hit_dice_used, concentration";

export const SPELL_COLUMNS =
  "name, level, school, classes, casting_time, ritual, range, components, duration, concentration, description, higher_levels, action, roll";

/** Reads a character with the user's own permissions (used by the page and by the actions). */
export async function loadCharacter(id: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  const empty = { supabase, userId: userId ?? null, character: null, canEdit: false, library: [] as SpellInfo[] };
  if (!userId) return empty;

  const { data } = await supabase.from("characters").select(COLUMNS).eq("id", id).maybeSingle();
  const character = data as unknown as FullCharacter | null;
  if (!character) return empty;

  // Fill in anything missing so the sheet never crashes on half-filled characters.
  character.class_levels ??= [];
  character.ability_scores ??= {};
  character.proficiencies ??= {};
  character.spells ??= {};
  character.spells.known ??= [];
  character.spells.slots ??= {};
  character.spells.slots_used ??= {};
  character.attacks ??= [];
  character.features ??= [];
  character.inventory ??= [];
  character.resources ??= [];
  character.sheet_values ??= {};
  character.hit_dice_used ??= {};

  const [{ data: spells }, { data: member }] = await Promise.all([
    character.spells.known.length
      ? supabase.from("srd_spells").select(SPELL_COLUMNS).in("name", character.spells.known)
      : Promise.resolve({ data: [] }),
    supabase.from("campaign_members").select("role")
      .eq("campaign_id", character.campaign_id).eq("user_id", userId).maybeSingle(),
  ]);

  // Equipped weapons from the Gear tab become attacks (unless the sheet already has one with that name).
  const { data: gear } = await supabase.from("character_items").select("name, srd_id").eq("character_id", id).eq("equipped", true).not("srd_id", "is", null);
  const { data: lib } = gear?.length ? await supabase.from("srd_items").select("id, kind, data").in("id", gear.map((g) => g.srd_id as string)) : { data: [] };
  type W = { kind: string; data: { damage?: string; type?: string; props?: string[]; range?: { long?: number; normal?: number } } | null };
  const byId = new Map(((lib ?? []) as (W & { id: string })[]).map((x) => [x.id, x]));
  for (const g of (gear ?? []) as { name: string; srd_id: string }[]) {
    const w = byId.get(g.srd_id);
    const d = w?.kind === "weapon" ? w.data : null;
    if (!d?.damage || character.attacks.some((a) => a.name.toLowerCase() === g.name.toLowerCase())) continue;
    const ranged = !!d.range?.long && !(d.props ?? []).includes("Thrown");
    character.attacks.push({
      name: g.name, kind: "weapon", damage: d.damage, damage_type: d.type?.toLowerCase(), add_mod: true,
      ability: (d.props ?? []).includes("Finesse") ? "finesse" : ranged ? "DEX" : "STR", ranged,
      ...(d.range?.long ? { range: `${d.range.normal}/${d.range.long} ft` } : {}),
    });
  }

  const canEdit = character.owner_user_id === userId || member?.role === "dm" || member?.role === "co_dm";
  return { supabase, userId, character, canEdit, library: (spells ?? []) as SpellInfo[] };
}

export async function getCharacterSheet(id: string) {
  await connection(); // depends on who is logged in
  const { supabase, userId, character, canEdit, library } = await loadCharacter(id);
  if (!userId) redirect("/login");
  if (!character) notFound();

  // Feat descriptions come from the feat library.
  const featNames = character.features
    .filter((f): f is Feature => typeof f !== "string" && !!f.feat && !f.description)
    .map((f) => f.name);
  const { data: feats } = featNames.length
    ? await supabase.from("srd_feats").select("name, category, description").in("name", featNames)
    : { data: [] as { name: string; category: string; description: string }[] };
  const featText = Object.fromEntries((feats ?? []).map((f) => [f.name, f.description]));
  const gear = await getGear(supabase, character.id, userId, canEdit);

  return { character, canEdit, library, featText, gear };
}
