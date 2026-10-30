// What a species gives at level 1 beyond its trait text, and what the player must pick for it.
// Written by hand from the SRD (5.1 for 2014, 5.2.1 for 2024): the data files only have the trait text.
import type { Ability } from "../rules";
import type { Rules, SpeciesData, SpeciesSub } from "./types";

export const ALL_SKILLS = ["Acrobatics", "Animal Handling", "Arcana", "Athletics", "Deception", "History", "Insight", "Intimidation", "Investigation",
  "Medicine", "Nature", "Perception", "Performance", "Persuasion", "Religion", "Sleight of Hand", "Stealth", "Survival"];
export const MENTAL: Ability[] = ["INT", "WIS", "CHA"];

export type SpeciesNeeds = {
  /** skills to pick (Skillful: 1 of any; Keen Senses: 1 of three; Skill Versatility: 2 of any) */
  skills?: { choose: number; from: string[]; why: string };
  /** an origin feat (Human: Versatile) */
  feat?: boolean;
  /** a cantrip from a class list (High Elf: Wizard) */
  cantrip?: { list: string; why: string };
  /** the ability for the lineage's spells (2024 Elf, Gnome, Tiefling) */
  ability?: boolean;
  /** +1 to N abilities (2014 Half-Elf), not the one listed */
  asi?: { choose: number; bonus: number; from: Ability[] };
  /** a subspecies / subrace / ancestry must be picked */
  sub?: string;
};
export type SpeciesGives = { skills: string[]; cantrips: string[]; speed?: number; hpPerLevel?: number };

const SUB_LABEL: Record<string, string> = {
  Dragonborn: "Draconic ancestry", Elf: "Elven lineage", Gnome: "Gnomish lineage", Goliath: "Giant ancestry", Tiefling: "Fiendish legacy",
  Dwarf: "Subrace", Halfling: "Subrace",
};

export function speciesNeeds(rules: Rules, species: string, subCount: number, asiChoice?: SpeciesNeeds["asi"]): SpeciesNeeds {
  const n: SpeciesNeeds = {};
  if (subCount > 1) n.sub = SUB_LABEL[species] ?? "Subrace";
  if (rules === "2024") {
    if (species === "Human") { n.skills = { choose: 1, from: ALL_SKILLS, why: "Skillful" }; n.feat = true; }
    if (species === "Elf") { n.skills = { choose: 1, from: ["Insight", "Perception", "Survival"], why: "Keen Senses" }; n.ability = true; }
    if (species === "Gnome" || species === "Tiefling") n.ability = true;
  } else {
    if (species === "Half-Elf") n.skills = { choose: 2, from: ALL_SKILLS, why: "Skill Versatility" };
    if (asiChoice) n.asi = asiChoice;
  }
  return n;
}

export function speciesNeedsSub(rules: Rules, species: string, sub: string | null): Pick<SpeciesNeeds, "cantrip"> {
  if (rules === "2014" && species === "Elf" && sub === "High Elf") return { cantrip: { list: "Wizard", why: "High Elf Cantrip" } };
  return {};
}

/** Skills, cantrips and other numbers a species gives without a choice. */
export function speciesGives(rules: Rules, species: string, sub: string | null): SpeciesGives {
  const g: SpeciesGives = { skills: [], cantrips: [] };
  const s = sub ?? "";
  if (rules === "2014") {
    if (species === "Elf") g.skills.push("Perception");
    if (species === "Half-Orc") g.skills.push("Intimidation");
    if (species === "Tiefling") g.cantrips.push("Thaumaturgy");
    if (s === "Hill Dwarf") g.hpPerLevel = 1; // Dwarven Toughness
  } else {
    if (species === "Dwarf") g.hpPerLevel = 1; // Dwarven Toughness
    if (s.endsWith("Drow")) g.cantrips.push("Dancing Lights");
    if (s.endsWith("High Elf")) g.cantrips.push("Prestidigitation");
    if (s.endsWith("Wood Elf")) { g.cantrips.push("Druidcraft"); g.speed = 35; }
    if (s.endsWith("Forest Gnome")) g.cantrips.push("Minor Illusion");
    if (s.endsWith("Rock Gnome")) g.cantrips.push("Mending", "Prestidigitation");
    if (species === "Tiefling") {
      g.cantrips.push("Thaumaturgy"); // Otherworldly Presence
      if (s.endsWith("Abyssal")) g.cantrips.push("Poison Spray");
      if (s.endsWith("Chthonic")) g.cantrips.push("Chill Touch");
      if (s.endsWith("Infernal")) g.cantrips.push("Fire Bolt");
    }
  }
  return g;
}

