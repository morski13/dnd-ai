import { describe, expect, test } from "vitest";
import { afterUse, atTurnStart, bestMoves, cleanState, featuresOf, multiList, NO_STATE, usable, type Foe } from "./monster";

const dragon = {
  name: "Young Red Dragon", ac: 18, hp: 178, init: 0, legendary_uses: 3,
  actions: [
    { name: "Multiattack", kind: "multiattack", count: 3 },
    { name: "Bite", kind: "attack", bonus: 10, damage: "2d10+6", damage_type: "piercing" },
    { name: "Claw", kind: "attack", bonus: 10, damage: "2d6+6", damage_type: "slashing" },
    { name: "Fire Breath", kind: "save", save_ability: "DEX", dc: 17, damage: "16d6", damage_type: "fire", half: true, targets: 2, recharge: 5 },
  ],
  multiattack: { count: 3, uses: ["Bite", "Claw"] },
};

const foe = (o: Partial<Foe>): Foe => ({ id: "c1", characterId: "ch1", name: "Ana", ac: 16, hp: 40, max: 40, conds: [], dist: 5, concentrating: null, saves: { DEX: 2 }, near: 0, ...o });

describe("monster features", () => {
  test("multiattack: one of each, the rest with the last", () => {
    const f = featuresOf(dragon);
    expect(f.multi).toEqual(["Bite", "Claw", "Claw"]);
    expect(multiList({ count: 2, uses: ["Scimitar"] }, f.attacks)).toEqual(["Bite", "Bite"]); // not one of its attacks: its first
    expect(multiList({ count: 2, uses: ["Bite"] }, f.attacks)).toEqual(["Bite", "Bite"]);
    expect(f.legendary).toBe(3);
  });
  test("recharge and per day", () => {
    const f = featuresOf(dragon);
    const breath = f.saves[0];
    const used = afterUse(breath, NO_STATE);
    expect(usable(breath, used).ok).toBe(false);
    expect(atTurnStart(used, f.saves, () => 4).spent).toEqual(["Fire Breath"]);
    const back = atTurnStart({ ...used, legendaryUsed: 2 }, f.saves, () => 5);
    expect(back.spent).toEqual([]);
    expect(back.legendaryUsed).toBe(0);
    expect(back.note).toMatch(/back/);
    const daily = { name: "Web", kind: "save", per_day: 2 };
    const twice = afterUse(daily, afterUse(daily, NO_STATE));
    expect(usable(daily, twice).ok).toBe(false);
    expect(cleanState({ spent: ["x"], perDay: { Web: 2 }, legendaryUsed: 9 }).legendaryUsed).toBe(9);
  });
});

describe("best moves", () => {
  const f = featuresOf(dragon);
  test("goes for the foe it can drop, and says why", () => {
    const moves = bestMoves(f, { ...NO_STATE, spent: ["Fire Breath"] }, [foe({}), foe({ id: "c2", name: "Bo", hp: 12, max: 40 })], { name: "Dragon", conds: [], reach: 10 }, "2024");
    expect(moves[0].title).toMatch(/Bo/);
    expect(moves[0].reasons.join(" ")).toMatch(/could drop Bo/);
  });
  test("a paralyzed foe next to it: every hit is critical", () => {
    const moves = bestMoves(f, { ...NO_STATE, spent: ["Fire Breath"] }, [foe({ conds: ["Paralyzed"] })], { name: "Dragon", conds: [], reach: 10 }, "2024");
    expect(moves[0].reasons.join(" ")).toMatch(/critical/);
    expect(moves.some((m) => m.save)).toBe(false); // the breath is recharging
  });
  test("breath on a cluster beats biting one", () => {
    const moves = bestMoves(f, NO_STATE, [foe({ hp: 200, max: 200, near: 3 })], { name: "Dragon", conds: [], reach: 10 }, "2024");
    expect(moves[0].save).toBe("Fire Breath");
    expect(moves[0].reasons.join(" ")).toMatch(/catches 4/);
  });
  test("out of reach: move first", () => {
    const moves = bestMoves(f, { ...NO_STATE, spent: ["Fire Breath"] }, [foe({ dist: 40 })], { name: "Dragon", conds: [], reach: 10 }, "2024");
    expect(moves[0].reasons.join(" ")).toMatch(/move first/);
  });
});
