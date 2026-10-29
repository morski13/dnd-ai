import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName } from "pdf-lib";
import { readPdfFields } from "./read-pdf";
import { cleanSpellName, fieldsToSheet, parseClassLevel, parseDamage, parseFeatureBlock, parseItemBlock, parseItemLine, sheetScore } from "./parse";
import { cleanAiSheet } from "./clean";
import { findIn, makeIndex } from "./match";
import { buildAttacks, buildFeatures, type LibWeapon } from "./build";

/** A PDF with real form fields, like the official fillable sheet (or, with dropForm, like a D&D Beyond export:
 *  the fields stay as page annotations but the document has no form dictionary). */
async function makePdf(text: Record<string, string>, boxes: Record<string, boolean> = {}, dropForm = false) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const form = doc.getForm();
  let y = 760;
  for (const [name, value] of Object.entries(text)) {
    const f = form.createTextField(name);
    f.setText(value);
    f.addToPage(page, { x: 20, y: (y -= 6), width: 100, height: 5 });
  }
  for (const [name, on] of Object.entries(boxes)) {
    const b = form.createCheckBox(name);
    if (on) b.check();
    b.addToPage(page, { x: 200, y: (y -= 6), width: 5, height: 5 });
  }
  if (dropForm) doc.catalog.delete(PDFName.of("AcroForm"));
  return doc.save();
}

describe("small parsers", () => {
  it("reads class and level lines", () => {
    expect(parseClassLevel("Ranger 3 (Hunter) / Rogue 1").classes).toEqual([
      { class: "Ranger", subclass: "Hunter", level: 3 }, { class: "Rogue", subclass: "", level: 1 },
    ]);
    expect(parseClassLevel("Barbarian (Path of the Berserker) 5").classes).toEqual([{ class: "Barbarian", subclass: "Path of the Berserker", level: 5 }]);
    expect(parseClassLevel("Level 4 Cleric").classes).toEqual([{ class: "Cleric", subclass: "", level: 4 }]);
    expect(parseClassLevel("Fighter 5, Champion").classes).toEqual([{ class: "Fighter", subclass: "Champion", level: 5 }]);
    expect(parseClassLevel("Wizard 5 School of Evocation").classes[0].subclass).toBe("School of Evocation");
    expect(parseClassLevel("Artificer 5 / Wizard 2")).toEqual({ classes: [{ class: "Wizard", subclass: "", level: 2 }], unknown: ["Artificer 5"] });
  });

  it("reads damage", () => {
    expect(parseDamage("1d8+3 slashing")).toEqual({ dice: "1d8", flat: 3, type: "slashing" });
    expect(parseDamage("1d8-2 Slashing")).toEqual({ dice: "1d8", flat: -2, type: "slashing" });
    expect(parseDamage("2d6 + 4 Piercing")).toEqual({ dice: "2d6", flat: 4, type: "piercing" });
    expect(parseDamage("0 Bludgeoning")).toEqual({ dice: "", flat: 0, type: "bludgeoning" });
    expect(parseDamage("2d10 Fire")).toEqual({ dice: "2d10", flat: 0, type: "fire" });
  });

  it("reads equipment lines and lists", () => {
    expect(parseItemLine("Dagger x2")).toEqual({ name: "Dagger", qty: 2 });
    expect(parseItemLine("20 Arrows")).toEqual({ name: "Arrows", qty: 20 });
    expect(parseItemLine("• Torch (10)")).toEqual({ name: "Torch", qty: 10 });
    expect(parseItemBlock("Leather armor, longbow, 20 arrows\nRope, hempen (50 feet)\nExplorer's Pack")).toEqual([
      { name: "Leather armor", qty: 1 }, { name: "longbow", qty: 1 }, { name: "arrows", qty: 20 },
      { name: "Rope", qty: 1 }, { name: "hempen (50 feet)", qty: 1 }, { name: "Explorer's Pack", qty: 1 },
    ]);
  });

  it("splits a features box into features", () => {
    const f = parseFeatureBlock("=== RANGER FEATURES ===\n* Favored Enemy • PHB 91\nYou have advantage on Survival checks.\nNatural Explorer. You are at home in forests.\nSneak Attack: 1d6 once per turn.", "Features");
    expect(f.map((x) => x.name)).toEqual(["Favored Enemy", "Natural Explorer", "Sneak Attack"]);
    expect(f[0].description).toBe("You have advantage on Survival checks.");
    expect(f[2].description).toBe("1d6 once per turn.");
  });

  it("cleans spell names", () => {
    expect(cleanSpellName("Find Familiar [R]")).toBe("Find Familiar");
    expect(cleanSpellName("Shield - VS")).toBe("Shield");
    expect(cleanSpellName("O Bless")).toBe("Bless");
  });
});

