import { describe, expect, it } from "vitest";
import spellsJson from "../test-fixtures/spells-lite.json";
import l14 from "../levelup/data-2014.json";
import l24 from "../levelup/data-2024.json";
import { planLevelUp } from "../levelup/engine";
import type { RulesData, SpellLite } from "../levelup/types";
import b14 from "./data-2014.json";
import b24 from "./data-2024.json";
import {
  abilityBonuses, armorClass, backgroundProblems, baseCharacter, blankDraft, buildCharacter, checkBase, extraSpells, finalScores,
  givenSkills, kitFrom, pointsUsed, skillProblems, speciesProblems, startingGear, suggestedArray, weaponLines,
} from "./engine";
import { CLASS_ORDER } from "./special";
import type { BuilderData, Draft } from "./types";

const B14 = b14 as unknown as BuilderData, B24 = b24 as unknown as BuilderData;
const L14 = l14 as unknown as RulesData, L24 = l24 as unknown as RulesData;
const SPELLS = spellsJson as SpellLite[];
const featText = (n: string) => `${n} rules text.`;
const make = (rules: "2014" | "2024", patch: Partial<Draft>): Draft => ({ ...blankDraft(rules), ...patch });

describe("ability scores", () => {
  it("checks each way of making scores", () => {
    expect(checkBase("standard", { STR: 15, DEX: 14, CON: 13, INT: 12, WIS: 10, CHA: 8 })).toBeNull();
    expect(checkBase("standard", { STR: 15, DEX: 15, CON: 13, INT: 12, WIS: 10, CHA: 8 })).toMatch(/standard array/);
    expect(pointsUsed({ STR: 15, DEX: 15, CON: 15, INT: 8, WIS: 8, CHA: 8 })).toBe(27);
    expect(checkBase("pointbuy", { STR: 15, DEX: 15, CON: 15, INT: 8, WIS: 8, CHA: 8 })).toBeNull();
    expect(checkBase("pointbuy", { STR: 15, DEX: 15, CON: 15, INT: 9, WIS: 8, CHA: 8 })).toMatch(/28 points/);
    expect(checkBase("pointbuy", { STR: 16, DEX: 8, CON: 8, INT: 8, WIS: 8, CHA: 8 })).toMatch(/8 to 15/);
    expect(checkBase("roll", { STR: 18, DEX: 3, CON: 12, INT: 9, WIS: 11, CHA: 7 })).toBeNull();
    expect(suggestedArray(CLASS_ORDER.Wizard)).toEqual({ INT: 15, CON: 14, DEX: 13, WIS: 12, CHA: 10, STR: 8 });
  });

  it("2014: the species gives the bonuses (Half-Elf picks two +1s)", () => {
    const d = make("2014", { species: "Half-Elf", speciesPicks: { skills: [], feat: null, cantrip: null, ability: null, asi: ["DEX", "CON"] }, base: suggestedArray(CLASS_ORDER.Bard) });
    expect(abilityBonuses(d, B14)).toEqual([{ a: "CHA", b: 2, from: "Half-Elf" }, { a: "DEX", b: 1, from: "Half-Elf" }, { a: "CON", b: 1, from: "Half-Elf" }]);
    expect(finalScores(d, B14)).toMatchObject({ CHA: 17, DEX: 15, CON: 14 });
    const hill = make("2014", { species: "Dwarf", base: suggestedArray(CLASS_ORDER.Cleric) });
    expect(abilityBonuses(hill, B14).map((x) => `${x.a}+${x.b}`)).toEqual(["CON+2", "WIS+1"]); // Hill Dwarf is taken automatically
  });

  it("2024: the background gives the bonuses (+2/+1 or +1/+1/+1), never above 20", () => {
    const d = make("2024", { background: "Soldier", bgAsi: { mode: "2-1", plus2: "STR", plus1: "CON" }, base: { STR: 15, DEX: 14, CON: 13, INT: 12, WIS: 10, CHA: 8 } });
    expect(finalScores(d, B24)).toMatchObject({ STR: 17, CON: 14, DEX: 14 });
    expect(finalScores({ ...d, bgAsi: { mode: "1-1-1" } }, B24)).toMatchObject({ STR: 16, DEX: 15, CON: 14 });
    expect(finalScores({ ...d, method: "manual", base: { ...d.base, STR: 20 } }, B24).STR).toBe(20);
  });
});

