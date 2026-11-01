// "Path of the Wild Soul" (Barbarian subclass from Wizards' Unearthed Arcana, August 2019) as a one-tap preset
// for ONE character: actions, roll table, uses and feature notes, written in our own words (not the UA text).
// Numbers follow the playtest; a DM can change anything afterwards in the sheet's "own rules" panel.
import type { Attack, TableRow } from "../rules";

export type PresetUse = { name: string; max: number; recharge: string };
export type Preset = { actions: Attack[]; uses: PresetUse[]; features: { name: string; description: string }[]; replaces: RegExp[] };

const SOURCE = "Path of the Wild Soul (UA 2019)";
export const isWildSoul = (subclass?: string) => /wild\s*soul/i.test(subclass ?? "");
const rageBonus = (lvl: number) => (lvl >= 16 ? 4 : lvl >= 9 ? 3 : 2);

/** The Wild Surge table: the d8 rolled each time you start raging. */
export function wildSurgeTable(): TableRow[] {
  return [
    { min: 1, max: 1, name: "Necrotic burst", text: "Every creature within 30 ft of you takes 1d10 necrotic damage. You gain temporary HP equal to all the necrotic damage dealt.",
      effect: { kind: "damage_only", damage: "1d10", damage_type: "necrotic", many: true, then: { temp_hp: "dealt" } } },
    { min: 2, max: 2, name: "Blink step", text: "Teleport up to 20 ft to a free space you can see. Until the rage ends you can do it again as a bonus action on each of your turns." },
    { min: 3, max: 3, name: "Spirit bombs", text: "1d4 small spirits fly 30 ft in random directions and burst at the end of your turn. Creatures within 5 ft of a spirit make a DEX save or take 2d8 force damage.",
      effect: { kind: "save", damage: "2d8", damage_type: "force", save_ability: "DEX", half_on_save: false, many: true } },
    { min: 4, max: 4, name: "Arcane armor", text: "+2 AC until the rage ends. A creature within 10 ft that hits you with an attack takes force damage equal to your CON modifier." },
    { min: 5, max: 5, name: "Rough ground", text: "Until the rage ends, the ground within 10 ft of you is difficult terrain for others. It moves with you and doesn't slow you." },
    { min: 6, max: 6, name: "Read their plans", text: "Each creature within 30 ft makes a WIS save. On a fail it has disadvantage on attacks against you until the start of your next turn.",
      effect: { kind: "save", save_ability: "WIS", half_on_save: false, many: true } },
    { min: 7, max: 7, name: "Psychic weapon", text: "Until the rage ends your weapon deals psychic damage, counts as light and thrown (20/60 ft), and comes back to your hand at the end of your turn." },
    { min: 8, max: 8, name: "Radiant line", text: "A 5 ft wide, 60 ft long line from you: creatures in it make a CON save or take 2d8 radiant damage and are blinded until the start of your next turn.",
      effect: { kind: "save", damage: "2d8", damage_type: "radiant", save_ability: "CON", half_on_save: false, many: true } },
  ];
}

/** Everything a Wild Soul barbarian of this level gets. `hasRage` = the sheet already has a Rage action. */
export function wildSoulPreset(barbLevel: number, conMod: number, hasRage: boolean): Preset {
  const con = Math.max(1, conMod);
  const actions: Attack[] = [];
  const uses: PresetUse[] = [];
  const features: Preset["features"] = [];

  if (!hasRage) {
    actions.push({
      name: "Rage", kind: "boost", custom: true, action: "bonus", resource: "Rage", applies: "str_weapon", damage_bonus: rageBonus(barbLevel),
      note: "Advantage on STR checks and saves, resistance to bludgeoning, piercing and slashing. Starting it rolls Wild Surge.",
    });
  }
  if (barbLevel >= 3) {
    actions.push({
      name: "Wild Surge", kind: "table", custom: true, action: "free", damage: "1d8", trigger_on: "Rage", dc_ability: "CON",
      table: wildSurgeTable(), note: "Rolled by itself when you start raging. Saves use DC 8 + proficiency + CON.",
    });
    actions.push({ name: "Lingering Magic", kind: "boost", custom: true, action: "action", resource: "Lingering Magic", note: "Cast Detect Magic without a slot or components (CON is the spellcasting ability)." });
    uses.push({ name: "Lingering Magic", max: con, recharge: "long rest" });
    features.push(
      { name: "Wild Surge", description: "When you start raging, roll a d8 on the Wild Surge table (the app rolls it for you). Saves against its effects use DC 8 + your proficiency bonus + your CON modifier." },
      { name: "Lingering Magic", description: `Cast Detect Magic without a spell slot or components, with CON as the spellcasting ability. ${con} uses (your CON modifier), back on a long rest.` },
    );
  }
  if (barbLevel >= 6) {
    const die = barbLevel >= 14 ? "1d6" : "1d4";
    actions.push({
      name: "Magic Reserves", kind: "roll", custom: true, action: "action", damage: die, resource: "Magic Reserves", spend_rolled: true,
      then: { self_damage_x: 5, self_damage_type: "force" },
      note: "Touch a creature: it gets back a spell slot of the rolled level, and you take 5× the roll as force damage. (Some tables use a later fan version where it's temp HP instead of damage to you: edit this action if so.)",
    });
    uses.push({ name: "Magic Reserves", max: barbLevel, recharge: "long rest" });
    features.push({ name: "Magic Reserves", description: `As an action, touch a creature and roll a ${die.slice(1)}: it regains an expended spell slot of that level. You can give back spell levels equal to your barbarian level (${barbLevel}) per long rest. In the playtest you take 5× the roll as force damage.` });
  }
  if (barbLevel >= 10) {
    actions.push({ name: "Arcane Rebuke", kind: "damage_only", custom: true, action: "reaction", damage: "3d6", damage_type: "force", note: "While raging, after you make a save that a creature you can see forced on you." });
    features.push({ name: "Arcane Rebuke", description: "While raging, when a creature you can see forces you to make a saving throw, you can use your reaction afterwards to deal 3d6 force damage to it." });
  }
  if (barbLevel >= 14) {
    actions.push({
      name: "Chaotic Fury", kind: "table", custom: true, action: "bonus", damage: "1d8", resource: "Chaotic Fury", dc_ability: "CON",
      table: wildSurgeTable(), note: "While raging: roll Wild Surge again and swap your current effect for the new one.",
    });
    uses.push({ name: "Chaotic Fury", max: con, recharge: "short rest" });
    features.push({ name: "Chaotic Fury", description: `While raging, use a bonus action to roll on the Wild Surge table again; the new effect replaces the old one. ${con} uses, back on a short or long rest. Your Magic Reserves die becomes a d6.` });
  }
  return {
    actions, uses,
    features: features.map((f) => ({ ...f, source: SOURCE })),
    // the name-only features a PDF import brings ("Wild Surge [Rage]", "Lingering Magic []") are replaced
    replaces: features.map((f) => new RegExp(`^${f.name}\\b`, "i")),
  };
}