describe("the official fillable sheet", () => {
  it("reads a filled-in sheet, including the proficiency boxes", async () => {
    const pdf = await makePdf({
      CharacterName: "Mira Thornwood", ClassLevel: "Ranger 3 (Hunter) / Rogue 1", "Race ": "Half-Elf", Background: "Outlander", PlayerName: "Ana",
      STR: "12", DEX: "17", CON: "14", INT: "10", WIS: "15", CHA: "8", ProfBonus: "+2", AC: "15", Speed: "30 ft", HPMax: "32",
      "ST Strength": "+3", "ST Dexterity": "+5", Stealth: "+7", Perception: "+4", Survival: "+4", Athletics: "+3",
      "Wpn Name": "Longbow", "Wpn1 AtkBonus": "+5", "Wpn1 Damage": "1d8+3 piercing",
      "Wpn Name 2": "Dagger +1", "Wpn2 AtkBonus  ": "+6", "Wpn2 Damage  ": "1d4+4 piercing",
      Equipment: "Leather armor, longbow, 20 arrows, 2 daggers", GP: "37", SP: "5",
      "Features and Traits": "Favored Enemy. Beasts.\nSneak Attack. 1d6.",
      "Spells 1015": "Hunter's Mark", "Spells 1023": "Cure Wounds - VS", "SpellcastingAbility 2": "WIS",
      PersonalityTraits: "I watch over my friends as if they were newborn pups.",
    }, {
      "Check Box 11": true, "Check Box 18": true, // STR, DEX saves
      "Check Box 26": true, "Check Box 34": true, "Check Box 39": true, "Check Box 40": true, // Athletics, Perception, Stealth, Survival
      "Check Box 23": false,
    });
    const read = await readPdfFields(pdf);
    expect(read.filled).toBeGreaterThan(20);
    const s = fieldsToSheet(read.fields);
    expect(s.name).toBe("Mira Thornwood");
    expect(s.species).toBe("Half-Elf");
    expect(s.classes).toEqual([{ class: "Ranger", subclass: "Hunter", level: 3 }, { class: "Rogue", subclass: "", level: 1 }]);
    expect(s.scores).toEqual({ STR: 12, DEX: 17, CON: 14, INT: 10, WIS: 15, CHA: 8 });
    expect(s.saves).toEqual(["STR", "DEX"]);
    expect(s.skills).toEqual(["Athletics", "Perception", "Stealth", "Survival"]);
    expect(s.expertise).toEqual(["Stealth"]); // ticked + a total of DEX +3 and double proficiency
    expect([s.hp, s.ac, s.speed]).toEqual([32, 15, 30]);
    expect(s.attacks).toEqual([
      { name: "Longbow", bonus: 5, damage: "1d8+3", damageType: "piercing", notes: "" },
      { name: "Dagger +1", bonus: 6, damage: "1d4+4", damageType: "piercing", notes: "" },
    ]);
    expect(s.equipment).toEqual([{ name: "Leather armor", qty: 1 }, { name: "longbow", qty: 1 }, { name: "arrows", qty: 20 }, { name: "daggers", qty: 2 }]);
    expect(s.coins).toEqual({ pp: 0, gp: 37, ep: 0, sp: 5, cp: 0 });
    expect(s.spells).toEqual(["Hunter's Mark", "Cure Wounds"]);
    expect(s.spellAbility).toBe("WIS");
    expect(s.features.map((f) => f.name)).toEqual(["Favored Enemy", "Sneak Attack", "Personality traits"]);
    expect(s.warnings).toEqual([]);
    expect(sheetScore(s)).toBeGreaterThan(10);
  });

  it("works out proficiencies from the totals when no box is ticked", async () => {
    const pdf = await makePdf({ CharacterName: "Bo", ClassLevel: "Fighter 1", STR: "16", DEX: "12", CON: "14", INT: "8", WIS: "10", CHA: "10",
      "ST Strength": "+5", "ST Constitution": "+4", "ST Dexterity": "+1", Athletics: "+5", Perception: "+2" });
    const s = fieldsToSheet((await readPdfFields(pdf)).fields);
    expect(s.profBonus).toBe(2); // from the level
    expect(s.saves).toEqual(["STR", "CON"]);
    expect(s.skills).toEqual(["Athletics", "Perception"]);
  });
});

