// D&D 5e rules math (from 03-rules-math-reference.md).
// Turns a character's data (+ the spell library) into bonuses, options and dice expressions.
import { combine, signed, timesDice } from "./dice";

export const ABILITIES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;
export type Ability = (typeof ABILITIES)[number];

export const SKILLS: Record<string, Ability> = {
  Acrobatics: "DEX", "Animal Handling": "WIS", Arcana: "INT", Athletics: "STR", Deception: "CHA",
  History: "INT", Insight: "WIS", Intimidation: "CHA", Investigation: "INT", Medicine: "WIS",
  Nature: "INT", Perception: "WIS", Performance: "CHA", Persuasion: "CHA", Religion: "INT",
  "Sleight of Hand": "DEX", Stealth: "DEX", Survival: "WIS",
};

export type ClassLevel = { class: string; subclass?: string; level: number };
export type ActionType = "action" | "bonus" | "reaction" | "free" | "other";

/** One thing a character can do on their turn: a weapon, a spell, or a class trick ("boost"). */
export type Attack = {
  name: string;
  kind: "weapon" | "spell_attack" | "save" | "heal" | "damage_only" | "boost";
  ability?: Ability | "finesse" | "spell";
  damage?: string;            // dice, e.g. "1d12" or "3d4+3"
  damage_type?: string;
  add_mod?: boolean;          // add the ability modifier to damage/healing
  proficient?: boolean;       // default true
  bonus?: number;             // magic weapon +1 etc.
  range?: string;
  ranged?: boolean;           // ranged weapon (for Sneak Attack)
  save_ability?: Ability;
  half_on_save?: boolean;
  action?: ActionType;        // default: action
  level?: number;             // spell level (0 = cantrip); spends a slot if > 0
  slot?: number;              // (old data) same as level
  per_level?: string;         // extra dice per slot level above `level`
  cantrip_scaling?: boolean;  // dice grow at character levels 5, 11, 17
  resource?: string;          // spends one use of this resource (Rage, Channel Divinity)
  // boosts (Rage, Reckless Attack, Sneak Attack, Steady Aim...)
  applies?: "str_weapon" | "finesse_ranged" | "weapon" | "attack";
  damage_bonus?: number;      // flat extra damage per hit (Rage +2)
  gives_advantage?: boolean;
  once_per_turn?: boolean;
  requires?: string[];        // other boosts that must be active (Frenzy needs Rage + Reckless Attack)
  needs_advantage_or_ally?: boolean; // Sneak Attack
  drawback?: string;
  note?: string;
  damage_only?: boolean;      // (old data) no attack roll
};

/** A spell from the library (srd_spells table) or a custom one. */
export type SpellInfo = {
  name: string;
  level: number;
  school: string;
  classes: string[];
  casting_time: string;
  ritual: boolean;
  range: string;
  components: string;
  duration: string;
  concentration: boolean;
  description: string;
  higher_levels: string | null;
  action: ActionType;
  roll?: {
    kind: "spell_attack" | "save" | "heal" | "damage_only";
    damage: string; damage_type?: string; add_mod?: boolean; save_ability?: Ability;
    half_on_save?: boolean; per_level?: string; cantrip_scaling?: boolean; note?: string;
  } | null;
};

export type SpellBook = {
  ability?: Ability;
  slots?: Record<string, number>;      // {"1": 4, "2": 2}
  slots_used?: Record<string, number>;
  known?: string[];                    // spell names
  heal_bonus?: { base: number; per_slot_level: number }; // Disciple of Life: 2 + slot level
  potent_cantrip?: boolean;            // Evoker: cantrips do half damage on a miss / successful save
};

export type SheetCharacter = {
  ability_scores: Partial<Record<Ability, number>>;
  class_levels: ClassLevel[];
  proficiencies: { saves?: Ability[]; skills?: string[]; expertise?: string[] };
  spells: SpellBook;
  attacks: Attack[];
};

export const abilityMod = (score: number) => Math.floor((score - 10) / 2);
export const profBonus = (level: number) => 2 + Math.floor((Math.max(level, 1) - 1) / 4);
export const totalLevel = (cls: ClassLevel[]) => cls.reduce((s, c) => s + (c.level ?? 0), 0);