describe("species, background and skills", () => {
  it("asks a 2024 Human for a skill and an origin feat, an Elf for a lineage and its spell ability", () => {
    expect(speciesProblems(make("2024", { species: "Human" }), B24)).toEqual(["Skillful: pick 1 skill.", "Versatile: pick an origin feat."]);
    expect(speciesProblems(make("2024", { species: "Elf" }), B24)).toEqual(["Pick your elven lineage.", "Keen Senses: pick 1 skill.", "Pick the ability for your lineage's spells."]);
    expect(speciesProblems(make("2014", { species: "Elf" }), B14)).toEqual(["High Elf Cantrip: pick a cantrip."]); // High Elf is the only SRD subrace
    expect(speciesProblems(make("2014", { species: "Dragonborn" }), B14)).toEqual(["Pick your draconic ancestry."]);
  });

  it("collects the skills you already have, and makes class skill picks skip them", () => {
    const d = make("2024", { cls: "Fighter", species: "Human", background: "Soldier", speciesPicks: { skills: ["Perception"], feat: "Skilled", cantrip: null, ability: null, asi: [] },
      feats: { Skilled: { skills: ["Stealth", "History", "Insight"] } } });
    expect([...givenSkills(d, B24).entries()]).toEqual([["Athletics", "Soldier"], ["Intimidation", "Soldier"], ["Perception", "Human"], ["Stealth", "Skilled"], ["History", "Skilled"], ["Insight", "Skilled"]]);
    expect(skillProblems({ ...d, classSkills: ["Athletics", "Survival"] }, B24)[0]).toMatch(/already have Athletics/);
    expect(skillProblems({ ...d, classSkills: ["Acrobatics", "Survival"] }, B24)).toEqual([]);
  });

  it("checks a homemade background", () => {
    const d = make("2024", { background: "Other", customBackground: { name: "Shipwright", abilities: ["STR", "CON", "INT"], feat: "Alert", skills: ["Athletics", "Nature"] }, languages: ["Elvish", "Dwarvish"] });
    expect(backgroundProblems(d, B24)).toEqual([]);
    expect(backgroundProblems({ ...d, customBackground: { ...d.customBackground, abilities: ["STR", "STR", "INT"] } }, B24)[0]).toMatch(/3 different/);
  });

  it("gathers species and Magic Initiate spells", () => {
    const d = make("2024", { species: "Elf", sub: "Elven Lineage: Wood Elf", speciesPicks: { skills: ["Perception"], feat: null, cantrip: null, ability: "WIS", asi: [] },
      background: "Acolyte", feats: { "Magic Initiate": { cantrips: ["Guidance", "Sacred Flame"], spell: "Bless", ability: "WIS" } } });
    expect(extraSpells(d, B24)).toEqual({ known: ["Druidcraft", "Guidance", "Sacred Flame", "Bless"], ability: "WIS" });
  });
});

