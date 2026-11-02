"use server";
// What the printable sheet shows for one character. The PDF itself is drawn in the browser
// (lib/own-sheet/make-pdf.ts), so the server only works out the numbers, the same way the sheet does.
import { CLASSES } from "@/lib/classes";
import { loadCharacter } from "@/lib/character-data";
import { BLANK, type PrintData } from "@/lib/own-sheet/fields";
import {
  ABILITIES, allOptions, attackBonus, damageExpression, initiative, pb, saveBonus, saveDCFor, SKILLS, skillBonus,
  spellAttackBonus, spellSaveDC, type Ability,
} from "@/lib/rules";

const ACTION_NOTE: Record<string, string> = { bonus: "bonus action", reaction: "reaction" };

export async function printSheet(characterId: string): Promise<{ data: PrintData } | { error: string }> {
  const { supabase, character: c, library } = await loadCharacter(characterId);
  if (!c) return { error: "Character not found." };
  const [{ data: extra }, { data: items }] = await Promise.all([
    supabase.from("characters").select("player_name, background, coins").eq("id", characterId).maybeSingle(),
    supabase.from("character_items").select("name, qty, equipped").eq("character_id", characterId).order("equipped", { ascending: false }).order("sort").order("created_at"),
  ]);

  const caster = !!c.spells?.ability || (c.spells?.known?.length ?? 0) > 0;
  const options = allOptions(c, library);
  // attacks: weapons first, then attack and save spells (cantrips before levelled spells)
  const attacks = options
    .filter((o) => !o.row_of && (o.kind === "weapon" || o.kind === "spell_attack" || o.kind === "save" || o.kind === "damage_only") && o.damage)
    .sort((a, b) => (a.kind === "weapon" ? 0 : 1) - (b.kind === "weapon" ? 0 : 1) || (a.level ?? 0) - (b.level ?? 0))
    .slice(0, 8)
    .map((o) => ({
      name: o.name,
      bonus: o.kind === "save" ? `DC ${saveDCFor(c, o)}` : o.kind === "damage_only" ? "" : (attackBonus(c, o) >= 0 ? `+${attackBonus(c, o)}` : String(attackBonus(c, o))),
      damage: `${damageExpression(c, o, o.level)}${o.damage_type ? ` ${o.damage_type}` : ""}`,
      notes: [
        o.kind === "save" && o.save_ability ? `${o.save_ability} save${o.half_on_save ? ", half on success" : ""}` : "",
        o.range ?? "", (o.level ?? 0) > 0 ? `level ${o.level} spell` : "", ACTION_NOTE[o.action ?? ""] ?? "",
      ].filter(Boolean).join(" · "),
    }));

  const features = c.features.map((f) => (typeof f === "string" ? { name: f, text: "" } : { name: f.name, text: f.description ?? "" }));
  const alignment = features.find((f) => /^alignment$/i.test(f.name))?.text ?? "";
  const spellLevel = new Map(library.map((s) => [s.name, s.level]));
  const slots = Object.entries(c.spells?.slots ?? {}).filter(([, n]) => n > 0).map(([l, n]) => `${l}: ${n}`);
  const pact = c.spells as { pact_level?: number; pact_slots?: number };
  if (pact.pact_slots) slots.push(`pact ${pact.pact_slots}× level ${pact.pact_level}`);
  const coins = (extra?.coins ?? {}) as Record<string, number>;

  const data: PrintData = {
    ...BLANK,
    id: c.id, name: c.name, player: (extra?.player_name as string) ?? "", species: c.species ?? "", background: (extra?.background as string) ?? "",
    alignment, rules: c.rule_set === "2014" ? "2014" : "2024",
    classes: c.class_levels.map((cl) => ({ class: cl.class, subclass: cl.subclass ?? "", level: cl.level })),
    scores: c.ability_scores, saves: c.proficiencies.saves ?? [], skills: c.proficiencies.skills ?? [], expertise: c.proficiencies.expertise ?? [],
    hpMax: c.hp_max, ac: c.ac, speed: c.speed, prof: pb(c), init: initiative(c), passive: 10 + skillBonus(c, "Perception"),
    hitDice: c.class_levels.map((cl) => `${cl.level}d${CLASSES[cl.class]?.hitDie ?? 8}`).join(" + "),
    saveTotals: Object.fromEntries(ABILITIES.map((a) => [a, saveBonus(c, a)])) as Record<Ability, number>,
    skillTotals: Object.fromEntries(Object.keys(SKILLS).map((s) => [s, skillBonus(c, s)])),
    attacks,
    spellAbility: caster ? c.spells.ability ?? "INT" : null,
    spellDc: caster ? spellSaveDC(c) : null, spellAttack: caster ? spellAttackBonus(c) : null, slots: slots.join(" · "),
    spells: (c.spells?.known ?? []).map((name) => ({ name, level: spellLevel.get(name) ?? 1 })),
    equipment: ((items ?? []) as { name: string; qty: number; equipped: boolean }[]).map((i) => ({ name: i.name, qty: i.qty ?? 1, equipped: !!i.equipped })),
    coins: { pp: coins.pp ?? 0, gp: coins.gp ?? 0, ep: coins.ep ?? 0, sp: coins.sp ?? 0, cp: coins.cp ?? 0 },
    uses: c.resources.map((r) => `${r.name} ${r.max}${r.recharge ? ` / ${r.recharge.replace(/_/g, " ")}` : ""}`),
    features: features.filter((f) => !/^alignment$/i.test(f.name)),
  };
  return { data };
}
