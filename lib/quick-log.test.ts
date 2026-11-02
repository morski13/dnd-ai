import { describe, expect, it } from "vitest";
import { planQuick } from "./quick-log";

const kazar = { characterId: "k" }, ogre = { monsterId: "o" };
describe("DM quick log", () => {
  it("an attack that hits saves the attack, its damage and the HP change", () => {
    const p = planQuick({ who: kazar, kind: "attack", label: "Greataxe", number: 17, hit: true, target: ogre, amount: 12 });
    expect(p).toEqual({ rolls: [
      { roll_type: "attack", source: "Greataxe", total: 17, success: true, target: ogre, parent: false },
      { roll_type: "damage", source: "Greataxe", total: 12, success: null, target: ogre, parent: true },
    ], hp: { target: ogre, kind: "damage", amount: 12 } });
  });
  it("a miss has no damage; heals default to yourself; taking damage needs no roll", () => {
    expect(planQuick({ who: kazar, kind: "attack", number: 5, hit: false, target: ogre, amount: 9 })).toMatchObject({ rolls: [{ roll_type: "attack", success: false }], hp: null });
    expect(planQuick({ who: kazar, kind: "heal", amount: 8 })).toMatchObject({ hp: { target: kazar, kind: "heal", amount: 8 } });
    expect(planQuick({ who: kazar, kind: "took", amount: 7 })).toEqual({ rolls: [], hp: { target: kazar, kind: "damage", amount: 7 } });
    expect(planQuick({ who: kazar, kind: "attack" })).toEqual({ error: "Type the attack roll." });
    expect(planQuick({ who: {}, kind: "heal", amount: 3 })).toEqual({ error: "Pick who." });
  });
});
