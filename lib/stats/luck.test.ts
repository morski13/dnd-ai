import { describe, expect, it } from "vitest";
import type { StatRoll } from "./compute";
import { fromLog } from "./test-log";
import { compareDice, d20Roll, expectedD20, luckByActor, luckScore, mergeLuck } from "./luck";

let id = 0;
const roll = (d: number, o: Partial<StatRoll> = {}): StatRoll => ({
  id: String(++id), session_id: "s1", combat_id: null, round: null, character_id: "a", monster_id: null,
  roll_type: "attack", source: "Sword", expression: "1d20+5", dice: [d], total: d + 5, is_crit: d === 20, is_fumble: d === 1,
  success: null, spell_slot: null, parent_roll_id: null, target_character_id: null, target_monster_id: null,
  created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, id)).toISOString(), ...o,
});

describe("luck score", () => {
  it("averages to exactly 0.5 for every way of rolling", () => {
    for (const mode of ["normal", "advantage", "disadvantage"] as const) {
      let mean = 0;
      for (let k = 1; k <= 20; k++) {
        const p = mode === "normal" ? 1 / 20 : mode === "advantage" ? ((k / 20) ** 2 - ((k - 1) / 20) ** 2) : (((21 - k) / 20) ** 2 - ((20 - k) / 20) ** 2);
        mean += p * luckScore(k, mode);
      }
      expect(mean).toBeCloseTo(0.5, 10);
    }
  });
  it("a 14 is good on a straight roll but below par with advantage", () => {
    expect(luckScore(14, "normal")).toBeCloseTo(0.675);
    expect(luckScore(14, "advantage")).toBeLessThan(0.5);
    expect(luckScore(14, "disadvantage")).toBeGreaterThan(0.8);
  });
  it("expected d20 per mode", () => {
    expect(expectedD20("normal")).toBe(10.5);
    expect(expectedD20("advantage")).toBeCloseTo(13.825, 3);
    expect(expectedD20("disadvantage")).toBeCloseTo(7.175, 3);
  });
});

describe("which rolls count", () => {
  it("d20 tests only, with advantage read from the row or the expression", () => {
    expect(d20Roll(roll(12, { roll_type: "damage", expression: "1d8+3" }))).toBeNull();
    expect(d20Roll(roll(12, { roll_type: "ability_score", expression: "4d6kh3" }))).toBeNull();
    expect(d20Roll(roll(12, { advantage: "advantage", dice_all: [12, 3] }))?.mode).toBe("advantage");
    expect(d20Roll(roll(12, { expression: "2d20kh1+5", dice_all: [12, 3] }))?.mode).toBe("advantage");
    expect(d20Roll(roll(9, { roll_type: "initiative", expression: "1d20+2" }))?.mode).toBe("normal");
  });
});

describe("luck by actor", () => {
  it("splits groups and app vs real dice", () => {
    const rolls = [
      ...Array.from({ length: 12 }, () => roll(20)), // app attacks, all nat 20
      ...Array.from({ length: 12 }, () => roll(10, { physical: true })), // real attacks, average-ish
      roll(5, { roll_type: "save", expression: "1d20+2" }),
      roll(15, { roll_type: "check", expression: "1d20+4", physical: true }),
    ];
    const l = luckByActor(rolls).get("c:a")!;
    expect(l.all.both.n).toBe(26);
    expect(l.attack.app.n).toBe(12);
    expect(l.attack.app.index).toBeCloseTo(97.5);
    expect(l.attack.app.verdict).toBe("lucky");
    expect(l.attack.real.index).toBeCloseTo(47.5);
    expect(l.attack.real.verdict).toBe("normal");
    expect(l.save.both.verdict).toBe("few");
    expect(l.check.real.n).toBe(1);
    expect(compareDice(l.attack.app, l.attack.real).verdict).toBe("app-higher");
    expect(compareDice(l.save.app, l.save.real).verdict).toBe("few");
  });
  it("merging two people weighs by rolls", () => {
    const a = luckByActor([...Array.from({ length: 10 }, () => roll(20))]).get("c:a")!;
    const b = luckByActor([...Array.from({ length: 30 }, () => roll(1, { character_id: "b" }))]).get("c:b")!;
    const m = mergeLuck([a, b]);
    expect(m.all.both.n).toBe(40);
    expect(m.all.both.mean! * 100).toBeCloseTo((97.5 * 10 + 2.5 * 30) / 40, 6);
  });
  it("the sample session", () => {
    const { rolls } = fromLog();
    const l = luckByActor(rolls);
    const vex = l.get("c:pc3")!;
    expect(vex.attack.both.n).toBe(3);
    expect(vex.all.both.verdict).toBe("few");
    expect(vex.all.real.n).toBe(0);
  });
});
