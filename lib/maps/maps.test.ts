import { describe, expect, it } from "vitest";
import spells from "../test-fixtures/area-spells.json";
import { inRange, parseArea, place, squaresIn, tokensIn } from "./area";
import { moveBudget, reachable, sizeSquares, startingSpots, walkSpeed } from "./move";

const S = spells as Record<string, { description: string; range: string }>;
const area = (n: string) => parseArea(S[n].description, S[n].range);
const tok = (id: string, x: number, y: number, size = 1) => ({ id, x, y, size });

describe("spell areas from the rules text", () => {
  it("reads the common shapes, sizes and ranges", () => {
    expect(area("Fireball")).toEqual({ shape: "sphere", size: 20, range: 150, pick: "all" });
    expect(area("Burning Hands")).toMatchObject({ shape: "cone", size: 15, range: null, pick: "all" });
    expect(area("Lightning Bolt")).toMatchObject({ shape: "line", size: 100, width: 5 });
    expect(area("Thunderwave")).toMatchObject({ shape: "cube", size: 15, range: null });
    expect(area("Spirit Guardians")).toMatchObject({ shape: "emanation", size: 15 });
    expect(area("Flame Strike")).toMatchObject({ shape: "cylinder", size: 10, range: 60 });
    expect(area("Cone of Cold")).toMatchObject({ shape: "cone", size: 60 });
  });
  it("spells that let you choose: who and how many", () => {
    expect(area("Bless")).toMatchObject({ shape: "targets", pick: "choose", max: 3, range: 30 });
    expect(area("Mass Healing Word")).toMatchObject({ shape: "targets", pick: "choose", max: 6 });
    expect(area("Mass Cure Wounds")).toMatchObject({ shape: "sphere", pick: "choose", max: 6 });
  });
  it("one-target spells are not areas", () => {
    expect(area("Healing Word")).toBeNull();
    expect(area("Sacred Flame")).toBeNull();
  });
});

describe("what an area covers", () => {
  const caster = tok("me", 5, 10);
  it("Fireball: a 20-ft sphere around the chosen point catches everyone near it, caster included if close", () => {
    const a = place(area("Fireball")!, caster, { x: 5, y: 5 });
    const near = [tok("a", 4, 4), tok("b", 7, 7), tok("far", 5, 0), tok("me", 5, 10)];
    expect(tokensIn(a, near, "me", "sphere").map((t) => t.id)).toEqual(["a", "b"]);
    expect(squaresIn(a, 20, 20).length).toBeGreaterThan(40);
  });
  it("range: 150 ft for Fireball, a Bless needs targets within 30 ft", () => {
    expect(inRange(area("Fireball")!, caster, { x: 5, y: -18 })).toBe(true);    // 28 squares = 140 ft
    expect(inRange(area("Fireball")!, caster, { x: 5, y: -30 })).toBe(false);
    const r = place(area("Bless")!, caster, { x: 0, y: 0 });
    expect(tokensIn(r, [tok("a", 5, 4), tok("b", 5, 3)], "me", "targets").map((t) => t.id)).toEqual(["a"]);
  });
  it("Burning Hands: a 15-ft cone in front of you, not behind, not you", () => {
    const a = place(area("Burning Hands")!, caster, { x: 5.5, y: 0 }); // pointing up
    const ids = tokensIn(a, [tok("front", 5, 9), tok("front3", 5, 7), tok("side", 7, 9), tok("behind", 5, 11), tok("me", 5, 10), tok("toofar", 5, 6)], "me", "cone").map((t) => t.id);
    expect(ids).toEqual(["front", "front3"]);
  });
  it("Lightning Bolt: a 5-ft-wide line", () => {
    const a = place(area("Lightning Bolt")!, caster, { x: 20.5, y: 10.5 }); // pointing right
    expect(tokensIn(a, [tok("on", 12, 10), tok("off", 12, 11), tok("me", 5, 10)], "me", "line").map((t) => t.id)).toEqual(["on"]);
  });
  it("Thunderwave: a 15-ft cube against your side", () => {
    const a = place(area("Thunderwave")!, caster, { x: 10, y: 10.5 });
    expect(a).toEqual({ shape: "rect", x: 6, y: 9, w: 3, h: 3 });
  });
  it("big creatures are hit if any of their squares are", () => {
    const a = place(area("Fireball")!, caster, { x: 5, y: 5 });
    expect(tokensIn(a, [tok("ogre", 8, 2, 2)], "me", "sphere").length).toBe(1);
  });
});

describe("movement", () => {
  it("speed from a sheet or a stat block", () => {
    expect(walkSpeed(25)).toBe(25);
    expect(walkSpeed("40 ft., climb 30 ft.")).toBe(40);
    expect(walkSpeed("walk 30 ft., fly 60 ft.")).toBe(30);
    expect(walkSpeed(null)).toBe(30);
  });
  it("Dash adds your speed again; Haste doubles it", () => {
    expect(moveBudget(30, 0)).toBe(30);
    expect(moveBudget(30, 1)).toBe(60);
    expect(moveBudget(30, 1, true)).toBe(120);
  });
  it("reachable squares: within your feet left, inside the map, never on someone else", () => {
    const me = tok("me", 2, 2);
    const r = reachable(me, [tok("ally", 3, 2)], 10, 10, 10);
    expect(r.length).toBe(25 - 1 - 1 - 9 + 9 - 0);            // 5×5 around (2 squares) minus me minus ally
    expect(r.some((p) => p.x === 3 && p.y === 2)).toBe(false);
    expect(reachable(tok("corner", 0, 0), [], 10, 10, 5).length).toBe(3);
    expect(reachable(tok("big", 0, 0, 2), [], 3, 3, 5).length).toBe(3);   // a Large token needs 2×2 free squares
  });
  it("starting spots: party at the bottom, monsters at the top, no overlaps", () => {
    const s = startingSpots([{ id: "a", side: "party", size: 1 }, { id: "b", side: "party", size: 1 }, { id: "ogre", side: "enemy", size: 2 }], 10, 10);
    expect(s.a.y).toBe(9); expect(s.b.y).toBe(9); expect(s.a.x).not.toBe(s.b.x);
    expect(s.ogre.y).toBe(0);
    expect(sizeSquares("Large giant")).toBe(2);
  });
});
