import { describe, expect, it } from "vitest";
import spellsJson from "../test-fixtures/spells-lite.json";
import d14 from "./data-2014.json";
import d24 from "./data-2024.json";
import { applyLevelUp, checkAnswers, featAbilities, findSubclass, levelChoices, levelDown, planLevelUp, type LevelChar } from "./engine";
import type { Answers, RulesData, SpellLite } from "./types";

const R14 = d14 as unknown as RulesData, R24 = d24 as unknown as RulesData;
const SPELLS = spellsJson as SpellLite[];
const base = (o: Partial<LevelChar>): LevelChar => ({
  class_levels: [], ability_scores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 }, proficiencies: { saves: [], skills: [], expertise: [] },
  features: [], spells: { known: [], slots: {}, slots_used: {} }, resources: [], hp_max: 10, hp_current: 10, rule_set: "2024", ...o,
});
const ans = (picks: Answers["picks"] = {}, asi: Answers["asi"] = {}): Answers => ({ picks, asi, hp: "average" });

const orrin = base({
  class_levels: [{ class: "Wizard", subclass: "Evoker", level: 3 }],
  ability_scores: { STR: 8, DEX: 14, CON: 12, INT: 16, WIS: 12, CHA: 10 },
  proficiencies: { saves: ["INT", "WIS"], skills: ["Arcana", "History"], expertise: [] },
  spells: { ability: "INT", known: ["Fire Bolt", "Ray of Frost", "Mage Hand", "Magic Missile", "Shield", "Burning Hands", "Mage Armor", "Detect Magic", "Shatter", "Scorching Ray"], slots: { 1: 4, 2: 2 }, slots_used: { 1: 1 } },
  hp_max: 17, hp_current: 12,
});

describe("level-up: what you get", () => {
  it("lists your classes first, then the ones you could add (with a warning when the scores are too low)", () => {
    const c = levelChoices(orrin, R24);
    expect(c.mine).toEqual([{ className: "Wizard", level: 4, subclass: "Evoker", isNew: false, warning: null }]);
    expect(c.others.find((o) => o.className === "Barbarian")?.warning).toMatch(/STR 13 \(for Barbarian\)/);
    expect(c.others.find((o) => o.className === "Fighter")?.warning).toBeNull(); // STR or DEX 13: DEX 14 is enough
    expect(c.others.find((o) => o.className === "Rogue")?.warning).toBeNull(); // DEX 14, INT 16
  });

  it("2024 Wizard 3 → 4: an Ability Score Improvement, one more cantrip and spell, from lists", () => {
    const p = planLevelUp(orrin, "Wizard", R24, SPELLS);
    expect(p).toMatchObject({ fromLevel: 3, toLevel: 4, totalLevel: 4, hitDie: 6, average: 4, subclass: "Evoker" });
    const kinds = p.choices.map((c) => `${c.kind}:${c.choose}`);
    expect(kinds).toEqual(["asi:1", "cantrips:1", "spells:1"]);
    const spells = p.choices.find((c) => c.kind === "spells")!;
    expect(spells.options.every((o) => (o.level ?? 0) >= 1 && (o.level ?? 0) <= 2)).toBe(true);
    expect(spells.options.some((o) => o.name === "Misty Step")).toBe(true);
    expect(spells.options.some((o) => o.name === "Shield")).toBe(false); // already known
    expect(p.choices.find((c) => c.kind === "cantrips")!.options.some((o) => o.name === "Fire Bolt")).toBe(false);
  });

  it("2024 Wizard 4 → 5: new 3rd-level slots and the proficiency bonus go up", () => {
    const p = planLevelUp({ ...orrin, class_levels: [{ class: "Wizard", subclass: "Evoker", level: 4 }] }, "Wizard", R24, SPELLS);
    expect(p.gains.join(" ")).toMatch(/Proficiency bonus goes up to \+3/);
    expect(p.gains.join(" ")).toMatch(/New: 2 3rd-level spell slots/);
    expect(p.choices.find((c) => c.kind === "spells")!.options.some((o) => o.level === 3)).toBe(true);
  });

  it("subclass at level 3 shows what each subclass gives", () => {
    const cleric = base({ class_levels: [{ class: "Cleric", level: 2 }], ability_scores: { STR: 10, DEX: 10, CON: 12, INT: 10, WIS: 16, CHA: 10 } });
    const p = planLevelUp(cleric, "Cleric", R24, SPELLS);
    const sub = p.choices.find((c) => c.kind === "subclass")!;
    expect(sub.options.map((o) => o.name)).toEqual(["Life Domain"]);
    expect(sub.gives!["Life Domain"].map((f) => f.name)).toContain("Disciple of Life");
  });

  it("2014 Warlock 1 → 2: two invocations (none above their level), one new spell", () => {
    const wl = base({ rule_set: "2014", class_levels: [{ class: "Warlock", subclass: "Fiend", level: 1 }], ability_scores: { STR: 8, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 16 } });
    const p = planLevelUp(wl, "Warlock", R14, SPELLS);
    const inv = p.choices.find((c) => c.title === "Eldritch Invocations")!;
    expect(inv.choose).toBe(2);
    expect(inv.options.some((o) => o.name === "Agonizing Blast")).toBe(true);
    expect(inv.options.some((o) => (o.minLevel ?? 0) > 2)).toBe(false);
    expect(p.choices.find((c) => c.kind === "spells")?.choose).toBe(1);
    expect(p.auto.some((f) => f.source.startsWith("Fiend"))).toBe(false); // the Fiend has nothing at 2
  });

  it("multiclassing into Fighter: level 1 features, fighting style and weapon mastery from lists", () => {
    const vex = base({ class_levels: [{ class: "Rogue", subclass: "Thief", level: 3 }], ability_scores: { STR: 10, DEX: 17, CON: 12, INT: 13, WIS: 12, CHA: 14 } });
    const p = planLevelUp(vex, "Fighter", R24, SPELLS);
    expect(p).toMatchObject({ isNew: true, fromLevel: 0, toLevel: 1, warnings: [] });
    expect(p.gains[0]).toMatch(/new class: Fighter level 1/);
    expect(p.choices.map((c) => c.title)).toEqual(expect.arrayContaining(["Weapon Mastery", "Fighting Style"]));
    expect(p.choices.find((c) => c.title === "Fighting Style")!.options.map((o) => o.name)).toEqual(["Archery", "Defense", "Great Weapon Fighting", "Two-Weapon Fighting"]);
  });

  it("finds subclasses by their usual names", () => {
    expect(findSubclass(R14.classes.Wizard.subclasses, "Evoker")?.name).toBe("Evocation");
    expect(findSubclass(R24.classes.Barbarian.subclasses, "Berserker")?.name).toBe("Path of the Berserker");
    expect(findSubclass(R24.classes.Cleric.subclasses, "Life")?.name).toBe("Life Domain");
  });

  it("knows which feats raise a score", () => {
    expect(featAbilities(R24.feats.find((f) => f.name === "Grappler")!.text)).toEqual({ abilities: ["STR", "DEX"], max: 20 });
    expect(featAbilities(R24.feats.find((f) => f.name === "Boon of Fate")!.text)?.max).toBe(30);
    expect(featAbilities(R24.feats.find((f) => f.name === "Alert")!.text)).toBeNull();
  });
});

