import { describe, expect, it } from "vitest";
import { adjusted, applyDamage, applyHeal, deathSave, healthOf, NO_SAVES, type HpState } from "./hp";

const pc = (hp: number, max = 17, temp = 0, saves = NO_SAVES): HpState => ({ hp, max, temp, saves });

describe("damage", () => {
  it("temp HP soaks first", () => {
    const r = applyDamage(pc(10, 17, 5), 8, { isCharacter: true });
    expect(r.next.temp).toBe(0);
    expect(r.next.hp).toBe(7);
    expect(r.tempLost).toBe(5);
    expect(r.hpLost).toBe(3);
  });
  it("Orrin drops to 0 (session 3: 11 HP, takes 14)", () => {
    const r = applyDamage(pc(11), 14, { isCharacter: true });
    expect(r.next.hp).toBe(0);
    expect(r.dropped).toBe(true);
    expect(r.instantDeath).toBe(false);
  });
  it("massive damage kills outright", () => {
    const r = applyDamage(pc(5, 17), 22, { isCharacter: true }); // 17 left over >= max 17
    expect(r.instantDeath).toBe(true);
    expect(r.next.saves.dead).toBe(true);
  });
  it("hit while down = failed death save, crit = two", () => {
    expect(applyDamage(pc(0), 3, { isCharacter: true }).next.saves.failures).toBe(1);
    expect(applyDamage(pc(0), 3, { isCharacter: true, crit: true }).next.saves.failures).toBe(2);
    const third = applyDamage(pc(0, 17, 0, { ...NO_SAVES, failures: 2 }), 3, { isCharacter: true });
    expect(third.next.saves.dead).toBe(true);
  });
  it("monsters die at 0", () => {
    const r = applyDamage(pc(10, 10), 16, { isCharacter: false });
    expect(r.dropped).toBe(true);
    expect(r.next.saves.dead).toBe(true);
    expect(r.hpLost).toBe(10);
  });
  it("save / resistance / vulnerability / immunity", () => {
    expect(adjusted(16, "half")).toBe(8);
    expect(adjusted(15, "resist")).toBe(7);
    expect(adjusted(7, "double")).toBe(14);
    expect(adjusted(20, "immune")).toBe(0);
    expect(adjusted(9, "full")).toBe(9);
  });
});

describe("healing", () => {
  it("can't go over max", () => {
    const r = applyHeal(pc(15), 8);
    expect(r.next.hp).toBe(17);
    expect(r.healed).toBe(2);
  });
  it("Healing Word picks Orrin up from 0 and clears death saves", () => {
    const r = applyHeal(pc(0, 17, 0, { ...NO_SAVES, failures: 2, successes: 1 }), 8);
    expect(r.next.hp).toBe(8);
    expect(r.revived).toBe(true);
    expect(r.next.saves).toEqual(NO_SAVES);
  });
  it("doesn't raise the dead", () => {
    expect(applyHeal(pc(0, 17, 0, { ...NO_SAVES, dead: true }), 10).next.hp).toBe(0);
  });
});

describe("death saves", () => {
  it("10+ success, under 10 failure, 1 = two, 20 = up with 1 HP", () => {
    expect(deathSave(pc(0), 10).next.saves.successes).toBe(1);
    expect(deathSave(pc(0), 9).next.saves.failures).toBe(1);
    expect(deathSave(pc(0), 1).next.saves.failures).toBe(2);
    const up = deathSave(pc(0, 17, 0, { ...NO_SAVES, failures: 2 }), 20);
    expect(up.outcome).toBe("back up");
    expect(up.next.hp).toBe(1);
    expect(up.next.saves).toEqual(NO_SAVES);
  });
  it("three successes = stable, three failures = dead", () => {
    expect(deathSave(pc(0, 17, 0, { ...NO_SAVES, successes: 2 }), 15).outcome).toBe("stable");
    expect(deathSave(pc(0, 17, 0, { ...NO_SAVES, failures: 2 }), 4).outcome).toBe("dead");
  });
});

it("what players see about monster health", () => {
  expect(healthOf(68, 68)).toBe("unhurt");
  expect(healthOf(50, 68)).toBe("hurt");
  expect(healthOf(34, 68)).toBe("bloodied");
  expect(healthOf(0, 68)).toBe("down");
  expect(healthOf(null, null)).toBe("unhurt");
});
