import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { readPdfFields } from "../sheet-import/read-pdf";
import { fieldsToSheet, sheetScore } from "../sheet-import/parse";
import { BLANK, FIELD, readClass, spellLines, spellsText, SPELL_LINES, type PrintData } from "./fields";
import { makeSheetPdf } from "./make-pdf";

const font = (n: string) => readFileSync(join(__dirname, "../../public/fonts", n));
const FONTS = { regular: font("sheet-lato-regular.ttf"), bold: font("sheet-lato-bold.ttf"), heading: font("sheet-spectral-bold.ttf") };

const KAZAR: PrintData = {
  ...BLANK, id: "11111111-2222-3333-4444-555555555555", name: "Kazar Čvorović", player: "Đorđe", species: "Leonin", background: "Outlander",
  alignment: "Chaotic Neutral", rules: "2014",
  classes: [{ class: "Barbarian", subclass: "Path of the Wild Soul", level: 9 }, { class: "Fighter", subclass: "", level: 1 }],
  scores: { STR: 19, DEX: 15, CON: 20, INT: 9, WIS: 11, CHA: 12 }, saves: ["STR", "CON"], skills: ["Athletics", "Intimidation", "Perception", "Survival"], expertise: [],
  hpMax: 112, ac: 22, speed: 45, prof: 4, init: 2, passive: 14, hitDice: "9d12 + 1d10",
  // WIS save +1 is a Cloak of Protection the app only knows as a number
  saveTotals: { STR: 8, DEX: 2, CON: 9, INT: -1, WIS: 1, CHA: 1 }, skillTotals: { Athletics: 8, Intimidation: 5, Perception: 4, Survival: 4, Stealth: 2 },
  attacks: [
    { name: "Morningstar", bonus: "+8", damage: "1d8+4 piercing", notes: "" },
    { name: "Javelin", bonus: "+8", damage: "1d6+4 piercing", notes: "30/120 ft" },
    { name: "Arcane Rebuke", bonus: "DC 17", damage: "3d6 force", notes: "CON save · reaction" },
  ],
  equipment: [{ name: "Morningstar", qty: 1, equipped: true }, { name: "Javelin", qty: 4, equipped: false }],
  coins: { pp: 0, gp: 152, ep: 0, sp: 7, cp: 0 }, uses: ["Rage 4 / long rest"],
  features: [{ name: "Rage", text: "On your turn, you can enter a rage as a bonus action." }, { name: "Wild Surge", text: "Roll on the Wild Surge table.\nThen apply it." }],
  notes: "Owes Grub 5 gp.",
};

async function roundTrip(d: PrintData, edit?: (doc: PDFDocument) => void) {
  let bytes = await makeSheetPdf(d, FONTS);
  if (edit) { const doc = await PDFDocument.load(bytes); edit(doc); bytes = await doc.save(); }
  const { fields } = await readPdfFields(bytes);
  return fieldsToSheet(fields);
}

