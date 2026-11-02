// Which species (race) and background suit a class (pure, tested). Shown in the builder so a player doesn't
// pick something that does nothing for their class. 2014: the species' ability bonuses decide most of it;
// 2024: species give no ability bonuses (the background does), so it's their traits. The trait notes are our own words.
import type { Ability } from "../rules";
import { CLASS_ORDER } from "./special";
import type { BackgroundData, Rules, SpeciesData, SpeciesSub } from "./types";

export type FitTier = "great" | "good" | "weak";
export type Fit = { tier: FitTier | null; score: number; reasons: string[] };

/** Why a species is a good pick for a class, by its traits (SRD species only). */
const TRAITS: Record<Rules, Record<string, Record<string, string>>> = {
  "2014": {
    Barbarian: { "Half-Orc": "Savage Attacks adds a die to your crits; Relentless Endurance keeps you up", Dwarf: "Poison resistance and a sturdy body" },
    Bard: { "Half-Elf": "Two extra skills (Skill Versatility)", Halfling: "Lucky rerolls your 1s" },
    Cleric: { Dwarf: "Hill Dwarf: extra HP every level; poison resistance" },
    Druid: { Human: "+1 to every score, nothing wasted" },
    Fighter: { "Half-Orc": "Savage Attacks and Relentless Endurance", Human: "+1 to every score", Dwarf: "Poison resistance, extra toughness" },
    Monk: { Elf: "Perception for free, Fey Ancestry against charm", Halfling: "Lucky rerolls your 1s; Nimbleness" },
    Paladin: { Dragonborn: "STR and CHA: both of your main scores; breath weapon", "Half-Orc": "Relentless Endurance on the front line" },
    Ranger: { Elf: "Perception for free; Keen Senses", Halfling: "Lucky; hard to pin down" },
    Rogue: { Halfling: "Lucky and Nimbleness; Lightfoot hides behind others", Elf: "Perception for free" },
    Sorcerer: { Tiefling: "Free spells that use CHA (Infernal Legacy)", Dragonborn: "Fits a draconic bloodline; breath weapon" },
    Warlock: { Tiefling: "Free spells that use CHA (Infernal Legacy); fire resistance" },
    Wizard: { Gnome: "Gnome Cunning: advantage on INT/WIS/CHA saves against magic", Elf: "High Elf: an extra Wizard cantrip" },
  },
  "2024": {
    Barbarian: { Goliath: "Big and strong (Powerful Build); Stone's Endurance soaks hits", Orc: "Relentless Endurance and Adrenaline Rush", Dwarf: "+1 HP every level (Dwarven Toughness); poison resistance" },
    Bard: { Human: "An extra origin feat (Versatile) and a skill", Halfling: "Luck rerolls your 1s", Tiefling: "Free spells cast with CHA" },
    Cleric: { Dwarf: "+1 HP every level and poison resistance for a front-line healer", Human: "An extra origin feat", Goliath: "Tough in melee; Stone's Endurance" },
    Druid: { Elf: "Wood Elf: speed 35 and nature spells cast with WIS", Gnome: "Gnomish Cunning: advantage on INT/WIS/CHA saves", Human: "An extra origin feat (Magic Initiate works well)" },
    Fighter: { Human: "An extra origin feat and a skill", Goliath: "Powerful Build, Large Form, giant ancestry trick", Orc: "Relentless Endurance and Adrenaline Rush", Dwarf: "+1 HP every level" },
    Monk: { Elf: "Wood Elf: speed 35 on top of your fast movement", Halfling: "Luck; slip past bigger creatures", Human: "An extra origin feat" },
    Paladin: { Dragonborn: "Breath weapon, damage resistance, wings at level 5", Orc: "Relentless Endurance on the front line", Human: "An extra origin feat" },
    Ranger: { Elf: "Wood Elf: speed 35, Perception or Survival", Halfling: "Naturally Stealthy and Luck", Human: "An extra origin feat and a skill" },
    Rogue: { Halfling: "Naturally Stealthy, Luck, Nimbleness", Elf: "Keen Senses (Perception) and Fey Ancestry", Human: "An extra origin feat and a skill" },
    Sorcerer: { Dragonborn: "Fits Draconic Sorcery; breath weapon and resistance", Tiefling: "More spells, cast with CHA", Human: "An extra origin feat" },
    Warlock: { Tiefling: "Free spells cast with CHA; fits a fiend patron", Elf: "Drow: spells cast with CHA", Human: "An extra origin feat" },
    Wizard: { Gnome: "Gnomish Cunning: advantage on INT/WIS/CHA saves", Elf: "High Elf: extra spells cast with INT", Human: "An extra origin feat (Alert or Magic Initiate)" },
  },
};

/** The lineage / ancestry that fits the class best (2024 subspecies), by the part of its name after the colon. */
const SUB_TRAITS: Record<string, Record<string, string[]>> = {
  Elf: { "Wood Elf": ["Druid", "Monk", "Ranger", "Rogue"], "High Elf": ["Wizard", "Bard"], Drow: ["Warlock", "Sorcerer"] },
  Gnome: { "Forest Gnome": ["Druid", "Ranger", "Rogue"], "Rock Gnome": ["Wizard", "Artificer"] },
  Goliath: { "Stone's Endurance": ["Barbarian", "Fighter", "Paladin", "Cleric"], "Cloud's Jaunt": ["Rogue", "Monk", "Ranger"], "Storm's Thunder": ["Sorcerer", "Warlock"], "Fire's Burn": ["Fighter", "Barbarian"] },
  Tiefling: { Infernal: ["Warlock", "Sorcerer", "Wizard"], Chthonic: ["Warlock", "Wizard"], Abyssal: ["Druid", "Sorcerer"] },
};