describe("a D&D Beyond export (fields without a form)", () => {
  it("still finds every field and the D&D Beyond markers", async () => {
    const pdf = await makePdf({
      CharacterName: "Dorn Ashvale", "CLASS LEVEL": "Cleric 4 / Fighter 1", "PLAYER NAME": "Stefan", RACE: "Mountain Dwarf", BACKGROUND: "Soldier",
      STR: "16", STRmod: "+3", DEX: "10", CON: "15", INT: "9", WIS: "16", CHA: "11", ProfBonus: "+3",
      WisProf: "•", ChaProf: "•", "ST Wisdom": "+6", InsightProf: "P", Insight: "+6", ReligionProf: "E", Religion: "+5", AthleticsProf: "P", Athletics: "+6",
      AC: "18", Speed: "25 ft. (Walking)", MaxHP: "41", Init: "+0",
      "Wpn Name": "Warhammer", "Wpn1 AtkBonus": "+6", "Wpn1 Damage": "1d8+3 Bludgeoning", "Wpn Notes 1": "Martial, Versatile",
      "Wpn Name 2": "Sacred Flame", "Wpn2 AtkBonus": "DC 14", "Wpn2 Damage": "1d8 Radiant",
      "Eq Name0": "Chain Mail", "Eq Qty0": "1", "Eq Name1": "Torch", "Eq Qty1": "10", "Eq Name2": "Torch", "Eq Qty2": "5", "Eq Name3": "Shield", "Eq Qty3": "1",
      GP: "120", CP: "14", spellCastingAbility0: "WIS", spellName0: "Sacred Flame", spellName1: "Bless", spellName5: "Find Familiar [R]", spellHeader1: "=== 1st LEVEL ===",
      FeaturesTraits1: "=== CLERIC FEATURES ===\n* Channel Divinity • PHB 58\nTurn undead.", Inspiration: "Off",
    }, { "Check Box 12": false }, true);
    const read = await readPdfFields(pdf);
    expect(read.fields.find((f) => f.name === "CLASS LEVEL")?.value).toBe("Cleric 4 / Fighter 1");
    const s = fieldsToSheet(read.fields);
    expect(s.name).toBe("Dorn Ashvale");
    expect(s.playerName).toBe("Stefan");
    expect(s.classes).toEqual([{ class: "Cleric", subclass: "", level: 4 }, { class: "Fighter", subclass: "", level: 1 }]);
    expect(s.saves).toEqual(["WIS", "CHA"]);
    expect(s.skills).toEqual(["Athletics", "Insight", "Religion"]);
    expect(s.expertise).toEqual(["Religion"]);
    expect([s.hp, s.ac, s.speed]).toEqual([41, 18, 25]);
    expect(s.attacks[0]).toEqual({ name: "Warhammer", bonus: 6, damage: "1d8+3", damageType: "bludgeoning", notes: "Martial, Versatile" });
    expect(s.attacks[1].name).toBe("Sacred Flame");
    expect(s.equipment).toEqual([{ name: "Chain Mail", qty: 1 }, { name: "Torch", qty: 15 }, { name: "Shield", qty: 1 }]);
    expect(s.coins.gp).toBe(120);
    expect(s.spells).toEqual(["Sacred Flame", "Bless", "Find Familiar"]);
    expect(s.features[0]).toEqual({ name: "Channel Divinity", description: "Turn undead." });
  });

  it("warns about classes the app doesn't have", async () => {
    const pdf = await makePdf({ CharacterName: "Varra", "CLASS LEVEL": "Artificer 5 / Wizard 2" }, {}, true);
    const s = fieldsToSheet((await readPdfFields(pdf)).fields);
    expect(s.classes).toEqual([{ class: "Wizard", subclass: "", level: 2 }]);
    expect(s.unknownClasses).toEqual(["Artificer 5"]);
    expect(s.warnings.join(" ")).toMatch(/Artificer 5/);
  });

  it("a flat PDF gives almost nothing, so the app knows to read the text instead", async () => {
    const doc = await PDFDocument.create();
    doc.addPage().drawText("Character Name: Mira   Class & Level: Ranger 3");
    const read = await readPdfFields(await doc.save());
    expect(read.filled).toBe(0);
    expect(sheetScore(fieldsToSheet(read.fields))).toBe(0);
  });
});

