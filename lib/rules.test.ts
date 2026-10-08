import { describe, expect, it } from "vitest";
import fixture from "./test-fixtures/srd-fixture.json";
import {
  abilityMod, allOptions, attackBonus, damageExpression, initiative, lowestFreeSlot, optionButtonLabel, planRoll,
  profBonus, saveBonus, skillBonus, spellSaveDC, type SheetCharacter, type SpellInfo,
} from "./rules";

// The Ashen Crown party, exactly as supabase/04 + 05 store it.
const base = {
  "Brakka Stonehew": { STR: 17, DEX: 14, CON: 16, INT: 8, WIS: 12, CHA: 10, cls: "Barbarian" },
  "Lyra Venn": { STR: 14, DEX: 10, CON: 14, INT: 10, WIS: 16, CHA: 12, cls: "Cleric" },
  Vex: { STR: 8, DEX: 17, CON: 12, INT: 12, WIS: 13, CHA: 14, cls: "Rogue" },
  "Orrin Ashby": { STR: 8, DEX: 14, CON: 12, INT: 17, WIS: 12, CHA: 10, cls: "Wizard" },
} as const;
const library = fixture.spells as unknown as SpellInfo[];
function pc(name: keyof typeof base, level = 3): SheetCharacter {
  const { cls, ...scores } = base[name];
  const p = (fixture.party as Record<string, unknown>)[name] as Omit<SheetCharacter, "ability_scores" | "class_levels">;
  return { ...structuredClone(p), ability_scores: scores, class_levels: [{ class: cls, level }] } as SheetCharacter;
}
const brakka = pc("Brakka Stonehew"), lyra = pc("Lyra Venn"), vex = pc("Vex"), orrin = pc("Orrin Ashby");
const opt = (c: SheetCharacter, name: string) => allOptions(c, library).find((o) => o.name === name)!;

describe("core numbers", () => {
  it("ability modifiers", () => {
    expect([1, 8, 9, 10, 11, 17, 20, 30].map(abilityMod)).toEqual([-5, -1, -1, 0, 0, 3, 5, 10]);
  });
  it("proficiency bonus by level", () => {
    expect([1, 4, 5, 8, 9, 12, 13, 17, 20].map(profBonus)).toEqual([2, 2, 3, 3, 4, 4, 5, 6, 6]);
  });
});

describe("matches the numbers in 06-sample-session-log.json", () => {
  it("initiative bonuses", () => {
    expect([brakka, lyra, vex, orrin].map(initiative)).toEqual([2, 0, 3, 2]);
  });
  it("Vex: Shortbow +5 for 1d6+3, Stealth +7 (expertise)", () => {
    expect(attackBonus(vex, opt(vex, "Shortbow"))).toBe(5);
    expect(damageExpression(vex, opt(vex, "Shortbow"))).toBe("1d6+3");
    expect(skillBonus(vex, "Stealth")).toBe(7);
  });
  it("Brakka: Greataxe +5 for 1d12+3", () => {
    expect(attackBonus(brakka, opt(brakka, "Greataxe"))).toBe(5);
    expect(damageExpression(brakka, opt(brakka, "Greataxe"))).toBe("1d12+3");
  });
  it("Lyra: spell save DC 13, Sacred Flame shows DC 13", () => {
    expect(spellSaveDC(lyra)).toBe(13);
    expect(optionButtonLabel(lyra, opt(lyra, "Sacred Flame"))).toBe("DC 13");
  });
  it("Orrin: Fire Bolt +5 for 1d10, Arcana +5", () => {
    expect(attackBonus(orrin, opt(orrin, "Fire Bolt"))).toBe(5);
    expect(damageExpression(orrin, opt(orrin, "Fire Bolt"))).toBe("1d10");
    expect(skillBonus(orrin, "Arcana")).toBe(5);
  });
});

