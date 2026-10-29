// The character builder's rules (pure, no database, tested): ability scores and their bonuses, the skills
// that come from the species and background, the starting kit, armor class, and the finished character.
// The class's level-1 choices (subclass, fighting style, weapon mastery, cantrips, spells…) come from the
// level-up engine, so a new character is built exactly like a level-up from nothing.
import { CLASSES } from "../classes";
import { applyLevelUp, type LevelChar } from "../levelup/engine";
import type { Plan, RulesData } from "../levelup/types";
import { ABILITIES, type Ability } from "../rules";
import { ALL_SKILLS, MENTAL, speciesGives, speciesNeeds, speciesNeedsSub } from "./special";
import type { BackgroundData, BuilderData, CategoryItem, Draft, FeatChoice, Kit, KitChoice, KitGroup, KitItem, SpeciesData, SpeciesSub } from "./types";

export const STANDARD = [15, 14, 13, 12, 10, 8];
export const POINT_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINTS = 27;
const mod = (n: number) => Math.floor((n - 10) / 2);
export const ORIGIN_FEATS = ["Alert", "Magic Initiate", "Savage Attacker", "Skilled"];
export const MAGIC_LISTS = ["Cleric", "Druid", "Wizard"];

export function blankDraft(rules: "2014" | "2024"): Draft {
  return {
    rules, cls: "", species: "", sub: null, speciesPicks: { skills: [], feat: null, cantrip: null, ability: null, asi: [] },
    background: "", customBackground: { name: "", abilities: [], feat: null, skills: [] }, bgAsi: { mode: "1-1-1" }, languages: [],
    method: "standard", base: { STR: 8, DEX: 8, CON: 8, INT: 8, WIS: 8, CHA: 8 }, classSkills: [], feats: {}, level: { picks: {}, hp: "average" },
    kit: [], bgKit: [], details: { name: "", playerName: "", alignment: "", personality: "", ideals: "", bonds: "", flaws: "", backstory: "" },
    targetLevel: 1, forMe: true,
  };
}

// ---------------------------------------------------------------- lookups

export const speciesOf = (d: Draft, data: BuilderData): SpeciesData | null => data.species.find((s) => s.name === d.species) ?? null;
export function subOf(d: Draft, data: BuilderData): SpeciesSub | null {
  const sp = speciesOf(d, data);
  if (!sp) return null;
  if (sp.subs.length === 1) return sp.subs[0]; // 2014: the SRD has one subrace each, so it's taken
  return sp.subs.find((s) => s.name === d.sub) ?? null;
}
export function backgroundOf(d: Draft, data: BuilderData): BackgroundData | null {
  if (d.background === "Other") {
    const c = d.customBackground;
    return {
      name: c.name.trim() || "Other", skills: c.skills, tools: [], equipment: [], ...(data.rules === "2024"
        ? { abilities: c.abilities, feat: c.feat ? { name: c.feat, note: null } : null }
        : { languages: 0, gp: 10, feature: null }),
    };
  }
  return data.backgrounds.find((b) => b.name === d.background) ?? null;
}

// ---------------------------------------------------------------- ability scores

export function pointsUsed(base: Record<Ability, number>): number {
  return ABILITIES.reduce((s, a) => s + (POINT_COST[base[a]] ?? 99), 0);
}

export function checkBase(method: Draft["method"], base: Record<Ability, number>): string | null {
  const v = ABILITIES.map((a) => base[a]);
  if (v.some((n) => !Number.isInteger(n))) return "Fill in all six scores.";
  if (method === "standard") {
    const sorted = [...v].sort((a, b) => b - a);
    return sorted.every((n, i) => n === STANDARD[i]) ? null : "Use each number of the standard array once: 15, 14, 13, 12, 10, 8.";
  }
  if (method === "pointbuy") {
    if (v.some((n) => n < 8 || n > 15)) return "With point buy every score is 8 to 15.";
    const used = pointsUsed(base);
    return used > POINTS ? `That's ${used} points; you have ${POINTS}.` : null;
  }
  if (method === "roll") return v.some((n) => n < 3 || n > 18) ? "Rolled scores are 3 to 18." : null;
  return v.some((n) => n < 3 || n > 20) ? "Scores are 3 to 20 before bonuses." : null;
}

