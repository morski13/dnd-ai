import { describe, expect, it } from "vitest";
import { roll } from "./dice";
import { autoCrit, cleanCustomAction, cleanHomebrew, critRules } from "./homebrew";
import { damageExpression, planRoll, type SheetCharacter } from "./rules";

const kazar = (homebrew = {}, rule_set: "2014" | "2024" = "2014"): SheetCharacter => ({
  ability_scores: { STR: 19, DEX: 15, CON: 20, INT: 9, WIS: 11, CHA: 12 },
  class_levels: [{ class: "Barbarian", subclass: "Path of the Wild Soul", level: 10 }, { class: "Fighter", subclass: "Champion", level: 3 }],
  proficiencies: { saves: ["STR", "CON"] },
  spells: { ability: "STR" },
  attacks: [
    { name: "Morningstar", kind: "weapon", damage: "1d8", damage_type: "piercing", ability: "STR", add_mod: true },
    { name: "Flaming Tongue", kind: "weapon", damage: "2d6", damage_type: "slashing", ability: "STR", add_mod: true },
    { name: "Javelin", kind: "weapon", damage: "1d6", damage_type: "piercing", ability: "STR", add_mod: true, ranged: true },
  ],
  homebrew, rule_set,
});

describe("a character's own rules", () => {
  it("works out Improved Critical and Brutal Critical from the classes", () => {
    expect(autoCrit(kazar().class_levels, "2014")).toEqual({ range: 19, extra: 1 });
    expect(autoCrit(kazar().class_levels, "2024")).toEqual({ range: 19, extra: 0 });
    expect(autoCrit([{ class: "Fighter", subclass: "Champion", level: 15 }, { class: "Barbarian", level: 17 }], "2014")).toEqual({ range: 18, extra: 3 });
    expect(critRules(kazar({ crit_range: 20, extra_crit_dice: 2 }))).toMatchObject({ range: 20, extra: 2 });
  });

  it("puts the crit range on attacks and Brutal Critical dice on melee damage only", () => {
    expect(planRoll(kazar(), { kind: "use", key: "atk:Morningstar" }).critOn).toBe(19);
    expect(planRoll(kazar(), { kind: "damage", key: "atk:Morningstar" }).critExtra).toBe("1d8");
    expect(planRoll(kazar(), { kind: "damage", key: "atk:Javelin" }).critExtra).toBeUndefined();
  });

  it("a toggle adds its dice and damage type to the weapon it works on", () => {
    const off = kazar({ toggles: [{ id: "t", name: "Ignited", on: false, applies_to: "Flaming Tongue", damage: "2d6", damage_type: "fire" }] });
    const on = kazar({ toggles: [{ id: "t", name: "Ignited", on: true, applies_to: "Flaming Tongue", damage: "2d6", damage_type: "fire" }] });
    expect(damageExpression(off, off.attacks[1])).toBe("2d6+4");
    expect(damageExpression(on, on.attacks[1])).toBe("4d6+4");
    expect(damageExpression(on, on.attacks[0])).toBe("1d8+4");
    expect(planRoll(on, { kind: "damage", key: "atk:Flaming Tongue" }).damageType).toBe("slashing + fire");
  });

  it("dice: a 19 crits with critOn 19, and crit extra dice are not doubled", () => {
    const nineteen = () => 19;
    expect(roll("1d20+8", { critOn: 19, rng: nineteen }).isCrit).toBe(true);
    expect(roll("1d20+8", { rng: nineteen }).isCrit).toBe(false);
    const r = roll("1d8+4", { critical: true, critExtra: "1d8", rng: () => 1 });
    expect(r.dice).toHaveLength(3); // 2 doubled + 1 Brutal Critical
    expect(r.total).toBe(7);
  });

  it("cleans custom actions and toggles from the browser", () => {
    expect(cleanCustomAction({ name: "Wild Surge", kind: "damage_only", damage: "1d10", damage_type: "necrotic", resource: "Rage", action: "free" }, ["Rage"]))
      .toEqual({ name: "Wild Surge", kind: "damage_only", custom: true, action: "free", damage: "1d10", damage_type: "necrotic", resource: "Rage", add_mod: false });
    expect(cleanCustomAction({ name: "Bad", kind: "damage_only", damage: "lots" }, [])).toHaveProperty("error");
    expect(cleanCustomAction({ name: "X", kind: "weapon", damage: "1d6", resource: "Ki" }, ["Rage"])).not.toHaveProperty("resource");
    expect(cleanHomebrew({ crit_range: 3, toggles: [{ name: "A", damage: "2d6" }, { name: "B", damage: "fire" }] }))
      .toMatchObject({ crit_range: 15, toggles: [{ name: "A", damage: "2d6", applies_to: "*" }] });
  });
});
