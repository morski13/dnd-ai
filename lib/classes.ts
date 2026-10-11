// The 12 SRD classes: hit die, saving throws, spellcasting, skill choices and the resources that come back on rests.
// Plain data + small helpers, used by the character creator and by short / long rests.
import type { Ability } from "./rules";

export type Rules = "2014" | "2024";
export type ClassInfo = {
  hitDie: number; saves: [Ability, Ability]; spell: Ability | null; caster: "full" | "half" | "pact" | null;
  skillCount: number; skills: string[];
};

const ALL_SKILLS = ["Acrobatics", "Animal Handling", "Arcana", "Athletics", "Deception", "History", "Insight", "Intimidation", "Investigation",
  "Medicine", "Nature", "Perception", "Performance", "Persuasion", "Religion", "Sleight of Hand", "Stealth", "Survival"];

export const CLASSES: Record<string, ClassInfo> = {
  Barbarian: { hitDie: 12, saves: ["STR", "CON"], spell: null, caster: null, skillCount: 2, skills: ["Animal Handling", "Athletics", "Intimidation", "Nature", "Perception", "Survival"] },
  Bard: { hitDie: 8, saves: ["DEX", "CHA"], spell: "CHA", caster: "full", skillCount: 3, skills: ALL_SKILLS },
  Cleric: { hitDie: 8, saves: ["WIS", "CHA"], spell: "WIS", caster: "full", skillCount: 2, skills: ["History", "Insight", "Medicine", "Persuasion", "Religion"] },
  Druid: { hitDie: 8, saves: ["INT", "WIS"], spell: "WIS", caster: "full", skillCount: 2, skills: ["Arcana", "Animal Handling", "Insight", "Medicine", "Nature", "Perception", "Religion", "Survival"] },
  Fighter: { hitDie: 10, saves: ["STR", "CON"], spell: null, caster: null, skillCount: 2, skills: ["Acrobatics", "Animal Handling", "Athletics", "History", "Insight", "Intimidation", "Perception", "Persuasion", "Survival"] },
  Monk: { hitDie: 8, saves: ["STR", "DEX"], spell: null, caster: null, skillCount: 2, skills: ["Acrobatics", "Athletics", "History", "Insight", "Religion", "Stealth"] },
  Paladin: { hitDie: 10, saves: ["WIS", "CHA"], spell: "CHA", caster: "half", skillCount: 2, skills: ["Athletics", "Insight", "Intimidation", "Medicine", "Persuasion", "Religion"] },
  Ranger: { hitDie: 10, saves: ["STR", "DEX"], spell: "WIS", caster: "half", skillCount: 3, skills: ["Animal Handling", "Athletics", "Insight", "Investigation", "Nature", "Perception", "Stealth", "Survival"] },
  Rogue: { hitDie: 8, saves: ["DEX", "INT"], spell: null, caster: null, skillCount: 4, skills: ["Acrobatics", "Athletics", "Deception", "Insight", "Intimidation", "Investigation", "Perception", "Persuasion", "Sleight of Hand", "Stealth"] },
  Sorcerer: { hitDie: 6, saves: ["CON", "CHA"], spell: "CHA", caster: "full", skillCount: 2, skills: ["Arcana", "Deception", "Insight", "Intimidation", "Persuasion", "Religion"] },
  Warlock: { hitDie: 8, saves: ["WIS", "CHA"], spell: "CHA", caster: "pact", skillCount: 2, skills: ["Arcana", "Deception", "History", "Intimidation", "Investigation", "Nature", "Religion"] },
  Wizard: { hitDie: 6, saves: ["INT", "WIS"], spell: "INT", caster: "full", skillCount: 2, skills: ["Arcana", "History", "Insight", "Investigation", "Medicine", "Nature", "Religion"] },
};
export const CLASS_NAMES = Object.keys(CLASSES);
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
export const SPECIES = ["Dragonborn", "Dwarf", "Elf", "Gnome", "Goliath", "Halfling", "Human", "Orc", "Tiefling", "Half-Elf", "Half-Orc", "Aasimar"];

const mod = (score: number) => Math.floor((score - 10) / 2);

