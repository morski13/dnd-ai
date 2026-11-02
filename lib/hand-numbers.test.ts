import { describe, expect, it } from "vitest";
import { cleanBonuses, cleanHomebrew } from "./homebrew";
import { initiative, pb, planRoll, saveBonus, SKILLS, skillBonus, spellAttackBonus, spellSaveDC, type SheetCharacter } from "./rules";

const pip = (bonuses?: object): SheetCharacter => ({
  ability_scores: { STR: 8, DEX: 16, CON: 12, INT: 14, WIS: 10, CHA: 10 },
  class_levels: [{ class: "Wizard", level: 5 }],
  proficiencies: { saves: ["INT", "WIS"], skills: ["Arcana"], expertise: [] },
  spells: { ability: "INT" }, attacks: [],
  homebrew: bonuses ? { bonuses } : {},
});

describe("numbers set by hand (Edit numbers)", () => {
  it("without anything set, the worked-out numbers", () => {
    const c = pip();
    expect([pb(c), initiative(c), saveBonus(c, "INT"), skillBonus(c, "Arcana"), spellSaveDC(c), spellAttackBonus(c)]).toEqual([3, 3, 5, 5, 13, 5]);
  });

  it("extras add on top, a fixed proficiency bonus replaces the level's", () => {
    const c = pip({ prof: 4, init: 2, saves: { INT: 1, CON: 1 }, skills: { Arcana: 1, Stealth: -1 }, spell_dc: 1, spell_attack: 2 });
    expect(pb(c)).toBe(4);
    expect(initiative(c)).toBe(5);
    expect(saveBonus(c, "INT")).toBe(2 + 4 + 1);
    expect(saveBonus(c, "CON")).toBe(1 + 0 + 1);
    expect(skillBonus(c, "Arcana")).toBe(2 + 4 + 1);
    expect(skillBonus(c, "Stealth")).toBe(3 - 1);
    expect(spellSaveDC(c)).toBe(8 + 2 + 4 + 1);
    expect(spellAttackBonus(c)).toBe(2 + 4 + 2);
    // the server's rolls use the same numbers
    expect(planRoll(c, { kind: "initiative" }).expression).toBe("1d20+5");
    expect(planRoll(c, { kind: "save", ability: "INT" }).expression).toBe("1d20+7");
  });

  it("cleaning: whole numbers in range, zeros and unknown skills dropped, prof only when given", () => {
    expect(cleanBonuses({ prof: "", init: "0", saves: { STR: "2.6", XYZ: 3 }, skills: { Arcana: 99, Flying: 2 }, spell_dc: -40 }, Object.keys(SKILLS)))
      .toEqual({ saves: { STR: 3 }, skills: { Arcana: 10 }, spell_dc: -10 });
    expect(cleanBonuses({ prof: 0 }, [])).toEqual({ prof: 0 });
    expect(cleanBonuses(null, [])).toEqual({});
    // cleanHomebrew keeps bonuses (the save actions clean them)
    expect(cleanHomebrew({ bonuses: { init: 1 } }).bonuses).toEqual({ init: 1 });
  });
});
