import { describe, expect, it } from "vitest";
import { luckFrom, luckLabel, rollHistory, withLuck, type RollRow } from "./luck";
import { compile, simulate, type Unit } from "./sim";

const att = (nat: number, expr = "1d20+5"): RollRow => ({ character_id: "a", roll_type: "attack", expression: expr, dice: [nat], dice_all: [nat], total: nat + 5 });
const dmg = (total: number): RollRow => ({ character_id: "a", roll_type: "damage", expression: "1d8+3", dice: [total - 3], dice_all: [total - 3], total });

describe("personal luck", () => {
  it("a new character uses average dice", () => {
    const l = luckFrom(undefined);
    expect(l).toMatchObject({ attackShift: 0, saveShift: 0, dmgMult: 1, rolls: 0 });
    expect(luckLabel(l)).toBe("average dice (no rolls yet)");
  });

  it("average dice until 30 rolls of a kind, then real luck (still pulled towards average)", () => {
    const few = luckFrom(rollHistory(Array.from({ length: 29 }, () => att(18)))["a"]);
    expect(few.attackShift).toBe(0);
    expect(luckLabel(few)).toBe("average dice (29 of 30 rolls)");
    const thirty = luckFrom(rollHistory(Array.from({ length: 30 }, (_, i) => att(i % 2 ? 13 : 14)))["a"]);
    const many = luckFrom(rollHistory(Array.from({ length: 80 }, (_, i) => att(i % 2 ? 13 : 14)))["a"]);
    expect(thirty.attackShift).toBeGreaterThan(0);
    expect(many.attackShift).toBeGreaterThan(thirty.attackShift);
    expect(many.attackShift).toBeLessThanOrEqual(3);
    expect(luckLabel(many)).toMatch(/based on 80 rolls · hits more/);
  });

  it("leaves out advantage rolls and counts damage against the dice average (each kind needs its own 30)", () => {
    const h = rollHistory([att(20, "2d20kh1+5"), dmg(11), dmg(11)])["a"];
    expect(h.attacks).toBe(0);
    expect(h.damage).toBe(2);
    expect(h.damageRatioSum / h.damage).toBeCloseTo(11 / 7.5);
    expect(luckFrom(h).dmgMult).toBe(1); // only 2 damage rolls: average
    const lots = rollHistory([...Array.from({ length: 30 }, () => dmg(11)), ...Array.from({ length: 5 }, () => att(19))])["a"];
    expect(luckFrom(lots).dmgMult).toBeGreaterThan(1);
    expect(luckFrom(lots).attackShift).toBe(0); // 5 attack rolls: still average
  });

  it("lucky dice win more simulated fights", () => {
    const hero: Unit = {
      key: "c:a", name: "Hero", side: "party", isCharacter: true, maxHp: 30, startHp: 30, ac: 15, init: 2,
      saves: { STR: 2, DEX: 2, CON: 2, INT: 0, WIS: 0, CHA: 0 },
      plans: [{ name: "Sword", cost: {}, expected: 8, strikes: [{ kind: "attack", bonus: 5, damage: compile("1d8+3"), targets: 1 }] }],
      heals: [], slots: {}, resources: {},
    };
    const ogre: Unit = { ...hero, key: "m", name: "Ogre", side: "enemy", isCharacter: false, maxHp: 59, startHp: 59, ac: 11,
      plans: [{ name: "Club", cost: {}, expected: 13, strikes: [{ kind: "attack", bonus: 6, damage: compile("2d8+4"), targets: 1 }] }] };
    const plain = simulate([hero, ogre], 2000, 1).pWin;
    const lucky = simulate([withLuck(hero, { attackShift: 2, saveShift: 1, dmgMult: 1.2, rolls: 80 }), ogre], 2000, 1).pWin;
    expect(lucky).toBeGreaterThan(plain + 0.05);
  });
});