/** Bonuses to ability scores, with where each comes from (2014: species; 2024: background). */
export function abilityBonuses(d: Draft, data: BuilderData): { a: Ability; b: number; from: string }[] {
  const out: { a: Ability; b: number; from: string }[] = [];
  if (data.rules === "2014") {
    const sp = speciesOf(d, data), sub = subOf(d, data);
    for (const x of sp?.asi ?? []) out.push({ a: x.a, b: x.b, from: sp!.name });
    for (const x of sub?.asi ?? []) out.push({ a: x.a, b: x.b, from: sub!.name });
    if (sp?.asiChoice) for (const a of d.speciesPicks.asi.slice(0, sp.asiChoice.choose)) out.push({ a, b: sp.asiChoice.bonus, from: sp.name });
  } else {
    const bg = backgroundOf(d, data);
    const abil = bg?.abilities ?? [];
    if (d.bgAsi.mode === "2-1") {
      if (abil.includes(d.bgAsi.plus2)) out.push({ a: d.bgAsi.plus2, b: 2, from: bg!.name });
      if (abil.includes(d.bgAsi.plus1) && d.bgAsi.plus1 !== d.bgAsi.plus2) out.push({ a: d.bgAsi.plus1, b: 1, from: bg!.name });
    } else for (const a of abil) out.push({ a, b: 1, from: bg!.name });
  }
  return out;
}

export function finalScores(d: Draft, data: BuilderData): Record<Ability, number> {
  const s = { ...d.base };
  for (const x of abilityBonuses(d, data)) s[x.a] = Math.min(20, s[x.a] + x.b);
  return s;
}

/** The best standard array for a class (its main abilities first). */
export function suggestedArray(order: Ability[]): Record<Ability, number> {
  return Object.fromEntries(order.map((a, i) => [a, STANDARD[i]])) as Record<Ability, number>;
}

// ---------------------------------------------------------------- skills and feats

/** Skills the character already has before picking class skills, and where each comes from. */
export function givenSkills(d: Draft, data: BuilderData): Map<string, string> {
  const m = new Map<string, string>();
  const bg = backgroundOf(d, data);
  for (const s of bg?.skills ?? []) m.set(s, bg!.name);
  const sp = speciesOf(d, data);
  if (sp) {
    for (const s of speciesGives(data.rules, sp.name, subOf(d, data)?.name ?? null).skills) if (!m.has(s)) m.set(s, sp.name);
    for (const s of d.speciesPicks.skills) if (!m.has(s)) m.set(s, sp.name);
  }
  for (const s of d.feats.Skilled?.skills ?? []) if (!m.has(s)) m.set(s, "Skilled");
  return m;
}

/** The origin feats this character gets: the background's (2024) and a Human's Versatile pick. */
export function originFeats(d: Draft, data: BuilderData): { name: string; list: string | null; from: string }[] {
  if (data.rules !== "2024") return [];
  const out: { name: string; list: string | null; from: string }[] = [];
  const bg = backgroundOf(d, data);
  if (bg?.feat) out.push({ name: bg.feat.name, list: bg.feat.note && MAGIC_LISTS.includes(bg.feat.note) ? bg.feat.note : null, from: bg.name });
  if (d.species === "Human" && d.speciesPicks.feat) out.push({ name: d.speciesPicks.feat, list: null, from: "Human (Versatile)" });
  return out;
}
/** Feat choices are stored by feat name; a second Magic Initiate (Human + Acolyte) is stored as "Magic Initiate 2". */
export function featKeys(d: Draft, data: BuilderData): { key: string; name: string; list: string | null; from: string }[] {
  const seen = new Map<string, number>();
  return originFeats(d, data).map((f) => {
    const n = (seen.get(f.name) ?? 0) + 1;
    seen.set(f.name, n);
    return { ...f, key: n === 1 ? f.name : `${f.name} ${n}` };
  });
}

