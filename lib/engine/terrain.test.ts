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

describe("objects", () => {
  it("a 10-ft tree takes 4 squares and blocks them all; fly over at its height", async () => {
    const { placeObject, objectAt, removeObject } = await import("./terrain");
    const { terrainOf, moveCosts } = await import("./space");
    let t = placeObject(readTerrain({}), { id: "t1", k: "tree", x: 2, y: 2, size: 2, tall: 30 }, 10, 10);
    expect(objectAt(t, 3, 3)?.id).toBe("t1");
    const tt = terrainOf(t);
    expect(["2,2", "3,2", "2,3", "3,3"].every((k) => tt.walls.has(k))).toBe(true);
    expect(tt.tall.get("3,3")).toBe(30);
    const ctx = { cols: 10, rows: 10, feet: 5, diag: "5" as const, terrain: tt, others: [], rules: "2014" as const };
    expect(moveCosts({ id: "b", x: 1, y: 2, size: 1, z: 20 }, ctx).costFt(2, 2)).toBeNull();   // 20 ft up: still under its top
    expect(moveCosts({ id: "b", x: 1, y: 2, size: 1, z: 30 }, ctx).costFt(2, 2)).toBe(5);
    // a new object on top replaces it; removing works; it stays inside the map
    t = placeObject(t, { id: "b1", k: "barrel", x: 3, y: 3, size: 1 }, 10, 10);
    expect(t.objects?.map((o) => o.id)).toEqual(["b1"]);
    expect(removeObject(t, "b1").objects).toEqual([]);
    expect(placeObject(readTerrain({}), { id: "x", k: "boulder", x: 9, y: 9, size: 3 }, 10, 10).objects?.[0]).toMatchObject({ x: 7, y: 7 });
    expect(readTerrain({ objects: [{ id: "z", k: "lava", x: 1, y: 1, size: 2 }] }).objects).toBeUndefined(); // not an object kind
  });
});

describe("what's on a square", () => {
  it("describes height, terrain and objects", async () => {
    const { describeSquare } = await import("./terrain");
    const t = readTerrain({ v: 2, cells: { "1,1": { k: "grass", h: 15 } }, objects: [{ id: "a", k: "tree", x: 1, y: 1, size: 2, tall: 30 }] });
    const s = describeSquare(t, 1, 1);
    expect(s).toMatch(/Ground \+15 ft/);
    expect(s).toMatch(/Tall grass \(difficult terrain/);
    expect(s).toMatch(/Tree, 10 ft wide, 30 ft tall/);
    expect(describeSquare(t, 5, 5)).toBe("Ground level");
  });
});
