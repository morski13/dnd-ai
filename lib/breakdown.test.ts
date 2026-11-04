import { describe, expect, it } from "vitest";
import { damageParts, hitDieLine, howTotal } from "./breakdown";
import { roll } from "./dice";
import { allOptions, type SheetCharacter } from "./rules";

const seq = (...v: number[]) => { let i = 0; return () => v[i++]; };

describe("how the total was reached", () => {
  it("damage with named parts", () => {
    const r = roll("1d8+2d6+4", { rng: seq(6, 3, 5) });
    expect(howTotal(r, [{ label: "STR", value: 4 }])).toBe("1d8 (6) + 2d6 (3 + 5) + 4 STR = 18");
    // parts that don't add up: the plain number
    expect(howTotal(r, [{ label: "STR", value: 3 }])).toBe("1d8 (6) + 2d6 (3 + 5) + 4 = 18");
  });
  it("advantage shows the dropped die", () => {
    const r = roll("1d20+5", { advantage: "advantage", rng: seq(4, 9) });
    expect(howTotal(r)).toBe("d20 (9, 4 dropped) + 5 = 14");
  });
  it("crits: dice twice, or doubled by the house rule", () => {
    expect(howTotal(roll("1d8+4", { critical: true, rng: seq(6, 2) }))).toBe("2d8 (6 + 2) + 4 = 12");
    expect(howTotal(roll("1d8+4", { critical: true, critMode: "double", rng: seq(6) }))).toBe("(1d8 (6)) ×2 + 4 = 16");
  });
  it("nothing to explain", () => {
    expect(howTotal(roll("1d20", { rng: seq(14) }))).toBeNull();
    expect(howTotal({ expression: "", dice: [], diceAll: [], modifier: 0, total: null })).toBeNull();
  });
  it("parts from the sheet match damageExpression", () => {
    const c: SheetCharacter = {
      ability_scores: { STR: 19, DEX: 15, CON: 20, INT: 9, WIS: 11, CHA: 12 }, class_levels: [{ class: "Fighter", level: 3 }],
      proficiencies: {}, spells: {}, attacks: [{ name: "Longsword +1", kind: "weapon", ability: "STR", damage: "1d8", add_mod: true, bonus: 1 }],
    };
    const o = allOptions(c, [])[0];
    expect(damageParts(c, o)).toEqual([{ label: "STR", value: 4 }, { label: "magic weapon", value: 1 }]);
    expect(howTotal(roll("1d8+5", { rng: seq(7) }), damageParts(c, o))).toBe("1d8 (7) + 4 STR + 1 magic weapon = 12");
  });
  it("hit dice", () => {
    expect(hitDieLine({ die: 10, dice: [6], total: 9 }, 3)).toBe("d10 (6) + 3 CON = 9");
    expect(hitDieLine({ die: 8, dice: [2, 5], total: 11 }, 2)).toBe("2d8 (2 + 5) + 4 CON = 11");
  });
});
