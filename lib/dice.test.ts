import { describe, expect, it } from "vitest";
import { parse, roll, secureRng, type Rng } from "./dice";

/** Fake dice that return the given numbers in order. */
const fixed = (...values: number[]): Rng => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("parse", () => {
  it("reads simple expressions", () => {
    expect(parse("2d6+3").terms).toEqual([
      { type: "dice", sign: 1, count: 2, sides: 6 },
      { type: "const", sign: 1, value: 3 },
    ]);
  });
  it("reads keep-highest, minus and spaces", () => {
    const p = parse(" 4d6kh3 - 1 ");
    expect(p.terms[0]).toMatchObject({ count: 4, sides: 6, keep: { kind: "h", n: 3 } });
    expect(p.terms[1]).toMatchObject({ type: "const", sign: -1, value: 1 });
  });
  it("reads adv / dis words", () => {
    expect(parse("1d20+5 adv").advantage).toBe("advantage");
    expect(parse("1d20+5 dis").advantage).toBe("disadvantage");
  });
  it("rejects nonsense", () => {
    expect(() => parse("banana")).toThrow();
    expect(() => parse("2d6++3")).toThrow();
    expect(() => parse("1000d6")).toThrow();
    expect(() => parse("3d6kh4")).toThrow();
    expect(() => parse("")).toThrow();
  });
});

describe("roll", () => {
  it("adds dice and modifiers", () => {
    const r = roll("2d6+3", { rng: fixed(4, 5) });
    expect(r).toMatchObject({ total: 12, dice: [4, 5], modifier: 3, natural: null });
  });

  it("several dice groups (Vex: Shortbow + Sneak Attack from the sample log)", () => {
    const r = roll("1d6+2d6+3", { rng: fixed(5, 6, 2) });
    expect(r.total).toBe(16);
  });

  it("4d6 drop lowest", () => {
    const r = roll("4d6kh3", { rng: fixed(3, 1, 6, 4) });
    expect(r.total).toBe(13);
    expect(r.dice).toEqual([3, 6, 4]);
    expect(r.diceAll).toEqual([3, 1, 6, 4]);
  });

  it("advantage keeps the higher d20 (Brakka's crit from the sample log)", () => {
    const r = roll("1d20+5", { advantage: "advantage", rng: fixed(20, 9) });
    expect(r).toMatchObject({ total: 25, natural: 20, isCrit: true, diceAll: [20, 9], expression: "2d20kh1+5" });
  });

  it("disadvantage keeps the lower d20", () => {
    const r = roll("1d20+5 dis", { rng: fixed(4, 18) });
    expect(r).toMatchObject({ total: 9, natural: 4 });
  });

  it("natural 1 is a fumble", () => {
    expect(roll("1d20+7", { rng: fixed(1) })).toMatchObject({ isFumble: true, total: 8 });
  });

  it("critical hit doubles the dice, not the modifier (Greataxe crit: 2d12+3)", () => {
    const r = roll("1d12+3", { critical: true, rng: fixed(11, 8) });
    expect(r).toMatchObject({ expression: "2d12+3", total: 22 });
  });

  it("negative modifiers", () => {
    expect(roll("1d20-1", { rng: fixed(11) }).total).toBe(10);
  });

  it("real random dice stay in range", () => {
    for (let i = 0; i < 2000; i++) {
      const v = secureRng(20);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(20);
    }
  });
});