/** Spells known before the class's own picks: species cantrips and Magic Initiate. */
export function extraSpells(d: Draft, data: BuilderData): { known: string[]; ability: Ability | null } {
  const known: string[] = [];
  const add = (n: string | null | undefined) => { if (n && !known.includes(n)) known.push(n); };
  const sp = speciesOf(d, data);
  let ability: Ability | null = null;
  if (sp) {
    for (const c of speciesGives(data.rules, sp.name, subOf(d, data)?.name ?? null).cantrips) add(c);
    add(d.speciesPicks.cantrip);
    if (data.rules === "2014" && d.speciesPicks.cantrip) ability = "INT";
    if (d.speciesPicks.ability) ability = d.speciesPicks.ability;
  }
  for (const f of featKeys(d, data)) {
    if (f.name !== "Magic Initiate") continue;
    const ch = d.feats[f.key] ?? {};
    for (const c of ch.cantrips ?? []) add(c);
    add(ch.spell);
    ability ??= ch.ability ?? null;
  }
  return { known, ability };
}

// ---------------------------------------------------------------- starting kit

/** The items and gold from one set of kit groups and the player's choices. */
export function kitFrom(groups: KitGroup[], choices: KitChoice[], categories: BuilderData["categories"]): { items: KitItem[]; gp: number; missing: string[] } {
  const items: KitItem[] = [];
  let gp = 0;
  const missing: string[] = [];
  groups.forEach((g, gi) => {
    const ch = choices[gi];
    const kit: Kit | undefined = g.options.length === 1 ? g.options[0] : ch ? g.options[ch.option] : undefined;
    if (!kit) { missing.push(g.desc || "a starting kit"); return; }
    items.push(...kit.items.map((i) => ({ ...i })));
    gp += kit.gp;
    kit.picks.forEach((p, pi) => {
      const got = (ch?.picks?.[pi] ?? []).slice(0, p.choose);
      const list = categories[p.category]?.items ?? [];
      const found = got.map((g2) => list.find((i) => (i.ref ?? i.name) === g2)).filter((x): x is CategoryItem => !!x);
      if (found.length < p.choose) missing.push(p.label);
      for (const f of found) {
        const same = items.find((i) => (i.ref ?? i.name) === (f.ref ?? f.name));
        if (same) same.qty += 1; else items.push({ ...f, qty: 1 });
      }
    });
  });
  return { items, gp, missing };
}

/** Everything the character starts with: class kit + background kit (fixed items included). */
export function startingGear(d: Draft, data: BuilderData) {
  const cb = data.classes[d.cls];
  const bg = backgroundOf(d, data);
  const a = cb ? kitFrom(cb.equipment, d.kit, data.categories) : { items: [], gp: 0, missing: ["a class"] };
  const b = bg ? kitFrom(bg.equipment, d.bgKit, data.categories) : { items: [], gp: 0, missing: [] };
  const items: KitItem[] = [];
  for (const it of [...(cb?.equipmentFixed ?? []), ...a.items, ...(bg?.equipmentFixed ?? []), ...b.items]) {
    const same = items.find((i) => (i.ref ?? i.name) === (it.ref ?? it.name));
    if (same) same.qty += it.qty; else items.push({ ...it });
  }
  return { items, gp: a.gp + b.gp + (bg?.gp ?? 0), missing: [...a.missing, ...b.missing] };
}

const proficientIn = (profs: string[], kind: string) =>
  profs.some((p) => { const l = p.toLowerCase(); return l === "all armor" ? kind !== "shield" : l.startsWith(kind.toLowerCase()); });

/** The best armor class from the kit (armor and shield the class can use), or unarmored defense. */
export function armorClass(items: KitItem[], scores: Record<Ability, number>, cls: string, profs: string[]): { ac: number; armor: string | null; shield: string | null; how: string } {
  const dex = mod(scores.DEX);
  let best = { ac: 10 + dex, armor: null as string | null, how: `10 + DEX ${dex >= 0 ? "+" : ""}${dex}` };
  if (cls === "Barbarian") best = { ac: 10 + dex + mod(scores.CON), armor: null, how: "Unarmored Defense (10 + DEX + CON)" };
  if (cls === "Monk") best = { ac: 10 + dex + mod(scores.WIS), armor: null, how: "Unarmored Defense (10 + DEX + WIS)" };
  for (const it of items) {
    if (!it.ac || it.armor === "Shield" || !it.armor) continue;
    if (!proficientIn(profs, it.armor)) continue;
    const ac = it.ac.base + (it.ac.dex ? Math.min(dex, it.ac.max ?? 99) : 0);
    if (ac > best.ac) best = { ac, armor: it.name, how: it.name };
  }
  const shield = cls === "Monk" && !best.armor ? null : items.find((i) => i.armor === "Shield" && proficientIn(profs, "Shield")) ?? null;
  return { ac: best.ac + (shield ? 2 : 0), armor: best.armor, shield: shield?.name ?? null, how: best.how + (shield ? " + shield" : "") };
}