/** Hit points: the full die at level 1, then the average (half the die + 1) per level, plus CON every level. */
export function averageHp(levels: { class: string; level: number }[], con: number): number {
  let hp = 0, first = true;
  for (const l of levels) {
    const die = CLASSES[l.class]?.hitDie ?? 8;
    for (let i = 0; i < l.level; i++) { hp += (first ? die : die / 2 + 1) + mod(con); first = false; }
  }
  return Math.max(1, hp);
}

const FULL: number[][] = [ // spell slots by caster level, levels 1–9
  [], [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/** Spell slots for a (multi)class character; Warlock pact slots are separate and come back on a short rest. */
export function spellSlots(levels: { class: string; level: number }[], rules: Rules) {
  let casterLevel = 0;
  for (const l of levels) {
    const c = CLASSES[l.class]?.caster;
    if (c === "full") casterLevel += l.level;
    if (c === "half") casterLevel += rules === "2014" && levels.length === 1 && l.level < 2 ? 0 : Math.ceil(l.level / 2);
  }
  const slots: Record<string, number> = {};
  (FULL[Math.min(20, casterLevel)] ?? []).forEach((n, i) => { slots[String(i + 1)] = n; });
  const wl = levels.find((l) => l.class === "Warlock")?.level ?? 0;
  const pact = wl ? { level: wl >= 9 ? 5 : wl >= 7 ? 4 : wl >= 5 ? 3 : wl >= 3 ? 2 : 1, count: wl >= 17 ? 4 : wl >= 11 ? 3 : wl >= 2 ? 2 : 1 } : null;
  if (pact) slots[String(pact.level)] = (slots[String(pact.level)] ?? 0) + pact.count;
  return { slots, pact };
}

export type Resource = { name: string; max: number; used?: number; recharge?: string };

/** The class resources a character starts with (what rests bring back). */
export function classResources(levels: { class: string; level: number }[], scores: Record<Ability, number>, rules: Rules): Resource[] {
  const out: Resource[] = [];
  const r24 = rules === "2024";
  for (const { class: c, level: n } of levels) {
    if (c === "Barbarian") out.push({ name: "Rage", max: n >= 17 ? 6 : n >= 12 ? 5 : n >= 6 ? 4 : n >= 3 ? 3 : 2, recharge: "long rest" });
    if (c === "Fighter") {
      out.push({ name: "Second Wind", max: r24 ? (n >= 10 ? 4 : n >= 4 ? 3 : 2) : 1, recharge: "short rest" });
      if (n >= 2) out.push({ name: "Action Surge", max: n >= 17 ? 2 : 1, recharge: "short rest" });
    }
    if (c === "Cleric" && n >= 2) out.push({ name: "Channel Divinity", max: r24 ? (n >= 18 ? 4 : n >= 6 ? 3 : 2) : (n >= 18 ? 3 : n >= 6 ? 2 : 1), recharge: "short rest" });
    if (c === "Paladin") {
      out.push({ name: "Lay on Hands (HP)", max: 5 * n, recharge: "long rest" });
      if (n >= 3) out.push({ name: "Channel Divinity", max: r24 && n >= 11 ? 3 : r24 ? 2 : 1, recharge: "short rest" });
    }
    if (c === "Bard") out.push({ name: "Bardic Inspiration", max: Math.max(1, mod(scores.CHA ?? 10)), recharge: n >= 5 ? "short rest" : "long rest" });
    if (c === "Monk" && n >= 2) out.push({ name: r24 ? "Focus Points" : "Ki Points", max: n, recharge: "short rest" });
    if (c === "Druid" && n >= 2) out.push({ name: "Wild Shape", max: r24 ? (n >= 17 ? 4 : n >= 6 ? 3 : 2) : 2, recharge: "short rest" });
    if (c === "Sorcerer" && n >= 2) out.push({ name: "Sorcery Points", max: n, recharge: "long rest" });
    if (c === "Wizard") out.push({ name: "Arcane Recovery", max: 1, recharge: "long rest" });
  }
  return out;
}

/** Hit dice by size, e.g. { 12: 3 } for a level 3 Barbarian. */
export function hitDice(levels: { class: string; level: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of levels) { const d = String(CLASSES[l.class]?.hitDie ?? 8); out[d] = (out[d] ?? 0) + l.level; }
  return out;
}