/** Short words about each class for the class cards (our own words, not rules text). */
export const CLASS_BLURB: Record<string, string> = {
  Barbarian: "A furious warrior. Rages to hit harder and shrug off damage. Simple to play.",
  Bard: "A performer whose music is magic. Helps friends, talks their way out of trouble.",
  Cleric: "A priest with divine magic. Heals the party and smites the undead.",
  Druid: "A keeper of nature. Casts nature magic and turns into animals.",
  Fighter: "A master of weapons and armor. Tough, flexible and simple to play.",
  Monk: "A martial artist. Fast, hard to hit, strikes many times a turn.",
  Paladin: "A holy knight. Heavy armor, healing touch and smites.",
  Ranger: "A hunter and tracker. Bow or blades, a little nature magic.",
  Rogue: "A sneaky expert. Sneak Attack, many skills, gets out of danger.",
  Sorcerer: "Magic in the blood. Fewer spells, but can bend them.",
  Warlock: "Power from a pact with a patron. Strong blasts, few spell slots that come back fast.",
  Wizard: "A scholar of magic. The biggest spell list, fragile up close.",
};
/** Which abilities matter most, to fill in a standard array for the player. */
export const CLASS_ORDER: Record<string, Ability[]> = {
  Barbarian: ["STR", "CON", "DEX", "WIS", "CHA", "INT"], Bard: ["CHA", "DEX", "CON", "WIS", "INT", "STR"],
  Cleric: ["WIS", "CON", "STR", "DEX", "CHA", "INT"], Druid: ["WIS", "CON", "DEX", "INT", "CHA", "STR"],
  Fighter: ["STR", "CON", "DEX", "WIS", "CHA", "INT"], Monk: ["DEX", "WIS", "CON", "STR", "INT", "CHA"],
  Paladin: ["STR", "CHA", "CON", "WIS", "DEX", "INT"], Ranger: ["DEX", "WIS", "CON", "STR", "INT", "CHA"],
  Rogue: ["DEX", "CON", "INT", "WIS", "CHA", "STR"], Sorcerer: ["CHA", "CON", "DEX", "WIS", "INT", "STR"],
  Warlock: ["CHA", "CON", "DEX", "WIS", "INT", "STR"], Wizard: ["INT", "CON", "DEX", "WIS", "CHA", "STR"],
};
export const ALIGNMENTS = ["Lawful Good", "Neutral Good", "Chaotic Good", "Lawful Neutral", "True Neutral", "Chaotic Neutral", "Lawful Evil", "Neutral Evil", "Chaotic Evil", "Unaligned"];

/** speciesNeeds + speciesNeedsSub, plus what an added book's species (or subspecies) asks for. */
export function needsFor(rules: Rules, sp: SpeciesData, sub: SpeciesSub | null): SpeciesNeeds {
  return {
    ...speciesNeeds(rules, sp.name, sp.subs.length, sp.asiChoice),
    ...speciesNeedsSub(rules, sp.name, sub?.name ?? null),
    ...(sp.needs ?? {}),
    ...(sub?.needs ?? {}),
  };
}

/** speciesGives, plus what an added book's species (or subspecies) gives. */
export function givesFor(rules: Rules, sp: SpeciesData, sub: SpeciesSub | null): SpeciesGives {
  const g = speciesGives(rules, sp.name, sub?.name ?? null);
  for (const x of [sp.gives, sub?.gives]) {
    if (!x) continue;
    g.skills = [...new Set([...g.skills, ...(x.skills ?? [])])];
    g.cantrips = [...new Set([...g.cantrips, ...(x.cantrips ?? [])])];
    if (x.speed) g.speed = x.speed;
    if (x.hpPerLevel) g.hpPerLevel = (g.hpPerLevel ?? 0) + x.hpPerLevel;
  }
  return g;
}