export function mods(c: SheetCharacter): Record<Ability, number> {
  return Object.fromEntries(ABILITIES.map((a) => [a, abilityMod(c.ability_scores[a] ?? 10)])) as Record<Ability, number>;
}
export const pb = (c: SheetCharacter) => profBonus(totalLevel(c.class_levels));
export const saveBonus = (c: SheetCharacter, a: Ability) => mods(c)[a] + (c.proficiencies.saves?.includes(a) ? pb(c) : 0);
export function skillBonus(c: SheetCharacter, skill: string) {
  const prof = c.proficiencies.skills?.includes(skill) ? pb(c) : 0;
  const exp = c.proficiencies.expertise?.includes(skill) ? pb(c) : 0;
  return mods(c)[SKILLS[skill]] + prof + exp;
}
export const initiative = (c: SheetCharacter) => mods(c).DEX;
export const spellAbility = (c: SheetCharacter): Ability => c.spells?.ability ?? "INT";
export const spellSaveDC = (c: SheetCharacter) => 8 + mods(c)[spellAbility(c)] + pb(c);
export const spellAttackBonus = (c: SheetCharacter) => mods(c)[spellAbility(c)] + pb(c);

// ---------------------------------------------------------------------------
// Options: everything on the Attacks tab, in one list.
// ---------------------------------------------------------------------------
export type Option = Attack & { key: string; fromSpell?: SpellInfo };

/** Sheet attacks + every known spell that deals damage or heals. Keys stay stable for rolling. */
export function allOptions(c: SheetCharacter, library: SpellInfo[]): Option[] {
  const sheet: Option[] = c.attacks.map((a) => ({
    ...a,
    level: a.level ?? a.slot,
    kind: a.damage_only && a.kind === "weapon" ? "damage_only" : a.kind,
    key: `atk:${a.name}`,
  }));
  const taken = new Set(sheet.map((o) => o.name));
  const byName = new Map(library.map((s) => [s.name, s]));
  const spells: Option[] = [];
  for (const name of c.spells?.known ?? []) {
    const s = byName.get(name);
    if (!s || taken.has(name)) continue;
    spells.push({
      key: `spell:${name}`, name, fromSpell: s, level: s.level, ability: "spell", action: s.action,
      kind: s.roll?.kind ?? "boost", damage: s.roll?.damage, damage_type: s.roll?.damage_type,
      add_mod: s.roll?.add_mod ?? false, save_ability: s.roll?.save_ability, half_on_save: s.roll?.half_on_save,
      per_level: s.roll?.per_level, cantrip_scaling: s.roll?.cantrip_scaling, range: s.range, note: s.roll?.note,
    });
  }
  return [...sheet, ...spells];
}

export const isRollable = (o: Attack) => !!o.damage || o.kind === "heal";
export const actionOf = (o: Attack): ActionType => o.action ?? (o.kind === "boost" ? "free" : "action");

/** The modifier an option uses (STR, DEX, better of the two for finesse, or the spellcasting ability). */
export function abilityModFor(c: SheetCharacter, o: Attack) {
  const m = mods(c);
  if (o.ability === "finesse") return Math.max(m.STR, m.DEX);
  if (o.ability === "spell") return m[spellAbility(c)];
  return o.ability ? m[o.ability] : 0;
}

export function attackBonus(c: SheetCharacter, o: Attack) {
  if (o.kind === "spell_attack") return spellAttackBonus(c) + (o.bonus ?? 0);
  return abilityModFor(c, o) + (o.proficient === false ? 0 : pb(c)) + (o.bonus ?? 0);
}

/** Damage (or healing) dice at a given slot level, e.g. "1d12+3", Cure Wounds at level 2 → "4d8+3". */
export function damageExpression(c: SheetCharacter, o: Attack, slotLevel?: number) {
  if (!o.damage) return "0";
  let dice = o.damage;
  const level = o.level ?? 0;
  if (o.cantrip_scaling && level === 0) {
    const lvl = totalLevel(c.class_levels);
    dice = timesDice(dice, 1 + (lvl >= 5 ? 1 : 0) + (lvl >= 11 ? 1 : 0) + (lvl >= 17 ? 1 : 0));
  }
  const extraLevels = slotLevel && level > 0 ? Math.max(0, slotLevel - level) : 0;
  const parts = [dice];
  if (o.per_level) for (let i = 0; i < extraLevels; i++) parts.push(o.per_level);
  let flat = (o.add_mod ? abilityModFor(c, o) : 0) + (o.bonus && o.kind !== "spell_attack" ? o.bonus : 0);
  if (o.kind === "heal" && level > 0 && c.spells?.heal_bonus) {
    flat += c.spells.heal_bonus.base + c.spells.heal_bonus.per_slot_level * (slotLevel ?? level);
  }
  if (flat) parts.push(String(flat));
  return combine(...parts);
}

