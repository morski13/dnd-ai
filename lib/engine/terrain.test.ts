import { describe, expect, it } from "vitest";
import { fallDice, paint, readTerrain, strokeSquares } from "./terrain";
import { coverOf, distanceFt, moveCosts, terrainOf, type MoveCtx } from "./space";

const b = (id: string, x: number, y: number, size = 1) => ({ id, x, y, size });
const ctx = (raw: unknown, over: Partial<MoveCtx> = {}): MoveCtx => ({ cols: 10, rows: 10, feet: 5, diag: "5", terrain: terrainOf(raw), others: [], rules: "2014", ...over });

describe("terrain kinds", () => {
  it("reads the old format and paints the new one", () => {
    const t = readTerrain({ walls: ["1,1"], difficult: ["2,2"] });
    expect(t.cells["1,1"].k).toBe("wall");
    const p = paint(t, ["3,3"], { kind: "tree" });
    expect(p.cells["3,3"]).toEqual({ k: "tree" });
    expect(paint(p, ["3,3"], { height: 10 }).cells["3,3"]).toEqual({ k: "tree", h: 10 });
    expect(paint(p, ["3,3"], { kind: "clear" }).cells["3,3"]).toBeUndefined();
    expect(paint(t, ["4,4"], { door: "door" }).doors["4,4"]).toEqual({ open: false });
    expect(strokeSquares({ x: 0.5, y: 0.5 }, { x: 3.5, y: 0.5 })).toEqual(["0,0", "1,0", "2,0", "3,0"]);
    expect(strokeSquares({ x: 2.5, y: 2.5 }, { x: 2.5, y: 2.5 }, 3)).toHaveLength(9);
  });
  it("trees block and give three-quarters at most; bushes, barrels: half", () => {
    const t = terrainOf({ v: 2, cells: { "2,0": { k: "tree" }, "2,1": { k: "tree" }, "2,-1": { k: "tree" } } });
    expect(t.walls.has("2,0")).toBe(true);
    expect(coverOf(b("a", 0, 0), b("t", 4, 0), t, []).level).not.toBe("total");
    const forest = terrainOf({ v: 2, cells: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].flatMap((y) => [[`2,${y}`, { k: "boulder" }]])) });
    expect(coverOf(b("a", 0, 3), b("t", 4, 3), forest, []).level).toBe("three-quarters");
    expect(coverOf(b("a", 0, 0), b("t", 4, 0), terrainOf({ v: 2, cells: { "2,0": { k: "barrel" } } }), []).level).toBe("half");
  });
  it("closed doors block, open ones don't; windows block moving but not sight", () => {
    const shut = terrainOf({ v: 2, cells: {}, doors: { "1,0": { open: false } } });
    expect(shut.walls.has("1,0")).toBe(true);
    expect(terrainOf({ v: 2, cells: {}, doors: { "1,0": { open: true } } }).walls.has("1,0")).toBe(false);
    const win = terrainOf({ v: 2, cells: {}, doors: { "1,0": { open: false, window: true } } });
    expect(win.walls.has("1,0")).toBe(true);
    expect(win.sight.has("1,0")).toBe(false);
  });
  it("height: climbing costs extra, distance counts it, a ridge blocks the view from below", () => {
    const hill = { v: 2, cells: { "1,0": { k: "ground", h: 10 } } };
    expect(moveCosts(b("me", 0, 0), ctx(hill)).costFt(1, 0)).toBe(15); // 5 ft step + 10 ft climb
    expect(moveCosts(b("me", 1, 0), ctx(hill)).costFt(0, 0)).toBe(5);  // stepping down is free
    const t = terrainOf({ v: 2, cells: { "3,3": { k: "ground", h: 15 } } });
    expect(distanceFt(b("a", 3, 3), b("b", 4, 3), 5, "5", t)).toBe(15);
    const ridge = terrainOf({ v: 2, cells: Object.fromEntries([-1, 0, 1].map((y) => [`2,${y}`, { k: "ground", h: 20 }])) });
    expect(coverOf(b("a", 0, 0), b("t", 4, 0), ridge, []).level).not.toBe("none");
  });
  it("hazards and falls", () => {
    const t = terrainOf({ v: 2, cells: { "1,1": { k: "lava" }, "2,2": { k: "spikes" } } });
    expect(t.hazards.get("1,1")).toMatchObject({ dice: "10d10", type: "fire" });
    expect(t.difficult.has("2,2")).toBe(true);
    expect(fallDice(25)).toBe("2d6");
    expect(fallDice(5)).toBeNull();
    expect(fallDice(500)).toBe("20d6");
  });
});