/** To-hit and damage for each weapon in the kit (shown before saving; the sheet works it out the same way). */
export function weaponLines(items: KitItem[], scores: Record<Ability, number>, prof: number) {
  return items.filter((i) => i.w).map((i) => {
    const w = i.w!;
    const str = mod(scores.STR), dex = mod(scores.DEX);
    const m = w.ranged ? dex : w.props.includes("Finesse") ? Math.max(str, dex) : str;
    return { name: i.name, hit: prof + m, damage: `${w.damage}${m ? (m > 0 ? `+${m}` : `${m}`) : ""}`, type: w.type.toLowerCase() };
  });
}

// ---------------------------------------------------------------- checks per step

export type Step = "class" | "species" | "background" | "abilities" | "skills" | "features" | "equipment" | "details";

export function speciesProblems(d: Draft, data: BuilderData): string[] {
  const sp = speciesOf(d, data);
  if (!sp) return ["Pick a species."];
  const p: string[] = [];
  const needs = { ...speciesNeeds(data.rules, sp.name, sp.subs.length, sp.asiChoice), ...speciesNeedsSub(data.rules, sp.name, subOf(d, data)?.name ?? null) };
  if (needs.sub && !subOf(d, data)) p.push(`Pick your ${needs.sub.toLowerCase()}.`);
  if (needs.skills && (d.speciesPicks.skills.length !== needs.skills.choose || d.speciesPicks.skills.some((s) => !needs.skills!.from.includes(s))))
    p.push(`${needs.skills.why}: pick ${needs.skills.choose} skill${needs.skills.choose > 1 ? "s" : ""}.`);
  if (needs.feat && !ORIGIN_FEATS.includes(d.speciesPicks.feat ?? "")) p.push("Versatile: pick an origin feat.");
  if (needs.cantrip && !d.speciesPicks.cantrip) p.push(`${needs.cantrip.why}: pick a cantrip.`);
  if (needs.ability && !MENTAL.includes(d.speciesPicks.ability as Ability)) p.push("Pick the ability for your lineage's spells.");
  if (needs.asi) {
    const a = d.speciesPicks.asi;
    if (a.length !== needs.asi.choose || new Set(a).size !== a.length || a.some((x) => !needs.asi!.from.includes(x))) p.push(`Pick ${needs.asi.choose} different abilities to raise by ${needs.asi.bonus}.`);
  }
  return p;
}

export function featProblems(d: Draft, data: BuilderData): string[] {
  const p: string[] = [];
  for (const f of featKeys(d, data)) {
    const ch: FeatChoice = d.feats[f.key] ?? {};
    if (f.name === "Magic Initiate") {
      if (!f.list && !MAGIC_LISTS.includes(ch.list ?? "")) p.push(`${f.key}: pick a spell list.`);
      if ((ch.cantrips ?? []).length !== 2) p.push(`${f.key}: pick 2 cantrips.`);
      if (!ch.spell) p.push(`${f.key}: pick a 1st-level spell.`);
      if (!MENTAL.includes(ch.ability as Ability)) p.push(`${f.key}: pick its spellcasting ability.`);
    }
    if (f.name === "Skilled" && (ch.skills ?? []).length !== 3) p.push("Skilled: pick 3 skills.");
  }
  return p;
}