/** What the big button on an option shows: "+5", "DC 13", "2d4+3" or "Use". */
export function optionButtonLabel(c: SheetCharacter, o: Attack) {
  if (o.kind === "save") return `DC ${spellSaveDC(c)}`;
  if (o.kind === "weapon" || o.kind === "spell_attack") return signed(attackBonus(c, o));
  if (o.kind === "heal" || o.kind === "damage_only") return damageExpression(c, o, o.level);
  if (o.kind === "boost" && o.damage) return damageExpression(c, o);
  return "Use";
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------
export function slotsLeft(c: SheetCharacter, level: number) {
  const max = c.spells?.slots?.[String(level)] ?? 0;
  return Math.max(0, max - (c.spells?.slots_used?.[String(level)] ?? 0));
}
/** Lowest slot level >= `minLevel` that still has a slot, or null. */
export function lowestFreeSlot(c: SheetCharacter, minLevel: number): number | null {
  for (let l = Math.max(1, minLevel); l <= 9; l++) if (slotsLeft(c, l) > 0) return l;
  return null;
}

// ---------------------------------------------------------------------------
// Roll requests: what the player tapped. The server turns them into a roll.
// ---------------------------------------------------------------------------
export type RollRequest =
  | { kind: "ability"; ability: Ability }
  | { kind: "save"; ability: Ability }
  | { kind: "skill"; skill: string }
  | { kind: "initiative" }
  | { kind: "use"; key: string; slot?: number }                               // tap the option's main button
  | { kind: "damage"; key: string; slot?: number; parentRollId?: string };   // follow-up damage

export type RollPlan = {
  rollType: "check" | "save" | "initiative" | "attack" | "damage" | "heal" | "save_dc" | "other";
  source: string;
  expression: string;   // "" when there's nothing to roll (save DC, casting a utility spell, using Rage)
  d20: boolean;         // advantage applies
  ability?: Ability;
  dc?: number;
  damageType?: string;
  spellSlot?: number;   // slot spent (for spells with level > 0)
  resource?: string;    // resource spent
  followUp?: boolean;   // offer a damage roll next
};

export function planRoll(c: SheetCharacter, req: RollRequest, library: SpellInfo[] = []): RollPlan {
  const d20 = (bonus: number) => `1d20${signed(bonus)}`;
  if ((req.kind === "ability" || req.kind === "save") && !ABILITIES.includes(req.ability)) throw new Error("Unknown ability");
  switch (req.kind) {
    case "ability":
      return { rollType: "check", source: `${req.ability} check`, expression: d20(mods(c)[req.ability]), d20: true, ability: req.ability };
    case "save":
      return { rollType: "save", source: `${req.ability} save`, expression: d20(saveBonus(c, req.ability)), d20: true, ability: req.ability };
    case "skill":
      if (!(req.skill in SKILLS)) throw new Error("Unknown skill");
      return { rollType: "check", source: req.skill, expression: d20(skillBonus(c, req.skill)), d20: true, ability: SKILLS[req.skill] };
    case "initiative":
      return { rollType: "initiative", source: "Initiative", expression: d20(initiative(c)), d20: true, ability: "DEX" };
    case "use":
    case "damage": {
      const o = allOptions(c, library).find((x) => x.key === req.key);
      if (!o) throw new Error("Unknown attack or spell");
      const level = o.level ?? 0;
      let slot: number | undefined;
      if (level > 0) {
        slot = req.slot ?? (req.kind === "use" ? lowestFreeSlot(c, level) ?? undefined : level);
        if (slot === undefined) throw new Error(`No spell slots left for ${o.name}`);
        if (slot < level || slot > 9) throw new Error("That slot is too low for this spell");
        if (req.kind === "use" && slotsLeft(c, slot) === 0) throw new Error(`No level ${slot} slots left`);
      }
      const spend = req.kind === "use" ? { spellSlot: slot, resource: o.resource } : { spellSlot: slot };
      const isHeal = o.kind === "heal";
      if (req.kind === "damage" || isHeal || o.kind === "damage_only" || (o.kind === "boost" && o.damage)) {
        if (!o.damage) throw new Error(`${o.name} has no damage to roll`);
        return {
          rollType: isHeal ? "heal" : "damage", source: o.name, expression: damageExpression(c, o, slot),
          d20: false, damageType: o.damage_type, ...spend, ...(req.kind === "damage" ? { resource: undefined } : {}),
        };
      }
      if (o.kind === "save") {
        return { rollType: "save_dc", source: o.name, expression: "", d20: false, ability: o.save_ability ?? "DEX", dc: spellSaveDC(c), followUp: !!o.damage, ...spend };
      }
      if (o.kind === "weapon" || o.kind === "spell_attack") {
        return { rollType: "attack", source: o.name, expression: d20(attackBonus(c, o)), d20: true, followUp: !!o.damage, ...spend };
      }
      // A boost or utility spell: nothing to roll, but it's logged (and spends its slot/resource).
      return { rollType: "other", source: o.name, expression: "", d20: false, ...spend };
    }
  }
}