describe("level-up: choices and saving", () => {
  const p = planLevelUp(orrin, "Wizard", R24, SPELLS);
  const good = ans({ cantrips: ["Light"], spells: ["Misty Step"] }, { "asi-4": { mode: "plus2", a: "INT" } });

  it("says what's still missing", () => {
    expect(checkAnswers(p, ans(), orrin, R24)).toMatch(/Ability Score Improvement: make a choice/);
    expect(checkAnswers(p, { ...good, picks: { ...good.picks, spells: [] } }, orrin, R24)).toMatch(/pick 1 \(you picked 0\)/);
    expect(checkAnswers(p, { ...good, picks: { ...good.picks, spells: ["Wish"] } }, orrin, R24)).toMatch(/pick from the list/);
    expect(checkAnswers(p, { ...good, asi: { "asi-4": { mode: "split", a: "INT", b: "INT" } } }, orrin, R24)).toMatch(/two different/);
    expect(checkAnswers(p, { ...good, asi: { "asi-4": { mode: "feat", feat: "Grappler" } } }, orrin, R24)).toMatch(/which score/);
    expect(checkAnswers(p, good, orrin, R24)).toBeNull();
  });

  it("applies everything: level, HP (average + CON), score, spells, slots kept as used", () => {
    const { patch, summary } = applyLevelUp(orrin, p, good, null, R24);
    expect(patch.class_levels).toEqual([{ class: "Wizard", subclass: "Evoker", level: 4 }]);
    expect(patch.hp_max).toBe(17 + 4 + 1);
    expect(patch.hp_current).toBe(12 + 5);
    expect(patch.ability_scores.INT).toBe(18);
    expect(patch.spells.known).toEqual(expect.arrayContaining(["Light", "Misty Step"]));
    expect(patch.spells.slots).toEqual({ 1: 4, 2: 3 });
    expect(patch.spells.slots_used).toEqual({ 1: 1 });
    expect(summary[0]).toBe("Wizard 4 (character level 4).");
  });

  it("a CON increase counts for the levels you already had", () => {
    const tough = base({ class_levels: [{ class: "Fighter", subclass: "Champion", level: 3 }], ability_scores: { STR: 16, DEX: 10, CON: 15, INT: 10, WIS: 10, CHA: 10 }, hp_max: 28, hp_current: 28 });
    const plan = planLevelUp(tough, "Fighter", R24, SPELLS);
    const { patch } = applyLevelUp(tough, plan, ans({ "mastery-4": ["Longsword"] }, { "asi-4": { mode: "split", a: "CON", b: "STR" } }), 9, R24);
    expect(patch.hp_max).toBe(28 + (9 + 3) + 1 * 3); // rolled 9, new CON +3, +1 for each of the 3 earlier levels
    expect(patch.resources.find((r) => r.name === "Second Wind")?.max).toBe(3);
    expect(patch.proficiencies.mastery).toEqual(["Longsword"]);
  });

  it("feats are added with their text; a new subclass adds its features", () => {
    const cleric = base({ class_levels: [{ class: "Cleric", level: 2 }], ability_scores: { STR: 10, DEX: 10, CON: 12, INT: 10, WIS: 16, CHA: 10 }, spells: { ability: "WIS", known: ["Guidance"], slots: {}, slots_used: {} } });
    const plan = planLevelUp(cleric, "Cleric", R24, SPELLS);
    const picks: Answers["picks"] = { subclass: ["Life Domain"] };
    const sp = plan.choices.find((c) => c.kind === "spells");
    if (sp) picks.spells = sp.options.slice(0, sp.choose).map((o) => o.name);
    const { patch } = applyLevelUp(cleric, plan, ans(picks), null, R24);
    expect(patch.class_levels[0]).toEqual({ class: "Cleric", level: 3, subclass: "Life Domain" });
    expect(patch.features.some((f) => typeof f !== "string" && f.name === "Disciple of Life" && f.source === "Life Domain 3")).toBe(true);
  });

  it("multiclass: a new class line, its features, and spellcasting ability if you had none", () => {
    const vex = base({ class_levels: [{ class: "Rogue", level: 3 }], ability_scores: { STR: 10, DEX: 17, CON: 12, INT: 13, WIS: 14, CHA: 14 }, spells: {} });
    const plan = planLevelUp(vex, "Cleric", R24, SPELLS);
    const picks: Answers["picks"] = {};
    for (const c of plan.choices) if (!c.optional && c.kind !== "asi") picks[c.key] = c.options.slice(0, c.choose).map((o) => o.name);
    const { patch } = applyLevelUp(vex, plan, ans(picks), null, R24);
    expect(patch.class_levels).toEqual([{ class: "Rogue", level: 3 }, { class: "Cleric", level: 1 }]);
    expect(patch.spells.ability).toBe("WIS");
    expect(patch.spells.slots).toEqual({ 1: 2 });
    expect(patch.hp_max).toBe(10 + 5 + 1);
  });
});

