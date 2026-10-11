import { describe, expect, it } from "vitest";
import { concentrationDc, monsterSave } from "./concentration";

describe("concentration", () => {
  it("DC is 10 or half the damage, whichever is higher, at most 30", () => {
    expect(concentrationDc(7)).toBe(10);
    expect(concentrationDc(22)).toBe(11);
    expect(concentrationDc(23)).toBe(11);
    expect(concentrationDc(100)).toBe(30);
  });
  it("reads a monster's save bonus from its stat block", () => {
    expect(monsterSave({ abilities: { CON: { mod: 3, save: 6 } } }, "CON")).toBe(6);
    expect(monsterSave({ abilities: { CON: { mod: 2 } } }, "CON")).toBe(2);
    expect(monsterSave({ saves: { WIS: 4 } }, "WIS")).toBe(4);
    expect(monsterSave(null, "DEX")).toBe(0);
  });
});