export function backgroundProblems(d: Draft, data: BuilderData): string[] {
  const bg = backgroundOf(d, data);
  if (!bg) return ["Pick a background."];
  const p: string[] = [];
  if (d.background === "Other") {
    const c = d.customBackground;
    if (!c.name.trim()) p.push("Give your background a name.");
    if (c.skills.length !== 2) p.push("Pick 2 skills for your background.");
    if (data.rules === "2024") {
      if (c.abilities.length !== 3 || new Set(c.abilities).size !== 3) p.push("Pick 3 different abilities for your background.");
      if (!ORIGIN_FEATS.includes(c.feat ?? "")) p.push("Pick an origin feat for your background.");
    }
  }
  if (data.rules === "2024" && d.bgAsi.mode === "2-1") {
    const ab = bg.abilities ?? [];
    if (!ab.includes(d.bgAsi.plus2) || !ab.includes(d.bgAsi.plus1) || d.bgAsi.plus1 === d.bgAsi.plus2) p.push("Pick two different abilities of your background: +2 and +1.");
  }
  const langs = data.rules === "2024" ? 2 : bg.languages ?? 0;
  if (d.languages.length !== langs) p.push(`Pick ${langs} language${langs === 1 ? "" : "s"}.`);
  p.push(...featProblems(d, data));
  return p;
}

export function skillProblems(d: Draft, data: BuilderData): string[] {
  const cb = data.classes[d.cls];
  if (!cb?.skills) return [];
  const given = givenSkills(d, data);
  const open = cb.skills.from.filter((s) => !given.has(s));
  const need = Math.min(cb.skills.choose, open.length + d.classSkills.filter((s) => given.has(s)).length);
  const bad = d.classSkills.filter((s) => !cb.skills!.from.includes(s) || given.has(s));
  if (bad.length) return [`You already have ${bad.join(", ")} (or it isn't a ${d.cls} skill). Pick another.`];
  return d.classSkills.length === need ? [] : [`Pick ${need} ${d.cls} skill${need > 1 ? "s" : ""} (${d.classSkills.length} picked).`];
}

export function kitProblems(d: Draft, data: BuilderData): string[] {
  const g = startingGear(d, data);
  return g.missing.map((m) => `Starting equipment: choose ${m}.`);
}

export const languageCount = (d: Draft, data: BuilderData) => (data.rules === "2024" ? 2 : backgroundOf(d, data)?.languages ?? 0);

// ---------------------------------------------------------------- the finished character

/** What the level-up engine starts from: the character with everything except their class. */
export function baseCharacter(d: Draft, data: BuilderData): LevelChar {
  const scores = finalScores(d, data);
  const skills = [...new Set([...givenSkills(d, data).keys(), ...d.classSkills])].filter((s) => ALL_SKILLS.includes(s));
  const extra = extraSpells(d, data);
  return {
    class_levels: [], ability_scores: scores,
    proficiencies: { saves: CLASSES[d.cls]?.saves ?? [], skills, expertise: [], mastery: [] },
    features: [], spells: { known: extra.known, ...(extra.ability ? { ability: extra.ability } : {}) }, resources: [], hp_max: null, hp_current: null,
    rule_set: data.rules,
  };
}

export type BuiltCharacter = {
  row: Record<string, unknown>;
  bag: { ref: string | null; name: string; qty: number; equip: boolean }[];
};

/**
 * The character to save. `plan` is the level-up engine's level-1 plan for this draft (with `first: true`),
 * `featText` the rules text of feats by name. Throws with a message when a choice is missing.
 */
