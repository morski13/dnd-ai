import { describe, expect, it } from "vitest";
import { add, formatCoins, formatCp, fromCp, magicPrice, parsePrice, pay, split, toCoins, total, ZERO } from "./money";

const purse = (p: Partial<typeof ZERO>) => ({ ...ZERO, ...p });

describe("money", () => {
  it("counts everything in copper", () => {
    expect(total(purse({ pp: 1, gp: 2, ep: 1, sp: 3, cp: 4 }))).toBe(1000 + 200 + 50 + 30 + 4);
  });

  it("pays exactly with gold", () => {
    expect(pay(purse({ gp: 15 }), 1500)).toEqual(purse({}));
  });

  it("breaks a gold coin and gives change in silver and copper", () => {
    // a 2 sp 5 cp item paid from 1 gp: 7 sp 5 cp back
    expect(pay(purse({ gp: 1 }), 25)).toEqual(purse({ sp: 7, cp: 5 }));
  });

  it("spends small coins first", () => {
    expect(pay(purse({ gp: 10, sp: 5 }), 50)).toEqual(purse({ gp: 10 }));
  });

  it("breaks platinum when that's all there is", () => {
    expect(pay(purse({ pp: 1 }), 150)).toEqual(purse({ gp: 8, sp: 5 }));
  });

  it("keeps the value exactly right, whatever the purse", () => {
    for (let i = 0; i < 500; i++) {
      const p = purse({ pp: i % 3, gp: (i * 7) % 13, ep: i % 2, sp: (i * 5) % 11, cp: (i * 3) % 17 });
      const price = (i * 37) % (total(p) + 1);
      const after = pay(p, price)!;
      expect(total(after)).toBe(total(p) - price);
      expect(Object.values(after).every((n) => n >= 0)).toBe(true);
    }
  });

  it("refuses when there isn't enough", () => {
    expect(pay(purse({ gp: 4, sp: 9 }), 500)).toBeNull();
  });

  it("cleans up coins from the database", () => {
    expect(toCoins({ gp: "12", sp: -3, cp: 2.7, zz: 5 })).toEqual(purse({ gp: 12, cp: 2 }));
    expect(toCoins(null)).toEqual(ZERO);
  });

  it("writes prices and purses for people", () => {
    expect(formatCp(1525)).toBe("15 gp 2 sp 5 cp");
    expect(formatCp(5)).toBe("5 cp");
    expect(formatCp(0)).toBe("Free");
    expect(formatCp(400000)).toBe("4,000 gp");
    expect(formatCoins(purse({ gp: 47, sp: 3 }))).toBe("47 gp, 3 sp");
    expect(formatCoins(ZERO)).toBe("No coins");
  });

  it("reads prices typed by the DM", () => {
    expect(parsePrice("12")).toBe(1200);
    expect(parsePrice("1.5 gp")).toBe(150);
    expect(parsePrice("2 gp 5 sp")).toBe(250);
    expect(parsePrice("1,000 gp")).toBe(100000);
    expect(parsePrice("")).toBeNull();
  });

  it("makes everyday change and adds coins", () => {
    expect(fromCp(1234)).toEqual(purse({ gp: 12, sp: 3, cp: 4 }));
    expect(add(purse({ gp: 1 }), purse({ gp: 2, sp: 1 }))).toEqual(purse({ gp: 3, sp: 1 }));
  });

  it("splits loot coins fairly", () => {
    expect(split(1001, 4)).toEqual([251, 250, 250, 250]);
    expect(split(10, 0)).toEqual([]);
  });

  it("suggests magic item prices by rarity", () => {
    expect(magicPrice("Uncommon")).toBe(40000);
    expect(magicPrice("Rare", true)).toBe(200000);
    expect(magicPrice("Very Rare")).toBe(4000000);
    expect(magicPrice("Artifact")).toBeNull();
  });
});