describe("finding things in the libraries", () => {
  const items = [{ name: "Crossbow, light", id: "x" }, { name: "Dagger", id: "d" }, { name: "Arrows", id: "a" }, { name: "Leather Armor", id: "l" },
    { name: "Torch", id: "t" }, { name: "Shield", id: "s" }, { name: "Rations (1 day)", id: "r" }];
  const idx = makeIndex(items);
  it("forgives how sheets write item names", () => {
    expect(findIn(idx, "Light Crossbow")?.id).toBe("x");
    expect(findIn(idx, "Crossbow, Light")?.id).toBe("x");
    expect(findIn(idx, "daggers")?.id).toBe("d");
    expect(findIn(idx, "arrow")?.id).toBe("a");
    expect(findIn(idx, "leather armor")?.id).toBe("l");
    expect(findIn(idx, "Torches")?.id).toBe("t");
    expect(findIn(idx, "Rations")?.id).toBe("r");
    expect(findIn(idx, "Dagger +1")?.id).toBe("d");
    expect(findIn(idx, "Shield of Faith")).toBeNull();
    expect(findIn(idx, "Ember Reactor")).toBeNull();
  });
  it("finds spells regardless of case", () => {
    const spells = makeIndex([{ name: "Shield of Faith" }, { name: "Hunter's Mark" }, { name: "Shield" }]);
    expect(findIn(spells, "shield of faith")?.name).toBe("Shield of Faith");
    expect(findIn(spells, "Hunters Mark")?.name).toBe("Hunter's Mark");
    expect(findIn(spells, "Shield")?.name).toBe("Shield");
  });
});