describe("spells from the library", () => {
  it("known damaging and healing spells appear as options; utility spells too", () => {
    const names = allOptions(orrin, library).map((o) => o.name);
    expect(names).toEqual(expect.arrayContaining(["Fire Bolt", "Ray of Frost", "Magic Missile", "Burning Hands", "Shatter", "Scorching Ray", "Shield", "Dagger"]));
  });
  it("Healing Word heals 2d4 + WIS + Disciple of Life (2 + slot level)", () => {
    expect(damageExpression(lyra, opt(lyra, "Healing Word"), 1)).toBe("2d4+6");
    expect(damageExpression(lyra, opt(lyra, "Healing Word"), 2)).toBe("4d4+7");
  });
  it("Cure Wounds upcast: +2d8 per slot level", () => {
    expect(damageExpression(lyra, opt(lyra, "Cure Wounds"), 2)).toBe("4d8+7");
  });
  it("Magic Missile at level 2 = 4 darts", () => {
    expect(damageExpression(orrin, opt(orrin, "Magic Missile"), 2)).toBe("4d4+4");
  });
  it("cantrips grow at level 5 and 11", () => {
    const o5 = pc("Orrin Ashby", 5), o11 = pc("Orrin Ashby", 11);
    expect(damageExpression(o5, opt(o5, "Fire Bolt"))).toBe("2d10");
    expect(damageExpression(o11, opt(o11, "Fire Bolt"))).toBe("3d10");
  });
  it("lowest free slot skips used levels", () => {
    const o = pc("Orrin Ashby");
    o.spells.slots_used = { "1": 4 };
    expect(lowestFreeSlot(o, 1)).toBe(2);
    o.spells.slots_used = { "1": 4, "2": 2 };
    expect(lowestFreeSlot(o, 1)).toBe(null);
  });
});

describe("other rules", () => {
  it("finesse uses the better of STR and DEX", () => {
    expect(attackBonus(vex, opt(vex, "Shortsword"))).toBe(5);
  });
  it("saving throws add proficiency only when proficient", () => {
    expect(saveBonus(brakka, "STR")).toBe(5);
    expect(saveBonus(brakka, "DEX")).toBe(2);
  });
});

describe("planRoll", () => {
  it("weapon attack, then its damage", () => {
    expect(planRoll(vex, { kind: "use", key: "atk:Shortbow" }, library)).toMatchObject({ rollType: "attack", expression: "1d20+5", followUp: true });
    expect(planRoll(vex, { kind: "damage", key: "atk:Shortbow" }, library)).toMatchObject({ rollType: "damage", expression: "1d6+3" });
  });
  it("casting a levelled spell spends the lowest free slot", () => {
    expect(planRoll(lyra, { kind: "use", key: "spell:Healing Word" }, library)).toMatchObject({ rollType: "heal", expression: "2d4+6", spellSlot: 1 });
    expect(planRoll(lyra, { kind: "use", key: "spell:Healing Word", slot: 2 }, library)).toMatchObject({ expression: "4d4+7", spellSlot: 2 });
  });
  it("save spells log the DC, then damage at the same slot", () => {
    expect(planRoll(orrin, { kind: "use", key: "spell:Shatter" }, library)).toMatchObject({ rollType: "save_dc", dc: 13, ability: "CON", spellSlot: 2, followUp: true });
    expect(planRoll(orrin, { kind: "damage", key: "spell:Shatter", slot: 2 }, library)).toMatchObject({ expression: "3d8", spellSlot: 2 });
  });
  it("utility spells and boosts are logged without dice", () => {
    expect(planRoll(lyra, { kind: "use", key: "spell:Bless" }, library)).toMatchObject({ rollType: "other", expression: "", spellSlot: 1 });
    expect(planRoll(brakka, { kind: "use", key: "atk:Rage" }, library)).toMatchObject({ rollType: "other", resource: "Rage" });
  });
  it("Sneak Attack rolls its dice", () => {
    expect(planRoll(vex, { kind: "use", key: "atk:Sneak Attack" }, library)).toMatchObject({ rollType: "damage", expression: "2d6" });
  });
  it("refuses impossible requests", () => {
    const o = pc("Orrin Ashby");
    o.spells.slots_used = { "1": 4, "2": 2 };
    expect(() => planRoll(o, { kind: "use", key: "spell:Magic Missile" }, library)).toThrow(/No spell slots/);
    expect(() => planRoll(orrin, { kind: "use", key: "spell:Shatter", slot: 1 }, library)).toThrow(/too low/);
    expect(() => planRoll(vex, { kind: "skill", skill: "Hacking" }, library)).toThrow();
    expect(() => planRoll(vex, { kind: "use", key: "atk:Laser" }, library)).toThrow();
  });
});