export function buildCharacter(d: Draft, data: BuilderData, levelData: RulesData, plan: Plan, featText: (n: string) => string): BuiltCharacter {
  const problems = [...speciesProblems(d, data), ...backgroundProblems(d, data), ...skillProblems(d, data), ...kitProblems(d, data)];
  const be = checkBase(d.method, d.base);
  if (be) problems.unshift(be);
  if (!CLASSES[d.cls] || !data.classes[d.cls]) problems.unshift("Pick a class.");
  if (!d.details.name.trim()) problems.push("Give your character a name.");
  if (problems.length) throw new Error(problems[0]);

  const base = baseCharacter(d, data);
  const { patch } = applyLevelUp(base, plan, d.level, null, levelData);
  const sp = speciesOf(d, data)!, sub = subOf(d, data), bg = backgroundOf(d, data)!;
  const gives = speciesGives(data.rules, sp.name, sub?.name ?? null);
  const scores = patch.ability_scores as Record<Ability, number>;

  // features: the class's (from the engine), then species, background and feats
  const features = [...patch.features];
  const add = (f: { name: string; source: string; description?: string; feat?: boolean }) => {
    if (!features.some((x) => typeof x !== "string" && x.name === f.name && x.source === f.source)) features.push(f);
  };
  for (const t of sp.traits) add({ name: t.name, source: sp.name, description: t.text });
  for (const t of sub?.traits ?? []) add({ name: t.name, source: sub!.name, description: t.text });
  if (bg.feature) add({ name: bg.feature.name, source: `${bg.name} background`, description: bg.feature.text });
  for (const f of featKeys(d, data)) {
    const ch = d.feats[f.key] ?? {};
    const picked = f.name === "Magic Initiate"
      ? ` Your picks: ${(ch.list ?? f.list ?? "")} list · ${[...(ch.cantrips ?? []), ch.spell].filter(Boolean).join(", ")} · ${ch.ability ?? ""}.`
      : f.name === "Skilled" ? ` Your picks: ${(ch.skills ?? []).join(", ")}.` : "";
    add({ name: f.name, source: f.from, description: `${featText(f.name)}${picked}`.trim(), feat: true });
  }
  if (d.languages.length || sp.languages) add({ name: "Languages", source: "About you", description: [data.rules === "2024" ? "Common" : sp.languages, ...d.languages].filter(Boolean).join(", ") });
  const cb = data.classes[d.cls];
  add({ name: "Proficiencies", source: d.cls, description: [...cb.proficiencies, ...bg.tools].filter(Boolean).join(", ") });
  if (d.details.alignment) add({ name: "Alignment", source: "About you", description: d.details.alignment });
  for (const [k, label] of [["personality", "Personality traits"], ["ideals", "Ideals"], ["bonds", "Bonds"], ["flaws", "Flaws"], ["backstory", "Backstory"]] as const) {
    const v = d.details[k].trim();
    if (v) add({ name: label, source: "About you", description: v.slice(0, 2000) });
  }

  // spells: the engine's, plus species and feat spells (they're already in base.known)
  const spells = { ...patch.spells, known: [...new Set(patch.spells.known ?? [])] };
  if (!spells.ability) { const extra = extraSpells(d, data).ability; if (extra) spells.ability = extra; }

  // HP: at level 1 the whole hit die + CON (+1 for a dwarf's toughness)
  const hitDie = CLASSES[d.cls].hitDie;
  const hp = Math.max(1, hitDie + mod(scores.CON) + (gives.hpPerLevel ?? 0));

  // kit: armor, shield and weapons are put on
  const gear = startingGear(d, data);
  const ac = armorClass(gear.items, scores, d.cls, cb.proficiencies);
  const weapons = new Set(gear.items.filter((i) => i.w).slice(0, 4).map((i) => i.name));
  const bag = gear.items.map((i) => ({ ref: i.ref ?? null, name: i.name, qty: i.qty, equip: i.name === ac.armor || i.name === ac.shield || weapons.has(i.name) }));

  const speed = gives.speed ?? sp.speed;
  return {
    row: {
      name: d.details.name.trim().slice(0, 60), player_name: d.details.playerName.trim().slice(0, 40) || null,
      species: (sub && sp.subs.length > 1 ? `${sp.name} (${sub.name.replace(/^.*?:\s*/, "").replace(/^Draconic Ancestry \((.+)\)$/, "$1")})` : sub?.name ?? sp.name).slice(0, 40),
      background: bg.name.slice(0, 40), rule_set: data.rules,
      class_levels: patch.class_levels, ability_scores: scores, hp_max: hp, hp_current: hp, temp_hp: 0, ac: ac.ac, speed,
      proficiencies: patch.proficiencies, spells, resources: patch.resources.map((r) => ({ ...r, used: 0 })), features, attacks: [], inventory: [],
      coins: { pp: 0, gp: gear.gp, ep: 0, sp: 0, cp: 0 },
    },
    bag,
  };
}