describe("what an AI read from the text", () => {
  it("is checked and cleaned before anyone sees it", () => {
    const s = cleanAiSheet({
      name: "  Mira Thornwood ", classes: [{ class: "ranger", subclass: "Hunter", level: 33 }, { class: "Blood Hunter", level: 2 }],
      scores: { STR: 12, DEX: "17", CON: 99, WIS: 15 }, saves: ["str", "Dexterity", "Luck"], skills: ["stealth", "Sleight of hand", "Cooking"],
      expertise: ["Stealth", "Arcana"], hp: "32", ac: 15, speed: "30 ft", attacks: [{ name: "Longbow", bonus: "+5", damage: "1d8+3 piercing" }],
      spells: ["Hunter's Mark", "", 7], equipment: [{ name: "Arrows", qty: 20 }, "Rope"], coins: { gp: "37", sp: -4 },
      features: [{ name: "Favored Enemy", description: "Beasts" }], spellAbility: "wisdom", warnings: ["The DEX save box was hard to read."],
    });
    expect(s.source).toBe("ai");
    expect(s.name).toBe("Mira Thornwood");
    expect(s.classes).toEqual([{ class: "Ranger", subclass: "Hunter", level: 20 }]);
    expect(s.unknownClasses).toEqual(["Blood Hunter 2"]);
    expect(s.scores).toEqual({ STR: 12, DEX: 17, CON: 30, WIS: 15 });
    expect(s.saves).toEqual(["STR", "DEX"]);
    expect(s.skills).toEqual(["Stealth", "Sleight of Hand"]);
    expect(s.expertise).toEqual(["Stealth"]); // only skills they have
    expect([s.hp, s.ac, s.speed]).toEqual([32, 15, 30]);
    expect(s.attacks).toEqual([{ name: "Longbow", bonus: 5, damage: "1d8+3", damageType: "piercing", notes: "" }]);
    expect(s.spells).toEqual(["Hunter's Mark"]);
    expect(s.equipment).toEqual([{ name: "Arrows", qty: 20 }, { name: "Rope", qty: 1 }]);
    expect(s.coins).toEqual({ pp: 0, gp: 37, ep: 0, sp: 0, cp: 0 });
    expect(s.spellAbility).toBe("WIS");
    expect(s.warnings[0]).toMatch(/AI read/);
    expect(s.warnings).toContain("The DEX save box was hard to read.");
  });

  it("survives garbage", () => {
    const s = cleanAiSheet("not json at all");
    expect(s.name).toBe("");
    expect(s.classes).toEqual([]);
    expect(cleanAiSheet(null).attacks).toEqual([]);
  });
});

describe("turning sheet attacks into app attacks", () => {
  const scores = { STR: 12, DEX: 17 }; // STR +1, DEX +3
  const weapons: Record<string, LibWeapon> = {
    longbow: { name: "Longbow", damage: "1d8", type: "Piercing", props: ["Ammunition", "Heavy", "Two-Handed"], range: { normal: 150, long: 600 } },
    dagger: { name: "Dagger", damage: "1d4", type: "Piercing", props: ["Finesse", "Light", "Thrown"], range: { normal: 20, long: 60 } },
  };
  const weapon = (n: string) => weapons[n.toLowerCase().replace(/\s*\+\d/, "")] ?? null;
  const isSpell = (n: string) => ["fire bolt", "sacred flame"].includes(n.toLowerCase());

  it("equips library weapons instead of copying them, and keeps magic bonuses", () => {
    const r = buildAttacks([
      { name: "Longbow", bonus: 5, damage: "1d8+3", damageType: "piercing", notes: "" },
      { name: "Dagger +1", bonus: 6, damage: "1d4+4", damageType: "piercing", notes: "" },
      { name: "Fire Bolt", bonus: 5, damage: "1d10", damageType: "fire", notes: "" },
      { name: "Claws", bonus: 3, damage: "1d6+1 slashing", damageType: "slashing", notes: "" },
    ], { scores, prof: 2, isSpell, weapon });
    expect(r.equip).toEqual(["Longbow", "Dagger"]);
    expect(r.skipped).toEqual(["Fire Bolt"]);
    expect(r.attacks).toEqual([
      { name: "Dagger +1", kind: "weapon", damage: "1d4+1", damage_type: "piercing", ability: "finesse", add_mod: true, bonus: 1, range: "20/60 ft" },
      { name: "Claws", kind: "weapon", damage: "1d6", damage_type: "slashing", ability: "STR", add_mod: true },
    ]);
  });

  it("puts spells the library doesn't have into a note", () => {
    const f = buildFeatures([{ name: "Rage", description: "Big." }], { spells: ["Toll the Dead"], classes: ["Artificer 5"] });
    expect(f.map((x) => x.name)).toEqual(["Rage", "Spells not in the app's library", "Classes the app doesn't have yet"]);
    expect(f[0].source).toBe("From your sheet");
  });
});