const subName = (s: SpeciesSub) => s.name.replace(/^.*?:\s*/, "");
const order = (cls: string): Ability[] => CLASS_ORDER[cls] ?? ["STR", "DEX", "CON", "WIS", "INT", "CHA"];
const WEIGHT = [3, 2, 1, 0, 0, 0];

/** 2014: how much the ability bonuses help (main ability +2 = 6). Half-Elf's free +1s go to the class's best scores. */
function bonusScore(cls: string, sp: SpeciesData, sub: SpeciesSub | null): { score: number; top: string[] } {
  const ord = order(cls);
  const got = new Map<Ability, number>();
  for (const x of [...sp.asi, ...(sub?.asi ?? [])]) got.set(x.a, (got.get(x.a) ?? 0) + x.b);
  if (sp.asiChoice) {
    const free = ord.filter((a) => sp.asiChoice!.from.includes(a) && !got.has(a)).slice(0, sp.asiChoice.choose);
    for (const a of free) got.set(a, (got.get(a) ?? 0) + sp.asiChoice.bonus);
  }
  let score = 0;
  for (const [a, b] of got) score += b * (WEIGHT[ord.indexOf(a)] ?? 0);
  const top = ord.slice(0, 2).filter((a) => got.has(a)).map((a) => `${a} +${got.get(a)}`);
  return { score, top };
}

/** The 2014 subrace to count: the picked one, or the single SRD one. */
function subFor(sp: SpeciesData, sub: SpeciesSub | null | undefined): SpeciesSub | null {
  if (sub) return sub;
  return sp.subs.length === 1 ? sp.subs[0] : null;
}

export function speciesFit(rules: Rules, cls: string, sp: SpeciesData, sub?: SpeciesSub | null): Fit {
  if (!cls) return { tier: null, score: 0, reasons: [] };
  const reasons: string[] = [];
  const trait = TRAITS[rules][cls]?.[sp.name];
  let score = 0;
  if (rules === "2014") {
    const b = bonusScore(cls, sp, subFor(sp, sub));
    score = b.score;
    if (b.top.length) reasons.push(`${b.top.join(", ")}: ${b.top.length > 1 ? "your main scores" : "a main score"} for a ${cls}`);
    if (trait) { reasons.push(trait); score += 3; }
    const tier: FitTier = score >= 8 ? "great" : score >= 5 ? "good" : "weak";
    if (tier === "weak") reasons.push(`Its bonuses don't raise ${order(cls).slice(0, 2).join(" or ")}, the scores a ${cls} needs most`);
    return { tier, score, reasons };
  }
  // 2024: ability bonuses come from the background, so only the traits count (the first one listed is the top pick)
  const rank = Object.keys(TRAITS[rules][cls] ?? {}).indexOf(sp.name);
  if (trait) { reasons.push(trait); score = 10 - rank * 2; }
  const subs = SUB_TRAITS[sp.name];
  if (subs) {
    const best = Object.entries(subs).find(([, cs]) => cs.includes(cls));
    if (best) {
      const picked = sub ? subName(sub) : null;
      if (!picked || picked === best[0]) { reasons.push(`Best lineage for a ${cls}: ${best[0]}`); score += 1; }
    }
  }
  return { tier: !trait ? null : rank === 0 ? "great" : "good", score, reasons };
}

/** The lineage that suits the class (2024 Elf / Gnome / Goliath / Tiefling), or null. */
export function bestSub(sp: SpeciesData, cls: string): string | null {
  const subs = SUB_TRAITS[sp.name];
  const hit = subs && Object.entries(subs).find(([, cs]) => cs.includes(cls));
  return hit ? hit[0] : null;
}

/** Species sorted for a class: the best first, then the rest in their usual order, weak ones last. */
export function rankSpecies(rules: Rules, cls: string, list: SpeciesData[]): { sp: SpeciesData; fit: Fit }[] {
  const rank = (t: FitTier | null) => (t === "great" ? 0 : t === "good" ? 1 : t === "weak" ? 3 : 2);
  return list.map((sp, i) => ({ sp, fit: speciesFit(rules, cls, sp), i }))
    .sort((a, b) => rank(a.fit.tier) - rank(b.fit.tier) || b.fit.score - a.fit.score || a.i - b.i)
    .map(({ sp, fit }) => ({ sp, fit }));
}

/** 2024: does the background raise the class's two main scores? (That's where the +2/+1 comes from now.) */
export function backgroundFit(rules: Rules, cls: string, bg: BackgroundData): Fit {
  if (!cls || rules !== "2024" || !bg.abilities?.length) return { tier: null, score: 0, reasons: [] };
  const [a, b] = order(cls);
  if (!bg.abilities.includes(a)) return { tier: "weak", score: -1, reasons: [`Can't raise ${a}, a ${cls}'s main score`] };
  if (bg.abilities.includes(b)) return { tier: "great", score: 2, reasons: [`Raises ${a} and ${b}, the two scores a ${cls} needs most`] };
  return { tier: "good", score: 1, reasons: [`Raises ${a}, a ${cls}'s main score`] };
}
