import { describe, expect, it } from "vitest";
import { checkRange, coverOf, distanceFt, moveCosts, provoked, reachableSquares, reachOf, terrainOf, type MoveCtx } from "./space";

const b = (id: string, x: number, y: number, size = 1) => ({ id, x, y, size });
const open = terrainOf({});

describe("distance", () => {
  it("side by side is 5 ft, diagonals 5 or 5-10-5", () => {
    expect(distanceFt(b("a", 0, 0), b("b", 1, 0))).toBe(5);
    expect(distanceFt(b("a", 0, 0), b("b", 1, 1))).toBe(5);
    expect(distanceFt(b("a", 0, 0), b("b", 4, 4))).toBe(20);
    expect(distanceFt(b("a", 0, 0), b("b", 4, 4), 5, "5-10-5")).toBe(30);
    // a Large ogre (2×2) next to you
    expect(distanceFt(b("a", 0, 0), b("ogre", 1, 0, 2))).toBe(5);
    expect(distanceFt(b("a", 0, 0), b("ogre", 3, 0, 2))).toBe(15);
  });
});

describe("range and reach", () => {
  it("weapons and spells", () => {
    expect(reachOf({ kind: "weapon", name: "Morningstar" })).toMatchObject({ melee: 5 });
    expect(reachOf({ kind: "weapon", name: "Glaive" })).toMatchObject({ melee: 10 });
    const bow = reachOf({ kind: "weapon", ranged: true, range: "80/320" });
    expect(checkRange(60, bow)).toMatchObject({ ok: true, long: false });
    expect(checkRange(200, bow)).toMatchObject({ ok: true, long: true });
    expect(checkRange(400, bow).ok).toBe(false);
    const jav = reachOf({ kind: "weapon", range: "30/120", name: "Javelin" });
    expect(checkRange(5, jav).mode).toBe("melee");
    expect(checkRange(25, jav).mode).toBe("ranged");
    expect(checkRange(10, reachOf({ kind: "weapon", name: "Dagger" })).ok).toBe(false);
    expect(reachOf({ kind: "spell_attack", range: "120 feet" })).toMatchObject({ normal: 120 });
    expect(checkRange(5, reachOf({ kind: "spell_attack", range: "Touch" })).ok).toBe(true);
  });
});

describe("cover", () => {
  it("a wall between: cover; a clear line: none", () => {
    expect(coverOf(b("a", 0, 0), b("t", 4, 0), open, []).level).toBe("none");
    const wall = terrainOf({ walls: ["2,0", "2,1"] });
    expect(coverOf(b("a", 0, 0), b("t", 4, 0), wall, []).level).not.toBe("none");
    const box = terrainOf({ walls: ["3,0", "3,1", "4,1", "5,1", "5,0"].concat(["3,-1"]) });
    expect(coverOf(b("a", 0, 0), b("t", 4, 0), box, []).ac).toBeGreaterThanOrEqual(2);
    expect(coverOf(b("a", 0, 0), b("t", 4, 0), open, [b("g", 2, 0)]).level).toBe("half");
  });
});

describe("moving", () => {
  const ctx = (over: Partial<MoveCtx> = {}): MoveCtx => ({ cols: 10, rows: 10, feet: 5, diag: "5", terrain: open, others: [], rules: "2014", ...over });
  it("difficult terrain costs double; walls block", () => {
    const me = b("me", 0, 0);
    expect(moveCosts(me, ctx()).costFt(3, 0)).toBe(15);
    expect(moveCosts(me, ctx({ terrain: terrainOf({ difficult: ["1,0", "2,0", "3,0", "1,1", "2,1", "3,1"] }) })).costFt(3, 0)).toBe(30); // entering a difficult square always costs double
    const walled = ctx({ terrain: terrainOf({ walls: ["1,0", "1,1", "1,2", "1,3", "1,4", "1,5", "1,6", "1,7", "1,8"] }) });
    expect(moveCosts(me, walled).costFt(2, 0)).toBe(90); // all the way around the bottom of the wall
  });
  it("5-10-5 diagonals", () => {
    expect(moveCosts(b("me", 0, 0), ctx({ diag: "5-10-5" })).costFt(2, 2)).toBe(15);
    expect(moveCosts(b("me", 0, 0), ctx({ diag: "5-10-5" })).costFt(4, 4)).toBe(30);
  });
  it("enemies block, allies can be passed but not stopped on", () => {
    const others = [{ ...b("ogre", 1, 0), hostile: true }, { ...b("ally", 0, 1), hostile: false }];
    const sq = reachableSquares(b("me", 0, 0), ctx({ others, cols: 2, rows: 3 }), 30).map((s) => `${s.x},${s.y}`);
    expect(sq).not.toContain("1,0");
    expect(sq).not.toContain("0,1");
    expect(sq).toContain("0,2"); // through the ally
  });
  it("leaving reach provokes, Disengage doesn't", () => {
    const enemy = { ...b("ogre", 1, 0), name: "Ogre", reach: 5, canReact: true };
    const path = [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }];
    expect(provoked(path, b("me", 0, 0), [enemy], { feet: 5, diag: "5", disengaged: false })).toHaveLength(1);
    expect(provoked(path, b("me", 0, 0), [enemy], { feet: 5, diag: "5", disengaged: true })).toHaveLength(0);
    expect(provoked(path, b("me", 0, 0), [{ ...enemy, reach: 10 }], { feet: 5, diag: "5", disengaged: false })).toHaveLength(0);
    expect(moveCosts(b("me", 0, 0), ctx()).pathTo(0, 2)?.length).toBe(3);
  });
});
