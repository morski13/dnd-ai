import { describe, expect, it } from "vitest";
import { averageHp, classResources, spellSlots } from "./classes";
import { hitDiceLeft, longRest, shortRest, type RestState } from "./rests";

const brakka: RestState = {
  class_levels: [{ class: "Barbarian", level: 3 }], hp_max: 35, hp_current: 10, temp_hp: 4,
  resources: [{ name: "Rage", max: 3, used: 2, recharge: "long rest" }, { name: "Second Wind", max: 2, used: 1, recharge: "short rest" }],
  spells: {}, hit_dice_used: {}, rule_set: "2024",
};

describe("rests", () => {
  it("knows the hit dice left, by size", () => {
    expect(hitDiceLeft({ class_levels: [{ class: "Fighter", level: 2 }, { class: "Wizard", level: 1 }], hit_dice_used: { 10: 1 } }))
      .toEqual([{ die: 10, total: 2, left: 1 }, { die: 6, total: 1, left: 1 }]);
  });

  it("short rest: hit dice heal (die + CON, at least 1), short-rest things come back, long-rest things don't", () => {
    const r = shortRest(brakka, [{ die: 12, roll: 7 }, { die: 12, roll: 1 }], -2);
    expect(r.healed).toBe(5 + 1);
    expect(r.hp_current).toBe(16);
    expect(r.hit_dice_used).toEqual({ 12: 2 });
    expect(r.resources.map((x) => x.used)).toEqual([2, 0]);
  });

  it("short rest never heals past max", () => {
    expect(shortRest({ ...brakka, hp_current: 33 }, [{ die: 12, roll: 12 }], 3).hp_current).toBe(35);
  });

  it("warlock pact slots come back on a short rest, other slots don't", () => {
    const s = { ...brakka, spells: { slots: { 1: 2, 2: 2 }, slots_used: { 1: 2, 2: 2 }, pact_level: 2, pact_slots: 2 } };
    expect(shortRest(s, [], 0).spells.slots_used).toEqual({ 1: 2, 2: 0 });
  });

  it("long rest: everything back; 2024 all hit dice, 2014 half (at least 1)", () => {
    const tired = { ...brakka, hit_dice_used: { 12: 3 } };
    const r = longRest(tired);
    expect(r).toMatchObject({ hp_current: 35, temp_hp: 0, hit_dice_used: {}, spells: { slots_used: {} } });
    expect(r.resources.every((x) => x.used === 0)).toBe(true);
    expect(longRest({ ...tired, rule_set: "2014" }).hit_dice_used).toEqual({ 12: 2 });
    expect(longRest({ ...tired, class_levels: [{ class: "Barbarian", level: 1 }], hit_dice_used: { 12: 1 }, rule_set: "2014" }).hit_dice_used).toEqual({});
  });
});

describe("classes", () => {
  it("HP: full die at level 1, then average + CON", () => {
    expect(averageHp([{ class: "Barbarian", level: 3 }], 16)).toBe(12 + 3 + 7 + 3 + 7 + 3);
    expect(averageHp([{ class: "Wizard", level: 1 }], 8)).toBe(5);
  });
  it("spell slots: full, half (2014 none at level 1), warlock pact", () => {
    expect(spellSlots([{ class: "Wizard", level: 5 }], "2024").slots).toEqual({ 1: 4, 2: 3, 3: 2 });
    expect(spellSlots([{ class: "Paladin", level: 1 }], "2024").slots).toEqual({ 1: 2 });
    expect(spellSlots([{ class: "Paladin", level: 1 }], "2014").slots).toEqual({});
    expect(spellSlots([{ class: "Warlock", level: 5 }], "2024")).toEqual({ slots: { 3: 2 }, pact: { level: 3, count: 2 } });
  });
  it("class resources by level and rules", () => {
    const s = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 16 };
    expect(classResources([{ class: "Fighter", level: 2 }], s, "2024").map((r) => `${r.name} ${r.max}`)).toEqual(["Second Wind 2", "Action Surge 1"]);
    expect(classResources([{ class: "Fighter", level: 2 }], s, "2014")[0].max).toBe(1);
    expect(classResources([{ class: "Bard", level: 1 }], s, "2024")[0]).toMatchObject({ name: "Bardic Inspiration", max: 3, recharge: "long rest" });
  });
});