describe("our own sheet", () => {
  it("prints and reads back exactly (Serbian letters too)", async () => {
    const s = await roundTrip(KAZAR);
    expect(s).toMatchObject({
      name: "Kazar Čvorović", playerName: "Đorđe", species: "Leonin", background: "Outlander", alignment: "Chaotic Neutral",
      classes: [{ class: "Barbarian", subclass: "Path of the Wild Soul", level: 9 }, { class: "Fighter", subclass: "", level: 1 }],
      scores: KAZAR.scores, saves: ["STR", "CON"], skills: ["Athletics", "Intimidation", "Perception", "Survival"], expertise: [],
      hp: 112, ac: 22, speed: 45, profBonus: 4, characterId: KAZAR.id,
      coins: { pp: 0, gp: 152, ep: 0, sp: 7, cp: 0 },
      equipment: [{ name: "Morningstar", qty: 1 }, { name: "Javelin", qty: 4 }],
      bonuses: { saves: { WIS: 1 } },
    });
    expect(s.attacks).toEqual([
      { name: "Morningstar", bonus: 8, damage: "1d8+4", damageType: "piercing", notes: "" },
      { name: "Javelin", bonus: 8, damage: "1d6+4", damageType: "piercing", notes: "30/120 ft" },
      { name: "Arcane Rebuke", bonus: null, damage: "3d6", damageType: "force", notes: "CON save · reaction · DC 17" },
    ]);
    expect(s.features).toEqual([
      { name: "Rage", description: "On your turn, you can enter a rage as a bonus action." },
      { name: "Wild Surge", description: "Roll on the Wild Surge table. Then apply it." },
      { name: "Alignment", description: "Chaotic Neutral" },
      { name: "Notes", description: "Owes Grub 5 gp." },
    ]);
    expect(sheetScore(s)).toBeGreaterThan(6);
  });

  it("changes made in a PDF app come back: scores, expertise, new totals, spells", async () => {
    const s = await roundTrip({ ...KAZAR, spells: [{ level: 0, name: "Fire Bolt" }, { level: 1, name: "Shield" }, { level: 1, name: "Magic Missile" }] }, (doc) => {
      const f = doc.getForm();
      f.getTextField(FIELD.score("STR")).setText("20");
      f.getCheckBox(FIELD.exp("Athletics")).check();
      f.getTextField(FIELD.skillTotal("Athletics")).setText("+14"); // 5 + 4 + 4 + a +1 magic belt
      f.getTextField(FIELD.init).setText("+5");
      f.getTextField(FIELD.equipment).setText("Morningstar (equipped)\n2 Potion of Healing\nRope ×1");
    });
    expect(s.scores.STR).toBe(20);
    expect(s.expertise).toEqual(["Athletics"]);
    expect(s.spells).toEqual(["Fire Bolt", "Magic Missile", "Shield"]); // a line per spell, by level
    expect(s.bonuses).toEqual({ init: 3, saves: { WIS: 1 }, skills: { Athletics: 1 } });
    expect(s.equipment).toEqual([{ name: "Morningstar", qty: 1 }, { name: "Potion of Healing", qty: 2 }, { name: "Rope", qty: 1 }]);
  });

  it("a blank sheet filled in by hand", async () => {
    const s = await roundTrip(BLANK, (doc) => {
      const f = doc.getForm();
      f.getTextField(FIELD.name).setText("Nella");
      f.getDropdown(FIELD.cls(0)).select("rogue");
      f.getTextField(FIELD.lvl(0)).setText("3");
      f.getDropdown(FIELD.cls(1)).select("Blood Hunter");
      f.getTextField(FIELD.score("DEX")).setText("17");
      f.getCheckBox(FIELD.skill("Stealth")).check();
      f.getTextField(FIELD.atk(0, "bonus")).setText("+5");
      f.getTextField(FIELD.atk(0, "name")).setText("Shortsword");
      f.getTextField(FIELD.atk(0, "damage")).setText("1d6 + 3");
    });
    expect(s).toMatchObject({ name: "Nella", classes: [{ class: "Rogue", level: 3 }], scores: { DEX: 17 }, skills: ["Stealth"], characterId: null, bonuses: {} });
    expect(s.unknownClasses).toEqual(["Blood Hunter 1"]);
    expect(s.attacks[0]).toMatchObject({ name: "Shortsword", bonus: 5, damage: "1d6+3", damageType: "" });
  });

  it("multiclass: classes written in any way players write them", () => {
    expect(readClass("Barbarian", "", "9")).toEqual({ cls: "Barbarian", sub: "", lvl: 9 });
    expect(readClass("barbarian 9", "", "")).toEqual({ cls: "Barbarian", sub: "", lvl: 9 });
    expect(readClass("Fighter (Champion)", "", "3")).toEqual({ cls: "Fighter", sub: "Champion", lvl: 3 });
    expect(readClass("Fighter / Battle Master", "", "")).toEqual({ cls: "Fighter", sub: "Battle Master", lvl: null });
    expect(readClass("Blood Hunter", "", "2").cls).toBeNull();
  });

  it("the spell page: a line per spell, prepared boxes, more spells, written by hand too", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ level: 1, name: `Spell ${String.fromCharCode(65 + i)}` }));
    const { lines, more } = spellLines(many);
    expect(lines[1]).toHaveLength(SPELL_LINES[1]);
    expect(more.map((x) => x.name)).toEqual(["Spell K", "Spell L"]);
    const s = await roundTrip({ ...KAZAR, spells: many, casters: [{ class: "Sorcerer", ability: "CHA", dc: 13, attack: 5 }], spellAbility: "CHA", spellDc: 13, spellAttack: 5 }, (doc) => {
      const f = doc.getForm();
      f.getTextField(FIELD.spell(3, 0)).setText("Fireball (C)");
      f.getCheckBox(FIELD.prep(3, 0)).check();
      f.getDropdown(FIELD.cls(1)).select("Sorcerer");
      f.getTextField(FIELD.lvl(1)).setText("2");
    });
    expect(s.spells).toHaveLength(13);
    expect(s.spells).toContain("Spell L");
    expect(s.spells).toContain("Fireball");
    expect(s.spellAbility).toBe("CHA");
    expect(s.classes.map((c) => `${c.class} ${c.level}`)).toEqual(["Barbarian 9", "Sorcerer 2"]);
  });

  it("spells text: one line per level", () => {
    expect(spellsText([{ level: 1, name: "Shield" }, { level: 0, name: "Light" }, { level: 1, name: "Sleep" }])).toBe("Cantrips: Light\nLevel 1: Shield, Sleep");
  });
});
