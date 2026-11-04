import { describe, expect, it } from "vitest";
import { characterFlight, climbCost, falls, flightFromSpeed } from "./flight";
import { distanceFt, moveCosts, terrainOf, type MoveCtx } from "./space";

const b = (id: string, x: number, y: number, size = 1, z = 0) => ({ id, x, y, size, z });

describe("flying", () => {
  it("fly speeds", () => {
    expect(flightFromSpeed("30 ft., fly 60 ft. (hover)")).toEqual({ fly: 60, hover: true });
    expect(flightFromSpeed("40 ft.")).toEqual({ fly: 0, hover: false });
    expect(characterFlight({ species: "Fairy", speed: 30 }).fly).toBe(30);
    expect(characterFlight({ species: "Human", features: [{ name: "Wings", description: "You have a flying speed of 30 feet." }] }).fly).toBe(30);
    expect(climbCost(0, 20)).toBe(20);
  });
  it("in the air: over trees and difficult ground, never through walls", () => {
    const t = terrainOf({ v: 2, cells: { "1,0": { k: "tree" }, "2,0": { k: "rocks" }, "3,0": { k: "wall" }, "3,1": { k: "wall" }, "3,2": { k: "wall" } } });
    const ctx: MoveCtx = { cols: 6, rows: 3, feet: 5, diag: "5", terrain: t, others: [], rules: "2014" };
    expect(moveCosts(b("me", 0, 0), ctx).costFt(1, 0)).toBeNull();          // a tree on the ground… (only around it)
    expect(moveCosts(b("me", 0, 0, 1, 30), ctx).costFt(2, 0)).toBe(10);     // over the tree, rocks don't slow
    expect(moveCosts(b("me", 0, 0, 1, 30), ctx).costFt(4, 0)).toBeNull();   // the wall still stops it
  });
  it("falls when Prone or speed 0, unless it hovers; height counts in reach", () => {
    expect(falls(30, ["Prone"], { fly: 60, hover: false }, 60)).toMatch(/Prone/);
    expect(falls(30, ["Prone"], { fly: 60, hover: true }, 60)).toBeNull();
    expect(falls(30, ["Grappled"], { fly: 60, hover: false }, 0)).toMatch(/can't move/);
    expect(falls(0, ["Prone"], { fly: 60, hover: false }, 60)).toBeNull();
    expect(distanceFt(b("me", 0, 0), b("bird", 1, 0, 1, 15))).toBe(15);
  });
});