describe("starting equipment and armor class", () => {
  it("adds up a kit with picks from a category", () => {
    const fighter = B14.classes.Fighter;
    const k = kitFrom(fighter.equipment, [{ option: 1, picks: [] }, { option: 0, picks: [["srd:2014:longsword"]] }, { option: 1, picks: [] }, { option: 0, picks: [] }], B14.categories);
    expect(k.missing).toEqual([]);
    expect(k.items.map((i) => `${i.name}×${i.qty}`)).toEqual(["Leather Armor×1", "Longbow×1", "Arrow×20", "Shield×1", "Longsword×1", "Handaxe×2", "Dungeoneer's Pack×1"]);
    expect(kitFrom(fighter.equipment, [], B14.categories).missing.length).toBe(4);
  });

  it("works out AC from the best armor the class can wear", () => {
    const d = make("2024", { cls: "Fighter", background: "Soldier", kit: [{ option: 0, picks: [] }], bgKit: [{ option: 0, picks: [["srd:2024:dice"]] }] });
    const g = startingGear(d, B24);
    expect(g.gp).toBe(4 + 14);
    const scores = { STR: 17, DEX: 14, CON: 14, INT: 8, WIS: 12, CHA: 10 } as const;
    expect(armorClass(g.items, { ...scores }, "Fighter", B24.classes.Fighter.proficiencies)).toMatchObject({ ac: 16, armor: "Chain Mail" });
    // a wizard can't wear chain mail: unarmored
    expect(armorClass(g.items, { ...scores }, "Wizard", B24.classes.Wizard.proficiencies).ac).toBe(12);
    // barbarian unarmored defense, with a shield
    expect(armorClass([{ name: "Shield", qty: 1, ac: { base: 2, dex: false }, armor: "Shield" }], { ...scores, CON: 16 }, "Barbarian", B24.classes.Barbarian.proficiencies))
      .toMatchObject({ ac: 10 + 2 + 3 + 2, shield: "Shield" });
    expect(weaponLines(g.items, { ...scores }, 2).find((w) => w.name === "Greatsword")).toEqual({ name: "Greatsword", hit: 5, damage: "2d6+3", type: "slashing" });
  });
});

