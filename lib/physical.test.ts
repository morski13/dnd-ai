import { describe, expect, it } from "vitest";
import { roll } from "./dice";
import { replayRng } from "./offline-rolls";
import { diceLabel, diceSides, physicalValues, shapeOf } from "./physical";

const replay = (expr: string, values: number[], opts = {}) => roll(expr, { ...opts, rng: replayRng(values) });

describe("real dice", () => {
  it("an attack: the typed d20 is the natural roll; advantage asks for both", () => {
    expect(shapeOf("1d20+7")).toMatchObject({ d20s: 1, others: [], modifierText: "+7" });
    const v = physicalValues(diceSides("1d20+7"), { d20: [20] });
    if ("error" in v) throw new Error(v.error);
    expect(replay("1d20+7", v.values)).toMatchObject({ total: 27, isCrit: true });
    const adv = diceSides("1d20+7", { advantage: "advantage" });
    expect(adv).toEqual([20, 20]);
    expect(physicalValues(adv, { d20: [5] })).toEqual({ error: "Type both d20s (2)." });
    const v2 = physicalValues(adv, { d20: [5, 14] });
    if ("error" in v2) throw new Error(v2.error);
    expect(replay("1d20+7", v2.values, { advantage: "advantage" }).total).toBe(21);
  });

  it("damage: the dice total is shared over the dice, modifiers added by the app, crits double the dice", () => {
    const sides = diceSides("2d6+4");
    const v = physicalValues(sides, { sum: 9 });
    if ("error" in v) throw new Error(v.error);
    expect(replay("2d6+4", v.values).total).toBe(13);
    expect(physicalValues(sides, { sum: 13 })).toEqual({ error: "2d6 add up to 2–12." });
    const crit = diceSides("1d8+3", { critical: true });
    expect(diceLabel(crit)).toBe("2d8");
    const c = physicalValues(crit, { sum: 15 });
    if ("error" in c) throw new Error(c.error);
    expect(replay("1d8+3", c.values, { critical: true }).total).toBe(18);
  });
});