describe("level down", () => {
  it("takes the level's features, average HP, slots; warns about the ASI", () => {
    const w4 = { ...orrin, class_levels: [{ class: "Wizard", subclass: "Evoker", level: 4 }], hp_max: 22, hp_current: 22,
      spells: { ...orrin.spells, slots: { 1: 4, 2: 3 }, slots_used: { 2: 3 } },
      features: [{ name: "Grappler", source: "Wizard 4", feat: true }, { name: "Potent Cantrip", source: "Evoker 6" }, "Old note"] };
    const { patch, notes } = levelDown(w4, "Wizard", R24);
    expect(patch.class_levels).toEqual([{ class: "Wizard", subclass: "Evoker", level: 3 }]);
    expect(patch.hp_max).toBe(22 - 5);
    expect(patch.spells.slots).toEqual({ 1: 4, 2: 2 });
    expect(patch.spells.slots_used).toEqual({ 2: 2 });
    expect(patch.features.map((f) => (typeof f === "string" ? f : f.name))).toEqual(["Potent Cantrip", "Old note"]);
    expect(notes.join(" ")).toMatch(/Ability Score Improvement/);
    expect(notes.join(" ")).toMatch(/new spells/);
  });

  it("below the subclass level the subclass and its features go; a 1-level class line goes away", () => {
    const cl = base({ class_levels: [{ class: "Cleric", subclass: "Life Domain", level: 3 }, { class: "Fighter", level: 1 }], hp_max: 30, hp_current: 30,
      features: [{ name: "Disciple of Life", source: "Life Domain 3" }, { name: "Second Wind", source: "Fighter 1" }] });
    const a = levelDown(cl, "Cleric", R24);
    expect(a.patch.class_levels[0]).toEqual({ class: "Cleric", level: 2 });
    expect(a.patch.features.map((f) => (typeof f === "string" ? f : f.name))).toEqual(["Second Wind"]);
    const b = levelDown(cl, "Fighter", R24);
    expect(b.patch.class_levels).toEqual([{ class: "Cleric", subclass: "Life Domain", level: 3 }]);
    expect(() => levelDown(base({ class_levels: [{ class: "Fighter", level: 1 }] }), "Fighter", R24)).toThrow(/lowest/);
  });
});