describe("a whole character", () => {
  it("2024 Human Fighter (Soldier) at level 1", () => {
    const d = make("2024", {
      cls: "Fighter", species: "Human", speciesPicks: { skills: ["Perception"], feat: "Alert", cantrip: null, ability: null, asi: [] },
      background: "Soldier", bgAsi: { mode: "2-1", plus2: "STR", plus1: "CON" }, languages: ["Dwarvish", "Orc"],
      method: "standard", base: suggestedArray(CLASS_ORDER.Fighter), classSkills: ["Acrobatics", "Survival"],
      kit: [{ option: 0, picks: [] }], bgKit: [{ option: 0, picks: [["srd:2024:dice"]] }],
      details: { ...blankDraft("2024").details, name: "Bren", alignment: "Lawful Good" },
    });
    expect(backgroundProblems(d, B24)).toEqual([]);
    const plan = planLevelUp(baseCharacter(d, B24), "Fighter", L24, SPELLS, { first: true });
    expect(plan.choices.map((c) => c.kind)).toEqual(["weapons", "pick"]); // mastery + fighting style, no multiclass skill
    expect(plan.gains.join(" ")).not.toMatch(/new class/);
    d.level = { picks: { "mastery-1": ["Greatsword", "Longbow", "Javelin"], "style-1": ["Great Weapon Fighting"] }, hp: "average" };
    const { row, bag } = buildCharacter(d, B24, L24, plan, featText);
    expect(row).toMatchObject({ name: "Bren", species: "Human", background: "Soldier", rule_set: "2024", hp_max: 10 + 2, ac: 16, speed: 30 });
    expect(row.class_levels).toEqual([{ class: "Fighter", level: 1 }]);
    expect(row.ability_scores).toEqual({ STR: 17, CON: 15, DEX: 13, WIS: 12, CHA: 10, INT: 8 });
    expect(row.proficiencies).toMatchObject({ saves: ["STR", "CON"], skills: ["Athletics", "Intimidation", "Perception", "Acrobatics", "Survival"], mastery: ["Greatsword", "Longbow", "Javelin"] });
    const names = (row.features as { name: string }[]).map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(["Second Wind", "Weapon Mastery", "Great Weapon Fighting", "Resourceful", "Alert", "Savage Attacker", "Languages", "Alignment"]));
    expect((row.coins as { gp: number }).gp).toBe(18);
    expect(bag.filter((b) => b.equip).map((b) => b.name)).toEqual(["Chain Mail", "Greatsword", "Flail", "Javelin", "Spear"]);
    expect(bag.every((b) => b.ref)).toBe(true);
  });

  it("2014 High Elf Wizard (Acolyte) with spells", () => {
    const d = make("2014", {
      cls: "Wizard", species: "Elf", speciesPicks: { skills: [], feat: null, cantrip: "Light", ability: null, asi: [] },
      background: "Acolyte", languages: ["Draconic", "Celestial"], method: "pointbuy", base: { STR: 8, DEX: 14, CON: 14, INT: 15, WIS: 12, CHA: 8 },
      classSkills: ["Arcana", "History"], kit: [{ option: 0, picks: [] }, { option: 1, picks: [["srd:2014:wand"]] }, { option: 0, picks: [] }],
      bgKit: [{ option: 0, picks: [["srd:2014:amulet"]] }], details: { ...blankDraft("2014").details, name: "Ilsa" },
    });
    expect(speciesProblems(d, B14)).toEqual([]);
    const base = baseCharacter(d, B14);
    expect(base.ability_scores).toMatchObject({ DEX: 16, INT: 16 });
    expect(base.proficiencies.skills).toEqual(["Insight", "Religion", "Perception", "Arcana", "History"]);
    const plan = planLevelUp(base, "Wizard", L14, SPELLS, { first: true });
    const cantrips = plan.choices.find((c) => c.kind === "cantrips")!;
    expect(cantrips.choose).toBe(3);
    expect(cantrips.options.some((o) => o.name === "Light")).toBe(false); // already known from High Elf
    const lvl1 = plan.choices.find((c) => c.kind === "spells")!;
    d.level = { picks: { cantrips: ["Fire Bolt", "Mage Hand", "Ray of Frost"], spells: lvl1.options.slice(0, lvl1.choose).map((o) => o.name) }, hp: "average" };
    const { row } = buildCharacter(d, B14, L14, plan, featText);
    expect(row).toMatchObject({ species: "High Elf", hp_max: 6 + 2, ac: 13, speed: 30 });
    expect((row.spells as { known: string[]; ability: string }).known.slice(0, 4)).toEqual(["Light", "Fire Bolt", "Mage Hand", "Ray of Frost"]);
    expect((row.spells as { ability: string }).ability).toBe("INT");
    expect((row.coins as { gp: number }).gp).toBe(15);
  });

  it("2024 Dwarf gets +1 HP per level; a missing choice stops the save", () => {
    const d = make("2024", {
      cls: "Barbarian", species: "Dwarf", background: "Soldier", bgAsi: { mode: "1-1-1" }, languages: ["Dwarvish", "Giant"],
      base: suggestedArray(CLASS_ORDER.Barbarian), classSkills: ["Survival", "Perception"], kit: [{ option: 0, picks: [] }], bgKit: [{ option: 1, picks: [] }],
      details: { ...blankDraft("2024").details, name: "Thora" },
    });
    const plan = planLevelUp(baseCharacter(d, B24), "Barbarian", L24, SPELLS, { first: true });
    d.level = { picks: { [plan.choices[0].key]: plan.choices[0].options.slice(0, plan.choices[0].choose).map((o) => o.name) }, hp: "average" };
    const { row } = buildCharacter(d, B24, L24, plan, featText);
    expect(row.hp_max).toBe(12 + 2 + 1); // d12 + CON (14, +1 from the background = 15 → +2) + Dwarven Toughness
    expect(row.ac).toBe(10 + 2 + 2); // Unarmored Defense: DEX 13+1 = 14 → +2, CON +2
    expect(row.speed).toBe(30);
    expect(() => buildCharacter({ ...d, classSkills: [] }, B24, L24, plan, featText)).toThrow(/Pick 2 Barbarian skills/);
  });
});
