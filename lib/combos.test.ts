import { describe, expect, it } from "vitest";
import fixture from "./test-fixtures/srd-fixture.json";
import { bestMoves, failChance, findCombos, hitChances } from "./combos";
import { allOptions, type SheetCharacter, type SpellInfo } from "./rules";

const library = fixture.spells as unknown as SpellInfo[];
const scores = {
  "Brakka Stonehew": [{ STR: 17, DEX: 14, CON: 16, INT: 8, WIS: 12, CHA: 10 }, "Barbarian"],
  "Lyra Venn": [{ STR: 14, DEX: 10, CON: 14, INT: 10, WIS: 16, CHA: 12 }, "Cleric"],
  Vex: [{ STR: 8, DEX: 17, CON: 12, INT: 12, WIS: 13, CHA: 14 }, "Rogue"],
  "Orrin Ashby": [{ STR: 8, DEX: 14, CON: 12, INT: 17, WIS: 12, CHA: 10 }, "Wizard"],
} as const;
function pc(name: keyof typeof scores): SheetCharacter {
  const p = (fixture.party as Record<string, unknown>)[name] as object;
  return { ...structuredClone(p), ability_scores: scores[name][0], class_levels: [{ class: scores[name][1], level: 3 }] } as SheetCharacter;
}
const target = { ac: 13, saveBonus: 2, allyAdjacent: false };
const moves = (name: keyof typeof scores, t = target) => {
  const c = pc(name);
  return bestMoves(c, allOptions(c, library), t);
};

describe("probability helpers", () => {
  it("hit chance (+5 vs AC 13 = 65%), advantage, limits", () => {
    expect(hitChances(5, 13, false).hit).toBeCloseTo(0.65);
    expect(hitChances(5, 13, true).hit).toBeCloseTo(1 - 0.35 ** 2);
    expect(hitChances(0, 30, false).hit).toBe(0.05); // natural 20 always hits
    expect(hitChances(20, 5, false).hit).toBe(0.95); // natural 1 always misses
  });
  it("chance to fail a DC 13 save with +2 = 50%", () => {
    expect(failChance(13, 2)).toBeCloseTo(0.5);
  });
});

describe("best moves for the party", () => {
  it("Brakka: Rage + Reckless Attack + Frenzy + Greataxe beats a plain swing", () => {
    const m = moves("Brakka Stonehew");
    expect(m.bestDamage!.title).toBe("Rage + Reckless Attack + Frenzy + Greataxe");
    expect(m.bestDamage!.costs).toContain("1 Rage");
    // hit 87.75% × (6.5+3+2+7) + crit 9.75% × (6.5+7) ≈ 17.55
    expect(m.bestDamage!.damage).toBeCloseTo(0.8775 * 18.5 + 0.0975 * 13.5, 1);
    expect(m.bestFree!.title).toBe("Reckless Attack + Greataxe"); // no Rage spent
    expect(m.bestHeal).toBeNull();
  });
  it("Vex: Steady Aim unlocks Sneak Attack with advantage", () => {
    const m = moves("Vex");
    expect(m.bestDamage!.title).toMatch(/^Sneak Attack \+ Steady Aim \+ (Shortbow|Shortsword)$/);
    expect(m.bestDamage!.costs).toEqual([]); // costs nothing but the bonus action
  });
  it("Vex: with an ally next to the target, Sneak Attack works without Steady Aim", () => {
    const c = pc("Vex");
    const combos = findCombos(c, allOptions(c, library), { ...target, allyAdjacent: true });
    expect(combos.some((x) => x.title === "Sneak Attack + Shortbow")).toBe(true);
    expect(findCombos(c, allOptions(c, library), target).some((x) => x.title === "Sneak Attack + Shortbow")).toBe(false);
  });
  it("Orrin: a level-2 spell is the biggest hit, Fire Bolt is the best free move", () => {
    const m = moves("Orrin Ashby");
    expect(["Shatter", "Scorching Ray", "Magic Missile"]).toContain(m.bestDamage!.title);
    expect(m.bestFree!.title).toBe("Fire Bolt");
    // Potent Cantrip: a miss still does half → 0.65×5.5 + 0.05×5.5 + 0.35×2.75
    expect(m.bestFree!.damage).toBeCloseTo(0.65 * 5.5 + 0.05 * 5.5 + 0.35 * 2.75, 2);
  });
  it("Lyra: biggest heal = Preserve Life (action) + Healing Word (bonus action)", () => {
    const m = moves("Lyra Venn");
    expect(m.bestHeal!.title).toBe("Preserve Life + Healing Word");
    expect(m.bestHeal!.heal).toBeCloseTo(15 + 5 + 6, 5); // 15 + (2d4 avg 5 + WIS 3 + Disciple of Life 3)
    expect(m.bestHeal!.costs).toEqual(expect.arrayContaining(["level 1 slot", "1 Channel Divinity"]));
  });
  it("Lyra: heal + damage in one turn is also found", () => {
    const c = (() => { const x = moves("Lyra Venn"); return x; })();
    expect(c.bestHeal).not.toBeNull();
    const lyraC = pc("Lyra Venn");
    const combos = findCombos(lyraC, allOptions(lyraC, library), target);
    const both = combos.find((x) => x.title === "Sacred Flame + Healing Word")!;
    expect(both.heal).toBeCloseTo(11, 5);
    expect(both.damage).toBeCloseTo(4.5 * 0.5, 5); // 1d8 × 50% fail chance
  });
  it("never two slot spells in one turn (2024 rule)", () => {
    const c = pc("Lyra Venn");
    const combos = findCombos(c, allOptions(c, library), target);
    expect(combos.some((x) => x.title === "Guiding Bolt + Healing Word")).toBe(false);
  });
  it("respects empty spell slots", () => {
    const c = pc("Orrin Ashby");
    c.spells.slots_used = { "1": 4, "2": 2 };
    const m = bestMoves(c, allOptions(c, library), target);
    expect(m.bestDamage!.title).toBe("Fire Bolt");
  });
});
