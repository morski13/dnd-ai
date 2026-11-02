import { describe, expect, it } from "vitest";
import { roll } from "./dice";
import { autoCrit, cleanHomebrew, critRules } from "./homebrew";
import { planRoll, type SheetCharacter } from "./rules";

// a die that always rolls the same face, so totals are exact
const fixed = (v: number) => () => v;

describe("critical hits", () => {
  it("the rules: damage dice twice, Brutal Critical dice once, modifier once", () => {
    const r = roll("1d8+4", { critical: true, critExtra: "1d8", rng: fixed(5) });
    expect(r.expression).toBe("2d8+4+1d8");
    expect(r.total).toBe(5 * 3 + 4);
    expect(r.doubled).toBeUndefined();
  });

  it("house rule: dice once (Brutal Critical too), then what the dice rolled counts twice; modifier once", () => {
    const r = roll("1d8+4", { critical: true, critExtra: "1d8", critMode: "double", rng: fixed(5) });
    expect(r.expression).toBe("1d8+4+1d8");
    expect(r.dice).toEqual([5, 5]);
    expect(r.total).toBe((5 + 5) * 2 + 4);
    expect(r.doubled).toBe(true);
    // not a crit: nothing changes
    expect(roll("1d8+4", { critMode: "double", rng: fixed(5) }).total).toBe(9);
  });

  it("Brutal Critical from the sheet's features counts in a 2024 game", () => {
    const kazar = [{ class: "Barbarian", level: 9 }, { class: "Fighter", level: 1 }];
    expect(autoCrit(kazar, "2024").extra).toBe(0);
    expect(autoCrit(kazar, "2024", [{ name: "Brutal Critical (1 die)" }]).extra).toBe(1);
    expect(autoCrit([{ class: "Barbarian", level: 13 }], "2024", ["Brutal Critical"]).extra).toBe(2);
    expect(autoCrit([{ class: "Fighter", level: 5 }], "2024", ["Brutal Critical"]).extra).toBe(1); // has it, no barbarian levels
  });

  it("the character's choice is saved and reaches the damage roll", () => {
    expect(cleanHomebrew({ crit_mode: "double" }).crit_mode).toBe("double");
    expect(cleanHomebrew({ crit_mode: "nonsense" }).crit_mode).toBeUndefined();
    const c = {
      ability_scores: { STR: 19 }, class_levels: [{ class: "Barbarian", level: 9 }], rule_set: "2024",
      proficiencies: {}, spells: {}, features: ["Brutal Critical"], homebrew: { crit_mode: "double" },
      attacks: [{ name: "Morningstar", kind: "weapon", ability: "STR", damage: "1d8", add_mod: true }],
    } as SheetCharacter & { features: string[] };
    expect(critRules(c)).toMatchObject({ mode: "double", extra: 1 });
    expect(planRoll(c, { kind: "damage", key: "atk:Morningstar" })).toMatchObject({ expression: "1d8+4", critExtra: "1d8", critMode: "double" });
  });
});
